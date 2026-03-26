import { NextRequest, NextResponse } from "next/server";
import { AccessToken, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { getKeySets, getKeyForRoom } from "~/lib/keyRotation";
import { validateRoomCode } from "~/lib/room-code";
import { MAX_NAME_LENGTH } from "~/lib/playerName";

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

    // Cap name length to prevent oversized JWTs
    const safeName = name.trim().slice(0, MAX_NAME_LENGTH);
    if (!safeName) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 },
      );
    }

    // Validate using the same room code format the app generates (6-char custom charset)
    const normalizedRoom = room.toUpperCase();
    if (!validateRoomCode(normalizedRoom)) {
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
    const result = await getKeyForRoom(normalizedRoom, keySets, keyHint === "next");

    if (!result) {
      // null = configuration error (missing key index, no keys configured)
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    if ("error" in result) {
      const msg = result.error === "all-exhausted"
        ? "All sessions are at capacity right now. Please try again in a few minutes."
        : "This room has hit its session limit. Ask people in the room to create a new one, or create your own.";
      return NextResponse.json({ error: msg, reason: result.error }, { status: 429 });
    }

    const { keySet, index } = result;
    const uniqueId = `${safeName}-${crypto.randomUUID().slice(0, 8)}`;

    const at = new AccessToken(keySet.apiKey, keySet.apiSecret, {
      identity: uniqueId,
      name: safeName,
      ttl: 3600, // 1 hour
    });

    at.addGrant({
      room: normalizedRoom,
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
