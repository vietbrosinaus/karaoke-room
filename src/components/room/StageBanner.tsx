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
  musicVolume?: number;
  onMusicVolumeChange?: (vol: number) => void;
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
  musicVolume = 1,
  onMusicVolumeChange,
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

  // Someone else singing — informational banner with volume
  if (!isMyTurn) {
    return (
      <div
        className="rounded-xl border px-4 py-3"
        style={{
          background: "var(--color-dark-surface)",
          borderColor: "var(--color-primary)",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🎤</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                {currentSinger?.name ?? "Unknown"}
              </span>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-primary)" }}>singing</span>
            </div>
            {singerSongName && (
              <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-accent)" }}>
                {singerSongName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-primary)", animation: "fade-in 1.5s ease-in-out infinite alternate" }} />
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Live</span>
          </div>
        </div>
        {/* Volume control for listener */}
        {onMusicVolumeChange && (
          <div className="mt-2 flex items-center gap-2 border-t pt-2" style={{ borderColor: "var(--color-dark-border)" }}>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Volume</span>
            <input type="range" min="0" max="100" value={Math.round(musicVolume * 100)} onChange={(e) => onMusicVolumeChange(Number(e.target.value) / 100)} className="volume-slider flex-1" />
            <span className="w-6 text-right text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{Math.round(musicVolume * 100)}</span>
          </div>
        )}
      </div>
    );
  }

  // My turn — expanded with controls
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-4"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-primary)",
      }}
    >
      <div
        className="absolute left-0 top-0 h-0.5 w-full"
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

          {/* Song name — editable if auto-detect failed */}
          {!singerSongName && (
            <SongNameInput onSet={(name) => {
              // This sets it via a custom event that RoomView can listen to
              window.dispatchEvent(new CustomEvent("karaoke-set-song", { detail: name }));
            }} />
          )}

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

function SongNameInput({ onSet }: { onSet: (name: string) => void }) {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return null;

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What are you singing?"
        maxLength={60}
        className="flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none transition-all focus:border-[var(--color-primary)]"
        style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onSet(value.trim());
            setSubmitted(true);
          }
        }}
      />
      {value.trim() && (
        <button
          onClick={() => { onSet(value.trim()); setSubmitted(true); }}
          className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:brightness-110"
          style={{ background: "var(--color-primary)", color: "#fff" }}
        >
          Set
        </button>
      )}
    </div>
  );
}

function MixBalance({ onMicGain, onMusicGain }: { onMicGain: (v: number) => void; onMusicGain: (v: number) => void }) {
  const [balance, setBalance] = useState(50);

  const handleChange = (raw: number) => {
    // Snap to center (50) when within 5 units — stronger magnetic feel
    const val = Math.abs(raw - 50) <= 5 ? 50 : raw;
    setBalance(val);
    onMusicGain(val / 50);
    onMicGain((100 - val) / 50);
  };

  const voicePct = Math.round((100 - balance) / 50 * 100);
  const musicPct = Math.round(balance / 50 * 100);
  const isCenter = balance === 50;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-16 text-right text-[10px] font-medium" style={{ color: balance <= 50 ? "var(--color-primary)" : "var(--color-text-muted)" }}>
          Voice {voicePct}%
        </span>
        <div className="relative flex-1">
          {/* Center guide line */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: "2px",
              height: "14px",
              borderRadius: "1px",
              background: isCenter ? "var(--color-primary)" : "var(--color-dark-border)",
              opacity: isCenter ? 1 : 0.5,
              transition: "all 0.15s ease",
            }}
          />
          <input
            type="range" min="0" max="100" value={balance}
            onChange={(e) => handleChange(Number(e.target.value))}
            className="volume-slider w-full"
          />
        </div>
        <span className="w-16 text-[10px] font-medium" style={{ color: balance >= 50 ? "var(--color-accent)" : "var(--color-text-muted)" }}>
          {musicPct}% Music
        </span>
      </div>
      {isCenter && (
        <p className="text-center text-[9px] font-medium" style={{ color: "var(--color-primary)" }}>Balanced</p>
      )}
    </div>
  );
}
