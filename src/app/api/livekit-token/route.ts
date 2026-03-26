import { NextRequest, NextResponse } from "next/server";
import { AccessToken, RoomConfiguration, TrackSource } from "livekit-server-sdk";

// Multiple LiveKit API key sets for quota distribution.
// NOTE: Token generation (toJwt) is local — quota errors happen at room.connect()
// on the client, not here. This rotation is PREEMPTIVE: keys are round-robined
// to spread usage across projects. The cooldown/exhaustion tracking is best-effort
// and resets on serverless cold starts. For true reactive failover, the client
// would need to retry with a different key hint on connect failure.
// Set in env: LIVEKIT_API_KEY, LIVEKIT_API_KEY_2, LIVEKIT_API_KEY_3, etc.
interface LiveKitKeySet {
  apiKey: string;
  apiSecret: string;
  url: string;
}

function getKeySets(): LiveKitKeySet[] {
  const sets: LiveKitKeySet[] = [];
  const defaultUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";

  // Scan LIVEKIT_API_KEY, LIVEKIT_API_KEY_2, LIVEKIT_API_KEY_3, ... up to _20
  // Add as many key sets as you want - just add env vars with incrementing suffixes
  const suffixes = ["", ...Array.from({ length: 20 }, (_, i) => `_${i + 2}`)];

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

// Track exhausted keys with cooldown (avoid hammering a key that just hit quota)
const exhaustedUntil = new Map<number, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min cooldown after quota hit

// Hash room code to a key index - ensures all users in the same room
// get the same LiveKit project (rooms are project-scoped)
function roomKeyIndex(room: string, total: number): number {
  let hash = 0;
  for (let i = 0; i < room.length; i++) {
    hash = ((hash << 5) - hash + room.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % total;
}

function getKeySetForRoom(room: string, keySets: LiveKitKeySet[], offset = 0): { keySet: LiveKitKeySet; index: number } | null {
  const now = Date.now();
  const total = keySets.length;
  const baseIdx = roomKeyIndex(room, total);

  // Try keys starting from the room's hashed index + offset
  for (let attempt = 0; attempt < total; attempt++) {
    const idx = (baseIdx + offset + attempt) % total;
    const cooldownEnd = exhaustedUntil.get(idx);

    if (!cooldownEnd || now > cooldownEnd) {
      return { keySet: keySets[idx]!, index: idx };
    }
  }

  // All keys exhausted - use the one with the shortest remaining cooldown
  let bestIdx = 0;
  let bestTime = Infinity;
  for (const [idx, until] of exhaustedUntil) {
    if (until < bestTime) {
      bestTime = until;
      bestIdx = idx;
    }
  }
  return { keySet: keySets[bestIdx]!, index: bestIdx };
}

function markExhausted(index: number) {
  exhaustedUntil.set(index, Date.now() + COOLDOWN_MS);
  console.log(`[LiveKit] Key set #${index + 1} hit quota - cooldown for ${COOLDOWN_MS / 1000}s`);
}

export async function GET(req: NextRequest) {
  try {
    const room = req.nextUrl.searchParams.get("room");
    const name = req.nextUrl.searchParams.get("name");
    const keyHint = req.nextUrl.searchParams.get("keyHint"); // "next" to skip current key

    if (!room || !name) {
      return NextResponse.json(
        { error: "Missing required query params: room, name" },
        { status: 400 },
      );
    }

    const keySets = getKeySets();
    if (keySets.length === 0) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 },
      );
    }

    // If client reported a connect failure, try the next key for this room
    const offset = keyHint === "next" ? 1 : 0;

    // Try key sets with failover (starting from the room's hashed key)
    let lastError: unknown = null;
    for (let attempt = 0; attempt < keySets.length; attempt++) {
      const active = getKeySetForRoom(room, keySets, offset + attempt);
      if (!active) break;

      try {
        const { keySet, index } = active;

        const uniqueId = `${name}-${crypto.randomUUID().slice(0, 8)}`;

        const at = new AccessToken(keySet.apiKey, keySet.apiSecret, {
          identity: uniqueId,
          name: name,
        });

        at.addGrant({
          room,
          roomJoin: true,
          roomCreate: true,
          canPublish: true,
          canSubscribe: true,
          canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE_AUDIO],
        });

        at.roomConfig = new RoomConfiguration({
          emptyTimeout: 30,
          departureTimeout: 15,
          maxParticipants: 10,
        });

        const token = await at.toJwt();

        // Return token + the LiveKit URL for this key set
        // (different keys might point to different LiveKit Cloud projects)
        return NextResponse.json({
          token,
          url: keySet.url,
        });
      } catch (err) {
        lastError = err;
        const isQuotaError =
          err instanceof Error &&
          (err.message.includes("quota") ||
           err.message.includes("limit") ||
           err.message.includes("exceeded") ||
           err.message.includes("429"));

        if (isQuotaError) {
          markExhausted(active.index);
          continue; // try next key for this room
        }

        // Non-quota error — don't rotate, just fail
        throw err;
      }
    }

    // All keys failed
    console.error("All LiveKit key sets exhausted:", lastError);
    return NextResponse.json(
      { error: "All LiveKit accounts have reached quota. Try again later." },
      { status: 429 },
    );
  } catch (error) {
    console.error("Failed to generate LiveKit token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }
}
