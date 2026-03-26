"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Music, Globe } from "lucide-react";
import type { Participant, ParticipantStatus, RoomState } from "~/types/room";

interface PeoplePanelProps {
  roomState: RoomState;
  myPeerId: string | null;
  onJoinQueue: () => void;
  onLeaveQueue: () => void;
  onSetSongIntent?: (song: string) => void;
  canSing: boolean;
  participantStatus: Record<string, ParticipantStatus>;
  activeSpeakers: Set<string>;
  personVolumes: Record<string, number>;
  onPersonVolumeChange: (identity: string, vol: number) => void;
}

export function PeoplePanel({
  roomState,
  myPeerId,
  onJoinQueue,
  onLeaveQueue,
  onSetSongIntent,
  canSing,
  participantStatus,
  activeSpeakers,
  personVolumes,
  onPersonVolumeChange,
}: PeoplePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"people" | "queue">("people");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [songIntent, setSongIntent] = useState("");

  const isInQueue = myPeerId ? roomState.queue.includes(myPeerId) : false;
  const isSinging = myPeerId !== null && roomState.currentSingerId === myPeerId;
  const isInQueueOrSinging = isInQueue || isSinging;
  const isWatchMode = roomState.roomMode === "watch";

  useEffect(() => {
    if (isWatchMode && tab === "queue") setTab("people");
  }, [isWatchMode, tab]);

  // Build a unified list: participants with their queue position
  const queuePositions = new Map(roomState.queue.map((id, i) => [id, i + 1]));

  return (
    <div
      className="flex flex-col rounded-xl border"
      style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
    >
      {/* Tab header */}
      <div className="flex border-b" style={{ borderColor: "var(--color-dark-border)" }}>
        <button
          onClick={() => setTab("people")}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition-all"
          style={{
            fontFamily: "var(--font-display)",
            color: tab === "people" ? "var(--color-primary)" : "var(--color-text-muted)",
            borderBottom: tab === "people" ? "2px solid var(--color-primary)" : "2px solid transparent",
          }}
        >
          People
          <span className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: "var(--color-dark-card)" }}>
            {roomState.participants.length}
          </span>
        </button>
        {!isWatchMode ? (
          <button
            onClick={() => setTab("queue")}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition-all"
            style={{
              fontFamily: "var(--font-display)",
              color: tab === "queue" ? "var(--color-accent)" : "var(--color-text-muted)",
              borderBottom: tab === "queue" ? "2px solid var(--color-accent)" : "2px solid transparent",
            }}
          >
            Queue
            <span className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: "var(--color-dark-card)" }}>
              {roomState.queue.length}
            </span>
          </button>
        ) : null}
      </div>

      {/* Queue tab */}
      {tab === "queue" && !isWatchMode && (
        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {roomState.queue.length === 0 ? (
            <p className="py-6 text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
              Queue is empty — be the first to sing!
            </p>
          ) : (
            <ul className="space-y-1">
              {roomState.queue.map((id, i) => {
                const p = roomState.participants.find((p) => p.id === id);
                const isMe = id === myPeerId;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2"
                    style={{
                      background: isMe ? "var(--color-primary-dim)" : "var(--color-dark-card)",
                      animation: `slide-in 0.2s ease-out ${i * 0.04}s both`,
                    }}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                      style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)", fontFamily: "var(--font-display)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm" style={{ color: isMe ? "var(--color-primary)" : "var(--color-text-primary)" }}>
                      {p?.name ?? "Unknown"}
                      {isMe && <span className="ml-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>(you)</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* People tab */}
      {tab === "people" && (
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto px-3 py-2">
        {roomState.participants.map((p) => {
          const isMe = p.id === myPeerId;
          const isSpeaking = Array.from(activeSpeakers).some((id) =>
            id.startsWith(p.name + "-") || id === p.name
          );
          const queuePos = queuePositions.get(p.id);
          const isSinger = p.id === roomState.currentSingerId;
          const status = participantStatus[p.id];
          const isExpanded = expandedId === p.id && !isMe;

          // Use LiveKit identity from status (broadcast via PartyKit) — no DOM queries needed
          const lkIdentity = status?.lkIdentity ?? p.name;
          const personVol = personVolumes[lkIdentity] ?? 1;

          return (
            <li key={p.id}>
              <div
                onClick={() => !isMe && setExpandedId(isExpanded ? null : p.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${!isMe ? "row-clickable cursor-pointer" : ""}`}
                onContextMenu={(e) => { if (!isMe) { e.preventDefault(); setExpandedId(isExpanded ? null : p.id); } }}
                style={{
                  background: isSpeaking
                    ? "rgba(139, 92, 246, 0.15)"
                    : isMe
                      ? "rgba(139, 92, 246, 0.05)"
                      : undefined,
                  boxShadow: isSpeaking
                    ? "inset 0 0 0 1px rgba(139, 92, 246, 0.4)"
                    : isExpanded
                      ? "0 0 8px rgba(139, 92, 246, 0.3), inset 0 0 0 1px rgba(139, 92, 246, 0.2)"
                      : undefined,
                }}
              >
                {/* Avatar */}
                <div
                  className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: isSinger
                      ? "var(--color-primary-dim)"
                      : isSpeaking
                        ? "rgba(139, 92, 246, 0.3)"
                        : "var(--color-dark-card)",
                    color: isSinger || isSpeaking
                      ? "var(--color-primary)"
                      : "var(--color-text-muted)",
                  }}
                >
                  {isSinger ? <Mic size={14} /> : p.name.charAt(0).toUpperCase()}
                  {isSpeaking && (
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ border: "2px solid var(--color-primary)", animation: "pulse-ring 1.2s ease-out infinite" }}
                    />
                  )}
                </div>

                {/* Name + status */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="truncate text-sm"
                      style={{ color: isMe ? "var(--color-primary)" : "var(--color-text-primary)" }}
                    >
                      {p.name}
                    </span>
                    {isMe && (
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>(you)</span>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {queuePos && !isSinger && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
                    >
                      #{queuePos}
                    </span>
                  )}
                  {status?.browser && (
                    <span className="flex items-center gap-0.5 text-[9px]" style={{ color: "var(--color-text-muted)", opacity: 0.6 }}>
                      <Globe size={9} />
                      {status.browser}
                    </span>
                  )}
                  {status && (
                    status.isMuted
                      ? <MicOff size={12} style={{ color: "var(--color-text-muted)", opacity: 0.5 }} />
                      : <Mic size={12} style={{ color: "var(--color-primary)" }} />
                  )}
                  {status?.isSharingAudio && (
                    <Music size={12} style={{ color: "var(--color-accent)" }} />
                  )}
                </div>
              </div>

              {/* Per-person volume slider */}
              {isExpanded && (
                <div
                  className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "var(--color-dark-card)", animation: "fade-in 0.1s ease-out" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="shrink-0 text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Vol</span>
                  <input
                    type="range" min="0" max="100"
                    value={Math.round(personVol * 100)}
                    onChange={(e) => onPersonVolumeChange(lkIdentity, Number(e.target.value) / 100)}
                    className="volume-slider flex-1"
                  />
                  <span className="w-5 text-right text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                    {Math.round(personVol * 100)}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      )}

      {/* Queue action */}
      <div className="border-t px-3 py-3" style={{ borderColor: "var(--color-dark-border)" }}>
        {isWatchMode ? (
          <p className="text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            To sing, switch back to Karaoke Mode
          </p>
        ) : null}
        {!isInQueueOrSinging ? (
          !isWatchMode && canSing ? (
            <button
              onClick={() => setShowJoinModal(true)}
              className="w-full cursor-pointer rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
            >
              I Want to Sing
            </button>
          ) : (
            <p className="text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Singing requires a Chromium desktop browser
            </p>
          )
        ) : isSinging ? (
          !isWatchMode ? (
            <p
              className="text-center text-xs font-bold"
              style={{ color: "var(--color-primary)" }}
            >
              You&apos;re singing!
            </p>
          ) : null
        ) : (
          !isWatchMode ? (
            <button
              onClick={onLeaveQueue}
              className="w-full cursor-pointer rounded-lg border py-2.5 text-xs font-medium transition-all hover:brightness-110"
              style={{ fontFamily: "var(--font-display)", borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
            >
              Leave Queue
            </button>
          ) : null
        )}
      </div>

      {/* Join queue modal — ask what they'll sing */}
      {showJoinModal && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setShowJoinModal(false)}
          />
          <div
            className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5"
            style={{
              background: "var(--color-dark-surface)",
              borderColor: "var(--color-dark-border)",
              animation: "fade-in 0.15s ease-out",
            }}
          >
            <h3
              className="mb-1 text-sm font-bold"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
            >
              What will you sing?
            </h3>
            <p className="mb-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
              Let everyone know, or skip if you&apos;re not sure yet.
            </p>
            <input
              autoFocus
              type="text"
              value={songIntent}
              onChange={(e) => setSongIntent(e.target.value.slice(0, 60))}
              placeholder="Song name..."
              className="mb-3 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
              style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (songIntent.trim()) onSetSongIntent?.(songIntent.trim());
                  onJoinQueue();
                  setShowJoinModal(false);
                  setSongIntent("");
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (songIntent.trim()) onSetSongIntent?.(songIntent.trim());
                  onJoinQueue();
                  setShowJoinModal(false);
                  setSongIntent("");
                }}
                className="flex-1 cursor-pointer rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110"
                style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
              >
                Join Queue
              </button>
              <button
                onClick={() => {
                  onJoinQueue();
                  setShowJoinModal(false);
                  setSongIntent("");
                }}
                className="cursor-pointer rounded-lg border px-4 py-2.5 text-xs font-medium transition-all hover:brightness-110"
                style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
              >
                Skip
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
