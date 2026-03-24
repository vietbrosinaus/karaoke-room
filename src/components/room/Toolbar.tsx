"use client";

import { useCallback, useRef } from "react";
import type { MicCheckState } from "~/hooks/useLiveKit";
import type { MicMode } from "~/hooks/useAudioDevices";

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
  const cooldownRef = useRef(false);
  const handleReact = useCallback((emoji: string) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    onReact(emoji);
    setTimeout(() => { cooldownRef.current = false; }, 500);
  }, [onReact]);

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto rounded-xl border px-3 py-2.5"
      style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
    >
      {/* Mic toggle */}
      <button
        onClick={toggleMic}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-150 hover:scale-105 active:scale-95"
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
      <div className="flex shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-dark-border)" }}>
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
          className="cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all hover:scale-105 hover:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: micCheckState !== "idle" ? "var(--color-accent-dim)" : "transparent",
            borderColor: micCheckState !== "idle" ? "var(--color-accent)" : "var(--color-dark-border)",
            color: micCheckState !== "idle" ? "var(--color-accent)" : "var(--color-text-primary)",
          }}
        >
          {micCheckState === "recording" ? "Recording..." : micCheckState === "playing" ? "Playing..." : "Mic Check"}
        </button>
      )}

      {/* Spacer pushes reactions right */}
      <div className="flex-1" />

      {/* Reactions */}
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleReact(emoji)}
          className="shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-base transition-transform hover:scale-125 active:scale-90"
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
