"use client";

import { useMemo, useState } from "react";
import { Mic, MicOff, SkipForward, Link as LinkIcon, MessageSquare, X } from "lucide-react";
import { extractYouTubeVideoId, extractYouTubePlaylistId, validateYouTubeVideo, fetchPlaylistItems } from "~/lib/youtube";

/** Check if a URL has both ?v= (video) and &list= (playlist) */
function extractListParam(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const list = url.searchParams.get("list");
    return list && /^[a-zA-Z0-9_-]{5,150}$/.test(list) ? list : null;
  } catch {
    return null;
  }
}
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
  // When a URL has both a video and a playlist, prompt the user to choose
  const [pendingChoice, setPendingChoice] = useState<{ videoId: string; listId: string } | null>(null);

  const canControl = roomState.roomMode === "watch" && roomState.watchCurrentVideoId !== null;
  const queueCount = roomState.watchQueue.length;
  const isLeader = myPeerId !== null && roomState.watchLeaderId === myPeerId;

  const statusLabel = useMemo(() => {
    if (roomState.roomMode !== "watch") return "Karaoke Mode";
    if (!roomState.watchCurrentVideoId) return "Queue empty";
    if (roomState.watchState === "paused") return "Paused";
    if (roomState.watchState === "playing") return "Playing";
    return "Ready";
  }, [roomState.roomMode, roomState.watchCurrentVideoId, roomState.watchState]);

  const addSingleVideo = async (videoId: string) => {
    if (isValidating) return;
    setIsValidating(true);
    setError(null);
    try {
      const res = await validateYouTubeVideo(videoId);
      if (!res.valid) {
        setError("Video not found or unavailable");
        return;
      }
      onQueueAdd(videoId, res.title || "YouTube video");
      setUrl("");
      setPendingChoice(null);
    } finally {
      setIsValidating(false);
    }
  };

  const addPlaylist = async (listId: string) => {
    if (isValidating) return;
    const remaining = 20 - roomState.watchQueue.length;
    if (remaining <= 0) {
      setError("Queue is full (max 20)");
      return;
    }
    setIsValidating(true);
    setError(null);
    try {
      const items = await fetchPlaylistItems(listId, remaining);
      if (!items.length) {
        setError("Couldn't load playlist - it may be private or a radio mix");
        return;
      }
      for (const item of items) {
        onQueueAdd(item.videoId, item.title);
      }
      setUrl("");
      setPendingChoice(null);
    } finally {
      setIsValidating(false);
    }
  };

  const submit = async () => {
    if (isValidating) return;
    setError(null);
    setPendingChoice(null);
    const trimmed = url.trim();
    if (!trimmed) return;

    const remaining = 20 - roomState.watchQueue.length;
    if (remaining <= 0) {
      setError("Queue is full (max 20)");
      return;
    }

    // Dedicated playlist page (/playlist?list=...)
    const playlistId = extractYouTubePlaylistId(trimmed);
    if (playlistId) {
      await addPlaylist(playlistId);
      return;
    }

    // Check if URL has both a video and a list param (e.g. watch?v=abc&list=PLxyz)
    const videoId = extractYouTubeVideoId(trimmed);
    const listId = extractListParam(trimmed);
    if (videoId && listId) {
      setPendingChoice({ videoId, listId });
      return;
    }

    // Single video
    if (!videoId) {
      setError("Not a valid YouTube or playlist URL");
      return;
    }

    await addSingleVideo(videoId);
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
              placeholder="Paste YouTube URL or playlist..."
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
            {isValidating ? "Loading..." : "Add"}
          </button>
        </div>
      </div>

      {pendingChoice ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>This URL has a video and a playlist:</span>
          <button
            className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              fontFamily: "var(--font-display)",
              borderColor: "rgb(var(--watch-glow-rgb) / 0.25)",
              background: "rgb(var(--watch-glow-rgb) / 0.10)",
              color: "var(--color-primary)",
            }}
            disabled={isValidating}
            onClick={() => void addSingleVideo(pendingChoice.videoId)}
          >
            {isValidating ? "Loading..." : "Add Video"}
          </button>
          <button
            className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              fontFamily: "var(--font-display)",
              borderColor: "var(--color-accent)",
              background: "var(--color-accent-dim)",
              color: "var(--color-accent)",
            }}
            disabled={isValidating}
            onClick={() => void addPlaylist(pendingChoice.listId)}
          >
            {isValidating ? "Loading..." : "Add Playlist"}
          </button>
          <button
            className="cursor-pointer text-xs"
            style={{ color: "var(--color-text-muted)" }}
            onClick={() => setPendingChoice(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

