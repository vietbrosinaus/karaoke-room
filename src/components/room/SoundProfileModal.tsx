"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Mic, Volume2 } from "lucide-react";
import type { AudioDevice, MicMode } from "~/hooks/useAudioDevices";
import type { MicCheckState } from "~/hooks/useLiveKit";
import { VOICE_EFFECTS, type VoiceEffect, createEffectChain, type EffectChain } from "~/lib/voiceEffects";

interface SoundProfileModalProps {
  open: boolean;
  onClose: () => void;
  // Mic state
  micMode: MicMode;
  onMicModeChange: (mode: MicMode) => void;
  // Voice effect
  voiceEffect: VoiceEffect;
  onVoiceEffectChange: (effect: VoiceEffect) => void;
  onEffectWetDry: (wet: number) => void;
  // Noise cancellation per mode
  talkingNoiseCancellation: boolean;
  onTalkingNoiseCancellationChange: (on: boolean) => void;
  singingNoiseCancellation: boolean;
  onSingingNoiseCancellationChange: (on: boolean) => void;
  // Devices
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputId: string;
  selectedOutputId: string;
  onInputChange: (id: string) => void;
  onOutputChange: (id: string) => void;
  // Mic check
  onTalkingMicCheck: () => void;
  onSingingMicCheck: () => void;
  onStopMicCheck: () => void;
  micCheckState: MicCheckState;
}

