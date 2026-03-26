"use client";

import { X } from "lucide-react";
import type { WatchQueueItem } from "~/types/room";

interface VideoQueueProps {
  myPeerId: string | null;
  current: { videoId: string; title: string | null; addedByName: string | null } | null;
  queue: WatchQueueItem[];
  onRemove: (videoId: string) => void;
}

function thumb(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

export function VideoQueue({ myPeerId, current, queue, onRemove }: VideoQueueProps) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
        boxShadow: "0 0 0 1px rgb(var(--watch-glow-rgb) / 0.05) inset",
      }}
    >
      <div className="-mx-3 mb-2 border-b px-3 pb-2" style={{ borderColor: "var(--color-dark-border)" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>
          Video Queue
        </p>
      </div>

      {current ? (
        <div className="mb-3 overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-dark-border)", background: "var(--color-dark-card)" }}>
          <div className="relative">
            <img src={thumb(current.videoId)} alt={current.title ?? "YouTube video thumbnail"} className="h-24 w-full object-cover opacity-90" />
            <div className="absolute left-2 top-2 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ borderColor: "var(--color-dark-border)", background: "var(--color-dark-bg)", color: "var(--color-accent)" }}
            >
              Now playing
            </div>
          </div>
          <div className="p-2">
            <p className="truncate text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {current.title ?? "YouTube video"}
            </p>
            <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Added by {current.addedByName ?? "someone"}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-xl border p-3 text-center" style={{ borderColor: "var(--color-dark-border)", background: "var(--color-dark-card)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Queue is empty
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            Paste a YouTube URL to add a video
          </p>
        </div>
      )}

      {queue.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>
            Up next
          </p>
          {queue.map((q) => (
            <div
              key={`${q.videoId}-${q.addedBy}-${q.title}`}
              className="flex items-center gap-2 rounded-lg border p-2"
              style={{ borderColor: "var(--color-dark-border)", background: "var(--color-dark-card)" }}
            >
              <img src={thumb(q.videoId)} alt={q.title ?? "YouTube video thumbnail"} className="h-10 w-16 rounded-md object-cover" loading="lazy" decoding="async" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {q.title}
                </p>
                <p className="truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  {q.addedByName}
                </p>
              </div>
              {myPeerId && q.addedBy === myPeerId ? (
                <button
                  onClick={() => onRemove(q.videoId)}
                  className="cursor-pointer rounded-lg border p-2 transition-all hover:scale-105 active:scale-95"
                  style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
                  title="Remove"
                  aria-label="Remove from queue"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

