"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";

interface AudioLevels {
  micLevel: number; // 0-1, local mic volume
  inboundLevel: number; // 0-1, loudest remote audio
  isReceivingAudio: boolean; // are we getting any remote audio
}

export function useAudioLevel(room: Room | null): AudioLevels {
  const [micLevel, setMicLevel] = useState(0);
  const [inboundLevel, setInboundLevel] = useState(0);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!room) return;

    let running = true;

    const poll = () => {
      if (!running) return;

      // Local mic level
      const micPub = room.localParticipant?.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track) {
        const track = micPub.track;
        // LiveKit tracks expose audioLevel via the underlying mediaStreamTrack
        // Use the WebAudio API to get the level
        setMicLevel(getTrackAudioLevel(track.mediaStreamTrack));
      } else {
        setMicLevel(0);
      }

      // Remote audio levels
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

      rafRef.current = requestAnimationFrame(poll);
    };

    // Use a slower polling interval to save CPU
    const interval = setInterval(() => {
      rafRef.current = requestAnimationFrame(poll);
    }, 100);

    return () => {
      running = false;
      clearInterval(interval);
      cancelAnimationFrame(rafRef.current);
    };
  }, [room]);

  return { micLevel, inboundLevel, isReceivingAudio };
}

// Audio level cache to avoid creating too many AnalyserNodes
const analyserCache = new WeakMap<MediaStreamTrack, { analyser: AnalyserNode; ctx: AudioContext }>();

function getTrackAudioLevel(track: MediaStreamTrack | undefined): number {
  if (!track || track.readyState !== "live") return 0;

  let entry = analyserCache.get(track);
  if (!entry) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      entry = { analyser, ctx };
      analyserCache.set(track, entry);

      // Clean up when track ends
      track.addEventListener("ended", () => {
        ctx.close().catch(() => {});
        analyserCache.delete(track);
      });
    } catch {
      return 0;
    }
  }

  const data = new Uint8Array(entry.analyser.frequencyBinCount);
  entry.analyser.getByteFrequencyData(data);

  // RMS of frequency data, normalized to 0-1
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += (data[i]! / 255) ** 2;
  }
  return Math.sqrt(sum / data.length);
}
