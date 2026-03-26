import { NextRequest, NextResponse } from "next/server";
import { AccessToken, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { getKeySets, getKeyForRoom } from "~/lib/keyRotation";

// LiveKit token endpoint with Redis-backed key rotation.
// See docs/IDEOLOGY.md for full architecture documentation.

export async function GET(req: NextRequest) {
  try {
    const room = req.nextUrl.searchParams.get("room");
    const name = req.nextUrl.searchParams.get("name");
    const keyHint = req.nextUrl.searchParams.get("keyHint");

    if (!room || !name) {
      return NextResponse.json(
        { error: "Missing required query params: room, name" },
        { status: 400 },
      );
    }

    // Validate room code format (alphanumeric + dash, 1-20 chars)
    if (!/^[a-zA-Z0-9-]{1,20}$/.test(room)) {
      return NextResponse.json(
        { error: "Invalid room code" },
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

    // Get the key for this room (Redis-backed with fallback to hash)
    const result = await getKeyForRoom(room, keySets, keyHint === "next");

    if (!result || "error" in result) {
      const msg = result?.error === "all-exhausted"
        ? "All sessions are at capacity right now. Please try again in a few minutes."
        : "This room has hit its session limit. Ask people in the room to create a new one, or create your own.";
      return NextResponse.json({ error: msg }, { status: 429 });
    }

    const { keySet, index } = result;
    const uniqueId = `${name}-${crypto.randomUUID().slice(0, 8)}`;

    const at = new AccessToken(keySet.apiKey, keySet.apiSecret, {
      identity: uniqueId,
      name: name,
      ttl: 3600, // 1 hour
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

    return NextResponse.json({
      token,
      url: keySet.url,
      keySet: index + 1, // 1-indexed for logging
    });
  } catch (error) {
    console.error("Failed to generate LiveKit token:", error);

    // Check if it's a quota error from JWT signing (unlikely but defensive)
    const isQuota = error instanceof Error &&
      (error.message.includes("quota") || error.message.includes("429"));

    if (isQuota) {
      return NextResponse.json(
        { error: "All sessions are at capacity right now. Please try again in a few minutes." },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }
}
