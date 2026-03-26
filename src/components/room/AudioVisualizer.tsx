"use client";

import { useEffect, useRef } from "react";
import type { Room } from "livekit-client";
import { Track } from "livekit-client";

interface AudioVisualizerProps {
  room: Room | null;
  isActive: boolean;
  children: React.ReactNode;
  ambientId?: string;
}

// Per-instance state is now inside the component via refs (not module-level)
// to avoid cross-instance cache contamination.

function findMusicTrack(room: Room): MediaStreamTrack | null {
  // Priority 1: ScreenShareAudio from remote participants (singer's mixed track)
  for (const [, participant] of room.remoteParticipants) {
    for (const [, pub] of participant.trackPublications) {
      if (pub.track && pub.isSubscribed && pub.track.kind === Track.Kind.Audio && pub.source === Track.Source.ScreenShareAudio) {
        return pub.track.mediaStreamTrack;
      }
    }
  }

  // Priority 2: Local ScreenShareAudio (singer's own view)
  const localPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
  if (localPub?.track) return localPub.track.mediaStreamTrack;

  // Priority 3: DOM fallback — audio element tagged as music
  const audioEl = document.querySelector<HTMLAudioElement>('audio[data-lk-type="music"]');
  if (audioEl?.srcObject instanceof MediaStream) {
    return audioEl.srcObject.getAudioTracks()[0] ?? null;
  }

  return null;
}

function getAudioEnergy(analyser: AnalyserNode | null, dataBuffer: Uint8Array | null): { bass: number; mid: number; high: number; overall: number } {
  if (!analyser || !dataBuffer) return { bass: 0, mid: 0, high: 0, overall: 0 };

  analyser.getByteFrequencyData(dataBuffer as Uint8Array<ArrayBuffer>);

  const len = dataBuffer.length;
  const third = Math.floor(len / 3);
  let bass = 0, mid = 0, high = 0;

  for (let i = 0; i < third; i++) bass += dataBuffer[i]!;
  for (let i = third; i < third * 2; i++) mid += dataBuffer[i]!;
  for (let i = third * 2; i < len; i++) high += dataBuffer[i]!;

  bass = bass / (third * 255);
  mid = mid / (third * 255);
  high = high / ((len - third * 2) * 255);
  const overall = (bass * 0.5 + mid * 0.35 + high * 0.15);

  return { bass, mid, high, overall };
}

export function AudioVisualizer({ room, isActive, children, ambientId }: AudioVisualizerProps) {
  const rafRef = useRef<number>(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackCheckCounter = useRef(0);

  // Per-instance audio state (not shared module-level)
  const vizCtxRef = useRef<AudioContext | null>(null);
  const vizSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vizAnalyserRef = useRef<AnalyserNode | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const dataBufferRef = useRef<Uint8Array | null>(null);

  const setupAnalyser = (track: MediaStreamTrack) => {
    // Same track — reuse
    if (track.id === lastTrackIdRef.current && vizAnalyserRef.current) return;

    lastTrackIdRef.current = track.id;

    if (!vizCtxRef.current || vizCtxRef.current.state === "closed") {
      vizCtxRef.current = new AudioContext({ sampleRate: 48000 });
    }

    vizSourceRef.current?.disconnect();
    vizSourceRef.current = vizCtxRef.current.createMediaStreamSource(new MediaStream([track]));
    vizAnalyserRef.current = vizCtxRef.current.createAnalyser();
    vizAnalyserRef.current.fftSize = 64;
    vizAnalyserRef.current.smoothingTimeConstant = 0.85;
    vizSourceRef.current.connect(vizAnalyserRef.current);
    dataBufferRef.current = new Uint8Array(vizAnalyserRef.current.frequencyBinCount);
  };

  const cleanupViz = () => {
    vizSourceRef.current?.disconnect();
    vizSourceRef.current = null;
    vizAnalyserRef.current = null;
    lastTrackIdRef.current = null;
    dataBufferRef.current = null;
    if (vizCtxRef.current && vizCtxRef.current.state !== "closed") {
      void vizCtxRef.current.close().catch(() => {});
    }
    vizCtxRef.current = null;
  };

  useEffect(() => {
    if (!isActive || !room) {
      cancelAnimationFrame(rafRef.current);
      cleanupViz();
      // Reset glow + ambient background
      if (wrapperRef.current) {
        wrapperRef.current.style.boxShadow = "";
        wrapperRef.current.style.borderColor = "";
      }
      if (ambientId) {
        const ambientEl = document.getElementById(ambientId);
        if (ambientEl) ambientEl.style.background = "";
      }
      return;
    }

    let running = true;

    const update = () => {
      if (!running) return;

      trackCheckCounter.current++;
      // Check for track every 10 frames (~170ms) instead of 30 (~500ms)
      if (trackCheckCounter.current >= 10 || !vizAnalyserRef.current) {
        trackCheckCounter.current = 0;
        const track = findMusicTrack(room);
        if (track && track.readyState === "live") {
          setupAnalyser(track);
        } else if (vizAnalyserRef.current) {
          // Track went dead (singer changed) — clear analyser so next poll finds new track
          cleanupViz();
        }
      }

      const energy = getAudioEnergy(vizAnalyserRef.current, dataBufferRef.current);

      const el = wrapperRef.current;
      if (el) {
        const intensity = energy.overall;
        const spread = Math.round(12 + intensity * 36);
        const opacity = Math.min(intensity * 1.5, 0.85);

        const violetGlow = `0 0 ${spread}px rgba(139, 92, 246, ${opacity * Math.max(energy.bass, 0.3)})`;
        const amberGlow = `0 0 ${Math.round(spread * 0.8)}px rgba(245, 158, 11, ${opacity * energy.high * 2.5})`;
        const innerGlow = `inset 0 0 ${Math.round(spread * 0.5)}px rgba(139, 92, 246, ${opacity * 0.4})`;

        el.style.boxShadow = `${violetGlow}, ${amberGlow}, ${innerGlow}`;
        el.style.borderColor = intensity > 0.15
          ? `rgba(139, 92, 246, ${0.4 + intensity * 0.6})`
          : "";
      }

      if (ambientId) {
        const ambientEl = document.getElementById(ambientId);
        if (ambientEl) {
          const bassOpacity = 0.03 + energy.bass * 0.1;
          const highOpacity = 0.02 + energy.high * 0.08;
          const bassSize = 40 + energy.bass * 20;
          const highSize = 35 + energy.high * 15;

          ambientEl.style.background =
            `radial-gradient(ellipse ${bassSize}% ${bassSize}% at 20% 80%, rgba(139, 92, 246, ${bassOpacity}), transparent), ` +
            `radial-gradient(ellipse ${highSize}% ${highSize}% at 80% 20%, rgba(245, 158, 11, ${highOpacity}), transparent)`;
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      cleanupViz();
      if (wrapperRef.current) {
        wrapperRef.current.style.boxShadow = "";
        wrapperRef.current.style.borderColor = "";
      }
      if (ambientId) {
        const ambientEl = document.getElementById(ambientId);
        if (ambientEl) ambientEl.style.background = "";
      }
    };
  }, [isActive, room, ambientId]);

  return (
    <div
      ref={wrapperRef}
      className="rounded-xl border transition-[border-color] duration-150"
      style={{
        borderColor: isActive ? "rgba(139, 92, 246, 0.4)" : "var(--color-dark-border)",
      }}
    >
      {children}
    </div>
  );
}
