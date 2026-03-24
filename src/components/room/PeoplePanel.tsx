"use client";

import { useState } from "react";
import type { Participant, ParticipantStatus, RoomState } from "~/types/room";

interface PeoplePanelProps {
  roomState: RoomState;
  myPeerId: string | null;
  onJoinQueue: () => void;
  onLeaveQueue: () => void;
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
  canSing,
  participantStatus,
  activeSpeakers,
  personVolumes,
  onPersonVolumeChange,
}: PeoplePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isInQueue = myPeerId ? roomState.queue.includes(myPeerId) : false;
  const isSinging = myPeerId !== null && roomState.currentSingerId === myPeerId;
  const isInQueueOrSinging = isInQueue || isSinging;

  // Build a unified list: participants with their queue position
  const queuePositions = new Map(roomState.queue.map((id, i) => [id, i + 1]));

  return (
    <div
      className="flex flex-col rounded-xl border"
      style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}
        >
          People
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--color-dark-card)", color: "var(--color-text-muted)" }}
        >
          {roomState.participants.length}
        </span>
      </div>

      {/* Participant list */}
      <ul className="flex-1 space-y-0.5 px-2 pb-2">
        {roomState.participants.map((p) => {
          const isMe = p.id === myPeerId;
          const isSpeaking = Array.from(activeSpeakers).some((id) =>
            id.startsWith(p.name + "-") || id === p.name
          );
          const queuePos = queuePositions.get(p.id);
          const isSinger = p.id === roomState.currentSingerId;
          const status = participantStatus[p.id];
          const isExpanded = expandedId === p.id && !isMe;

          // Find LiveKit identity from audio elements
          const lkIdentity = (() => {
            if (typeof document === "undefined") return p.name;
            const el = document.querySelector<HTMLAudioElement>(
              `audio[data-lk-identity^="${CSS.escape(p.name)}-"]`
            );
            return el?.dataset.lkIdentity ?? p.name;
          })();
          const personVol = personVolumes[lkIdentity] ?? 1;

          return (
            <li key={p.id}>
              <div
                onClick={() => !isMe && setExpandedId(isExpanded ? null : p.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${!isMe ? "cursor-pointer hover:bg-[var(--color-dark-card)]" : ""}`}
                style={{
                  background: isSpeaking
                    ? "rgba(139, 92, 246, 0.15)"
                    : isMe
                      ? "rgba(139, 92, 246, 0.05)"
                      : "transparent",
                  boxShadow: isSpeaking ? "inset 0 0 0 1px rgba(139, 92, 246, 0.4)" : "none",
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
                  {isSinger ? "🎤" : p.name.charAt(0).toUpperCase()}
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
                  {status?.isMuted !== false && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                      <line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                  )}
                </div>
              </div>

              {/* Per-person volume slider */}
              {isExpanded && (
                <div
                  className="mx-3 mb-1 flex items-center gap-2 rounded-lg px-3 py-2"
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

      {/* Queue action */}
      <div className="border-t px-3 py-3" style={{ borderColor: "var(--color-dark-border)" }}>
        {!isInQueueOrSinging ? (
          canSing ? (
            <button
              onClick={onJoinQueue}
              className="w-full cursor-pointer rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
            >
              I Want to Sing
            </button>
          ) : (
            <p className="text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Singing requires Chrome/Edge desktop
            </p>
          )
        ) : isSinging ? (
          <p
            className="text-center text-xs font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            You&apos;re singing!
          </p>
        ) : (
          <button
            onClick={onLeaveQueue}
            className="w-full cursor-pointer rounded-lg border py-2.5 text-xs font-medium transition-all hover:brightness-110"
            style={{ fontFamily: "var(--font-display)", borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
          >
            Leave Queue
          </button>
        )}
      </div>
    </div>
  );
}
