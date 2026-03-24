"use client";

import type { RoomState } from "~/types/room";

interface NowSingingProps {
  roomState: RoomState;
  isMyTurn: boolean;
  myPeerId: string | null;
  isSharing: boolean;
  onStartSharing: () => Promise<void>;
  onStopSharing: () => void;
  onFinishSinging: () => void;
  audioError: string | null;
  singerSongName: string | null;
}

export function NowSinging({
  roomState,
  isMyTurn,
  myPeerId,
  isSharing,
  onStartSharing,
  onStopSharing,
  onFinishSinging,
  audioError,
  singerSongName,
}: NowSingingProps) {
  const currentSinger = roomState.participants.find(
    (p) => p.id === roomState.currentSingerId,
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-8"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: roomState.currentSingerId
          ? "var(--color-neon-pink)"
          : "var(--color-dark-border)",
        boxShadow: roomState.currentSingerId
          ? "0 0 40px rgba(255, 45, 120, 0.15), inset 0 0 40px rgba(255, 45, 120, 0.03)"
          : "none",
        transition: "all 0.5s ease",
        minHeight: "200px",
      }}
    >
      {/* Decorative gradient bar at top */}
      <div
        className="absolute left-0 top-0 h-1 w-full"
        style={{
          background: roomState.currentSingerId
            ? "linear-gradient(90deg, var(--color-neon-pink), var(--color-neon-purple), var(--color-neon-cyan))"
            : "var(--color-dark-border)",
        }}
      />

      {!roomState.currentSingerId ? (
        /* No one singing */
        <div className="flex h-full flex-col items-center justify-center gap-4 py-8">
          <div
            className="text-5xl"
            style={{ filter: "grayscale(0.5)", opacity: 0.6 }}
          >
            🎤
          </div>
          <p
            className="text-lg"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-text-secondary)",
            }}
          >
            Stage is empty
          </p>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Join the queue to start singing!
          </p>
        </div>
      ) : isMyTurn ? (
        /* I'm singing */
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <p
              className="mb-1 text-sm uppercase tracking-widest"
              style={{ color: "var(--color-neon-pink)" }}
            >
              You&apos;re up!
            </p>
            <h2
              className="text-3xl font-bold"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--color-text-primary)",
              }}
            >
              🎤 Your Turn to Sing
            </h2>
          </div>

          {audioError && (
            <p className="text-sm" style={{ color: "var(--color-neon-pink)" }}>
              {audioError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            {!isSharing ? (
              <button
                onClick={onStartSharing}
                className="cursor-pointer rounded-xl px-6 py-3 font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  fontFamily: "var(--font-display)",
                  background:
                    "linear-gradient(135deg, var(--color-neon-pink), var(--color-neon-purple))",
                  color: "#fff",
                  boxShadow: "0 0 25px rgba(255, 45, 120, 0.3)",
                }}
              >
                Share Your Audio
              </button>
            ) : (
              <button
                onClick={onStopSharing}
                className="cursor-pointer rounded-xl border-2 px-6 py-3 font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  fontFamily: "var(--font-display)",
                  borderColor: "var(--color-neon-pink)",
                  color: "var(--color-neon-pink)",
                  background: "rgba(255, 45, 120, 0.1)",
                }}
              >
                Stop Sharing
              </button>
            )}

            <button
              onClick={() => {
                onStopSharing();
                onFinishSinging();
              }}
              className="cursor-pointer rounded-xl border px-6 py-3 font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                fontFamily: "var(--font-display)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              Done Singing
            </button>
          </div>

          {isSharing && (
            <div className="flex flex-col items-center gap-2">
              {singerSongName && (
                <p
                  className="max-w-md truncate text-lg"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--color-neon-purple)",
                    textShadow: "0 0 12px rgba(168, 85, 247, 0.4)",
                  }}
                  title={singerSongName}
                >
                  ♫ {singerSongName}
                </p>
              )}
              <div
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
                style={{
                  background: "rgba(0, 240, 255, 0.08)",
                  color: "var(--color-neon-cyan)",
                  animation: "neon-pulse 2s ease-in-out infinite",
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-neon-cyan)" }} />
                Sharing system audio to room
              </div>
            </div>
          )}

          <p
            className="text-center text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Tip: Play your karaoke video in another tab, then click &quot;Share
            Your Audio&quot; and select that tab.
            <br />
            Use headphones to avoid echo!
          </p>
        </div>
      ) : (
        /* Someone else is singing */
        <div className="flex flex-col items-center gap-4">
          <p
            className="text-sm uppercase tracking-widest"
            style={{ color: "var(--color-neon-pink)" }}
          >
            Now Singing
          </p>
          <h2
            className="text-3xl font-bold"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-text-primary)",
            }}
          >
            🎤 {currentSinger?.name ?? "Unknown"}
          </h2>
          {singerSongName && (
            <p
              className="max-w-md truncate text-center text-lg"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--color-neon-purple)",
                textShadow: "0 0 12px rgba(168, 85, 247, 0.4)",
              }}
              title={singerSongName}
            >
              ♫ {singerSongName}
            </p>
          )}
          <div
            className="mt-2 flex items-center gap-2 text-sm"
            style={{ color: "var(--color-neon-cyan)" }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: "var(--color-neon-cyan)",
                animation: "neon-pulse 1.5s ease-in-out infinite",
              }}
            />
            Listening...
          </div>
        </div>
      )}
    </div>
  );
}
