/**
 * LiveKit key rotation with Upstash Redis.
 *
 * Strategy: Least-loaded with room affinity (as specified in docs/IDEOLOGY.md).
 * - New rooms assigned to the key with fewest active rooms (TTL-based counting)
 * - Existing rooms always use their assigned key (room affinity, no split)
 * - Exhausted keys are marked and skipped for new assignments
 * - Falls back to deterministic hash if Redis is unreachable
 *
 * Room counts use TTL-based counting: each room:X:key mapping has a 1hr TTL.
 * To find the least-loaded key, we count active mappings per key via SCAN.
 * Expired TTLs self-clean via SCAN (only non-expired keys appear in results).
 *
 * Exhaustion tracking uses a Redis Set per key (SADD) to count distinct rooms
 * reporting failures within a fixed time window. This prevents a single client
 * from marking a key exhausted via repeated retries. The window TTL is set once
 * when the first room reports (not reset on subsequent reports).
 *
 * Known limitation: an attacker with 3+ valid mapped room codes can still
 * exhaust keys. Full mitigation requires authenticated forceNext or server-side
 * LiveKit error detection (webhook integration), which is out of scope.
 *
 * See docs/IDEOLOGY.md for full architecture decisions.
 */

import "server-only";
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
const EXHAUST_THRESHOLD = 3;   // require 3+ distinct rooms to report before marking key exhausted
const EXHAUST_WINDOW = 60;     // fixed window from first report (not reset on subsequent reports)

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
 * - Exhausted key + existing mapping: return error (429, never split)
 * - Redis down: fall back to deterministic hash function
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
    // Room code validation is done at the API boundary (route.ts uses validateRoomCode).
    // Here we just construct the Redis key from the already-validated, uppercased room code.
    const roomKey = `room:${room}:key`;

    // Read room's current key mapping once (reused by both forceNext and affinity check)
    const currentKey = await r.get<number>(roomKey);

    // Client reported connect failure - track distinct rooms reporting this key.
    // Uses SADD (Redis Set) so the same room reporting multiple times only counts once.
    // TTL is set via ttl < 0 check (covers both new keys and keys that lost their TTL),
    // so the window is fixed from first report, not sliding.
    if (forceNext && currentKey !== null && currentKey >= 0 && currentKey < keySets.length) {
      const reportSetKey = `key:${currentKey}:report_rooms`;
      // SADD the room to the set so the same room only counts once
      await r.sadd(reportSetKey, room);
      // Ensure the window has a fixed TTL. We only set TTL when the key currently has
      // no TTL (either newly created or TTL was lost), which avoids a sliding window.
      const ttl = await r.ttl(reportSetKey);
      if (ttl < 0) {
        await r.expire(reportSetKey, EXHAUST_WINDOW);
      }
      const distinctCount = await r.scard(reportSetKey);
      if (distinctCount >= EXHAUST_THRESHOLD) {
        // Only set exhaustion if not already set (NX) to avoid resetting the TTL
        await r.set(`key:${currentKey}:exhausted`, "1", { ex: EXHAUSTED_TTL, nx: true });
      }
      // Even if threshold not met, this room's key just failed - return exhausted
      // immediately so the user gets 429 instead of looping with the same broken key.
      // The threshold gates the global exhaustion marker (affects new rooms), but
      // this room should not retry the same key.
      await r.expire(roomKey, ROOM_KEY_TTL);
      return { error: "room-exhausted" as const };
    }

    // Check existing room-to-key mapping (reuse the GET we already did)
    if (currentKey !== null) {
      if (!keySets[currentKey]) {
        // Mapping points to a key index that no longer exists in env config.
        // This is a server configuration error (key removed), not a quota issue.
        // Return null so the route can respond with 500 instead of misleading 429.
        console.error(
          "[KeyRotation] Redis mapping references missing key index",
          { room, currentKey, configuredKeyCount: keySets.length },
        );
        // Still refresh TTL so the mapping does not expire while the room is active.
        // Preserves room affinity once the server configuration is corrected.
        await r.expire(roomKey, ROOM_KEY_TTL);
        return null;
      }
      const exhausted = await r.exists(`key:${currentKey}:exhausted`);
      if (!exhausted) {
        // Key is healthy - use it (room affinity)
        await r.expire(roomKey, ROOM_KEY_TTL);
        return { keySet: keySets[currentKey]!, index: currentKey };
      }
      // Key is exhausted with active mapping - refuse (don't split room)
      // Still refresh TTL so the mapping doesn't expire while the room is active,
      // which would cause a late joiner to get a different key and split the room.
      await r.expire(roomKey, ROOM_KEY_TTL);
      // TODO: if room is actually empty (all users left), we could reassign.
      // This requires checking PartyKit participant count, which is a cross-service call.
      // For now, the 1hr TTL on the mapping handles this: empty rooms expire naturally.
      return { error: "room-exhausted" as const };
    }

    // No mapping - new room. Find least-loaded non-exhausted key.

    // 1. Check which keys are exhausted
    const pipeline = r.pipeline();
    for (let i = 0; i < keySets.length; i++) {
      pipeline.exists(`key:${i}:exhausted`);
    }
    const exhaustionResults = await pipeline.exec<number[]>();

    // Treat undefined pipeline results as exhausted (fail-closed) to avoid
    // routing to a potentially bad key on partial pipeline failure
    const nonExhausted = keySets
      .map((_, i) => i)
      .filter((i) => (exhaustionResults[i] ?? 1) === 0);

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
      // Winner's key vanished (theoretically impossible with 1hr TTL).
      // Try SET NX to avoid clobbering a concurrent write, then read back
      // whatever Redis has to ensure we return the actual stored value.
      await r.set(roomKey, bestIdx, { ex: ROOM_KEY_TTL, nx: true });
      const finalKey = await r.get<number>(roomKey);
      if (finalKey !== null && keySets[finalKey]) {
        return { keySet: keySets[finalKey]!, index: finalKey };
      }
      // Inconsistent Redis state: we could not confirm any stored mapping.
      // Fail closed so the caller can return a 500 rather than breaking affinity.
      return null;
    }

    return { keySet: keySets[bestIdx]!, index: bestIdx };
  } catch (err) {
    // Redis error - fall back to deterministic hash function.
    // Note: this can break room affinity for rooms previously pinned via Redis,
    // but availability is preferred over perfect affinity during outages.
    console.error("[KeyRotation] Redis error, falling back to hash:", err);
    const idx = hashRoomToKey(room, keySets.length);
    return { keySet: keySets[idx]!, index: idx };
  }
}
