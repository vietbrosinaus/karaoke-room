"use client";

import { useEffect, useState } from "react";
import type { Room } from "livekit-client";
import { useAudioLevel } from "~/hooks/useAudioLevel";

interface StatusBarProps {
  room: Room | null;
  isConnected: boolean;
  isMicEnabled: boolean;
  isSharing: boolean;
  remoteParticipantCount: number;
  sessionStartTime: number; // Date.now() when room was entered
}

export function StatusBar({
  room,
  isConnected,
  isMicEnabled,
  isSharing,
  remoteParticipantCount,
  sessionStartTime,
}: StatusBarProps) {
  const { micLevel, inboundLevel, isReceivingAudio } = useAudioLevel(room);
  const [elapsed, setElapsed] = useState(0);

  // Session timer
  useEffect(() => {
    if (!sessionStartTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // LiveKit free tier: 500 participant-minutes/month
  // Each connected participant uses 1 min/min
  const participantMinutes = Math.ceil(elapsed / 60) * (remoteParticipantCount + 1);

  return (
    <div
      className="relative z-10 flex flex-wrap items-center gap-4 border-t px-6 py-2.5"
      style={{
        borderColor: "var(--color-dark-border)",
        background: "var(--color-dark-surface)",
      }}
    >
      {/* Mic status */}
      <StatusItem
        label="Mic"
        active={isMicEnabled}
        color={isMicEnabled ? "var(--color-neon-cyan)" : "var(--color-text-secondary)"}
      >
        <LevelMeter level={micLevel} color="var(--color-neon-cyan)" />
      </StatusItem>

      {/* Inbound audio status */}
      <StatusItem
        label="Hearing"
        active={isReceivingAudio}
        color={isReceivingAudio ? "var(--color-neon-purple)" : "var(--color-text-secondary)"}
      >
        <LevelMeter level={inboundLevel} color="var(--color-neon-purple)" />
      </StatusItem>

      {/* Sharing status */}
      {isSharing && (
        <StatusItem
          label="Sharing"
          active={true}
          color="var(--color-neon-pink)"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--color-neon-pink)",
              animation: "neon-pulse 1.5s ease-in-out infinite",
            }}
          />
        </StatusItem>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Session time */}
      <div
        className="flex items-center gap-2 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <span>Session: {timeStr}</span>
      </div>

      {/* Quota usage */}
      <div
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
        style={{
          background: "var(--color-dark-card)",
          color:
            participantMinutes > 400
              ? "var(--color-neon-pink)"
              : "var(--color-text-secondary)",
        }}
        title={`LiveKit free tier: 500 participant-minutes/month. Current session: ~${participantMinutes} p-min used.`}
      >
        <span>~{participantMinutes} p-min</span>
        <span style={{ opacity: 0.5 }}>/ 500</span>
      </div>
    </div>
  );
}

function StatusItem({
  label,
  active,
  color,
  children,
}: {
  label: string;
  active: boolean;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <div
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: active ? color : "var(--color-dark-border)",
          boxShadow: active ? `0 0 6px ${color}` : "none",
        }}
      />
      {children}
    </div>
  );
}

function LevelMeter({ level, color }: { level: number; color: string }) {
  // 5 bars
  const bars = 5;
  const filledBars = Math.round(level * bars * 3); // amplify for visibility

  return (
    <div className="flex items-end gap-px">
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className="rounded-sm transition-all duration-75"
          style={{
            width: "3px",
            height: `${6 + i * 2}px`,
            background:
              i < filledBars ? color : "var(--color-dark-border)",
            opacity: i < filledBars ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}
