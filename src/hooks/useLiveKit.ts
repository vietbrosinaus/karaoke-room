"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  ConnectionState,
  type RoomOptions,
  type LocalTrackPublication,
  AudioPresets,
} from "livekit-client";

import type { MicMode } from "./useAudioDevices";
import { createEffectChain, type VoiceEffect, type EffectChain } from "~/lib/voiceEffects";

interface UseLiveKitParams {
  roomCode: string;
  playerName: string;
  isMyTurn: boolean;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  micMode: MicMode;
}

export type MicCheckState = "idle" | "recording" | "playing";

interface UseLiveKitReturn {
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  micCheckState: MicCheckState;
  startTalkingMicCheck: (noiseCancellation: boolean) => Promise<void>;
  startSingingMicCheck: (noiseCancellation: boolean) => Promise<void>;
  isSharing: boolean;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  sharingError: string | null;
  remoteParticipantCount: number;
  currentSong: string | null;
  activeSpeakers: Set<string>;
  setMixMicGain: (val: number) => void;
  setMixMusicGain: (val: number) => void;
  voiceEffect: VoiceEffect;
  setVoiceEffect: (effect: VoiceEffect) => void;
  setEffectWetDry: (wet: number) => void;
}

export function useLiveKit({
  roomCode,
  playerName,
  isMyTurn,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  micMode,
}: UseLiveKitParams): UseLiveKitReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0);
  const [currentSong, setCurrentSong] = useState<string | null>(null);

  const [micCheckState, setMicCheckState] = useState<MicCheckState>("idle");
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());

  const roomRef = useRef<Room | null>(null);
  const systemAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const micCheckAbortRef = useRef<(() => void) | null>(null);
  const isSharingInFlightRef = useRef(false); // guard against concurrent startSharing/stopSharing
  const micModeRef = useRef<MicMode>(micMode);
  micModeRef.current = micMode;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  // Ref mirrors — used in callbacks to avoid stale closures
  const isMicEnabledRef = useRef(isMicEnabled);
  isMicEnabledRef.current = isMicEnabled;
  const selectedOutputRef = useRef(selectedOutputDeviceId);
  selectedOutputRef.current = selectedOutputDeviceId;

  // Single-track mixing: when sharing, mix system audio + mic into one track
  // via Web Audio API. Both sources share the same render clock → zero drift.
  const mixCtxRef = useRef<AudioContext | null>(null);
  const mixMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixSystemSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixMicGainRef = useRef<GainNode | null>(null);
  const mixSystemGainRef = useRef<GainNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixMicStreamRef = useRef<MediaStream | null>(null); // raw mic capture
  const mixPubRef = useRef<LocalTrackPublication | null>(null);
  const effectChainRef = useRef<EffectChain | null>(null);
  const [voiceEffect, setVoiceEffectState] = useState<VoiceEffect>("none");
  const voiceEffectRef = useRef<VoiceEffect>("none");
  const effectWetDryRef = useRef(0.7); // tracks current wet/dry for singing mic check

  // --- Connect to LiveKit room ---

  useEffect(() => {
    if (!roomCode || !playerNameRef.current) return;

    let cancelled = false;

    const isRawMode = micModeRef.current === "raw";
    const room = new Room({
      audioCaptureDefaults: {
        echoCancellation: !isRawMode,
        noiseSuppression: !isRawMode,
        autoGainControl: !isRawMode,
        deviceId: selectedInputDeviceId || undefined,
        channelCount: isRawMode ? 2 : 1, // stereo for singing, mono for talking
        sampleRate: isRawMode ? 48000 : undefined,
      },
      audioOutput: {
        deviceId: selectedOutputDeviceId || undefined,
      },
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        audioPreset: isRawMode
          ? AudioPresets.musicHighQualityStereo
          : AudioPresets.music,
        dtx: !isRawMode, // DTX saves bandwidth for voice, disable for music
        red: true, // redundant encoding for packet loss resilience
      },
    });

    roomRef.current = room;

    // Remote audio: auto-attach
    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _pub: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind !== Track.Kind.Audio) return;
        const isMusic = track.source === Track.Source.ScreenShareAudio;
        console.log("[LiveKit] Subscribed to audio from", participant.identity, "source:", track.source, isMusic ? "(music)" : "(mic)");
        const el = track.attach();
        el.id = `lk-audio-${participant.identity}-${track.sid}`;
        el.dataset.lkType = isMusic ? "music" : "mic";
        el.dataset.lkIdentity = participant.identity;
        el.style.display = "none";
        el.autoplay = true;
        el.preload = "none";
        // Route to the selected output device
        if (selectedOutputRef.current && typeof el.setSinkId === "function") {
          void el.setSinkId(selectedOutputRef.current).catch(() => {});
        }
        document.body.appendChild(el);
        // Force play — may fail due to autoplay policy, but startAudio handles that
        el.play().catch(() => {
          console.log("[LiveKit] Autoplay blocked for", participant.identity, "— will resume on user click");
        });
      },
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (
        track: RemoteTrack,
        _pub: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind !== Track.Kind.Audio) return;
        console.log("[LiveKit] Unsubscribed audio from", participant.identity);
        for (const el of track.detach()) {
          el.remove();
        }
      },
    );

    // Participant count
    const updateCount = () => {
      if (cancelled) return;
      setRemoteParticipantCount(room.remoteParticipants.size);
    };
    room.on(RoomEvent.ParticipantConnected, updateCount);
    room.on(RoomEvent.ParticipantDisconnected, updateCount);

    // Active speakers — highlight who is talking
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      if (cancelled) return;
      // Include local participant if they're speaking
      const identities = new Set(speakers.map((p) => p.identity));
      if (room.localParticipant.isSpeaking) {
        identities.add(room.localParticipant.identity);
      }
      setActiveSpeakers(identities);
    });

    // Connection state — including reconnect awareness
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log("[LiveKit] Connection state:", state);
      if (cancelled) return;
      setIsConnected(state === ConnectionState.Connected);
    });

    room.on(RoomEvent.Reconnecting, () => {
      console.log("[LiveKit] Reconnecting...");
      if (!cancelled) setError("Reconnecting...");
    });

    room.on(RoomEvent.Reconnected, () => {
      console.log("[LiveKit] Reconnected!");
      if (!cancelled) {
        setIsConnected(true);
        setError(null);
        updateCount();
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log("[LiveKit] Disconnected");
      if (!cancelled) {
        setIsConnected(false);
      }
    });

    // Connect (with retry on transient errors)
    const connect = async (attempt = 0) => {
      try {
        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(playerNameRef.current)}`,
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Token error: ${res.status} ${text}`);
        }
        const data = (await res.json()) as { token: string; url?: string; keySet?: number };
        if (cancelled) return;

        // Server may return a different URL per key set (different LiveKit projects)
        const url = (data.url && data.url.startsWith("wss://")) ? data.url : process.env.NEXT_PUBLIC_LIVEKIT_URL;
        if (!url) throw new Error("NEXT_PUBLIC_LIVEKIT_URL not set");

        console.log("[LiveKit] Connecting to", url, data.keySet ? `(key set #${data.keySet})` : "");
        await room.connect(url, data.token);
        if (cancelled) return;

        console.log("[LiveKit] Connected! Local participant:", room.localParticipant.identity);
        setIsConnected(true);
        setError(null);
        updateCount();

        // Resume audio context so remote audio plays without needing mic toggle.
        // Browsers block autoplay — also retried via manual click/keydown listeners below.
        room.startAudio().catch((e) => {
          console.warn("[LiveKit] startAudio failed (will retry on user click):", e);
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Connection failed";
        console.error("[LiveKit] Error:", err);
        setError(msg);
        // Retry up to 3 times with exponential backoff
        if (attempt < 3) {
          const delay = Math.min(1000 * 2 ** attempt, 8000);
          console.log(`[LiveKit] Retrying in ${delay}ms (attempt ${attempt + 1}/3)...`);
          setTimeout(() => { if (!cancelled) void connect(attempt + 1); }, delay);
        }
      }
    };

    void connect();

    // Resume audio on user interaction (autoplay policy workaround).
    // Fires on each interaction until audio context is running, then no-ops.
    let audioResumed = false;
    const resumeAudio = () => {
      if (audioResumed) return;
      room.startAudio().then(() => {
        audioResumed = true;
        document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
          if (el.paused) el.play().catch(() => {});
        });
      }).catch(() => {});
      // Also try immediately
      document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
        if (el.paused) el.play().catch(() => {});
      });
    };
    document.addEventListener("click", resumeAudio, { once: false });
    document.addEventListener("keydown", resumeAudio, { once: false });
    document.addEventListener("touchstart", resumeAudio, { once: false });

    return () => {
      cancelled = true;
      document.removeEventListener("click", resumeAudio);
      document.removeEventListener("keydown", resumeAudio);
      document.removeEventListener("touchstart", resumeAudio);
      // Abort any in-progress mic check
      micCheckAbortRef.current?.();
      micCheckAbortRef.current = null;
      if (systemAudioTrackRef.current) {
        systemAudioTrackRef.current.stop();
        systemAudioTrackRef.current = null;
      }
      // Clean up mix context if active
      if (mixPubRef.current?.track) {
        void room.localParticipant?.unpublishTrack(mixPubRef.current.track);
      }
      mixPubRef.current = null;
      mixMicSourceRef.current?.disconnect();
      mixSystemSourceRef.current?.disconnect();
      mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
      mixMicStreamRef.current = null;
      if (mixCtxRef.current?.state !== "closed") {
        void mixCtxRef.current?.close();
      }
      mixCtxRef.current = null;
      mixMicSourceRef.current = null;
      mixSystemSourceRef.current = null;
      mixMicGainRef.current = null;
      mixSystemGainRef.current = null;
      mixDestRef.current = null;
      // Remove all remote audio elements to prevent duplicates on reconnect
      document.querySelectorAll('audio[id^="lk-audio-"]').forEach((el) => el.remove());
      room.disconnect();
      roomRef.current = null;
      setIsConnected(false);
      setIsMicEnabled(false);
      setIsSharing(false);
    };
    // playerName uses a ref — name changes only go through PartyKit, not LiveKit.
    // micMode is NOT included — handled by a separate effect that republishes the mic track.
    // selectedInputDeviceId/selectedOutputDeviceId are NOT included — handled by separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // --- Switch input device without reconnecting ---

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected || !selectedInputDeviceId) return;

    console.log("[LiveKit] Switching mic input to device:", selectedInputDeviceId);

    // If mix is active, re-capture the mic from the new device
    if (mixPubRef.current && mixMicStreamRef.current) {
      void (async () => {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: selectedInputDeviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
              sampleRate: 48000,
            },
          });

          mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
          mixMicStreamRef.current = newStream;

          mixMicSourceRef.current?.disconnect();
          const ctx = mixCtxRef.current;
          const gain = mixMicGainRef.current;
          if (ctx && gain) {
            const newSource = ctx.createMediaStreamSource(newStream);
            newSource.connect(gain);
            mixMicSourceRef.current = newSource;
            console.log("[LiveKit] Mix mic switched to new input device");
          }
        } catch (err) {
          console.error("[LiveKit] Error switching mix input device:", err);
        }
      })();
    } else {
      // Normal path: let LiveKit handle it
      void room.switchActiveDevice("audioinput", selectedInputDeviceId).catch((err) => {
        console.error("[LiveKit] Error switching input device:", err);
      });
    }
  }, [selectedInputDeviceId, isConnected]);

  // --- Switch mic mode without reconnecting ---
  // Republish the mic track with new audio processing constraints.

  const prevMicModeRef = useRef<MicMode>(micMode);
  useEffect(() => {
    if (prevMicModeRef.current === micMode) return;

    const room = roomRef.current;
    // Skip if mix is active — mix already uses raw mode
    if (!room || !isConnected || !isMicEnabled || mixPubRef.current) {
      // Still update ref so we don't re-fire when the guard clears
      prevMicModeRef.current = micMode;
      return;
    }

    // Update ref only after passing the guard, so a skipped switch
    // retries when isMicEnabled becomes true again
    prevMicModeRef.current = micMode;

    const isRaw = micMode === "raw";
    console.log("[LiveKit] Switching mic mode to:", micMode);

    // Unpublish current mic, then re-enable with new constraints
    void (async () => {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
        room.options.audioCaptureDefaults = {
          ...room.options.audioCaptureDefaults,
          echoCancellation: !isRaw,
          noiseSuppression: !isRaw,
          autoGainControl: !isRaw,
          channelCount: isRaw ? 2 : 1,
          sampleRate: isRaw ? 48000 : undefined,
        };
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log("[LiveKit] Mic mode switched to", micMode);
      } catch (err) {
        console.error("[LiveKit] Error switching mic mode:", err);
      }
    })();
  }, [micMode, isConnected, isMicEnabled]);

  // --- Switch output device without reconnecting ---

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected || !selectedOutputDeviceId) return;

    // Only switch output if the browser supports it (setSinkId / speaker-selection)
    const supportsOutput = typeof HTMLAudioElement.prototype.setSinkId === "function";
    if (!supportsOutput) {
      console.log("[LiveKit] Browser does not support audio output selection — skipping");
      return;
    }

    console.log("[LiveKit] Switching audio output to device:", selectedOutputDeviceId);
    void room.switchActiveDevice("audiooutput", selectedOutputDeviceId).catch(() => {
      // Silently ignore — some browsers don't support this
    });

    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      void el.setSinkId(selectedOutputDeviceId).catch(() => {});
    });
  }, [selectedOutputDeviceId, isConnected]);

  // --- Mic check (record-and-playback) ---
  // Records 5 seconds of mic audio, then plays it back so you can hear
  // exactly how you sound to other participants. No stuttering issues
  // since playback is from a finished recording, not a live loopback.

  // Helper: record from a MediaStreamTrack for 5s and play back
  const recordAndPlayback = useCallback((track: MediaStreamTrack, label: string) => {
    let cancelled = false;
    setMicCheckState("recording");
    console.log(`[LiveKit] ${label}: recording 5s...`);

    const recorder = new MediaRecorder(new MediaStream([track]), {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm",
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.onstop = () => {
      // Stop the captured stream (we own it)
      track.stop();
      if (cancelled) { setMicCheckState("idle"); return; }

      const blob = new Blob(chunks, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      if (selectedOutputRef.current && typeof audio.setSinkId === "function") {
        void (audio as HTMLAudioElement).setSinkId(selectedOutputRef.current).catch(() => {});
      }

      setMicCheckState("playing");
      console.log(`[LiveKit] ${label}: playing back...`);

      audio.onended = () => { URL.revokeObjectURL(url); setMicCheckState("idle"); };
      audio.onerror = () => { URL.revokeObjectURL(url); setMicCheckState("idle"); };
      void audio.play().catch(() => setMicCheckState("idle"));
    };

    recorder.start();
    const timer = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5000);

    micCheckAbortRef.current = () => {
      cancelled = true;
      clearTimeout(timer);
      track.stop();
      if (recorder.state === "recording") { try { recorder.stop(); } catch { /* */ } }
      setMicCheckState("idle");
    };
  }, []);

  // Guard against concurrent mic checks (async race)
  const micCheckInFlightRef = useRef(false);

  // Talking Mic Check: captures a FRESH mic with talking constraints, records YOUR voice only
  const startTalkingMicCheck = useCallback(async (noiseCancellation: boolean) => {
    if (micCheckState !== "idle" || micCheckInFlightRef.current) return;
    micCheckInFlightRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
          echoCancellation: noiseCancellation,
          noiseSuppression: noiseCancellation,
          autoGainControl: noiseCancellation,
          channelCount: 1,
        },
      });
      const track = stream.getAudioTracks()[0];
      if (!track) { micCheckInFlightRef.current = false; setMicCheckState("idle"); return; }
      recordAndPlayback(track, "Talking mic check");
      // micCheckInFlightRef resets when recording starts (state changes from idle)
      micCheckInFlightRef.current = false;
    } catch (err) {
      console.error("[LiveKit] Talking mic check error:", err);
      micCheckInFlightRef.current = false;
      setMicCheckState("idle");
    }
  }, [micCheckState, selectedInputDeviceId, recordAndPlayback]);

  // Singing Mic Check: captures FRESH mic → routes through voice effect chain → records effected output
  const startSingingMicCheck = useCallback(async (noiseCancellation: boolean) => {
    if (micCheckState !== "idle" || micCheckInFlightRef.current) return;
    micCheckInFlightRef.current = true;
    try {
      // 1. Capture raw mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
          echoCancellation: noiseCancellation,
          noiseSuppression: noiseCancellation,
          autoGainControl: noiseCancellation,
          channelCount: 2,
          sampleRate: 48000,
        },
      });
      const rawTrack = stream.getAudioTracks()[0];
      if (!rawTrack) { setMicCheckState("idle"); return; }

      // 2. Route through effect chain in a temporary AudioContext
      const ctx = new AudioContext({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);
      const chain = createEffectChain(ctx, voiceEffectRef.current);
      const dest = ctx.createMediaStreamDestination();

      source.connect(chain.input);
      chain.output.connect(dest);

      // Apply current wet/dry to match the live effect setting
      chain.setWetDry?.(effectWetDryRef.current);

      const effectedTrack = dest.stream.getAudioTracks()[0];
      if (!effectedTrack) { ctx.close(); rawTrack.stop(); setMicCheckState("idle"); return; }

      // 3. Record the effected output
      console.log("[LiveKit] Singing mic check: recording with effect:", voiceEffectRef.current);

      let cancelled = false;
      setMicCheckState("recording");

      const recorder = new MediaRecorder(dest.stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm",
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = () => {
        // Clean up everything
        source.disconnect();
        chain.cleanup();
        rawTrack.stop();
        void ctx.close();

        if (cancelled) { setMicCheckState("idle"); return; }

        const blob = new Blob(chunks, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        if (selectedOutputRef.current && typeof audio.setSinkId === "function") {
          void (audio as HTMLAudioElement).setSinkId(selectedOutputRef.current).catch(() => {});
        }

        setMicCheckState("playing");
        console.log("[LiveKit] Singing mic check: playing back with effect...");

        audio.onended = () => { URL.revokeObjectURL(url); setMicCheckState("idle"); };
        audio.onerror = () => { URL.revokeObjectURL(url); setMicCheckState("idle"); };
        void audio.play().catch(() => setMicCheckState("idle"));
      };

      recorder.start();
      const timer = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5000);

      micCheckAbortRef.current = () => {
        cancelled = true;
        clearTimeout(timer);
        source.disconnect();
        chain.cleanup();
        rawTrack.stop();
        void ctx.close();
        if (recorder.state === "recording") { try { recorder.stop(); } catch { /* */ } }
        setMicCheckState("idle");
      };
    } catch (err) {
      console.error("[LiveKit] Singing mic check error:", err);
      micCheckInFlightRef.current = false;
      setMicCheckState("idle");
    }
  }, [micCheckState, selectedInputDeviceId]);

  // --- Microphone ---

  const isTogglingMicRef = useRef(false);
  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !room.localParticipant || isTogglingMicRef.current) return;

    isTogglingMicRef.current = true;
    try {
      const newState = !isMicEnabledRef.current;
      console.log("[LiveKit] Setting mic enabled:", newState);
      await room.localParticipant.setMicrophoneEnabled(newState);
      setIsMicEnabled(newState);
      console.log("[LiveKit] Mic is now", newState ? "ON" : "OFF");
    } catch (err) {
      console.error("[LiveKit] Mic error:", err);
      setError(err instanceof Error ? err.message : "Mic failed");
    } finally {
      isTogglingMicRef.current = false;
    }
  }, []);

  // --- System audio sharing (single-track mixing) ---
  // Mixes system audio + mic into ONE track via Web Audio API.
  // Both sources share the same AudioContext render clock → zero drift/latency.
  // Also bypasses Chrome's system-level echo cancellation (Chromium #40226380).

  const cleanupMix = useCallback(() => {
    effectChainRef.current?.cleanup();
    effectChainRef.current = null;
    mixMicSourceRef.current?.disconnect();
    mixSystemSourceRef.current?.disconnect();
    mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
    mixMicStreamRef.current = null;
    mixMicSourceRef.current = null;
    mixSystemSourceRef.current = null;
    mixMicGainRef.current = null;
    mixSystemGainRef.current = null;
    mixDestRef.current = null;
    if (mixCtxRef.current?.state !== "closed") {
      void mixCtxRef.current?.close();
    }
    mixCtxRef.current = null;
  }, []);

  // Expose gain controls for the singer to adjust mix balance
  const setMixMicGain = useCallback((val: number) => {
    if (mixMicGainRef.current) mixMicGainRef.current.gain.value = val;
  }, []);
  const setMixMusicGain = useCallback((val: number) => {
    if (mixSystemGainRef.current) mixSystemGainRef.current.gain.value = val;
  }, []);

  // Swap voice effect live during sharing
  const setVoiceEffect = useCallback((effect: VoiceEffect) => {
    setVoiceEffectState(effect);
    voiceEffectRef.current = effect;
    const ctx = mixCtxRef.current;
    const micSource = mixMicSourceRef.current;
    const micGain = mixMicGainRef.current;
    if (!ctx || !micSource || !micGain) return; // not sharing, will apply on next share

    // Tear down old chain
    effectChainRef.current?.cleanup();
    micSource.disconnect();

    // Create new chain
    const chain = createEffectChain(ctx, effect);
    micSource.connect(chain.input);
    chain.output.connect(micGain);
    effectChainRef.current = chain;

    console.log("[LiveKit] Voice effect switched to:", effect);
  }, []);

  const setEffectWetDry = useCallback((wet: number) => {
    effectWetDryRef.current = wet;
    effectChainRef.current?.setWetDry?.(wet);
  }, []);

  const startSharing = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !room.localParticipant || isSharingInFlightRef.current) {
      if (!room) setSharingError("Not connected");
      return;
    }

    isSharingInFlightRef.current = true;
    try {
      // 1. Capture system audio
      console.log("[LiveKit] Capturing system audio...");
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1, frameRate: 1 },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      for (const vt of displayStream.getVideoTracks()) vt.stop();

      const systemTrack = displayStream.getAudioTracks()[0];
      if (!systemTrack) {
        displayStream.getTracks().forEach((t) => t.stop());
        setSharingError("No audio captured. Check 'Share audio' in the dialog.");
        isSharingInFlightRef.current = false;
        return;
      }

      // Store system track ref immediately so it's cleaned up on any failure
      systemAudioTrackRef.current = systemTrack;

      // Detect song name from tab title
      const trackLabel = systemTrack.label;
      console.log("[LiveKit] System audio track label:", trackLabel);
      const GENERIC_LABELS = new Set(["tab audio", "screen audio", "system audio", "audio", ""]);
      let detectedSong: string | null = null;
      if (trackLabel && !GENERIC_LABELS.has(trackLabel.toLowerCase())) {
        let songName = trackLabel;
        if (songName.startsWith("Tab: ")) songName = songName.slice(5);
        if (songName.endsWith(" - YouTube")) songName = songName.slice(0, -10);
        if (songName.endsWith(" - Spotify")) songName = songName.slice(0, -10);
        if (songName.trim()) detectedSong = songName.trim();
      }
      setCurrentSong(detectedSong);

      // 2. Capture raw mic (no browser processing — AudioContext mixing bypasses
      //    Chrome's system-level echo cancellation, Chromium bug #40226380)
      let micStream: MediaStream | null = null;
      if (isMicEnabledRef.current) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
              sampleRate: 48000,
            },
          });
        } catch (err) {
          console.warn("[LiveKit] Mic capture failed — sharing music only:", err);
        }
      }

      // 3. Mix into a single AudioContext destination (low-latency for send path)
      const ctx = new AudioContext({ sampleRate: 48000 });
      const dest = ctx.createMediaStreamDestination();

      const systemSource = ctx.createMediaStreamSource(new MediaStream([systemTrack]));
      const systemGain = ctx.createGain();
      systemGain.gain.value = 1.0;
      systemSource.connect(systemGain);
      systemGain.connect(dest);

      mixCtxRef.current = ctx;
      mixSystemSourceRef.current = systemSource;
      mixSystemGainRef.current = systemGain;
      mixDestRef.current = dest;

      if (micStream) {
        const micSource = ctx.createMediaStreamSource(micStream);
        const micGain = ctx.createGain();
        micGain.gain.value = 1.0;

        // Insert voice effect chain: source → effect → gain → dest
        const chain = createEffectChain(ctx, voiceEffectRef.current);
        micSource.connect(chain.input);
        chain.output.connect(micGain);
        micGain.connect(dest);

        mixMicSourceRef.current = micSource;
        mixMicGainRef.current = micGain;
        mixMicStreamRef.current = micStream;
        effectChainRef.current = chain;
      }

      // 4. Mute LiveKit's managed mic to avoid duplicate voice
      if (isMicEnabledRef.current) {
        await room.localParticipant.setMicrophoneEnabled(false);
      }

      // 5. Publish the single mixed track
      const mixedTrack = dest.stream.getAudioTracks()[0];
      if (!mixedTrack) throw new Error("No mixed audio track");

      console.log("[LiveKit] Publishing mixed track (music + voice)...");
      const pub = await room.localParticipant.publishTrack(mixedTrack, {
        source: Track.Source.ScreenShareAudio,
        name: "karaoke-mix",
        audioPreset: AudioPresets.musicHighQuality,
        dtx: false,
        red: false,
      });

      console.log("[LiveKit] Mixed track published!", pub.trackSid);

      mixPubRef.current = pub;
      setIsSharing(true);
      setSharingError(null);

      // When the user stops screen sharing from browser chrome
      // Use refs in the handler to avoid stale closure issues
      systemTrack.onended = () => {
        console.log("[LiveKit] System audio ended by user");
        // Inline cleanup instead of calling stopSharing to avoid stale closure
        if (mixPubRef.current?.track && roomRef.current?.localParticipant) {
          void roomRef.current.localParticipant.unpublishTrack(mixPubRef.current.track);
        }
        mixPubRef.current = null;
        if (systemAudioTrackRef.current) {
          systemAudioTrackRef.current.stop();
          systemAudioTrackRef.current = null;
        }
        cleanupMix();
        setIsSharing(false);
        setCurrentSong(null);
        // Restore managed mic
        if (roomRef.current && isMicEnabledRef.current) {
          void roomRef.current.localParticipant.setMicrophoneEnabled(true).catch(() => {});
        }
      };
    } catch (err) {
      // Stop system track if it was captured
      if (systemAudioTrackRef.current) {
        systemAudioTrackRef.current.stop();
        systemAudioTrackRef.current = null;
      }
      cleanupMix();
      // Restore managed mic
      try {
        if (isMicEnabledRef.current && roomRef.current) {
          await roomRef.current.localParticipant.setMicrophoneEnabled(true);
        }
      } catch { /* best effort */ }

      if (err instanceof Error && err.name === "NotAllowedError") {
        setSharingError(null);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to share audio";
        console.error("[LiveKit] Share error:", err);
        setSharingError(msg);
      }
    } finally {
      isSharingInFlightRef.current = false;
    }
  }, [selectedInputDeviceId, cleanupMix]);

  const stopSharing = useCallback(() => {
    const room = roomRef.current;

    console.log("[LiveKit] Stopping sharing");

    // Unpublish mixed track
    if (mixPubRef.current?.track && room?.localParticipant) {
      void room.localParticipant.unpublishTrack(mixPubRef.current.track);
    }
    mixPubRef.current = null;

    // Stop system audio
    if (systemAudioTrackRef.current) {
      systemAudioTrackRef.current.stop();
      systemAudioTrackRef.current = null;
    }

    // Clean up mix context
    cleanupMix();

    setIsSharing(false);
    setSharingError(null);
    setCurrentSong(null);

    // Restore managed mic
    if (room && isMicEnabledRef.current) {
      void room.localParticipant.setMicrophoneEnabled(true).catch((err) => {
        console.error("[LiveKit] Error restoring managed mic:", err);
      });
    }
  }, [cleanupMix]);

  // Auto-stop sharing when not my turn
  useEffect(() => {
    if (!isMyTurn && isSharing) {
      console.log("[LiveKit] Not my turn — stopping share");
      stopSharing();
    }
  }, [isMyTurn, isSharing, stopSharing]);

  return {
    room: roomRef.current,
    isConnected,
    error,
    isMicEnabled,
    toggleMic,
    micCheckState,
    startTalkingMicCheck,
    startSingingMicCheck,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    remoteParticipantCount,
    currentSong,
    activeSpeakers,
    setMixMicGain,
    setMixMusicGain,
    voiceEffect,
    setVoiceEffect,
    setEffectWetDry,
  };
}
