"use client";

import { useState } from "react";
import type { AudioDevice, MicMode } from "~/hooks/useAudioDevices";
import type { MicCheckState } from "~/hooks/useLiveKit";

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
            color: "var(--color-primary)",
            fontSize: "0.75rem",
          }}
        >
          Audio
        </h3>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="cursor-pointer rounded-lg border px-4 py-1.5 text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            fontFamily: "var(--font-display)",
            borderColor: showSettings ? "var(--color-primary)" : "var(--color-dark-border)",
            color: showSettings ? "var(--color-primary)" : "var(--color-text-secondary)",
            background: showSettings ? "var(--color-primary-dim)" : "var(--color-dark-card)",
          }}
        >
          {showSettings ? "Close Settings" : "Settings"}
        </button>
      </div>

      {/* Mic controls — always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={toggleMic}
          className="flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            fontFamily: "var(--font-display)",
            background: isMicEnabled
              ? "var(--color-primary-dim)"
              : "var(--color-primary)",
            color: isMicEnabled
              ? "var(--color-primary)"
              : "#fff",
            borderWidth: isMicEnabled ? "1px" : "0",
            borderColor: "var(--color-primary)",
          }}
        >
          {isMicEnabled ? <MicIcon /> : <MicOffIcon />}
          {isMicEnabled ? "Mute" : "Unmute"}
        </button>

        {/* Mic mode toggle */}
        <div
          className="flex overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--color-dark-border)" }}
        >
          <button
            onClick={() => onMicModeChange("voice")}
            className="cursor-pointer px-3 py-2 text-xs font-medium transition-all duration-200"
            style={{
              background: micMode === "voice" ? "var(--color-primary-dim)" : "var(--color-dark-card)",
              color: micMode === "voice" ? "var(--color-primary)" : "var(--color-text-secondary)",
            }}
          >
            💬 Talking
          </button>
          <button
            onClick={() => onMicModeChange("raw")}
            className="cursor-pointer px-3 py-2 text-xs font-medium transition-all duration-200"
            style={{
              background: micMode === "raw" ? "var(--color-accent-dim)" : "var(--color-dark-card)",
              color: micMode === "raw" ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}
          >
            🎤 Singing
          </button>
        </div>

        {/* Mic check */}
        {isMicEnabled && (
          <button
            onClick={onMicCheck}
            disabled={micCheckState !== "idle"}
            className="cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: micCheckState !== "idle" ? "var(--color-accent)" : "var(--color-dark-border)",
              background: micCheckState !== "idle" ? "var(--color-accent-dim)" : "var(--color-dark-card)",
              color: micCheckState !== "idle" ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}
          >
            {micCheckState === "recording" ? "🔴 Recording..." : micCheckState === "playing" ? "🔊 Playing..." : "🎧 Mic Check"}
          </button>
        )}
      </div>

      {/* Status text */}
      <p className="mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
        {micCheckState === "recording"
          ? "Recording 5 seconds — speak or sing now!"
          : micCheckState === "playing"
            ? "Playing back — this is how others hear you."
            : isMicEnabled
              ? micMode === "voice"
                ? "Talking mode — echo cancellation on."
                : "Singing mode — raw audio. Use headphones!"
              : "Mic is muted."}
      </p>

      {/* Settings panel — volume sliders + device selectors */}
      {showSettings && (
        <div
          className="mt-4 space-y-4 rounded-xl border p-4"
          style={{
            background: "var(--color-dark-card)",
            borderColor: "var(--color-dark-border)",
            animation: "fade-in 0.15s ease-out",
          }}
        >
          {/* App Volume */}
          <VolumeSlider
            label="App Volume"
            value={voiceVolume}
            onChange={onVoiceVolumeChange}
            color="var(--color-primary)"
          />

          {/* Device selectors */}
          <DeviceSelect
            label="Microphone"
            devices={inputDevices}
            selectedId={selectedInputId}
            onChange={onInputChange}
          />
          <DeviceSelect
            label="Speaker Output"
            devices={outputDevices}
            selectedId={selectedOutputId}
            onChange={onOutputChange}
          />

          {/* Processing info */}
          <div className="rounded-lg p-3" style={{ background: "var(--color-dark-bg)" }}>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)", fontSize: "0.6rem" }}>
              Active Processing
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <Dot label="Echo Cancel" on={micMode === "voice"} />
              <Dot label="Noise Suppress" on={micMode === "voice"} />
              <Dot label="Auto Gain" on={micMode === "voice"} />
              <Dot label="Stereo 48kHz" on={micMode === "raw"} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VolumeSlider({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color, fontSize: "0.6rem" }}>
          {label}
        </span>
        <input
          type="range" min="0" max="100"
          value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="volume-slider flex-1"
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

function DeviceSelect({ label, devices, selectedId, onChange }: { label: string; devices: AudioDevice[]; selectedId: string; onChange: (id: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-display)", fontSize: "0.6rem" }}>
        {label}
      </label>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--color-primary)]"
        style={{ background: "var(--color-dark-bg)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
      >
        {devices.length === 0 && <option value="">No devices found</option>}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
        ))}
      </select>
    </div>
  );
}

function Dot({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "var(--color-primary)" : "var(--color-dark-border)" }} />
      <span style={{ color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)", opacity: on ? 1 : 0.5 }}>{label}</span>
    </div>
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
