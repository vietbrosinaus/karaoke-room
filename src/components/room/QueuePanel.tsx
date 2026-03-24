"use client";

import type { RoomState } from "~/types/room";

interface QueuePanelProps {
  roomState: RoomState;
  myPeerId: string | null;
  onJoinQueue: () => void;
  onLeaveQueue: () => void;
  canSing?: boolean;
}

export function QueuePanel({
  roomState,
  myPeerId,
  onJoinQueue,
  onLeaveQueue,
  canSing = true,
}: QueuePanelProps) {
  const isInQueue = myPeerId ? roomState.queue.includes(myPeerId) : false;
  const isSinging = myPeerId !== null && roomState.currentSingerId === myPeerId;
  const isInQueueOrSinging = isInQueue || isSinging;

  const queueWithNames = roomState.queue.map((id) => {
    const p = roomState.participants.find((p) => p.id === id);
    return { id, name: p?.name ?? "Unknown" };
  });

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
            color: "var(--color-neon-purple)",
            fontSize: "0.75rem",
          }}
        >
          Singing Queue
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background: "rgba(184, 77, 255, 0.15)",
            color: "var(--color-neon-purple)",
          }}
        >
          {roomState.queue.length}
        </span>
      </div>

      {/* Queue list */}
      {queueWithNames.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {queueWithNames.map((entry, i) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={{
                background:
                  entry.id === myPeerId
                    ? "rgba(0, 240, 255, 0.08)"
                    : "var(--color-dark-card)",
                animation: `slide-in 0.3s ease-out ${i * 0.05}s both`,
              }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: "rgba(184, 77, 255, 0.2)",
                  color: "var(--color-neon-purple)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {i + 1}
              </span>
              <span
                className="text-sm"
                style={{
                  color:
                    entry.id === myPeerId
                      ? "var(--color-neon-cyan)"
                      : "var(--color-text-primary)",
                }}
              >
                {entry.name}
                {entry.id === myPeerId && (
                  <span
                    className="ml-1.5 text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    (you)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="mb-4 py-4 text-center text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Queue is empty — be the first to sing!
        </p>
      )}

      {/* Join / Leave button */}
      {!isInQueueOrSinging ? (
        canSing ? (
          <button
            onClick={onJoinQueue}
            className="w-full cursor-pointer rounded-xl py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-display)",
              background:
                "linear-gradient(135deg, var(--color-neon-purple), var(--color-neon-pink))",
              color: "#fff",
              boxShadow: "0 0 20px rgba(184, 77, 255, 0.2)",
            }}
          >
            🎤 I Want to Sing
          </button>
        ) : (
          <div
            className="rounded-xl py-3 text-center text-xs"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-text-secondary)",
              background: "var(--color-dark-card)",
              border: "1px solid var(--color-dark-border)",
            }}
          >
            Singing requires Chrome or Edge on desktop
          </div>
        )
      ) : isSinging ? (
        <div
          className="rounded-xl py-3 text-center text-sm font-bold"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-neon-pink)",
            background: "rgba(255, 45, 120, 0.1)",
          }}
        >
          You&apos;re singing!
        </div>
      ) : (
        <button
          onClick={onLeaveQueue}
          className="w-full cursor-pointer rounded-xl border py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            fontFamily: "var(--font-display)",
            borderColor: "var(--color-dark-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          Leave Queue
        </button>
      )}
    </div>
  );
}
