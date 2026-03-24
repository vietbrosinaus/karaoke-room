"use client";

import type { AudioDevice, MicMode } from "~/hooks/useAudioDevices";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  voiceVolume: number;
  onVoiceVolumeChange: (vol: number) => void;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  onInputChange: (id: string) => void;
  onOutputChange: (id: string) => void;
  micMode: MicMode;
}

export function SettingsDrawer({
  open,
  onClose,
  voiceVolume,
  onVoiceVolumeChange,
  inputDevices,
  outputDevices,
  selectedInputId,
  selectedOutputId,
  onInputChange,
  onOutputChange,
  micMode,
}: SettingsDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l"
        style={{
          background: "var(--color-dark-bg)",
          borderColor: "var(--color-dark-border)",
          animation: "slide-in-right 0.2s ease-out",
        }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-dark-border)" }}>
          <h2
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            Settings
          </h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-sm transition-all hover:bg-[var(--color-dark-card)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-auto p-5">
          {/* App Volume */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
              App Volume
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="0" max="100"
                value={Math.round(voiceVolume * 100)}
                onChange={(e) => onVoiceVolumeChange(Number(e.target.value) / 100)}
                className="volume-slider flex-1"
              />
              <span className="w-8 text-right text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                {Math.round(voiceVolume * 100)}
              </span>
            </div>
          </div>

          {/* Microphone */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
              Microphone
            </label>
            <select
              value={selectedInputId}
              onChange={(e) => onInputChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
              style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
            >
              {inputDevices.length === 0 && <option value="">No devices found</option>}
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Speaker */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
              Speaker Output
            </label>
            <select
              value={selectedOutputId}
              onChange={(e) => onOutputChange(e.target.value)}
              className="w-full cursor-pointer rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
              style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
            >
              {outputDevices.length === 0 && <option value="">Default</option>}
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Mic Mode Info */}
          <div className="rounded-lg p-4" style={{ background: "var(--color-dark-surface)" }}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
              Mic Mode
            </p>
            <div className="space-y-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <p>
                <span style={{ color: "var(--color-primary)" }}>Talk</span> — Echo cancellation + noise suppression. Best for chatting.
              </p>
              <p>
                <span style={{ color: "var(--color-accent)" }}>Sing</span> — No processing, stereo 48kHz. Use headphones!
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
              <Dot label="Echo Cancel" on={micMode === "voice"} />
              <Dot label="Noise Suppress" on={micMode === "voice"} />
              <Dot label="Auto Gain" on={micMode === "voice"} />
              <Dot label="Stereo 48kHz" on={micMode === "raw"} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Dot({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "var(--color-primary)" : "var(--color-dark-border)" }} />
      <span style={{ color: on ? "var(--color-text-primary)" : "var(--color-text-muted)", opacity: on ? 1 : 0.5 }}>{label}</span>
    </div>
  );
}
