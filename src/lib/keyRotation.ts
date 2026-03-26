/**
 * LiveKit key rotation with Upstash Redis.
 *
 * Strategy: Hash-based distribution with room affinity and exhaustion tracking.
 * - New rooms hashed to a non-exhausted key (deterministic, even distribution)
 * - Existing rooms always use their assigned key (room affinity, no split)
 * - Exhausted keys are marked in Redis and skipped for new room assignments
 * - Falls back to in-memory hash if Redis is unreachable
 *
 * Why hash instead of least-loaded: we can't track actual LiveKit quota usage
 * (no API on free plan), and room-count tracking drifts because PartyKit
 * room-close events don't notify our API. Hash gives even distribution
 * without maintenance, and exhaustion markers handle key failures.
 *
 * See docs/IDEOLOGY.md for architecture decisions and user workflows.
 */

import { Redis } from "@upstash/redis";

interface LiveKitKeySet {
  apiKey: string;
  apiSecret: string;
  url: string;
}

// Redis instance - lazy init, null if env vars not set
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// Scan env vars for key sets: LIVEKIT_API_KEY, _2, _3, ... _20
export function getKeySets(): LiveKitKeySet[] {
  const sets: LiveKitKeySet[] = [];
  const defaultUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
  // Primary (no suffix) + _2 through _20 = up to 20 key sets
  const suffixes = ["", ...Array.from({ length: 19 }, (_, i) => `_${i + 2}`)];

  for (const suffix of suffixes) {
    const apiKey = process.env[`LIVEKIT_API_KEY${suffix}`];
    const apiSecret = process.env[`LIVEKIT_API_SECRET${suffix}`];
    if (!apiKey || !apiSecret) continue;
    sets.push({
      apiKey,
      apiSecret,
      url: process.env[`LIVEKIT_URL${suffix}`] ?? defaultUrl,
    });
  }
  return sets;
}

// Deterministic hash for room-to-key distribution
function hashRoomToKey(room: string, total: number): number {
  let hash = 0;
  for (let i = 0; i < room.length; i++) {
    hash = ((hash << 5) - hash + room.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % total;
}

const ROOM_KEY_TTL = 3600;     // 1 hour - room-to-key mapping
const EXHAUSTED_TTL = 300;     // 5 min - key exhaustion cooldown

/**
 * Get the key set for a room.
 * - Existing rooms: use stored mapping (room affinity)
 * - New rooms: hash among non-exhausted keys, store with SET NX
 * - Exhausted key + existing mapping: return null (429, never split)
 * - Redis down: fall back to deterministic hash
 */
export async function getKeyForRoom(
  room: string,
  keySets: LiveKitKeySet[],
  forceNext: boolean,
): Promise<{ keySet: LiveKitKeySet; index: number } | null> {
  if (keySets.length === 0) return null;

  const r = getRedis();
  if (!r) {
    const idx = hashRoomToKey(room, keySets.length);
    return { keySet: keySets[idx]!, index: idx };
  }

  try {
    const roomKey = `room:${room}:key`;

    // Client reported connect failure - mark current key exhausted and clear mapping
    if (forceNext) {
      const currentKey = await r.get<number>(roomKey);
      if (currentKey !== null) {
        await r.set(`key:${currentKey}:exhausted`, "1", { ex: EXHAUSTED_TTL });
        await r.del(roomKey); // clear mapping so room can be reassigned
      }
    }

    // Check existing room-to-key mapping
    const existingKey = await r.get<number>(roomKey);
    if (existingKey !== null) {
      const exhausted = await r.exists(`key:${existingKey}:exhausted`);
      if (!exhausted && keySets[existingKey]) {
        // Key is healthy - use it (room affinity)
        await r.expire(roomKey, ROOM_KEY_TTL);
        return { keySet: keySets[existingKey]!, index: existingKey };
      }
      // Key is exhausted with active mapping - refuse (don't split room)
      return null;
    }

    // No mapping - new room or cleared mapping. Find a non-exhausted key.
    // Check exhaustion state for all keys in one pipeline
    const pipeline = r.pipeline();
    for (let i = 0; i < keySets.length; i++) {
      pipeline.exists(`key:${i}:exhausted`);
    }
    const results = await pipeline.exec<number[]>();

    const nonExhausted = keySets
      .map((_, i) => i)
      .filter((i) => !results[i]);

    if (nonExhausted.length === 0) {
      // All keys exhausted - return null (429)
      return null;
    }

    // Hash room to a non-exhausted key (even distribution, deterministic)
    const bestIdx = nonExhausted[hashRoomToKey(room, nonExhausted.length)]!;

    // Atomic SET NX - prevents race condition where two concurrent requests
    // for the same new room get different keys
    const wasSet = await r.set(roomKey, bestIdx, { ex: ROOM_KEY_TTL, nx: true });

    if (!wasSet) {
      // Another instance assigned this room first - read their assignment
      const assignedKey = await r.get<number>(roomKey);
      if (assignedKey !== null && keySets[assignedKey]) {
        return { keySet: keySets[assignedKey]!, index: assignedKey };
      }
    }

    return { keySet: keySets[bestIdx]!, index: bestIdx };
  } catch (err) {
    // Redis error - fall back to hash
    console.error("[KeyRotation] Redis error, falling back to hash:", err);
    const idx = hashRoomToKey(room, keySets.length);
    return { keySet: keySets[idx]!, index: idx };
  }
}
