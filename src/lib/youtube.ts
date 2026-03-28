"use client";

let youtubeIframeApiPromise: Promise<void> | null = null;

export function extractYouTubeVideoId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Accept bare IDs
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  // youtube.com variants
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    // /watch?v=<id>
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    // /embed/<id> or /shorts/<id> or /live/<id>
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live")) {
      const id = parts[1] ?? "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
  }

  return null;
}

export async function validateYouTubeVideo(videoId: string): Promise<{ valid: boolean; title: string }> {
  const id = (videoId ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return { valid: false, title: "" };

  // oEmbed returns 200 with metadata if the video exists and can be embedded.
  const oembed = new URL("https://www.youtube.com/oembed");
  oembed.searchParams.set("url", `https://www.youtube.com/watch?v=${id}`);
  oembed.searchParams.set("format", "json");

  try {
    const res = await fetch(oembed.toString(), { method: "GET" });
    if (!res.ok) return { valid: false, title: "" };
    const data = (await res.json()) as { title?: unknown };
    const title = typeof data.title === "string" ? data.title : "";
    return { valid: true, title };
  } catch {
    return { valid: false, title: "" };
  }
}

/**
 * Extract a playlist ID from a YouTube URL.
 * Only returns a playlist ID for dedicated playlist URLs (/playlist?list=...).
 * Watch URLs with &list= are treated as single videos (user intent is the video).
 * Radio/mix playlists (RD prefix) are rejected - they're dynamically generated
 * and can't be enumerated by the IFrame API.
 */
export function extractYouTubePlaylistId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;

  const list = url.searchParams.get("list");
  if (!list || !/^[a-zA-Z0-9_-]{5,150}$/.test(list)) return null;

  // Reject radio/mix playlists (RD prefix) - dynamically generated, can't enumerate
  if (list.startsWith("RD")) return null;

  // Only treat as playlist if it's a dedicated playlist URL (no ?v= video)
  const hasVideo = Boolean(url.searchParams.get("v"));
  const isPlaylistPage = url.pathname.startsWith("/playlist");
  if (hasVideo && !isPlaylistPage) return null;

  return list;
}

/**
 * Fetch video IDs from a YouTube playlist using the IFrame API.
 * Creates a hidden player, loads the playlist, reads getPlaylist(), destroys it.
 * No API key needed - uses YouTube's own client-side infrastructure.
 */
export async function fetchPlaylistVideoIds(playlistId: string, max: number = 20): Promise<string[]> {
  await loadYouTubeIFrameAPI();

  return new Promise<string[]>((resolve) => {
    // Create an off-screen container for the temp player
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.width = "1px";
    container.style.height = "1px";
    document.body.appendChild(container);

    const playerId = `yt-playlist-probe-${Date.now()}`;
    const div = document.createElement("div");
    div.id = playerId;
    container.appendChild(div);

    let settled = false;
    const cleanup = (ids: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try { player.destroy(); } catch { /* ignore */ }
      container.remove();
      resolve(ids);
    };

    const timeoutId = setTimeout(() => cleanup([]), 15_000);

    const player = new YT.Player(playerId, {
      height: "1",
      width: "1",
      playerVars: {
        listType: "playlist",
        list: playlistId,
      },
      events: {
        onReady: () => {
          // getPlaylist() may not be available immediately - poll briefly
          let attempts = 0;
          const poll = setInterval(() => {
            attempts++;
            try {
              const playlist = (player as unknown as { getPlaylist?: () => string[] | null }).getPlaylist?.();
              if (playlist && playlist.length > 0) {
                clearInterval(poll);
                cleanup(playlist.slice(0, max));
                return;
              }
            } catch { /* ignore */ }
            // Try cueing the playlist if it hasn't loaded
            if (attempts === 1) {
              try {
                (player as unknown as { cuePlaylist: (opts: Record<string, unknown>) => void }).cuePlaylist({
                  listType: "playlist",
                  list: playlistId,
                });
              } catch { /* ignore */ }
            }
            if (attempts > 30) {
              clearInterval(poll);
              cleanup([]);
            }
          }, 300);
        },
        onError: () => cleanup([]),
      },
    });
  });
}

/**
 * Fetch playlist items (videoId + title) with no API key.
 * Uses IFrame API for video IDs, then oEmbed for titles (batched in groups of 5).
 */
export async function fetchPlaylistItems(playlistId: string, max: number = 20): Promise<{ videoId: string; title: string }[]> {
  const ids = await fetchPlaylistVideoIds(playlistId, max);
  if (ids.length === 0) return [];

  // Batch oEmbed requests in groups of 5 to avoid rate limiting
  const items: { videoId: string; title: string }[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (videoId) => {
        const { valid, title } = await validateYouTubeVideo(videoId);
        if (!valid) return null;
        return { videoId, title: title || "YouTube video" };
      }),
    );
    for (const r of results) {
      if (r) items.push(r);
    }
  }

  return items;
}

export function loadYouTubeIFrameAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { YT?: unknown; onYouTubeIframeAPIReady?: () => void };

  if (w.YT && (w.YT as { Player?: unknown }).Player) {
    return Promise.resolve();
  }

  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise<void>((resolve, reject) => {
    const hasPlayer = () => Boolean(w.YT && (w.YT as { Player?: unknown }).Player);
    if (hasPlayer()) {
      resolve();
      return;
    }

    let settled = false;
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      youtubeIframeApiPromise = null;
      reject(err);
    };

    const timeoutId = window.setTimeout(() => {
      settleReject(new Error("Timed out while loading YouTube IFrame API"));
    }, 15_000);

    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } finally {
        settleResolve();
      }
    };

    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }

    script.addEventListener(
      "load",
      () => {
        if (hasPlayer()) settleResolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        settleReject(new Error("Failed to load YouTube IFrame API"));
      },
      { once: true },
    );
  });

  return youtubeIframeApiPromise;
}

