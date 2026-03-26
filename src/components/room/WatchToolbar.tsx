"use client";

import { useMemo, useState } from "react";
import { Mic, MicOff, SkipForward, Link as LinkIcon, MessageSquare, X } from "lucide-react";
import { extractYouTubeVideoId, validateYouTubeVideo } from "~/lib/youtube";
import type { RoomState } from "~/types/room";

interface WatchToolbarProps {
  roomState: RoomState;
  myPeerId: string | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  onSoundProfileOpen: () => void;
  onQueueAdd: (videoId: string, title: string) => void;
  onSkip: () => void;
}

export function WatchToolbar({ roomState, myPeerId, isMicEnabled, toggleMic, onSoundProfileOpen, onQueueAdd, onSkip }: WatchToolbarProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const canControl = roomState.roomMode === "watch" && roomState.watchCurrentVideoId !== null;
  const queueCount = roomState.watchQueue.length + (roomState.watchCurrentVideoId ? 1 : 0);
  const isLeader = myPeerId !== null && roomState.watchLeaderId === myPeerId;

  const statusLabel = useMemo(() => {
    if (roomState.roomMode !== "watch") return "Karaoke Mode";
    if (!roomState.watchCurrentVideoId) return "Queue empty";
    if (roomState.watchState === "paused") return "Paused";
    if (roomState.watchState === "playing") return "Playing";
    return "Ready";
  }, [roomState.roomMode, roomState.watchCurrentVideoId, roomState.watchState]);

  const submit = async () => {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) return;

    // Soft-block playlists for now (YouTube playlist links, or watch URLs with `list=`)
    try {
      const u = new URL(trimmed);
      const host = u.hostname.replace(/^www\./, "");
      const hasList = Boolean(u.searchParams.get("list"));
      const isPlaylistPath = u.pathname.startsWith("/playlist");
      if ((host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") && (hasList || isPlaylistPath)) {
        setError("Playlists are not supported yet - paste a single video URL.");
        return;
      }
    } catch {
      // ignore URL parse failures here - extractYouTubeVideoId handles them
    }

    const videoId = extractYouTubeVideoId(trimmed);
    if (!videoId) {
      setError("Not a valid YouTube URL");
      return;
    }

    if (roomState.watchQueue.length >= 20) {
      setError("Queue is full");
      return;
    }

    setIsValidating(true);
    try {
      const res = await validateYouTubeVideo(videoId);
      if (!res.valid) {
        setError("Video not found or unavailable");
        return;
      }
      onQueueAdd(videoId, res.title || "YouTube video");
      setUrl("");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: "var(--color-dark-border)",
        background: "var(--color-dark-surface)",
        boxShadow: "0 0 0 1px rgb(var(--watch-glow-rgb) / 0.06) inset",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Mic toggle (watch mode still needs mute/unmute) */}
        <button
          onClick={toggleMic}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all active:scale-95"
          style={{
            fontFamily: "var(--font-display)",
            borderColor: "rgb(var(--watch-glow-rgb) / 0.25)",
            background: isMicEnabled ? "rgb(var(--watch-glow-rgb) / 0.10)" : "rgb(var(--watch-glow-rgb) / 0.18)",
            color: "var(--color-primary)",
          }}
          title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          {isMicEnabled ? <Mic size={14} /> : <MicOff size={14} />}
          {isMicEnabled ? "Mute" : "Unmute"}
        </button>

        {/* Sound Profile (devices/effects) */}
        <button
          onClick={onSoundProfileOpen}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all active:scale-95"
          style={{
            fontFamily: "var(--font-display)",
            borderColor: "var(--color-dark-border)",
            background: "var(--color-primary-dim)",
            color: "var(--color-primary)",
          }}
          title="Sound Profile"
        >
          <MessageSquare size={14} />
          Sound
        </button>

        <button
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            fontFamily: "var(--font-display)",
            borderColor: "var(--color-dark-border)",
            background: "transparent",
            color: "var(--color-text-muted)",
          }}
          disabled={!canControl}
          onClick={onSkip}
          title="Skip (advances the queue)"
        >
          <SkipForward size={14} />
          Skip
        </button>

        <div className="ml-1 flex items-center gap-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          <span
            className="rounded-full border px-2 py-1 uppercase tracking-[0.12em]"
            style={{
              borderColor: "var(--color-dark-border)",
              background: "var(--color-accent-dim)",
              color: "var(--color-accent)",
              fontWeight: 700,
            }}
          >
            {statusLabel}
          </span>
          <span className="hidden sm:inline">Queue: {queueCount}</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">{isLeader ? "You are leader" : "Following"}</span>
        </div>

        <div className="flex-1" />

        <div className="flex min-w-[260px] flex-1 items-center gap-2 sm:min-w-[360px]">
          <div className="relative flex-1">
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              placeholder="Paste YouTube URL..."
              className="w-full rounded-lg border px-3 py-2 pl-9 text-xs outline-none transition-colors"
              style={{
                background: "var(--color-dark-card)",
                borderColor: error ? "var(--color-danger)" : "var(--color-dark-border)",
                color: "var(--color-text-primary)",
              }}
            />
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }}>
              <LinkIcon size={14} />
            </div>
          </div>

          {url ? (
            <button
              className="cursor-pointer rounded-lg border p-2 transition-all hover:scale-105 active:scale-95"
              style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
              onClick={() => { setUrl(""); setError(null); }}
              title="Clear"
              aria-label="Clear URL"
            >
              <X size={14} />
            </button>
          ) : null}

          <button
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              fontFamily: "var(--font-display)",
            borderColor: "rgb(var(--watch-glow-rgb) / 0.25)",
            background: "rgb(var(--watch-glow-rgb) / 0.10)",
              color: "var(--color-primary)",
            }}
            disabled={isValidating || !url.trim()}
            onClick={() => { void submit(); }}
            title="Add to queue"
          >
            <LinkIcon size={14} />
            {isValidating ? "Checking..." : "Add"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-2 text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

