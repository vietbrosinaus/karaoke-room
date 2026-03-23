"use client";

interface AudioControlsProps {
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
}

export function AudioControls({ isMicEnabled, toggleMic }: AudioControlsProps) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
      }}
    >
      <h3
        className="mb-4 text-sm uppercase tracking-widest"
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--color-neon-cyan)",
          fontSize: "0.75rem",
        }}
      >
        Microphone
      </h3>

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
      </div>

      <p
        className="mt-3 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {isMicEnabled
          ? "Your mic is on. Others can hear you talking."
          : "Your mic is muted. Click to start talking."}
      </p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
