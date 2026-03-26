"use client";

import { useState, useEffect, useRef } from "react";
import type { Room } from "livekit-client";
import type { RoomState } from "~/types/room";
import { Mic, Music, VolumeX, Volume2, Circle, Square, Wand2 } from "lucide-react";
import type { RecordingState } from "~/hooks/useLiveKit";
import { AudioVisualizer } from "./AudioVisualizer";

interface StageBannerProps {
  room: Room | null;
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
  ambientId?: string;
  onMuteAll?: () => void;
  onUnmuteAll?: () => void;
  isMutedAll?: boolean;
  // Auto-mix
  autoMix?: boolean;
  onAutoMixChange?: (on: boolean) => void;
  // Collaborative mix (listener can adjust singer's mix)
  onMixAdjust?: (voice: number, music: number) => void;
  onMixAdjustDone?: (voice: number, music: number) => void;
  mixVoiceValue?: number;
  mixMusicValue?: number;
  // Recording
  recordingState?: RecordingState;
  recordingDuration?: number;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
}

export function StageBanner({
  room,
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
  ambientId,
  onMuteAll,
  onUnmuteAll,
  isMutedAll = false,
  onMixAdjust,
  onMixAdjustDone,
  mixVoiceValue = 100,
  mixMusicValue = 70,
  autoMix = false,
  onAutoMixChange,
  recordingState = "idle",
  recordingDuration = 0,
  onStartRecording,
  onStopRecording,
}: StageBannerProps) {
  const currentSinger = roomState.participants.find(
    (p) => p.id === roomState.currentSingerId,
  );

  const isSomeoneSinging = !!roomState.currentSingerId;

  // No one singing — compact idle state
  if (!isSomeoneSinging) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
      >
        <Mic size={18} style={{ opacity: 0.4, color: "var(--color-text-muted)" }} />
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Nobody singing — join the queue!
        </span>
      </div>
    );
  }

  // Someone else singing — informational banner with volume
  if (!isMyTurn) {
    return (
      <AudioVisualizer room={room} isActive={isSomeoneSinging} ambientId={ambientId}>
      <div
        className="relative overflow-hidden rounded-xl px-4 py-3"
        style={{ background: "var(--color-dark-surface)" }}
      >
        <div className="flex items-center gap-3">
          <Mic size={18} style={{ color: "var(--color-primary)" }} />
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
        {/* Local volume control */}
        {onMusicVolumeChange && (
          <div className="mt-2 flex items-center gap-2 border-t pt-2" style={{ borderColor: "var(--color-dark-border)" }}>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Volume</span>
            <input type="range" min="0" max="100" value={Math.round(musicVolume * 100)} onChange={(e) => onMusicVolumeChange(Number(e.target.value) / 100)} className="volume-slider flex-1" />
            <span className="w-6 text-right text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{Math.round(musicVolume * 100)}</span>
          </div>
        )}
        {/* Collaborative mix — adjust singer's voice/music balance for everyone */}
        {onMixAdjust && (
          <ListenerMixControl voiceValue={mixVoiceValue} musicValue={mixMusicValue} onAdjust={onMixAdjust} onDone={onMixAdjustDone} />
        )}

      </div>
      </AudioVisualizer>
    );
  }

  // My turn — expanded with controls
  return (
    <AudioVisualizer room={room} isActive={isSharing} ambientId={ambientId}>
    <div
      className="relative overflow-hidden rounded-xl p-4"
      style={{ background: "var(--color-dark-surface)" }}
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
            <Mic size={20} style={{ color: "var(--color-primary)" }} />
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
              Singing requires a Chromium browser (Chrome, Edge, Brave, Arc...)
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Mic size={20} style={{ color: "var(--color-primary)" }} />
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

          {/* Song name — always editable */}
          <SongNameInput
            initial={singerSongName ?? ""}
            onSet={(name) => {
              window.dispatchEvent(new CustomEvent("karaoke-set-song", { detail: name }));
            }}
          />

          {/* Separate mic/music volume sliders + auto-mix */}
          {onMixMicGain && onMixMusicGain && (
            <div className="space-y-2">
              <MixSlider label="Voice" icon={<Mic size={14} style={{ color: "var(--color-primary)" }} />} value={mixVoiceValue} onChange={(v) => onMixMicGain(v / 100)} />
              <MixSlider label="Music" icon={<Music size={14} style={{ color: "var(--color-accent)" }} />} value={mixMusicValue} onChange={(v) => onMixMusicGain(v / 100)} />
              {onAutoMixChange && (
                <button
                  onClick={() => onAutoMixChange(!autoMix)}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[10px] font-medium transition-all hover:brightness-110"
                  style={{
                    borderColor: autoMix ? "var(--color-primary)" : "var(--color-dark-border)",
                    background: autoMix ? "var(--color-primary-dim)" : "transparent",
                    color: autoMix ? "var(--color-primary)" : "var(--color-text-muted)",
                  }}
                  title="Automatically lower music when you sing"
                >
                  <Wand2 size={10} />
                  {autoMix ? "Auto Mix ON" : "Auto Mix"}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Record button */}
            {onStartRecording && onStopRecording && (
              <button
                onClick={recordingState === "recording" ? onStopRecording : onStartRecording}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:brightness-110"
                style={{
                  borderColor: recordingState === "recording" ? "var(--color-danger)" : "var(--color-dark-border)",
                  background: recordingState === "recording" ? "rgba(239, 68, 68, 0.1)" : "transparent",
                  color: recordingState === "recording" ? "var(--color-danger)" : "var(--color-text-muted)",
                }}
                title={recordingState === "recording" ? "Stop recording" : "Record your performance"}
              >
                {recordingState === "recording" ? (
                  <>
                    <Square size={10} fill="currentColor" />
                    {formatDuration(recordingDuration)}
                  </>
                ) : (
                  <>
                    <Circle size={10} fill="currentColor" style={{ color: "var(--color-danger)" }} />
                    Record
                  </>
                )}
              </button>
            )}
            {onMuteAll && onUnmuteAll && (
              <button
                onClick={isMutedAll ? onUnmuteAll : onMuteAll}
                className="flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:brightness-110"
                style={{
                  borderColor: isMutedAll ? "var(--color-accent)" : "var(--color-dark-border)",
                  background: isMutedAll ? "var(--color-accent-dim)" : "transparent",
                  color: isMutedAll ? "var(--color-accent)" : "var(--color-text-muted)",
                }}
                title={isMutedAll ? "Unmute everyone" : "Mute all other microphones"}
              >
                {isMutedAll ? <VolumeX size={12} /> : <Volume2 size={12} />}
                {isMutedAll ? "Unmute All" : "Mute All"}
              </button>
            )}
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
    </AudioVisualizer>
  );
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function MixSlider({ label, icon, value, onChange }: { label: string; icon: React.ReactNode; value: number; onChange: (val: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="w-10 text-[10px] uppercase" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <input type="range" min="0" max="150" value={value} onChange={(e) => onChange(Number(e.target.value))} className="volume-slider flex-1" />
      <span className="w-6 text-right text-[10px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>{value}</span>
    </div>
  );
}

function SongNameInput({ initial, onSet }: { initial: string; onSet: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);

  // Sync if external value changes
  useEffect(() => { setValue(initial); }, [initial]);

  const submit = () => {
    if (value.trim()) onSet(value.trim());
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-all hover:bg-[var(--color-dark-card)]"
        style={{ color: value ? "var(--color-accent)" : "var(--color-text-muted)" }}
      >
        <span className="truncate flex-1">{value || "What are you singing? (click to set)"}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 60))}
        placeholder="Song name..."
        className="flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none transition-all focus:border-[var(--color-primary)]"
        style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        onBlur={submit}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setValue(initial); setEditing(false); } }}
      />
    </div>
  );
}

