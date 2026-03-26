/**
 * LiveKit key rotation with Upstash Redis.
 *
 * Strategy: Least-loaded with room affinity (as specified in docs/IDEOLOGY.md).
 * - New rooms assigned to the key with fewest active rooms (TTL-based counting)
 * - Existing rooms always use their assigned key (room affinity, no split)
 * - Exhausted keys are marked and skipped for new assignments
 * - Falls back to in-memory hash if Redis is unreachable
 *
 * Room counts use TTL-based counting: each room:X:key mapping has a 1hr TTL.
 * To find the least-loaded key, we count active mappings per key via SCAN.
 * No INCR/DECR counters - expired TTLs self-clean. No drift.
 *
 * See docs/IDEOLOGY.md for full architecture decisions.
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

// Deterministic hash fallback (no Redis)
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
 * Count active rooms per key using SCAN (TTL-based counting).
 * Each room:X:key mapping has a TTL. We count non-expired ones per key index.
 * Self-cleaning: expired mappings don't appear in SCAN results.
 */
async function countRoomsPerKey(r: Redis, totalKeys: number): Promise<number[]> {
  const counts = new Array<number>(totalKeys).fill(0);

  let cursor = 0;
  do {
    const [nextCursor, keys] = await r.scan(cursor, { match: "room:*:key", count: 100 });
    cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;

    if (keys.length > 0) {
      // Batch GET all found room keys
      const pipeline = r.pipeline();
      for (const key of keys) {
        pipeline.get(key);
      }
      const values = await pipeline.exec<(number | null)[]>();

      for (const val of values) {
        if (val !== null && val >= 0 && val < totalKeys) {
          counts[val]!++;
        }
      }
    }
  } while (cursor !== 0);

  return counts;
}

/**
 * Get the key set for a room.
 * - Existing rooms: use stored mapping (room affinity)
 * - New rooms: least-loaded non-exhausted key, assigned with SET NX (atomic)
 * - Exhausted key + existing mapping: return null (429, never split)
 * - Redis down: fall back to deterministic hash
 */
export async function getKeyForRoom(
  room: string,
  keySets: LiveKitKeySet[],
  forceNext: boolean,
): Promise<{ keySet: LiveKitKeySet; index: number } | { error: "room-exhausted" | "all-exhausted" } | null> {
  if (keySets.length === 0) return null;

  const r = getRedis();
  if (!r) {
    const idx = hashRoomToKey(room, keySets.length);
    return { keySet: keySets[idx]!, index: idx };
  }

  try {
    // Sanitize room code for Redis key safety (alphanumeric + dash only)
    const safeRoom = room.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20);
    const roomKey = `room:${safeRoom}:key`;

    // Client reported connect failure - mark current key exhausted
    // Do NOT delete the room mapping (other users in the room need it)
    // The mapping stays so subsequent joins see the exhausted state and get 429
    if (forceNext) {
      const currentKey = await r.get<number>(roomKey);
      if (currentKey !== null) {
        await r.set(`key:${currentKey}:exhausted`, "1", { ex: EXHAUSTED_TTL });
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
      return { error: "room-exhausted" as const };
    }

    // No mapping - new room. Find least-loaded non-exhausted key.

    // 1. Check which keys are exhausted
    const pipeline = r.pipeline();
    for (let i = 0; i < keySets.length; i++) {
      pipeline.exists(`key:${i}:exhausted`);
    }
    const exhaustionResults = await pipeline.exec<number[]>();

    const nonExhausted = keySets
      .map((_, i) => i)
      .filter((i) => !exhaustionResults[i]);

    if (nonExhausted.length === 0) {
      return { error: "all-exhausted" as const };
    }

    // 2. Count active rooms per key (TTL-based counting via SCAN)
    const roomCounts = await countRoomsPerKey(r, keySets.length);

    // 3. Pick the non-exhausted key with the fewest rooms (least-loaded)
    let bestIdx = nonExhausted[0]!;
    let bestCount = Infinity;
    for (const idx of nonExhausted) {
      if (roomCounts[idx]! < bestCount) {
        bestCount = roomCounts[idx]!;
        bestIdx = idx;
      }
    }

    // 4. Atomic SET NX - prevents race where two concurrent requests
    //    for the same new room get different keys
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
