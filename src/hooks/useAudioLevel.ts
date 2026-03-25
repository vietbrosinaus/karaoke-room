"use client";

import { useEffect, useRef, useState } from "react";
import { Room, Track } from "livekit-client";

interface AudioLevels {
  micLevel: number; // 0-1, local mic volume
  inboundLevel: number; // 0-1, loudest remote audio
  isReceivingAudio: boolean; // are we getting any remote audio
}

// Single shared AudioContext for all level analysis — avoids creating
// new contexts per track which causes audio thread scheduling jitter.
let sharedAnalyserCtx: AudioContext | null = null;
function getOrCreateSharedCtx(): AudioContext {
  if (!sharedAnalyserCtx || sharedAnalyserCtx.state === "closed") {
    sharedAnalyserCtx = new AudioContext({ sampleRate: 48000, latencyHint: "playback" });
  }
  return sharedAnalyserCtx;
}

const analyserCache = new WeakMap<MediaStreamTrack, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>();

function getTrackAudioLevel(track: MediaStreamTrack | undefined): number {
  if (!track || track.readyState !== "live") return 0;

  let entry = analyserCache.get(track);
  if (!entry) {
    try {
      const ctx = getOrCreateSharedCtx();
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      entry = { analyser, source };
      analyserCache.set(track, entry);

      track.addEventListener("ended", () => {
        source.disconnect();
        analyserCache.delete(track);
      });
    } catch {
      return 0;
    }
  }

  const data = new Uint8Array(entry.analyser.frequencyBinCount);
  entry.analyser.getByteFrequencyData(data);

  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += (data[i]! / 255) ** 2;
  }
  return Math.sqrt(sum / data.length);
}

export function useAudioLevel(room: Room | null, mixMicStream?: MediaStream | null): AudioLevels {
  const [micLevel, setMicLevel] = useState(0);
  const [inboundLevel, setInboundLevel] = useState(0);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const rafRef = useRef<number>(0);
  const lastPollRef = useRef(0);

  useEffect(() => {
    if (!room) return;

    let running = true;

    // Single RAF loop, throttled to ~10fps (100ms) to save CPU
    const poll = (timestamp: number) => {
      if (!running) return;

      if (timestamp - lastPollRef.current >= 100) {
        lastPollRef.current = timestamp;

        // Use mix mic stream when sharing (managed mic is disabled), fall back to LiveKit track
        const mixTrack = mixMicStream?.getAudioTracks()[0];
        if (mixTrack && mixTrack.readyState === "live") {
          setMicLevel(getTrackAudioLevel(mixTrack));
        } else {
          const micPub = room.localParticipant?.getTrackPublication(Track.Source.Microphone);
          setMicLevel(micPub?.track ? getTrackAudioLevel(micPub.track.mediaStreamTrack) : 0);
        }

        let maxRemoteLevel = 0;
        let hasRemoteAudio = false;
        for (const [, participant] of room.remoteParticipants) {
          for (const [, pub] of participant.trackPublications) {
            if (pub.track && pub.track.kind === Track.Kind.Audio && pub.isSubscribed) {
              hasRemoteAudio = true;
              const level = getTrackAudioLevel(pub.track.mediaStreamTrack);
              if (level > maxRemoteLevel) maxRemoteLevel = level;
            }
          }
        }
        setInboundLevel(maxRemoteLevel);
        setIsReceivingAudio(hasRemoteAudio);
      }

      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [room]);

  return { micLevel, inboundLevel, isReceivingAudio };
}
