"use client";

import type { Participant, ParticipantStatus } from "~/types/room";

interface ParticipantListProps {
  participants: Participant[];
  currentSingerId: string | null;
  myPeerId: string | null;
  participantStatus?: Record<string, ParticipantStatus>;
  activeSpeakers?: Set<string>;
}

export function ParticipantList({
  participants,
  currentSingerId,
  myPeerId,
  participantStatus = {},
  activeSpeakers = new Set(),
}: ParticipantListProps) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3
          className="text-sm uppercase tracking-widest"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-neon-yellow)",
            fontSize: "0.75rem",
          }}
        >
          In the Room
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background: "rgba(255, 225, 86, 0.15)",
            color: "var(--color-neon-yellow)",
          }}
        >
          {participants.length}
        </span>
      </div>

      <ul className="space-y-1.5">
        {participants.map((p, i) => {
          const status = participantStatus[p.id];
          // Match by name prefix — LiveKit identity is "name-randomhex"
          const isSpeaking = Array.from(activeSpeakers).some((id) =>
            id.startsWith(p.name + "-") || id === p.name
          );
          return (
            <li
              key={p.id}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200"
              style={{
                background: isSpeaking
                  ? "rgba(139, 92, 246, 0.18)"
                  : p.id === myPeerId
                    ? "rgba(139, 92, 246, 0.06)"
                    : "transparent",
                boxShadow: isSpeaking
                  ? "inset 0 0 0 1.5px rgba(139, 92, 246, 0.5), 0 0 12px rgba(139, 92, 246, 0.2)"
                  : "none",
                animation: `slide-in 0.3s ease-out ${i * 0.04}s both`,
              }}
            >
              <div
                className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: isSpeaking
                    ? "rgba(139, 92, 246, 0.45)"
                    : p.id === currentSingerId
                      ? "var(--color-primary-dim)"
                      : "var(--color-dark-card)",
                  color: isSpeaking
                    ? "var(--color-primary)"
                    : p.id === currentSingerId
                      ? "var(--color-primary)"
                      : "var(--color-text-secondary)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {p.id === currentSingerId ? "🎤" : p.name.charAt(0).toUpperCase()}
                {isSpeaking && (
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: "2px solid var(--color-primary)",
                      animation: "pulse-ring 1.2s ease-out infinite",
                    }}
                  />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="truncate"
                  style={{
                    color:
                      p.id === myPeerId
                        ? "var(--color-neon-cyan)"
                        : "var(--color-text-primary)",
                  }}
                >
                  {p.name}
                  {p.id === myPeerId && (
                    <span
                      className="ml-1 text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      (you)
                    </span>
                  )}
                </span>

                {/* Status icons */}
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {status && (
                    <>
                      {/* Mic status */}
                      {status.isMuted ? (
                        <MicOffSmallIcon />
                      ) : (
                        <MicOnSmallIcon />
                      )}

                      {/* Browser */}
                      {status.browser && (
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--color-text-secondary)", opacity: 0.7 }}
                          title={status.browser}
                        >
                          {status.browser}
                        </span>
                      )}

                      {/* Sharing audio */}
                      {status.isSharingAudio && <MusicNoteIcon />}

                      {/* Current song */}
                      {status.currentSong && (
                        <span
                          className="max-w-[100px] truncate text-xs"
                          style={{ color: "var(--color-neon-pink)" }}
                          title={status.currentSong}
                        >
                          {status.currentSong.length > 25
                            ? status.currentSong.slice(0, 25) + "..."
                            : status.currentSong}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}

        {participants.length === 0 && (
          <li
            className="py-4 text-center text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            No one here yet
          </li>
        )}
      </ul>
    </div>
  );
}

function MicOnSmallIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-neon-cyan)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffSmallIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-text-secondary)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: 0.6 }}
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MusicNoteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-neon-pink)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
