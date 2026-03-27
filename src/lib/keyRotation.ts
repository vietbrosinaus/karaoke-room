/**
 * LiveKit key rotation with Upstash Redis.
 *
 * Strategy: Least-loaded with room affinity (as specified in docs/IDEOLOGY.md).
 * - New rooms assigned to the key with fewest active rooms (TTL-based counting)
 * - Existing rooms always use their assigned key (room affinity, no split)
 * - Exhausted keys are marked and skipped for new assignments
 * - Falls back to deterministic hash if Redis is unreachable
 *
 * Room counts use TTL-based counting: each room:X:key mapping has a TTL.
 * To find the least-loaded key, we count active mappings per key via SCAN.
 * Expired TTLs self-clean via SCAN (only non-expired keys appear in results).
 *
 * Exhaustion tracking uses a Redis Set per key (SADD) to count distinct rooms
 * reporting failures. Global exhaustion requires EXHAUST_THRESHOLD distinct rooms.
 * A separate quota_hit marker (1hr TTL) allows single-report re-exhaustion for
 * keys that have recently been marked exhausted (handles the 5-min cooldown cycle).
 *
 * On forceNext: if the key is already exhausted (or has recent quota_hit), return
 * room-exhausted immediately. Otherwise, record the report and return a valid token
 * so network blips don't produce false positives.
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

// Room mapping TTL: 1 hour. Kept alive indefinitely by the client-side token refresh
// (every 30min in useLiveKit.ts). Only expires if ALL users in the room disconnect
// and nobody new joins for 1 hour - at which point the room is truly dead.
const ROOM_KEY_TTL = 3600;     // 1 hour - room-to-key mapping
const EXHAUSTED_TTL = 300;     // 5 min - key exhaustion cooldown
const QUOTA_HIT_TTL = 3600;    // 1 hour - "this key had quota issues recently" marker
const EXHAUST_THRESHOLD = 3;   // 3 distinct rooms to mark key globally exhausted (DoS resistance)
const EXHAUST_WINDOW = 60;     // fixed window from first report

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
    const roomKey = `room:${room}:key`;

    // Read room's current key mapping once (reused by both forceNext and affinity check)
    const currentKey = await r.get<number>(roomKey);

    // C2 fix: forceNext now has two behaviors based on key state:
    // - Key already exhausted or has recent quota_hit: return room-exhausted immediately
    // - Key appears healthy: record the report via SADD but return a valid token (no false positive)
    if (forceNext && currentKey !== null && currentKey >= 0 && currentKey < keySets.length) {
      const reportSetKey = `key:${currentKey}:report_rooms`;
      // Always record the report
      await r.sadd(reportSetKey, room);
      const ttl = await r.ttl(reportSetKey);
      if (ttl < 0) {
        await r.expire(reportSetKey, EXHAUST_WINDOW);
      }
      const distinctCount = await r.scard(reportSetKey);

      // Check if threshold met - mark globally exhausted
      if (distinctCount >= EXHAUST_THRESHOLD) {
        await r.set(`key:${currentKey}:exhausted`, "1", { ex: EXHAUSTED_TTL, nx: true });
        // S1 fix: also set quota_hit marker (1hr) so single reports re-exhaust quickly
        await r.set(`key:${currentKey}:quota_hit`, "1", { ex: QUOTA_HIT_TTL, nx: true });
      }

      // S1 fix: if key had quota issues recently, single report re-exhausts immediately
      const [isExhausted, hadQuotaHit] = await Promise.all([
        r.exists(`key:${currentKey}:exhausted`),
        r.exists(`key:${currentKey}:quota_hit`),
      ]);

      if (isExhausted || hadQuotaHit) {
        // Key is known-bad. Re-mark exhausted if not already, and return room-exhausted.
        if (!isExhausted && hadQuotaHit) {
          await r.set(`key:${currentKey}:exhausted`, "1", { ex: EXHAUSTED_TTL, nx: true });
        }
        await r.expire(roomKey, ROOM_KEY_TTL);
        return { error: "room-exhausted" as const };
      }

      // C2 fix: key appears healthy (no exhaustion, no recent quota_hit).
      // Don't return room-exhausted - it might be a network blip.
      // Fall through to the normal affinity path and return a valid token.
    }

    // Check existing room-to-key mapping (reuse the GET we already did)
    if (currentKey !== null) {
      if (!keySets[currentKey]) {
        console.error(
          "[KeyRotation] Redis mapping references missing key index",
          { room, currentKey, configuredKeyCount: keySets.length },
        );
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
      await r.expire(roomKey, ROOM_KEY_TTL);
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
      .filter((i) => (exhaustionResults[i] ?? 1) === 0);

    if (nonExhausted.length === 0) {
      return { error: "all-exhausted" as const };
    }

    // 2. Count active rooms per key (TTL-based counting via SCAN)
    const roomCounts = await countRoomsPerKey(r, keySets.length);

    // 3. Pick the non-exhausted key with the fewest rooms (least-loaded)
    // S3 fix: random tie-breaking to avoid burst skew toward lowest index
    let bestIdx = nonExhausted[0]!;
    let bestCount = Infinity;
    for (const idx of nonExhausted) {
      const count = roomCounts[idx]!;
      if (count < bestCount || (count === bestCount && Math.random() > 0.5)) {
        bestCount = count;
        bestIdx = idx;
      }
    }

    // 4. Atomic SET NX - prevents race where two concurrent requests
    //    for the same new room get different keys
    const wasSet = await r.set(roomKey, bestIdx, { ex: ROOM_KEY_TTL, nx: true });

    if (!wasSet) {
      const assignedKey = await r.get<number>(roomKey);
      if (assignedKey !== null && keySets[assignedKey]) {
        return { keySet: keySets[assignedKey]!, index: assignedKey };
      }
      await r.set(roomKey, bestIdx, { ex: ROOM_KEY_TTL, nx: true });
      const finalKey = await r.get<number>(roomKey);
      if (finalKey !== null && keySets[finalKey]) {
        return { keySet: keySets[finalKey]!, index: finalKey };
      }
      return null;
    }

    return { keySet: keySets[bestIdx]!, index: bestIdx };
  } catch (err) {
    console.error("[KeyRotation] Redis error, falling back to hash:", err);
    const idx = hashRoomToKey(room, keySets.length);
    return { keySet: keySets[idx]!, index: idx };
  }
}
