"use client";

import { useState } from "react";
import type { AudioDevice, MicMode } from "~/hooks/useAudioDevices";

type MicCheckState = "idle" | "recording" | "playing";

interface AudioControlsProps {
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  micCheckState: MicCheckState;
  onMicCheck: () => void;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  onInputChange: (id: string) => void;
  onOutputChange: (id: string) => void;
  micMode: MicMode;
  onMicModeChange: (mode: MicMode) => void;
  musicVolume: number;
  onMusicVolumeChange: (vol: number) => void;
  voiceVolume: number;
  onVoiceVolumeChange: (vol: number) => void;
}

export function AudioControls({
  isMicEnabled,
  toggleMic,
  micCheckState,
  onMicCheck,
  inputDevices,
  outputDevices,
  selectedInputId,
  selectedOutputId,
  onInputChange,
  onOutputChange,
  micMode,
  onMicModeChange,
  musicVolume,
  onMusicVolumeChange,
  voiceVolume,
  onVoiceVolumeChange,
}: AudioControlsProps) {
  const [showSettings, setShowSettings] = useState(false);

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
            color: "var(--color-neon-cyan)",
            fontSize: "0.75rem",
          }}
        >
          Audio
        </h3>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="cursor-pointer rounded-lg px-3 py-1 text-xs transition-all duration-200 hover:scale-105"
          style={{
            color: "var(--color-text-secondary)",
            background: showSettings
              ? "rgba(0, 240, 255, 0.1)"
              : "var(--color-dark-card)",
          }}
        >
          {showSettings ? "Hide" : "Settings"}
        </button>
      </div>

      {/* Mic toggle + mode */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMic}
          className="flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            fontFamily: "var(--font-display)",
            background: isMicEnabled
              ? "rgba(0, 240, 255, 0.15)"
              : "var(--color-neon-cyan)",
            color: isMicEnabled
              ? "var(--color-neon-cyan)"
              : "var(--color-dark-bg)",
            borderWidth: isMicEnabled ? "1px" : "0",
            borderColor: "var(--color-neon-cyan)",
          }}
        >
          {isMicEnabled ? <MicIcon /> : <MicOffIcon />}
          {isMicEnabled ? "Mute" : "Unmute"}
        </button>

        {/* Mic mode toggle — Talking vs Singing */}
        <div
          className="flex overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--color-dark-border)" }}
          title="Talking: echo cancellation + noise reduction on. Singing: all processing off for better audio quality."
        >
          <button
            onClick={() => onMicModeChange("voice")}
            className="cursor-pointer px-3 py-2 text-xs font-medium transition-all duration-200"
            style={{
              background:
                micMode === "voice"
                  ? "rgba(0, 240, 255, 0.15)"
                  : "var(--color-dark-card)",
              color:
                micMode === "voice"
                  ? "var(--color-neon-cyan)"
                  : "var(--color-text-secondary)",
            }}
          >
            💬 Talking
          </button>
          <button
            onClick={() => onMicModeChange("raw")}
            className="cursor-pointer px-3 py-2 text-xs font-medium transition-all duration-200"
            style={{
              background:
                micMode === "raw"
                  ? "rgba(255, 45, 120, 0.15)"
                  : "var(--color-dark-card)",
              color:
                micMode === "raw"
                  ? "var(--color-neon-pink)"
                  : "var(--color-text-secondary)",
            }}
          >
            🎤 Singing
          </button>
        </div>

        {/* Mic check — record & playback */}
        {isMicEnabled && (
          <button
            onClick={onMicCheck}
            disabled={micCheckState !== "idle"}
            className="cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: micCheckState !== "idle"
                ? "var(--color-neon-yellow)"
                : "var(--color-dark-border)",
              background: micCheckState !== "idle"
                ? "rgba(255, 225, 86, 0.15)"
                : "var(--color-dark-card)",
              color: micCheckState !== "idle"
                ? "var(--color-neon-yellow)"
                : "var(--color-text-secondary)",
            }}
            title="Record 5 seconds of your mic, then play it back"
          >
            {micCheckState === "recording"
              ? "🔴 Recording..."
              : micCheckState === "playing"
                ? "🔊 Playing back..."
                : "🎧 Mic Check"}
          </button>
        )}
      </div>

      {/* Volume sliders */}
      <div className="mt-4 space-y-3">
        {/* Music volume (singer's system audio) */}
        <div className="flex items-center gap-3">
          <MusicNoteSliderIcon muted={musicVolume === 0} />
          <div className="flex flex-1 flex-col gap-1">
            <span
              className="text-xs"
              style={{ color: "var(--color-neon-pink)", fontFamily: "var(--font-display)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em" }}
            >
              Music
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(musicVolume * 100)}
              onChange={(e) => onMusicVolumeChange(Number(e.target.value) / 100)}
              className="volume-slider volume-slider--music flex-1"
            />
          </div>
          <span
            className="w-8 text-right text-xs tabular-nums"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {Math.round(musicVolume * 100)}
          </span>
        </div>

        {/* Voice volume (everyone's mics) */}
        <div className="flex items-center gap-3">
          <SpeakerIcon muted={voiceVolume === 0} />
          <div className="flex flex-1 flex-col gap-1">
            <span
              className="text-xs"
              style={{ color: "var(--color-neon-cyan)", fontFamily: "var(--font-display)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em" }}
            >
              Voices
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(voiceVolume * 100)}
              onChange={(e) => onVoiceVolumeChange(Number(e.target.value) / 100)}
              className="volume-slider volume-slider--voice flex-1"
            />
          </div>
          <span
            className="w-8 text-right text-xs tabular-nums"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {Math.round(voiceVolume * 100)}
          </span>
        </div>
      </div>

      <p
        className="mt-3 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {micCheckState === "recording"
          ? "🔴 Recording 5 seconds — speak or sing now!"
          : micCheckState === "playing"
            ? "🔊 Playing back — this is how others hear you."
            : isMicEnabled
              ? micMode === "voice"
                ? "Talking mode — echo cancellation + noise reduction on."
                : "Singing mode — all processing off for best sound quality. Use headphones to avoid echo!"
              : "Mic is muted. Unmute to talk or sing."}
      </p>

      {/* Settings panel */}
      {showSettings && (
        <div
          className="mt-4 space-y-4 rounded-xl border p-4"
          style={{
            background: "var(--color-dark-card)",
            borderColor: "var(--color-dark-border)",
            animation: "float-up 0.2s ease-out",
          }}
        >
          {/* Mic mode explanation */}
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--color-dark-bg)" }}
          >
            <p
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--color-neon-yellow)",
                fontSize: "0.6rem",
              }}
            >
              Mic Mode
            </p>
            <div className="space-y-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <p>
                <span style={{ color: "var(--color-neon-cyan)" }}>💬 Talking</span> — Echo
                cancellation + noise suppression. Best for chatting between songs.
              </p>
              <p>
                <span style={{ color: "var(--color-neon-pink)" }}>🎤 Singing</span> — No
                processing, stereo 48kHz. Full quality voice. Use headphones!
              </p>
            </div>
          </div>

          {/* Mic input selector */}
          <div>
            <label
              className="mb-1.5 block text-xs uppercase tracking-widest"
              style={{
                color: "var(--color-neon-cyan)",
                fontFamily: "var(--font-display)",
                fontSize: "0.65rem",
              }}
            >
              Microphone Input
            </label>
            <select
              value={selectedInputId}
              onChange={(e) => onInputChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--color-neon-cyan)]"
              style={{
                background: "var(--color-dark-bg)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-primary)",
              }}
            >
              {inputDevices.length === 0 && (
                <option value="">No devices found</option>
              )}
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Audio output selector */}
          <div>
            <label
              className="mb-1.5 block text-xs uppercase tracking-widest"
              style={{
                color: "var(--color-neon-purple)",
                fontFamily: "var(--font-display)",
                fontSize: "0.65rem",
              }}
            >
              Audio Output
            </label>
            <select
              value={selectedOutputId}
              onChange={(e) => onOutputChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--color-neon-purple)]"
              style={{
                background: "var(--color-dark-bg)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-primary)",
              }}
            >
              {outputDevices.length === 0 && (
                <option value="">Default</option>
              )}
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Current audio settings summary */}
          <div
            className="rounded-lg border p-3"
            style={{
              borderColor: "var(--color-dark-border)",
              background: "var(--color-dark-bg)",
            }}
          >
            <p
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--color-text-secondary)",
                fontSize: "0.6rem",
              }}
            >
              Active Processing
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <ProcessingRow label="Echo Cancel" active={micMode === "voice"} />
              <ProcessingRow label="Noise Suppress" active={micMode === "voice"} />
              <ProcessingRow label="Auto Gain" active={micMode === "voice"} />
              <ProcessingRow
                label="Stereo"
                active={micMode === "raw"}
              />
              <ProcessingRow label="48kHz" active={micMode === "raw"} />
              <ProcessingRow label="High Bitrate" active={micMode === "raw"} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProcessingRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: active ? "var(--color-neon-cyan)" : "var(--color-dark-border)",
        }}
      />
      <span style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)", opacity: active ? 1 : 0.5 }}>
        {label}
      </span>
    </div>
  );
}

function MusicNoteSliderIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={muted ? "var(--color-text-secondary)" : "var(--color-neon-pink)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: muted ? 0.5 : 1 }}
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={muted ? "var(--color-text-secondary)" : "var(--color-neon-purple)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: muted ? 0.5 : 1 }}
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="23" x2="17" y1="9" y2="15" />
          <line x1="17" x2="23" y1="9" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