function ListenerMixControl({ voiceValue, musicValue, onAdjust, onDone }: { voiceValue: number; musicValue: number; onAdjust: (voice: number, music: number) => void; onDone?: (voice: number, music: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [voice, setVoice] = useState(voiceValue);
  const [music, setMusic] = useState(musicValue);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from external changes (e.g., singer adjusted)
  useEffect(() => { setVoice(voiceValue); }, [voiceValue]);
  useEffect(() => { setMusic(musicValue); }, [musicValue]);

  // Cleanup throttle on unmount
  useEffect(() => () => { if (throttleRef.current) clearTimeout(throttleRef.current); }, []);

  const sendThrottled = (v: number, m: number) => {
    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => { onAdjust(v / 100, m / 100); }, 100);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[10px] font-medium transition-all hover:brightness-110"
        style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
      >
        <Wand2 size={10} />
        Help Mix
      </button>
    );
  }

  const handleRelease = () => {
    // Send chat announcement once when user releases the slider
    onDone?.(voice / 100, music / 100);
  };

  return (
    <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: "var(--color-dark-border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Adjust for everyone</span>
        <button onClick={() => setExpanded(false)} className="cursor-pointer text-[9px]" style={{ color: "var(--color-text-muted)" }}>hide</button>
      </div>
      <div onPointerUp={handleRelease} onTouchEnd={handleRelease}>
        <MixSlider label="Voice" icon={<Mic size={12} style={{ color: "var(--color-primary)" }} />} value={voice} onChange={(v) => { setVoice(v); sendThrottled(v, music); }} />
        <MixSlider label="Music" icon={<Music size={12} style={{ color: "var(--color-accent)" }} />} value={music} onChange={(v) => { setMusic(v); sendThrottled(voice, v); }} />
      </div>
    </div>
  );
}

