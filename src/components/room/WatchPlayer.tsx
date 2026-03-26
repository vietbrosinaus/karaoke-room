"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadYouTubeIFrameAPI } from "~/lib/youtube";

export interface WatchPlayerApi {
  getCurrentTime: () => number | null;
  getState: () => "playing" | "paused" | null;
  play: () => void;
  pause: () => void;
  setVolume: (v: number) => void; // 0-100
}

interface WatchPlayerProps {
  videoId: string | null;
  title: string | null;
  isLeader: boolean;
  watchSync: { state: "playing" | "paused"; time: number; from: string } | null;
  onSync: (state: "playing" | "paused", time: number) => void;
  onAdvance: () => void;
  onApi?: (api: WatchPlayerApi | null) => void;
}

function isProbablyMobile() {
  if (typeof window === "undefined") return false;
  // Heuristic: touch + small viewport is enough for autoplay policy handling.
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const small = window.innerWidth < 900;
  return hasTouch && small;
}

export function WatchPlayer({ videoId, title, isLeader, watchSync, onSync, onAdvance, onApi }: WatchPlayerProps) {
  const containerId = useMemo(() => `yt-${Math.random().toString(36).slice(2)}`, []);
  const playerRef = useRef<YT.Player | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessingSyncRef = useRef(false);
  const [needsTap, setNeedsTap] = useState(false);

  const api: WatchPlayerApi = useMemo(() => ({
    getCurrentTime: () => {
      try {
        return playerRef.current ? playerRef.current.getCurrentTime() : null;
      } catch {
        return null;
      }
    },
    getState: () => {
      try {
        const p = playerRef.current;
        if (!p) return null;
        const s = p.getPlayerState();
        if (s === YT.PlayerState.PLAYING) return "playing";
        if (s === YT.PlayerState.PAUSED) return "paused";
        return null;
      } catch {
        return null;
      }
    },
    play: () => {
      try {
        playerRef.current?.playVideo();
      } catch {
        // ignore
      }
    },
    pause: () => {
      try {
        playerRef.current?.pauseVideo();
      } catch {
        // ignore
      }
    },
    setVolume: (v: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(v)));
      try {
        playerRef.current?.setVolume(clamped);
      } catch {
        // ignore
      }
    },
  }), []);

  useEffect(() => {
    onApi?.(api);
    return () => onApi?.(null);
  }, [api, onApi]);

  useEffect(() => {
    if (!videoId) {
      setNeedsTap(false);
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
      return;
    }

    let cancelled = false;

    const mount = async () => {
      await loadYouTubeIFrameAPI();
      if (cancelled) return;

      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;

      const player = new YT.Player(containerId, {
        videoId,
        playerVars: {
          // Privacy enhanced domain is handled by IFrame API internally, but rel=0 still applies.
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (isProbablyMobile()) setNeedsTap(true);
          },
          onStateChange: (evt: YT.OnStateChangeEvent) => {
            if (isProcessingSyncRef.current) return;
            if (!playerRef.current) return;

            if (evt.data === YT.PlayerState.ENDED) {
              if (isLeader) onAdvance();
              return;
            }

            if (evt.data === YT.PlayerState.PLAYING || evt.data === YT.PlayerState.PAUSED) {
              const state = evt.data === YT.PlayerState.PLAYING ? "playing" : "paused";
              const t = playerRef.current.getCurrentTime();
              onSync(state, t);
            }
          },
          onError: () => {
            // If the video is blocked from embedding, the UI will still show, but playback will fail.
            // We rely on oEmbed validation to catch most cases.
          },
        },
      });

      playerRef.current = player;
    };

    void mount();

    return () => {
      cancelled = true;
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
  }, [containerId, isLeader, onAdvance, onSync, videoId]);

  useEffect(() => {
    if (!isLeader) {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
      return;
    }
    if (!videoId) return;

    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const s = p.getPlayerState();
        const state = s === YT.PlayerState.PAUSED ? "paused" : "playing";
        const t = p.getCurrentTime();
        // Leader heartbeat: state does not change in most cases, so server treats this as heartbeat.
        onSync(state, t);
      } catch {
        // ignore
      }
    }, 10_000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    };
  }, [isLeader, onSync, videoId]);

  useEffect(() => {
    if (!watchSync) return;
    const p = playerRef.current;
    if (!p) return;
    if (!videoId) return;

    isProcessingSyncRef.current = true;
    try {
      const current = p.getCurrentTime();
      const drift = Math.abs(current - watchSync.time);
      if (drift > 2) {
        p.seekTo(watchSync.time, true);
      }
      if (watchSync.state === "playing") p.playVideo();
      else p.pauseVideo();
    } catch {
      // ignore
    } finally {
      isProcessingSyncRef.current = false;
    }
  }, [videoId, watchSync]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-3"
      style={{
        borderColor: "var(--color-dark-border)",
        background: "var(--color-dark-surface)",
        animation: "watch-enter 0.25s ease-out",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>
            Watch Mode
          </p>
          <p className="truncate text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {title ?? "Waiting for a video..."}
          </p>
        </div>
        <div
          className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{
            borderColor: "var(--color-dark-border)",
            color: isLeader ? "var(--color-accent)" : "var(--color-text-muted)",
            background: isLeader ? "var(--color-accent-dim)" : "transparent",
          }}
          title={isLeader ? "Your client drives time sync" : "Following room sync"}
        >
          {isLeader ? "Leader" : "Viewer"}
        </div>
      </div>

      {videoId ? (
        <div className="relative">
          <div
            className="watch-glow overflow-hidden rounded-xl"
            style={{
              aspectRatio: "16/9",
              background: "linear-gradient(135deg, rgba(212, 160, 23, 0.10), rgba(245, 230, 200, 0.04))",
            }}
          >
            <div id={containerId} className="h-full w-full" />
          </div>

          {needsTap ? (
            <button
              onClick={() => {
                setNeedsTap(false);
                isProcessingSyncRef.current = true;
                try {
                  playerRef.current?.playVideo();
                } finally {
                  isProcessingSyncRef.current = false;
                }
              }}
              className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-xl"
              style={{ background: "rgba(9, 9, 11, 0.55)" }}
            >
              <div className="rounded-xl border px-4 py-3 text-center" style={{ borderColor: "var(--color-dark-border)", background: "rgba(9, 9, 11, 0.75)" }}>
                <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                  Tap to play
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Required by mobile autoplay rules
                </p>
              </div>
            </button>
          ) : null}
        </div>
      ) : (
        <div
          className="flex items-center justify-center rounded-xl border"
          style={{
            aspectRatio: "16/9",
            borderColor: "var(--color-dark-border)",
            background: "var(--color-dark-card)",
          }}
        >
          <div className="max-w-sm text-center">
            <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
              Paste a YouTube URL to start watching together
            </p>
            <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
              The queue auto-plays. Anyone can pause, resume, or skip.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

