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
        /* ── Stage empty ── */
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
        /* ── My turn — guided step flow ── */
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
            <div
              className="rounded-lg px-4 py-2 text-sm"
              style={{
                background: "rgba(255, 45, 120, 0.1)",
                color: "var(--color-neon-pink)",
                border: "1px solid rgba(255, 45, 120, 0.2)",
              }}
            >
              {audioError}
            </div>
          )}

          {!isSharing ? (
            /* Steps before sharing */
            <div className="w-full max-w-md space-y-3">
              {/* Step indicators */}
              <StepRow
                number={1}
                label="Open your karaoke video in another browser tab"
                hint="YouTube, Spotify, or any music site"
                done={false}
                active
              />
              <StepRow
                number={2}
                label="Click the button below to share that tab's audio"
                hint="A browser popup will ask you to pick which tab"
                done={false}
                active={false}
              />
              <StepRow
                number={3}
                label="Pick the tab and check 'Share tab audio'"
                hint="Everyone in the room will hear the music"
                done={false}
                active={false}
              />

              <button
                onClick={onStartSharing}
                className="mt-4 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl px-6 py-4 font-bold tracking-wide transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  fontFamily: "var(--font-display)",
                  background:
                    "linear-gradient(135deg, var(--color-neon-pink), var(--color-neon-purple))",
                  color: "#fff",
                  boxShadow: "0 0 25px rgba(255, 45, 120, 0.3)",
                  fontSize: "1rem",
                }}
              >
                <ShareIcon />
                Share Tab Audio
              </button>

              <p
                className="text-center text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                🎧 Use headphones to avoid echo!
              </p>
            </div>
          ) : (
            /* Currently sharing — live state */
            <div className="flex w-full max-w-md flex-col items-center gap-4">
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
                className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "rgba(0, 240, 255, 0.08)",
                  border: "1px solid rgba(0, 240, 255, 0.15)",
                  color: "var(--color-neon-cyan)",
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: "var(--color-neon-cyan)",
                    animation: "neon-pulse 1.5s ease-in-out infinite",
                  }}
                />
                Sharing audio to room — everyone can hear the music
              </div>

              <div className="flex w-full gap-3">
                <button
                  onClick={onStopSharing}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    fontFamily: "var(--font-display)",
                    borderColor: "var(--color-dark-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Stop Music
                </button>

                <button
                  onClick={() => {
                    onStopSharing();
                    onFinishSinging();
                  }}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: "rgba(255, 45, 120, 0.15)",
                    color: "var(--color-neon-pink)",
                    border: "1px solid rgba(255, 45, 120, 0.3)",
                  }}
                >
                  🎤 Finish My Turn
                </button>
              </div>
            </div>
          )}

          {/* Skip option if they don't want to share audio */}
          {!isSharing && (
            <button
              onClick={() => {
                onFinishSinging();
              }}
              className="cursor-pointer text-xs underline transition-opacity hover:opacity-80"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Skip my turn
            </button>
          )}
        </div>
      ) : (
        /* ── Someone else is singing ── */
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

/* ── Step row for the guided flow ── */

function StepRow({
  number,
  label,
  hint,
  done,
  active,
}: {
  number: number;
  label: string;
  hint: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-4 py-3"
      style={{
        background: active
          ? "rgba(0, 240, 255, 0.05)"
          : "var(--color-dark-card)",
        opacity: active || done ? 1 : 0.5,
        animation: `slide-in 0.3s ease-out ${(number - 1) * 0.08}s both`,
      }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: done
            ? "rgba(0, 240, 255, 0.2)"
            : active
              ? "rgba(255, 45, 120, 0.2)"
              : "var(--color-dark-border)",
          color: done
            ? "var(--color-neon-cyan)"
            : active
              ? "var(--color-neon-pink)"
              : "var(--color-text-secondary)",
          fontFamily: "var(--font-display)",
        }}
      >
        {done ? "✓" : number}
      </span>
      <div>
        <p
          className="text-sm"
          style={{
            color: active
              ? "var(--color-text-primary)"
              : "var(--color-text-secondary)",
          }}
        >
          {label}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {hint}
        </p>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  );
}
