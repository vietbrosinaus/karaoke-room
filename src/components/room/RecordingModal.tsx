"use client";

import { useState, useRef, useEffect } from "react";
import { Download, Play, Square, Trash2, Loader2 } from "lucide-react";
import { convertToMp3, convertToWav } from "~/lib/audioConvert";

type ConvertFormat = "mp3" | "wav";

interface RecordingModalProps {
  open: boolean;
  blob: Blob;
  duration: number;
  songName: string | null;
  onClose: () => void;
}

export function RecordingModal({ open, blob, duration, songName, onClose }: RecordingModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [converting, setConverting] = useState<ConvertFormat | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Create object URL on mount, revoke on unmount
  useEffect(() => {
    if (open && blob) {
      urlRef.current = URL.createObjectURL(blob);
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [open, blob]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !converting) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, converting]);

  if (!open) return null;

  const fileName = songName ? songName.replace(/[^a-zA-Z0-9 _-]/g, "").trim() : "recording";

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const triggerDownload = (url: string, ext: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePlay = () => {
    if (!urlRef.current) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }
    const audio = new Audio(urlRef.current);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
    audioRef.current = audio;
    setIsPlaying(true);
    void audio.play();
  };

  const handleDownloadWebm = () => {
    if (!urlRef.current) return;
    triggerDownload(urlRef.current, "webm");
  };

  const handleConvert = async (format: ConvertFormat) => {
    if (converting) return;
    setConverting(format);
    try {
      const converted = format === "mp3" ? await convertToMp3(blob) : await convertToWav(blob);
      const url = URL.createObjectURL(converted);
      triggerDownload(url, format);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`[Recording] ${format} conversion failed:`, err);
    } finally {
      setConverting(null);
    }
  };

  const fileSizeKB = Math.round(blob.size / 1024);
  const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(1);

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)" }} onClick={converting ? undefined : onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5"
        style={{
          background: "var(--color-dark-bg)",
          borderColor: "var(--color-dark-border)",
          animation: "fade-in 0.15s ease-out",
        }}
      >
        <h3
          className="mb-1 text-sm font-bold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
        >
          Recording Complete
        </h3>
        <p className="mb-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {formatTime(duration)} &middot; {fileSizeKB > 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`}
          {songName && (
            <span style={{ color: "var(--color-accent)" }}> &middot; {songName}</span>
          )}
        </p>

        {/* Preview */}
        <button
          onClick={handlePlay}
          disabled={!!converting}
          className="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-medium transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: isPlaying ? "var(--color-primary)" : "var(--color-dark-border)",
            background: isPlaying ? "var(--color-primary-dim)" : "transparent",
            color: isPlaying ? "var(--color-primary)" : "var(--color-text-primary)",
          }}
        >
          {isPlaying ? <><Square size={12} /> Stop Preview</> : <><Play size={12} /> Preview</>}
        </button>

        {/* Download WebM (instant) */}
        <button
          onClick={handleDownloadWebm}
          disabled={!!converting}
          className="mb-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
        >
          <Download size={12} />
          Download WebM
        </button>

        {/* Convert to other formats */}
        <div className="mb-3">
          <p className="mb-2 text-center text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            Or convert to
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void handleConvert("mp3")}
              disabled={!!converting}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: converting === "mp3" ? "var(--color-accent)" : "var(--color-dark-border)",
                background: converting === "mp3" ? "var(--color-accent-dim)" : "transparent",
                color: converting === "mp3" ? "var(--color-accent)" : "var(--color-text-primary)",
              }}
            >
              {converting === "mp3" ? <><Loader2 size={11} className="animate-spin" /> Converting...</> : "MP3"}
            </button>
            <button
              onClick={() => void handleConvert("wav")}
              disabled={!!converting}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: converting === "wav" ? "var(--color-accent)" : "var(--color-dark-border)",
                background: converting === "wav" ? "var(--color-accent-dim)" : "transparent",
                color: converting === "wav" ? "var(--color-accent)" : "var(--color-text-primary)",
              }}
            >
              {converting === "wav" ? <><Loader2 size={11} className="animate-spin" /> Converting...</> : "WAV"}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[9px]" style={{ color: "var(--color-text-muted)" }}>
            Converts in your browser — nothing uploaded
          </p>
        </div>

        {/* Discard */}
        <button
          onClick={onClose}
          disabled={!!converting}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
        >
          <Trash2 size={12} />
          Discard
        </button>
      </div>
    </>
  );
}
