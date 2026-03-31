"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Mic, Tv, Lock, ArrowLeft, RefreshCw } from "lucide-react";

interface RoomEntry {
  code: string;
  participantCount: number;
  mode: "karaoke" | "watch";
  currentSinger: string | null;
  currentSong: string | null;
  isLocked: boolean;
}

const POLL_INTERVAL_MS = 10_000;

export default function BrowsePage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const host =
        process.env.NEXT_PUBLIC_PARTY_HOST ?? "localhost:1999";
      const protocol = host.startsWith("localhost") ? "http" : "https";
      const res = await fetch(
        `${protocol}://${host}/parties/registry/global`
      );
      if (!res.ok) throw new Error("Failed to fetch rooms");
      const data = (await res.json()) as RoomEntry[];
      setRooms(data);
      setError(null);
    } catch {
      setError("Could not load rooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRooms();
    const interval = setInterval(() => void fetchRooms(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden px-4 py-10">
      {/* Background */}
      <div
        className="pointer-events-none absolute -top-60 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-[0.06] blur-[120px]"
        style={{ background: "var(--color-primary)" }}
      />

      {/* Header */}
      <div className="mb-8 w-full max-w-2xl" style={{ animation: "fade-in 0.5s ease-out" }}>
        <button
          onClick={() => router.push("/")}
          className="mb-4 flex items-center gap-1.5 text-sm transition-colors hover:brightness-125"
          style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-display)" }}
        >
          <ArrowLeft size={14} />
          Back to Home
        </button>
        <div className="flex items-center justify-between">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            Active Rooms
          </h1>
          <button
            onClick={() => void fetchRooms()}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all hover:border-[var(--color-primary)]"
            style={{
              borderColor: "var(--color-dark-border)",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-display)",
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="w-full max-w-2xl" style={{ animation: "fade-in 0.6s ease-out 0.1s both" }}>
        {loading && (
          <div className="flex justify-center py-20">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {!loading && error && (
          <p className="py-20 text-center text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        {!loading && !error && rooms.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No active rooms
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)", opacity: 0.6 }}>
              Create one from the home page
            </p>
          </div>
        )}

        {!loading && !error && rooms.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {rooms.map((room) => (
              <button
                key={room.code}
                onClick={() => router.push(`/room/${room.code}`)}
                className="flex flex-col gap-2 rounded-xl border p-4 text-left transition-all hover:border-[var(--color-primary)] hover:brightness-110 active:scale-[0.98]"
                style={{
                  background: "var(--color-dark-surface)",
                  borderColor: "var(--color-dark-border)",
                }}
              >
                {/* Top row: code + lock */}
                <div className="flex items-center justify-between">
                  <span
                    className="font-mono text-lg font-bold tracking-[0.15em]"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {room.code}
                  </span>
                  <div className="flex items-center gap-2">
                    {room.isLocked && (
                      <Lock size={14} style={{ color: "var(--color-accent)" }} />
                    )}
                    {room.mode === "karaoke" ? (
                      <Mic size={14} style={{ color: "var(--color-primary)" }} />
                    ) : (
                      <Tv size={14} style={{ color: "var(--color-primary)" }} />
                    )}
                  </div>
                </div>

                {/* Singer or video info */}
                {(room.currentSinger || room.currentSong) && (
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {room.currentSinger && (
                      <span style={{ color: "var(--color-accent)" }}>
                        {room.currentSinger}
                      </span>
                    )}
                    {room.currentSinger && room.currentSong && " - "}
                    {room.currentSong}
                  </p>
                )}

                {/* Bottom: participant count */}
                <div className="flex items-center gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  <Users size={12} />
                  <span>
                    {room.participantCount} {room.participantCount === 1 ? "person" : "people"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
