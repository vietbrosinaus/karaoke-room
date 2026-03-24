"use client";

import type { MicCheckState } from "~/hooks/useLiveKit";
import type { MicMode } from "~/hooks/useAudioDevices";
import type { Reaction } from "~/hooks/useRoomState";

interface ToolbarProps {
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  micMode: MicMode;
  onMicModeChange: (mode: MicMode) => void;
  micCheckState: MicCheckState;
  onMicCheck: () => void;
  onReact: (emoji: string) => void;
  isMixActive: boolean; // when true, mic toggle is disabled
}

const REACTIONS = ["🔥", "👏", "😍", "🎵", "💯", "🙌"];

export function Toolbar({
  isMicEnabled,
  toggleMic,
  micMode,
  onMicModeChange,
  micCheckState,
  onMicCheck,
  onReact,
  isMixActive,
}: ToolbarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
      style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
    >
      {/* Mic toggle */}
      <button
        onClick={toggleMic}
        disabled={isMixActive}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-150 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          fontFamily: "var(--font-display)",
          background: isMicEnabled ? "var(--color-primary-dim)" : "var(--color-primary)",
          color: isMicEnabled ? "var(--color-primary)" : "#fff",
          border: isMicEnabled ? "1px solid var(--color-primary)" : "none",
        }}
        title={isMixActive ? "Mic is in the mix while sharing" : undefined}
      >
        {isMicEnabled ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        )}
        {isMicEnabled ? "Mute" : "Unmute"}
      </button>

      {/* Mode toggle */}
      <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-dark-border)" }}>
        <button
          onClick={() => onMicModeChange("voice")}
          className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium transition-all"
          style={{
            background: micMode === "voice" ? "var(--color-primary-dim)" : "transparent",
            color: micMode === "voice" ? "var(--color-primary)" : "var(--color-text-muted)",
          }}
        >
          Talk
        </button>
        <button
          onClick={() => onMicModeChange("raw")}
          className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium transition-all"
          style={{
            background: micMode === "raw" ? "var(--color-accent-dim)" : "transparent",
            color: micMode === "raw" ? "var(--color-accent)" : "var(--color-text-muted)",
          }}
        >
          Sing
        </button>
      </div>

      {/* Mic check */}
      {isMicEnabled && (
        <button
          onClick={onMicCheck}
          disabled={micCheckState !== "idle"}
          className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: micCheckState !== "idle" ? "var(--color-accent-dim)" : "var(--color-dark-card)",
            color: micCheckState !== "idle" ? "var(--color-accent)" : "var(--color-text-muted)",
          }}
        >
          {micCheckState === "recording" ? "Rec..." : micCheckState === "playing" ? "Playing..." : "Check"}
        </button>
      )}

      {/* Divider */}
      <div className="mx-1 h-5 w-px" style={{ background: "var(--color-dark-border)" }} />

      {/* Reactions */}
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="cursor-pointer rounded-md px-1.5 py-1 text-base transition-transform hover:scale-125 active:scale-90"
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
