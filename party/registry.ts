import type * as Party from "partykit/server";

interface RoomEntry {
  participantCount: number;
  mode: "karaoke" | "watch";
  currentSinger: string | null;
  currentSong: string | null;
  isLocked: boolean;
  updatedAt: number;
}

const EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

export default class Registry implements Party.Server {
  rooms: Map<string, RoomEntry> = new Map();

  constructor(readonly room: Party.Room) {}

  private purgeExpired() {
    const cutoff = Date.now() - EXPIRY_MS;
    for (const [code, entry] of this.rooms) {
      if (entry.updatedAt < cutoff) {
        this.rooms.delete(code);
      }
    }
  }

  async onRequest(req: Party.Request) {
    const url = new URL(req.url);
    const roomCode = url.searchParams.get("room");

    if (req.method === "GET") {
      this.purgeExpired();
      const list = Array.from(this.rooms.entries()).map(([code, entry]) => ({
        code,
        ...entry,
      }));
      return new Response(JSON.stringify(list), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (req.method === "POST" && roomCode) {
      const body = (await req.json()) as Omit<RoomEntry, "updatedAt">;
      this.rooms.set(roomCode, { ...body, updatedAt: Date.now() });
      return new Response("ok", { status: 200 });
    }

    if (req.method === "DELETE" && roomCode) {
      this.rooms.delete(roomCode);
      return new Response("ok", { status: 200 });
    }

    return new Response("Method not allowed", { status: 405 });
  }
}
