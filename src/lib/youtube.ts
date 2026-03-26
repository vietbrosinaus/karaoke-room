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

