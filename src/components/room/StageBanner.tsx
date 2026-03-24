"use client";

import { useState } from "react";
import type { RoomState } from "~/types/room";

interface StageBannerProps {
  roomState: RoomState;
  isMyTurn: boolean;
  isSharing: boolean;
  onStartSharing: () => Promise<void>;
  onStopSharing: () => void;
  onFinishSinging: () => void;
  audioError: string | null;
  singerSongName: string | null;
  canSing: boolean;
  onMixMicGain?: (val: number) => void;
  onMixMusicGain?: (val: number) => void;
}

export function StageBanner({
  roomState,
  isMyTurn,
  isSharing,
  onStartSharing,
  onStopSharing,
  onFinishSinging,
  audioError,
  singerSongName,
  canSing,
  onMixMicGain,
  onMixMusicGain,
}: StageBannerProps) {
  const currentSinger = roomState.participants.find(
    (p) => p.id === roomState.currentSingerId,
  );

  // No one singing — compact idle state
  if (!roomState.currentSingerId) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
      >
        <span className="text-lg" style={{ opacity: 0.4 }}>🎤</span>
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Nobody singing — join the queue!
        </span>
      </div>
    );
  }

  // Someone else singing — compact listening state
  if (!isMyTurn) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{
          background: "var(--color-dark-surface)",
          borderColor: "var(--color-primary)",
          borderWidth: "1px",
        }}
      >
        <span className="text-lg">🎤</span>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {currentSinger?.name ?? "Unknown"}
          </span>
          {singerSongName && (
            <span className="ml-2 text-xs" style={{ color: "var(--color-primary)" }}>
              — {singerSongName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-primary)", animation: "fade-in 1.5s ease-in-out infinite alternate" }}
          />
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Listening</span>
        </div>
      </div>
    );
  }

  // My turn — expanded with controls
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-primary)",
      }}
    >
      <div
        className="absolute left-0 top-0 h-0.5 w-full rounded-t-xl"
        style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-accent))" }}
      />

      {audioError && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}>
          {audioError}
        </div>
      )}

      {!isSharing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎤</span>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                Your Turn to Sing
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Open a karaoke tab, then share its audio
              </p>
            </div>
          </div>

          {canSing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onStartSharing}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
              >
                Share Tab Audio
              </button>
              <button
                onClick={onFinishSinging}
                className="cursor-pointer rounded-lg border px-3 py-2.5 text-xs transition-all hover:brightness-110"
                style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
              >
                Skip
              </button>
            </div>
          ) : (
            <p className="rounded-lg py-2 text-center text-xs" style={{ color: "var(--color-text-muted)", background: "var(--color-dark-card)" }}>
              Singing requires Chrome or Edge on desktop
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎤</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                Sharing Audio
              </p>
              {singerSongName && (
                <p className="truncate text-xs" style={{ color: "var(--color-primary)" }}>
                  {singerSongName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)", animation: "fade-in 1.5s ease-in-out infinite alternate" }} />
              <span className="text-xs" style={{ color: "var(--color-success)" }}>Live</span>
            </div>
          </div>

          {/* Mix balance */}
          {onMixMicGain && onMixMusicGain && (
            <MixBalance onMicGain={onMixMicGain} onMusicGain={onMixMusicGain} />
          )}

          <div className="flex gap-2">
            <button
              onClick={onStopSharing}
              className="flex-1 cursor-pointer rounded-lg border py-2 text-xs font-medium transition-all hover:brightness-110"
              style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
            >
              Stop Music
            </button>
            <button
              onClick={() => { onStopSharing(); onFinishSinging(); }}
              className="flex-1 cursor-pointer rounded-lg py-2 text-xs font-medium transition-all hover:brightness-110"
              style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
            >
              Finish Turn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MixBalance({ onMicGain, onMusicGain }: { onMicGain: (v: number) => void; onMusicGain: (v: number) => void }) {
  const [balance, setBalance] = useState(50);
  const handleChange = (val: number) => {
    setBalance(val);
    onMusicGain(val / 50);
    onMicGain((100 - val) / 50);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Voice</span>
      <input type="range" min="0" max="100" value={balance} onChange={(e) => handleChange(Number(e.target.value))} className="volume-slider flex-1" />
      <span className="text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Music</span>
    </div>
  );
}
