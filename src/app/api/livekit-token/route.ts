import { NextRequest, NextResponse } from "next/server";
import { AccessToken, RoomConfiguration, TrackSource } from "livekit-server-sdk";

export async function GET(req: NextRequest) {
  try {
    const room = req.nextUrl.searchParams.get("room");
    const name = req.nextUrl.searchParams.get("name");

    if (!room || !name) {
      return NextResponse.json(
        { error: "Missing required query params: room, name" },
        { status: 400 },
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 },
      );
    }

    // Use client-provided session ID for stable identity across refreshes.
    // If the same identity reconnects, LiveKit replaces the old participant
    // instantly — no ghost participants burning quota.
    // Falls back to random UUID if no session ID provided (backwards compat).
    const sessionId = req.nextUrl.searchParams.get("sid");
    const uniqueId = sessionId || `${name}-${crypto.randomUUID().slice(0, 8)}`;

    const at = new AccessToken(apiKey, apiSecret, {
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

    // Auto-destroy empty rooms to stop burning LiveKit quota
    at.roomConfig = new RoomConfiguration({
      emptyTimeout: 30,      // destroy room 30s after last participant leaves
      departureTimeout: 5,   // grace period for reconnections (short = fewer ghosts)
      maxParticipants: 10,
    });

    const token = await at.toJwt();

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Failed to generate LiveKit token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }
}
