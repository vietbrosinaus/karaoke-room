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
  talkingNC: boolean;  // noise cancellation for talking mode
  singingNC: boolean;  // noise cancellation for singing mode
}

export type MicCheckState = "idle" | "monitoring-talk" | "monitoring-sing" | "error";
export type RecordingState = "idle" | "recording" | "stopped";

interface UseLiveKitReturn {
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  micCheckState: MicCheckState;
  startTalkingMicCheck: (noiseCancellation: boolean) => Promise<void>;
  startSingingMicCheck: (noiseCancellation: boolean) => Promise<void>;
  stopMicCheck: () => void;
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
  // Mix mic stream (for status bar level meter during sharing)
  mixMicStream: MediaStream | null;
  // Auto-mix (sidechain ducking)
  autoMix: boolean;
  setAutoMix: (on: boolean) => void;
  // Recording
  recordingState: RecordingState;
  recordingDuration: number;
  recordingBlob: Blob | null;
  startRecording: () => void;
  stopRecording: () => void;
  clearRecording: () => void;
}

export function useLiveKit({
  roomCode,
  playerName,
  isMyTurn,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  micMode,
  talkingNC,
  singingNC,
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
  // Mic check Web Audio refs — stored so effects can hot-swap NC/effect during monitoring
  const micCheckCtxRef = useRef<AudioContext | null>(null);
  const micCheckSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micCheckGainRef = useRef<GainNode | null>(null);
  const micCheckStreamRef = useRef<MediaStream | null>(null);
  const micCheckEffectChainRef = useRef<EffectChain | null>(null);
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
  const talkingNCRef = useRef(talkingNC);
  talkingNCRef.current = talkingNC;
  const singingNCRef = useRef(singingNC);
  singingNCRef.current = singingNC;

  // Single-track mixing: when sharing, mix system audio + mic into one track
  // via Web Audio API. Both sources share the same render clock → zero drift.
  const mixCtxRef = useRef<AudioContext | null>(null);
  const mixMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixSystemSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixMicGainRef = useRef<GainNode | null>(null);
  const mixSystemGainRef = useRef<GainNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixMicStreamRef = useRef<MediaStream | null>(null); // raw mic capture
  const [mixMicStreamState, setMixMicStreamState] = useState<MediaStream | null>(null);
  // Helper: set both ref and state for mixMicStream
  const setMixMicStream = useCallback((stream: MediaStream | null) => {
    mixMicStreamRef.current = stream;
    setMixMicStreamState(stream);
  }, []);
  const mixPubRef = useRef<LocalTrackPublication | null>(null);
  const effectChainRef = useRef<EffectChain | null>(null);
  const [voiceEffect, setVoiceEffectState] = useState<VoiceEffect>("none");
  const voiceEffectRef = useRef<VoiceEffect>("none");
  const effectWetDryRef = useRef(0.7); // tracks current wet/dry for singing mic check

  // Recording: passive tap on mixDest stream
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);

  // --- Connect to LiveKit room ---

  useEffect(() => {
    if (!roomCode || !playerNameRef.current) return;

    let cancelled = false;

    const isRawMode = micModeRef.current === "raw";
    // NC setting depends on the current mode
    const ncEnabled = isRawMode ? singingNCRef.current : talkingNCRef.current;
    const room = new Room({
      audioCaptureDefaults: {
        echoCancellation: ncEnabled,
        noiseSuppression: ncEnabled,
        autoGainControl: ncEnabled,
        deviceId: selectedInputDeviceId || undefined,
        channelCount: isRawMode ? 2 : 1,
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
        setError("Disconnected - the room may have hit its session limit. Ask others to create a new room, or create one yourself.");
      }
    });

    // Connect (with retry on transient errors + key failover)
    const connect = async (attempt = 0, useNextKey = false) => {
      try {
        const keyHint = useNextKey ? "&keyHint=next" : "";
        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(playerNameRef.current)}${keyHint}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string; reason?: string } | null;
          if (res.status === 429) {
            throw new Error(body?.error ?? "This room has hit its session limit. Ask people in the room to create a new one, or create your own.");
          }
          throw new Error(body?.error ?? "Failed to get token. Please try again.");
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

        // On connect failure, retry with a different key set first, then exponential backoff
        if (attempt < 3) {
          const tryNextKey = attempt === 0; // first retry uses next key set
          const delay = Math.min(1000 * 2 ** attempt, 8000);
          console.log(`[LiveKit] Retrying in ${delay}ms (attempt ${attempt + 1}/3)${tryNextKey ? " with next key" : ""}...`);
          setTimeout(() => { if (!cancelled) void connect(attempt + 1, tryNextKey); }, delay);
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
      // Abort any in-progress mic check and restore remote audio
      micCheckAbortRef.current?.();
      micCheckAbortRef.current = null;
      if (micErrorTimerRef.current) { clearTimeout(micErrorTimerRef.current); micErrorTimerRef.current = null; }
      document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
        const saved = el.dataset.savedVolume;
        if (saved !== undefined) { el.volume = parseFloat(saved); delete el.dataset.savedVolume; }
      });
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
      mixMicStreamRef.current = null; setMixMicStreamState(null);
      if (mixCtxRef.current?.state !== "closed") {
        void mixCtxRef.current?.close();
      }
      mixCtxRef.current = null;
      mixMicSourceRef.current = null;
      mixSystemSourceRef.current = null;
      mixMicGainRef.current = null;
      mixSystemGainRef.current = null;
      mixDestRef.current = null;
      // Stop auto-mix timer + analyser (prevent orphaned setInterval)
      if (autoMixTimerRef.current) { clearInterval(autoMixTimerRef.current); autoMixTimerRef.current = null; }
      autoMixAnalyserRef.current?.disconnect();
      autoMixAnalyserRef.current = null;
      autoMixRef.current = false;
      // Stop active recording timer (blob is lost on unmount anyway)
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
      recorderRef.current = null;
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
          const nc = singingNCRef.current;
          const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: selectedInputDeviceId },
              echoCancellation: nc,
              noiseSuppression: nc,
              autoGainControl: nc,
              channelCount: 2,
              sampleRate: 48000,
            },
          });

          mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
          mixMicStreamRef.current = newStream; setMixMicStreamState(newStream);

          mixMicSourceRef.current?.disconnect();
          const ctx = mixCtxRef.current;
          const chain = effectChainRef.current;
          const gain = mixMicGainRef.current;
          if (ctx) {
            const newSource = ctx.createMediaStreamSource(newStream);
            // Route through effect chain if present, otherwise direct to gain
            if (chain) {
              newSource.connect(chain.input);
            } else if (gain) {
              newSource.connect(gain);
            }
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
        // Use NC toggle for the target mode
        const nc = isRaw ? singingNCRef.current : talkingNCRef.current;
        room.options.audioCaptureDefaults = {
          ...room.options.audioCaptureDefaults,
          echoCancellation: nc,
          noiseSuppression: nc,
          autoGainControl: nc,
          channelCount: isRaw ? 2 : 1,
          sampleRate: isRaw ? 48000 : undefined,
        };
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log("[LiveKit] Mic mode switched to", micMode);
      } catch (err) {
        console.error("[LiveKit] Error switching mic mode:", err);
      }
    })();
  }, [micMode, isConnected, isMicEnabled, talkingNC, singingNC]);

  // --- Hot-swap NC during sharing ---
  // When NC toggle changes while sharing, re-capture mic with new constraints
  const prevSingingNCRef = useRef(singingNC);
  useEffect(() => {
    if (prevSingingNCRef.current === singingNC) return;
    prevSingingNCRef.current = singingNC;

    // Only hot-swap if we're actively sharing with a mic in the mix
    if (!mixPubRef.current || !mixMicStreamRef.current || !mixCtxRef.current) return;

    console.log("[LiveKit] Hot-swapping NC during sharing:", singingNC ? "ON" : "OFF");
    void (async () => {
      try {
        const nc = singingNC;
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
            echoCancellation: nc,
            noiseSuppression: nc,
            autoGainControl: nc,
            channelCount: 2,
            sampleRate: 48000,
          },
        });

        // Stop old mic stream
        mixMicStreamRef.current?.getTracks().forEach((t) => t.stop());
        mixMicStreamRef.current = newStream; setMixMicStreamState(newStream);

        // Reconnect in the Web Audio graph
        mixMicSourceRef.current?.disconnect();
        const ctx = mixCtxRef.current;
        const chain = effectChainRef.current;
        if (ctx && chain) {
          const newSource = ctx.createMediaStreamSource(newStream);
          newSource.connect(chain.input);
          mixMicSourceRef.current = newSource;
          console.log("[LiveKit] Mix mic re-captured with NC:", nc ? "ON" : "OFF");
        }
      } catch (err) {
        console.error("[LiveKit] Error hot-swapping NC:", err);
      }
    })();
  }, [singingNC, selectedInputDeviceId]);

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

    // Also route mic check AudioContext to new output if active
    if (micCheckCtxRef.current && "setSinkId" in micCheckCtxRef.current) {
      void (micCheckCtxRef.current as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedOutputDeviceId).catch(() => {});
    }
  }, [selectedOutputDeviceId, isConnected]);

  // --- Real-time mic check (live loopback) ---
  // Routes mic audio through Web Audio API directly to speakers so you hear
  // yourself in real-time. Mutes all remote audio during monitoring to avoid
  // confusion. Toggle on/off — no record-and-playback delay.

  const micCheckInFlightRef = useRef(false);

  // Safety: if mic check state gets stuck (e.g., getUserMedia hangs), force reset after 30s
  useEffect(() => {
    if (micCheckState === "idle" || micCheckState === "error") return;
    const safety = setTimeout(() => {
      console.warn("[LiveKit] Mic check state stuck at", micCheckState, "— force resetting");
      micCheckAbortRef.current?.();
      micCheckAbortRef.current = null;
      micCheckInFlightRef.current = false;
      setMicCheckState("idle");
      // Restore remote audio in case it was muted
      document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
        const saved = el.dataset.savedVolume;
        if (saved !== undefined) { el.volume = parseFloat(saved); delete el.dataset.savedVolume; }
      });
    }, 30000);
    return () => clearTimeout(safety);
  }, [micCheckState]);

  // Mute/restore remote audio elements during mic check
  const muteRemoteAudio = useCallback(() => {
    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      el.dataset.savedVolume = String(el.volume);
      el.volume = 0;
    });
  }, []);

  const restoreRemoteAudio = useCallback(() => {
    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      const saved = el.dataset.savedVolume;
      if (saved !== undefined) {
        el.volume = parseFloat(saved);
        delete el.dataset.savedVolume;
      }
    });
  }, []);

  // Stop any active mic check monitoring
  const stopMicCheck = useCallback(() => {
    micCheckAbortRef.current?.();
    micCheckAbortRef.current = null;
    restoreRemoteAudio();
    setMicCheckState("idle");
  }, [restoreRemoteAudio]);

  // Talking Mic Check: live loopback with talking NC constraints
  const startTalkingMicCheck = useCallback(async (noiseCancellation: boolean) => {
    // If already monitoring, stop it (toggle behavior)
    if (micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing") {
      stopMicCheck();
      return;
    }
    if (micCheckState !== "idle" && micCheckState !== "error") return;
    if (micCheckInFlightRef.current) return;
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
      if (!track) { micCheckInFlightRef.current = false; return; }

      // Route mic → speakers via AudioContext
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);

      // Route to selected output device if supported (setSinkId is not in TS types yet)
      if (selectedOutputRef.current && "setSinkId" in ctx) {
        void (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedOutputRef.current).catch(() => {});
      }

      // Store refs for hot-swap effects
      micCheckCtxRef.current = ctx;
      micCheckSourceRef.current = source;
      micCheckGainRef.current = gain;
      micCheckStreamRef.current = stream;
      micCheckEffectChainRef.current = null; // talking has no effect chain

      muteRemoteAudio();
      setMicCheckState("monitoring-talk");
      console.log("[LiveKit] Talking mic check: live monitoring started");

      micCheckAbortRef.current = () => {
        source.disconnect();
        gain.disconnect();
        track.stop();
        if (ctx.state !== "closed") void ctx.close();
        micCheckCtxRef.current = null;
        micCheckSourceRef.current = null;
        micCheckGainRef.current = null;
        micCheckStreamRef.current = null;
        micCheckEffectChainRef.current = null;
      };
      micCheckInFlightRef.current = false;
    } catch (err) {
      console.error("[LiveKit] Talking mic check error:", err);
      micCheckInFlightRef.current = false;
      setMicCheckState("error");
      setTimeout(() => setMicCheckState("idle"), 2000);
    }
  }, [micCheckState, selectedInputDeviceId, muteRemoteAudio, stopMicCheck]);

  // Singing Mic Check: live loopback through voice effect chain
  const startSingingMicCheck = useCallback(async (noiseCancellation: boolean) => {
    // If already monitoring, stop it (toggle behavior)
    if (micCheckState === "monitoring-talk" || micCheckState === "monitoring-sing") {
      stopMicCheck();
      return;
    }
    if (micCheckState !== "idle" && micCheckState !== "error") return;
    if (micCheckInFlightRef.current) return;
    micCheckInFlightRef.current = true;

    try {
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
      if (!rawTrack) { micCheckInFlightRef.current = false; return; }

      // Route mic → effect chain → speakers
      const ctx = new AudioContext({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(stream);
      const chain = createEffectChain(ctx, voiceEffectRef.current);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;

      source.connect(chain.input);
      chain.output.connect(gain);
      gain.connect(ctx.destination);

      // Apply current wet/dry
      chain.setWetDry?.(effectWetDryRef.current);

      // Route to selected output device if supported (setSinkId is not in TS types yet)
      if (selectedOutputRef.current && "setSinkId" in ctx) {
        void (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedOutputRef.current).catch(() => {});
      }

      // Store refs for hot-swap effects
      micCheckCtxRef.current = ctx;
      micCheckSourceRef.current = source;
      micCheckGainRef.current = gain;
      micCheckStreamRef.current = stream;
      micCheckEffectChainRef.current = chain;

      muteRemoteAudio();
      setMicCheckState("monitoring-sing");
      console.log("[LiveKit] Singing mic check: live monitoring with effect:", voiceEffectRef.current);

      micCheckAbortRef.current = () => {
        source.disconnect();
        chain.cleanup();
        gain.disconnect();
        rawTrack.stop();
        if (ctx.state !== "closed") void ctx.close();
        micCheckCtxRef.current = null;
        micCheckSourceRef.current = null;
        micCheckGainRef.current = null;
        micCheckStreamRef.current = null;
        micCheckEffectChainRef.current = null;
      };
      micCheckInFlightRef.current = false;
    } catch (err) {
      console.error("[LiveKit] Singing mic check error:", err);
      micCheckInFlightRef.current = false;
      setMicCheckState("error");
      setTimeout(() => setMicCheckState("idle"), 2000);
    }
  }, [micCheckState, selectedInputDeviceId, muteRemoteAudio, stopMicCheck]);

  // --- Hot-swap NC during talking mic check ---
  // When talkingNC changes while monitoring-talk, re-capture mic with new constraints
  useEffect(() => {
    if (micCheckState !== "monitoring-talk") return;
    const ctx = micCheckCtxRef.current;
    const oldSource = micCheckSourceRef.current;
    const gain = micCheckGainRef.current;
    if (!ctx || !oldSource || !gain) return;

    console.log("[LiveKit] Hot-swapping talking NC during mic check:", talkingNC ? "ON" : "OFF");
    void (async () => {
      try {
        const nc = talkingNC;
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
            echoCancellation: nc,
            noiseSuppression: nc,
            autoGainControl: nc,
            channelCount: 1,
          },
        });

        // Stop old mic stream
        micCheckStreamRef.current?.getTracks().forEach((t) => t.stop());
        micCheckStreamRef.current = newStream;

        // Reconnect in the Web Audio graph
        oldSource.disconnect();
        const newSource = ctx.createMediaStreamSource(newStream);
        newSource.connect(gain);
        micCheckSourceRef.current = newSource;

        console.log("[LiveKit] Talking mic check re-captured with NC:", nc ? "ON" : "OFF");
      } catch (err) {
        console.error("[LiveKit] Error hot-swapping talking NC:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talkingNC]);

  // --- Hot-swap NC during singing mic check ---
  // When singingNC changes while monitoring-sing, re-capture mic with new constraints
  useEffect(() => {
    if (micCheckState !== "monitoring-sing") return;
    const ctx = micCheckCtxRef.current;
    const oldSource = micCheckSourceRef.current;
    const chain = micCheckEffectChainRef.current;
    if (!ctx || !oldSource || !chain) return;

    console.log("[LiveKit] Hot-swapping singing NC during mic check:", singingNC ? "ON" : "OFF");
    void (async () => {
      try {
        const nc = singingNC;
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
            echoCancellation: nc,
            noiseSuppression: nc,
            autoGainControl: nc,
            channelCount: 2,
            sampleRate: 48000,
          },
        });

        // Stop old mic stream
        micCheckStreamRef.current?.getTracks().forEach((t) => t.stop());
        micCheckStreamRef.current = newStream;

        // Reconnect in the Web Audio graph
        oldSource.disconnect();
        const newSource = ctx.createMediaStreamSource(newStream);
        newSource.connect(chain.input);
        micCheckSourceRef.current = newSource;

        console.log("[LiveKit] Singing mic check re-captured with NC:", nc ? "ON" : "OFF");
      } catch (err) {
        console.error("[LiveKit] Error hot-swapping singing NC:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singingNC]);

  // --- Hot-swap voice effect during singing mic check ---
  // When voiceEffect changes while monitoring-sing, swap effect chain live
  useEffect(() => {
    if (micCheckState !== "monitoring-sing") return;
    const ctx = micCheckCtxRef.current;
    const source = micCheckSourceRef.current;
    const gain = micCheckGainRef.current;
    const oldChain = micCheckEffectChainRef.current;
    if (!ctx || !source || !gain || !oldChain) return;

    // Tear down old chain and reconnect with new effect
    oldChain.cleanup();
    source.disconnect();

    const newChain = createEffectChain(ctx, voiceEffect);
    source.connect(newChain.input);
    newChain.output.connect(gain);
    newChain.setWetDry?.(effectWetDryRef.current);
    micCheckEffectChainRef.current = newChain;

    console.log("[LiveKit] Singing mic check effect swapped to:", voiceEffect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEffect]);

  // --- Microphone ---

  const isTogglingMicRef = useRef(false);
  const micErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !room.localParticipant || isTogglingMicRef.current) return;

    isTogglingMicRef.current = true;
    const newState = !isMicEnabledRef.current;
    try {
      console.log("[LiveKit] Setting mic enabled:", newState);

      // If sharing is active, add/remove mic from the mix instead of LiveKit managed mic
      if (mixPubRef.current && mixCtxRef.current && mixDestRef.current) {
        if (newState && !mixMicStreamRef.current) {
          // Add mic to mix
          const nc = singingNCRef.current;
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
              echoCancellation: nc,
              noiseSuppression: nc,
              autoGainControl: nc,
              channelCount: 2,
              sampleRate: 48000,
            },
          });

          const ctx = mixCtxRef.current;
          const dest = mixDestRef.current;
          const micSource = ctx.createMediaStreamSource(stream);
          const micGain = ctx.createGain();
          micGain.gain.value = 1.0;

          const chain = createEffectChain(ctx, voiceEffectRef.current);
          chain.setWetDry?.(effectWetDryRef.current);
          micSource.connect(chain.input);
          chain.output.connect(micGain);
          micGain.connect(dest);

          mixMicSourceRef.current = micSource;
          mixMicGainRef.current = micGain;
          mixMicStreamRef.current = stream; setMixMicStreamState(stream);
          effectChainRef.current = chain;

          console.log("[LiveKit] Mic added to mix on the fly");
          // Reconnect auto-mix analyser to new mic source if active
          if (autoMixRef.current) connectAutoMixAnalyser();
        } else if (!newState && mixMicStreamRef.current) {
          // Remove mic from mix
          effectChainRef.current?.cleanup();
          effectChainRef.current = null;
          mixMicSourceRef.current?.disconnect();
          mixMicSourceRef.current = null;
          mixMicGainRef.current?.disconnect();
          mixMicGainRef.current = null;
          mixMicStreamRef.current.getTracks().forEach((t) => t.stop());
          mixMicStreamRef.current = null; setMixMicStreamState(null);

          console.log("[LiveKit] Mic removed from mix on the fly");
        }
        setIsMicEnabled(newState);
      } else {
        // Not sharing — use LiveKit managed mic
        await room.localParticipant.setMicrophoneEnabled(newState);
        setIsMicEnabled(newState);
      }

      console.log("[LiveKit] Mic is now", newState ? "ON" : "OFF");
    } catch (err) {
      console.error("[LiveKit] Mic error:", err);
      const errName = err instanceof Error ? err.name : "";
      const isTransient = errName === "NotAllowedError" || errName === "NotFoundError";
      const msg = errName === "NotAllowedError"
        ? "Mic permission needed — click Unmute again"
        : errName === "NotFoundError"
          ? "No microphone found — check your device"
          : (err instanceof Error ? err.message : "Mic failed");
      setError(msg);
      // Clear previous timer, schedule new one — only one timer active at a time
      if (micErrorTimerRef.current) clearTimeout(micErrorTimerRef.current);
      if (isTransient) {
        micErrorTimerRef.current = setTimeout(() => {
          setError((prev) => prev === msg ? null : prev);
          micErrorTimerRef.current = null;
        }, 3000);
      }
    } finally {
      isTogglingMicRef.current = false;
    }
  }, [selectedInputDeviceId]);

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
    mixMicStreamRef.current = null; setMixMicStreamState(null);
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

  // --- Auto-mix: sidechain ducking (lower music when voice detected) ---
  // Measures RAW mic level (before effects) to avoid reverb tails keeping ducking active.
  // Reads music gain from the live GainNode (not a snapshot) so slider changes are respected.
  const [autoMix, setAutoMixState] = useState(false);
  const autoMixRef = useRef(false);
  const autoMixTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoMixAnalyserRef = useRef<AnalyserNode | null>(null);
  const autoMixBaseGainRef = useRef(0.7); // tracks the user's music slider position

  // Called by setMixMusicGain to keep base gain in sync with slider
  const updateAutoMixBaseGain = useCallback((val: number) => {
    autoMixBaseGainRef.current = val;
  }, []);

  const connectAutoMixAnalyser = useCallback(() => {
    // Connect analyser to raw mic source (before effects) to avoid reverb tails
    const ctx = mixCtxRef.current;
    const micSource = mixMicSourceRef.current;
    if (!ctx || !micSource) return;

    autoMixAnalyserRef.current?.disconnect();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    micSource.connect(analyser); // always raw mic, never chain output
    autoMixAnalyserRef.current = analyser;
  }, []);

  const setAutoMix = useCallback((on: boolean) => {
    setAutoMixState(on);
    autoMixRef.current = on;

    if (!on) {
      if (autoMixTimerRef.current) {
        clearInterval(autoMixTimerRef.current);
        autoMixTimerRef.current = null;
      }
      autoMixAnalyserRef.current?.disconnect();
      autoMixAnalyserRef.current = null;
      // Restore music gain to slider value
      const musicGain = mixSystemGainRef.current;
      const ctx = mixCtxRef.current;
      if (musicGain && ctx) {
        musicGain.gain.setTargetAtTime(autoMixBaseGainRef.current, ctx.currentTime, 0.15);
      }
      return;
    }

    const ctx = mixCtxRef.current;
    const musicGain = mixSystemGainRef.current;
    if (!ctx || !musicGain) return;

    // Snapshot current slider position as base
    autoMixBaseGainRef.current = musicGain.gain.value;

    connectAutoMixAnalyser();
    if (!autoMixAnalyserRef.current) return;

    const analyser = autoMixAnalyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let smoothedLevel = 0;

    autoMixTimerRef.current = setInterval(() => {
      if (!autoMixRef.current) return;
      const currentAnalyser = autoMixAnalyserRef.current;
      const currentMusicGain = mixSystemGainRef.current;
      const currentCtx = mixCtxRef.current;
      if (!currentAnalyser || !currentMusicGain || !currentCtx) return;

      currentAnalyser.getByteFrequencyData(dataArray);

      // RMS energy of voice frequencies (100Hz-4kHz) on raw mic signal
      const binHz = (currentCtx.sampleRate / 2) / currentAnalyser.frequencyBinCount;
      const lowBin = Math.floor(100 / binHz);
      const highBin = Math.min(Math.floor(4000 / binHz), dataArray.length);
      let sum = 0;
      for (let i = lowBin; i < highBin; i++) sum += dataArray[i]! * dataArray[i]!;
      const rms = Math.sqrt(sum / (highBin - lowBin)) / 255;

      // Smooth to avoid pumping
      smoothedLevel = smoothedLevel * 0.7 + rms * 0.3;

      // Duck: voice loud → music at 30% of slider, voice quiet → 100% of slider
      const voiceThreshold = 0.08;
      const duckRatio = smoothedLevel > voiceThreshold
        ? Math.max(0.3, 1 - (smoothedLevel - voiceThreshold) * 3)
        : 1.0;

      currentMusicGain.gain.setTargetAtTime(
        autoMixBaseGainRef.current * duckRatio,
        currentCtx.currentTime,
        0.15,
      );
    }, 50);
  }, [connectAutoMixAnalyser]);

  // Stop auto-mix when sharing stops
  useEffect(() => {
    if (!isSharing && autoMixRef.current) {
      setAutoMix(false);
    }
  }, [isSharing, setAutoMix]);

  // Sync Room's audioCaptureDefaults to current NC before restoring managed mic
  const syncNCToRoom = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const isRaw = micModeRef.current === "raw";
    const nc = isRaw ? singingNCRef.current : talkingNCRef.current;
    room.options.audioCaptureDefaults = {
      ...room.options.audioCaptureDefaults,
      echoCancellation: nc,
      noiseSuppression: nc,
      autoGainControl: nc,
    };
  }, []);

  // Expose gain controls for the singer to adjust mix balance
  const setMixMicGain = useCallback((val: number) => {
    if (mixMicGainRef.current) mixMicGainRef.current.gain.value = val;
  }, []);
  const setMixMusicGain = useCallback((val: number) => {
    if (mixSystemGainRef.current) mixSystemGainRef.current.gain.value = val;
    updateAutoMixBaseGain(val); // keep auto-mix base in sync with slider
  }, [updateAutoMixBaseGain]);

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

    // Create new chain with current wet/dry
    const chain = createEffectChain(ctx, effect);
    chain.setWetDry?.(effectWetDryRef.current);
    micSource.connect(chain.input);
    chain.output.connect(micGain);
    effectChainRef.current = chain;

    console.log("[LiveKit] Voice effect switched to:", effect);
  }, []);

  const setEffectWetDry = useCallback((wet: number) => {
    effectWetDryRef.current = wet;
    effectChainRef.current?.setWetDry?.(wet);
    // Also apply to mic check effect chain if monitoring
    micCheckEffectChainRef.current?.setWetDry?.(wet);
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

      // 2. Capture mic with singing NC setting (AudioContext mixing bypasses
      //    Chrome's system-level echo cancellation, Chromium bug #40226380)
      const singNC = singingNCRef.current;
      let micStream: MediaStream | null = null;
      if (isMicEnabledRef.current) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
              echoCancellation: singNC,
              noiseSuppression: singNC,
              autoGainControl: singNC,
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
      systemGain.gain.value = 0.7; // default: voice louder than music (karaoke standard)
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
        mixMicStreamRef.current = micStream; setMixMicStreamState(micStream);
        effectChainRef.current = chain;
        // Apply current wet/dry to match Sound Profile setting
        chain.setWetDry?.(effectWetDryRef.current);
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
        // Restore managed mic with current NC settings
        syncNCToRoom();
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
      // Restore managed mic with current NC settings
      syncNCToRoom();
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

    // Restore managed mic with current NC settings
    syncNCToRoom();
    if (room && isMicEnabledRef.current) {
      void room.localParticipant.setMicrophoneEnabled(true).catch((err) => {
        console.error("[LiveKit] Error restoring managed mic:", err);
      });
    }
  }, [cleanupMix]);

  // --- Recording (passive tap on mix stream) ---

  const stopRecordingInternal = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
  }, []);

  const startRecording = useCallback(() => {
    const dest = mixDestRef.current;
    if (!dest || recordingState === "recording") return;

    console.log("[LiveKit] Starting recording from mix stream");
    recordingChunksRef.current = [];
    setRecordingBlob(null);
    setRecordingDuration(0);

    const recorder = new MediaRecorder(dest.stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm",
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordingChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      const chunks = recordingChunksRef.current;
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        setRecordingBlob(blob);
        setRecordingState("stopped");
        console.log("[LiveKit] Recording stopped, blob size:", blob.size);
      } else {
        setRecordingState("idle");
      }
    };

    recorder.start(1000); // collect chunks every 1s
    recorderRef.current = recorder;
    recordingStartRef.current = Date.now();
    setRecordingState("recording");

    // Update duration every second
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration(Math.floor((Date.now() - recordingStartRef.current) / 1000));
    }, 1000);
  }, [recordingState]);

  const stopRecording = useCallback(() => {
    stopRecordingInternal();
  }, [stopRecordingInternal]);

  const clearRecording = useCallback(() => {
    setRecordingBlob(null);
    setRecordingState("idle");
    setRecordingDuration(0);
    recordingChunksRef.current = [];
  }, []);

  // Auto-stop recording when sharing stops
  useEffect(() => {
    if (!isSharing && recordingState === "recording") {
      console.log("[LiveKit] Sharing stopped — auto-stopping recording");
      stopRecordingInternal();
    }
  }, [isSharing, recordingState, stopRecordingInternal]);

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
    stopMicCheck,
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
    mixMicStream: mixMicStreamState,
    autoMix,
    setAutoMix,
    recordingState,
    recordingDuration,
    recordingBlob,
    startRecording,
    stopRecording,
    clearRecording,
  };
}