export function SoundProfileModal({
  open,
  onClose,
  micMode,
  onMicModeChange,
  voiceEffect,
  onVoiceEffectChange,
  onEffectWetDry,
  talkingNoiseCancellation,
  onTalkingNoiseCancellationChange,
  singingNoiseCancellation,
  onSingingNoiseCancellationChange,
  inputDevices,
  outputDevices,
  selectedInputId,
  selectedOutputId,
  onInputChange,
  onOutputChange,
  onTalkingMicCheck,
  onSingingMicCheck,
  onStopMicCheck,
  micCheckState,
}: SoundProfileModalProps) {
  const [wetDry, setWetDry] = useState(70);

  // Close modal — auto-stop effect below handles mic check cleanup
  const handleClose = () => {
    onClose();
  };

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, micCheckState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-stop mic check when modal closes
  useEffect(() => {
    if (!open && (micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing")) {
      onStopMicCheck();
    }
  }, [open, micCheckState, onStopMicCheck]);

  // Apply wet/dry when effect changes
  useEffect(() => {
    if (voiceEffect !== "none") onEffectWetDry(wetDry / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEffect]); // intentionally only fires on effect change, not on wetDry/callback change

  const handleWetDry = (val: number) => {
    setWetDry(val);
    onEffectWetDry(val / 100);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)" }} onClick={handleClose} />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border"
        style={{ background: "var(--color-dark-bg)", borderColor: "var(--color-dark-border)", animation: "fade-in 0.15s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--color-dark-border)" }}>
          <h2 className="text-sm font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            Sound Profile
          </h2>
          <button onClick={handleClose} className="cursor-pointer rounded-lg p-1.5 transition-all hover:bg-[var(--color-dark-card)]" style={{ color: "var(--color-text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-auto p-5">
          {/* === TALKING MODE === */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare size={16} style={{ color: "var(--color-primary)" }} />
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)" }}>
                Talking Mode
              </h3>
            </div>

            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-surface)" }}>
              {/* Noise cancellation toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>Noise Cancellation</p>
                  <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    {talkingNoiseCancellation ? "Echo cancel + noise suppression ON" : "Raw audio, no processing"}
                  </p>
                </div>
                <ToggleSwitch on={talkingNoiseCancellation} onChange={onTalkingNoiseCancellationChange} color="var(--color-primary)" />
              </div>

              {/* Talking mic check — real-time toggle */}
              <button
                onClick={onTalkingMicCheck}
                disabled={micCheckState === "monitoring-sing"}
                className="w-full cursor-pointer rounded-lg border py-2 text-xs font-medium transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: micCheckState === "monitoring-talk" ? "var(--color-primary)" : "var(--color-dark-border)",
                  background: micCheckState === "monitoring-talk" ? "var(--color-primary-dim)" : "transparent",
                  color: micCheckState === "monitoring-talk" ? "var(--color-primary)" : "var(--color-text-primary)",
                }}
              >
                {micCheckState === "monitoring-talk" ? "Listening... (click to stop)" : micCheckState === "error" ? "Mic access denied" : "Talking Mic Check"}
              </button>
            </div>
          </section>

          {/* === SINGING MODE === */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Mic size={16} style={{ color: "var(--color-text-secondary)" }} />
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-secondary)" }}>
                Singing Mode
              </h3>
            </div>

            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-surface)" }}>
              {/* Voice effect selector */}
              <div>
                <p className="mb-2 text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>Voice Effect</p>
                <div className="flex flex-wrap gap-1.5">
                  {VOICE_EFFECTS.map((fx) => (
                    <button
                      key={fx.id}
                      onClick={() => onVoiceEffectChange(fx.id)}
                      className="cursor-pointer rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: voiceEffect === fx.id ? "var(--color-primary)" : "var(--color-dark-card)",
                        color: voiceEffect === fx.id ? "#fff" : "var(--color-text-muted)",
                        border: voiceEffect === fx.id ? "none" : "1px solid var(--color-dark-border)",
                      }}
                      title={fx.description}
                    >
                      {fx.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wet/dry slider */}
              {voiceEffect !== "none" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Dry</span>
                  <input
                    type="range" min="0" max="100" value={wetDry}
                    onChange={(e) => handleWetDry(Number(e.target.value))}
                    className="volume-slider flex-1"
                  />
                  <span className="text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>Wet</span>
                  <span className="w-6 text-right text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{wetDry}</span>
                </div>
              )}

              {/* Noise cancellation toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>Noise Cancellation</p>
                  <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    {singingNoiseCancellation ? "Processing ON (may reduce voice quality)" : "OFF — raw stereo 48kHz (recommended)"}
                  </p>
                </div>
                <ToggleSwitch on={singingNoiseCancellation} onChange={onSingingNoiseCancellationChange} color="var(--color-primary)" />
              </div>

              {/* Singing mic check — real-time toggle */}
              <button
                onClick={onSingingMicCheck}
                disabled={micCheckState === "monitoring-talk"}
                className="w-full cursor-pointer rounded-lg border py-2 text-xs font-medium transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: micCheckState === "monitoring-sing" ? "var(--color-primary)" : "var(--color-dark-border)",
                  background: micCheckState === "monitoring-sing" ? "var(--color-primary-dim)" : "transparent",
                  color: micCheckState === "monitoring-sing" ? "var(--color-primary)" : "var(--color-text-primary)",
                }}
              >
                {micCheckState === "monitoring-sing" ? "Listening... (click to stop)" : micCheckState === "error" ? "Mic access denied" : "Singing Mic Check"}
              </button>
              <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {micCheckState === "monitoring-sing" || micCheckState === "monitoring-talk"
                  ? "Others are muted while you listen to yourself"
                  : "Hear yourself live with the selected voice effect"}
              </p>
            </div>
          </section>

          {/* === DEVICES === */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Volume2 size={16} style={{ color: "var(--color-text-muted)" }} />
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-muted)" }}>
                Devices
              </h3>
            </div>

            <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--color-dark-surface)" }}>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Microphone</label>
                <select
                  value={selectedInputId}
                  onChange={(e) => onInputChange(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
                  style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
                >
                  {inputDevices.length === 0 && <option value="">No devices found</option>}
                  {inputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Speaker</label>
                <select
                  value={selectedOutputId}
                  onChange={(e) => onOutputChange(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
                  style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
                >
                  {outputDevices.length === 0 && <option value="">Default</option>}
                  {outputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function ToggleSwitch({ on, onChange, color }: { on: boolean; onChange: (on: boolean) => void; color: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative h-6 w-11 cursor-pointer rounded-full transition-all duration-200"
      style={{ background: on ? color : "var(--color-dark-border)" }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: on ? "calc(100% - 22px)" : "2px" }}
      />
    </button>
  );
}
