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

interface UseLiveKitParams {
  roomCode: string;
  playerName: string;
  isMyTurn: boolean;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  micMode: MicMode;
}

type MicCheckState = "idle" | "recording" | "playing";

interface UseLiveKitReturn {
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  micCheckState: MicCheckState;
  startMicCheck: () => void;
  isSharing: boolean;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  sharingError: string | null;
  remoteParticipantCount: number;
  currentSong: string | null;
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

  const roomRef = useRef<Room | null>(null);
  const systemAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const systemAudioPubRef = useRef<LocalTrackPublication | null>(null);
  const micCheckAbortRef = useRef<(() => void) | null>(null);
  const micModeRef = useRef<MicMode>(micMode);
  micModeRef.current = micMode;

  // Ref mirrors — used in callbacks to avoid stale closures
  const isMicEnabledRef = useRef(isMicEnabled);
  isMicEnabledRef.current = isMicEnabled;
  const selectedOutputRef = useRef(selectedOutputDeviceId);
  selectedOutputRef.current = selectedOutputDeviceId;

  // Web Audio bypass: when sharing tab audio, Chrome's system-level echo
  // cancellation nerfs the mic even with echoCancellation:false. Routing
  // the mic through an AudioContext → MediaStreamDestination bypasses this.
  const bypassAudioCtxRef = useRef<AudioContext | null>(null);
  const bypassSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bypassDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const bypassRawStreamRef = useRef<MediaStream | null>(null);
  const bypassPubRef = useRef<LocalTrackPublication | null>(null);
  const bypassInFlightRef = useRef(false); // guard against concurrent calls

  // --- Connect to LiveKit room ---

  useEffect(() => {
    if (!roomCode || !playerName) return;

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
        el.style.display = "none";
        el.autoplay = true;
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

    // Connection state
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log("[LiveKit] Connection state:", state);
      if (cancelled) return;
      setIsConnected(state === ConnectionState.Connected);
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log("[LiveKit] Disconnected");
      if (!cancelled) {
        setIsConnected(false);
      }
    });

    // Connect
    const connect = async () => {
      try {
        // Stable session ID: survives page refresh so LiveKit replaces the
        // old participant instead of creating a ghost duplicate.
        // Scoped by (roomCode, playerName) so changing name gets a fresh identity.
        const sidKey = `lk-sid-${roomCode}-${playerName}`;
        let sid = sessionStorage.getItem(sidKey);
        if (!sid) {
          sid = `${playerName}-${crypto.randomUUID().slice(0, 8)}`;
          sessionStorage.setItem(sidKey, sid);
        }

        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(playerName)}`,
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Token error: ${res.status} ${text}`);
        }
        const { token } = (await res.json()) as { token: string };
        if (cancelled) return;

        const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
        if (!url) throw new Error("NEXT_PUBLIC_LIVEKIT_URL not set");

        console.log("[LiveKit] Connecting to", url);
        await room.connect(url, token);
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
      if (systemAudioTrackRef.current) {
        systemAudioTrackRef.current.stop();
        systemAudioTrackRef.current = null;
      }
      systemAudioPubRef.current = null;
      // Clean up Web Audio bypass if active
      if (bypassPubRef.current?.track) {
        void room.localParticipant?.unpublishTrack(bypassPubRef.current.track);
      }
      bypassPubRef.current = null;
      bypassSourceRef.current?.disconnect();
      bypassSourceRef.current = null;
      bypassDestRef.current = null;
      bypassRawStreamRef.current?.getTracks().forEach((t) => t.stop());
      bypassRawStreamRef.current = null;
      if (bypassAudioCtxRef.current?.state !== "closed") {
        void bypassAudioCtxRef.current?.close();
      }
      bypassAudioCtxRef.current = null;
      room.disconnect();
      roomRef.current = null;
      setIsConnected(false);
      setIsMicEnabled(false);
      setIsSharing(false);
    };
    // micMode is NOT included — handled by a separate effect that republishes the mic track.
    // selectedInputDeviceId/selectedOutputDeviceId are NOT included — handled by separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, playerName]);

  // --- Switch input device without reconnecting ---

  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isConnected || !selectedInputDeviceId) return;

    console.log("[LiveKit] Switching mic input to device:", selectedInputDeviceId);

    // If bypass is active, we need to re-capture the mic from the new device
    if (bypassPubRef.current && bypassRawStreamRef.current) {
      void (async () => {
        try {
          // Get new mic stream from the selected device
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

          // Stop old stream
          bypassRawStreamRef.current?.getTracks().forEach((t) => t.stop());
          bypassRawStreamRef.current = newStream;

          // Reconnect Web Audio graph with new source
          bypassSourceRef.current?.disconnect();
          const ctx = bypassAudioCtxRef.current;
          const dest = bypassDestRef.current;
          if (ctx && dest) {
            const newSource = ctx.createMediaStreamSource(newStream);
            newSource.connect(dest);
            bypassSourceRef.current = newSource;
            console.log("[LiveKit] Bypass mic switched to new input device");
          }
        } catch (err) {
          console.error("[LiveKit] Error switching bypass input device:", err);
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
    // Skip if bypass is active — bypass already uses raw mode
    if (!room || !isConnected || !isMicEnabled || bypassPubRef.current) {
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

    console.log("[LiveKit] Switching audio output to device:", selectedOutputDeviceId);
    void room.switchActiveDevice("audiooutput", selectedOutputDeviceId).catch((err) => {
      console.error("[LiveKit] Error switching output device:", err);
    });

    // Also update our manually created <audio> elements (remote tracks)
    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      if (typeof el.setSinkId === "function") {
        void el.setSinkId(selectedOutputDeviceId).catch((err) => {
          console.error("[LiveKit] Error setting sink on audio element:", err);
        });
      }
    });
  }, [selectedOutputDeviceId, isConnected]);

  // --- Mic check (record-and-playback) ---
  // Records 5 seconds of mic audio, then plays it back so you can hear
  // exactly how you sound to other participants. No stuttering issues
  // since playback is from a finished recording, not a live loopback.

  const startMicCheck = useCallback(() => {
    if (micCheckState !== "idle") return;

    const room = roomRef.current;
    if (!room || !isMicEnabledRef.current) return;

    // Get the active mic track (bypass or managed)
    let mediaTrack: MediaStreamTrack | undefined;
    if (bypassRawStreamRef.current) {
      mediaTrack = bypassRawStreamRef.current.getAudioTracks()[0];
    } else {
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      mediaTrack = micPub?.track?.mediaStreamTrack;
    }

    if (!mediaTrack) {
      console.log("[LiveKit] No mic track for mic check");
      return;
    }

    let cancelled = false;
    micCheckAbortRef.current = () => { cancelled = true; };

    setMicCheckState("recording");
    console.log("[LiveKit] Mic check: recording 5s...");

    const recorder = new MediaRecorder(new MediaStream([mediaTrack]), {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.onstop = () => {
      if (cancelled) { setMicCheckState("idle"); return; }

      const blob = new Blob(chunks, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      setMicCheckState("playing");
      console.log("[LiveKit] Mic check: playing back...");

      audio.onended = () => {
        URL.revokeObjectURL(url);
        setMicCheckState("idle");
        console.log("[LiveKit] Mic check: done");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setMicCheckState("idle");
      };
      void audio.play().catch(() => setMicCheckState("idle"));
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 5000);
  }, [micCheckState]);

  // --- Microphone ---

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !room.localParticipant) return;

    try {
      const newState = !isMicEnabled;
      console.log("[LiveKit] Setting mic enabled:", newState);
      await room.localParticipant.setMicrophoneEnabled(newState);
      setIsMicEnabled(newState);
      console.log("[LiveKit] Mic is now", newState ? "ON" : "OFF");
    } catch (err) {
      console.error("[LiveKit] Mic error:", err);
      setError(err instanceof Error ? err.message : "Mic failed");
    }
  }, [isMicEnabled]);

  // --- System audio sharing ---

  // Helper: tear down all bypass resources (idempotent, sync-safe)
  const cleanupBypassResources = useCallback(() => {
    bypassSourceRef.current?.disconnect();
    bypassSourceRef.current = null;
    bypassDestRef.current = null;
    if (bypassAudioCtxRef.current?.state !== "closed") {
      void bypassAudioCtxRef.current?.close();
    }
    bypassAudioCtxRef.current = null;
    bypassRawStreamRef.current?.getTracks().forEach((t) => t.stop());
    bypassRawStreamRef.current = null;
  }, []);

  // Publish mic via Web Audio API bypass — routes mic through AudioContext
  // so Chrome's system-level echo cancellation/AGC can't touch it.
  // This is the only reliable way to prevent Chrome from nerfing the mic
  // when getDisplayMedia audio is active (Chromium bug #40226380).
  // Returns true on success, false on failure.
  const publishBypassMic = useCallback(async (): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || bypassInFlightRef.current) return false;

    // Only publish bypass if user's mic is actually on
    if (!isMicEnabledRef.current) {
      console.log("[LiveKit] Mic is off — skipping bypass mic publish");
      return true; // not an error, just nothing to do
    }

    bypassInFlightRef.current = true;
    console.log("[LiveKit] Publishing mic via Web Audio bypass...");
    try {
      // 1. Capture raw mic with all processing disabled
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        },
      });
      bypassRawStreamRef.current = rawStream;

      // 2. Route through AudioContext → bypasses Chrome's system-level processing
      const ctx = new AudioContext({ sampleRate: 48000 });
      const source = ctx.createMediaStreamSource(rawStream);
      const dest = ctx.createMediaStreamDestination();
      source.connect(dest);

      bypassAudioCtxRef.current = ctx;
      bypassSourceRef.current = source;
      bypassDestRef.current = dest;

      // 3. Get the output track (this one is untouched by Chrome's processing)
      const bypassTrack = dest.stream.getAudioTracks()[0];
      if (!bypassTrack) throw new Error("No audio track from Web Audio bypass");

      // 4. Mute LiveKit's managed mic to avoid duplicate audio
      await room.localParticipant.setMicrophoneEnabled(false);

      // 5. Publish the bypass track as a custom track
      const pub = await room.localParticipant.publishTrack(bypassTrack, {
        name: "bypass-mic",
        source: Track.Source.Microphone,
        audioPreset: AudioPresets.musicHighQualityStereo,
        dtx: false,
        red: true,
      });
      bypassPubRef.current = pub;

      console.log("[LiveKit] Bypass mic published!", pub.trackSid);
      bypassInFlightRef.current = false;
      return true;
    } catch (err) {
      console.error("[LiveKit] Error publishing bypass mic:", err);
      // Clean up any resources allocated before the error
      cleanupBypassResources();
      // Try to restore managed mic if we muted it
      try {
        if (isMicEnabledRef.current) {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
      } catch { /* best effort */ }
      bypassInFlightRef.current = false;
      return false;
    }
  }, [selectedInputDeviceId, cleanupBypassResources]);

  // Tear down the Web Audio bypass and restore LiveKit's managed mic
  const unpublishBypassMic = useCallback(async () => {
    if (bypassInFlightRef.current) return; // another operation in progress
    // Skip if bypass isn't active
    if (!bypassPubRef.current && !bypassRawStreamRef.current) return;

    bypassInFlightRef.current = true;
    const room = roomRef.current;
    console.log("[LiveKit] Tearing down Web Audio bypass mic...");

    // Unpublish the bypass track
    if (bypassPubRef.current?.track && room?.localParticipant) {
      void room.localParticipant.unpublishTrack(bypassPubRef.current.track);
    }
    bypassPubRef.current = null;

    // Clean up all Web Audio resources
    cleanupBypassResources();

    // Re-enable LiveKit's managed mic if user had it on (use ref for fresh value)
    if (room && isMicEnabledRef.current) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log("[LiveKit] Managed mic restored");
      } catch (err) {
        console.error("[LiveKit] Error restoring managed mic:", err);
      }
    }
    bypassInFlightRef.current = false;
  }, [cleanupBypassResources]);

  const startSharing = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !room.localParticipant) {
      setSharingError("Not connected");
      return;
    }

    try {
      console.log("[LiveKit] Capturing system audio...");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1, frameRate: 1 },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Kill video track immediately
      for (const vt of stream.getVideoTracks()) vt.stop();

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        // Stop any remaining tracks on the stream
        stream.getTracks().forEach((t) => t.stop());
        setSharingError("No audio captured. Check 'Share audio' in the dialog.");
        return;
      }

      // Switch mic to Web Audio bypass BEFORE publishing system audio.
      // Chrome's system-level echo cancellation nerfs the mic when it detects
      // audio output from getDisplayMedia — even with echoCancellation:false.
      // Routing through AudioContext bypasses this entirely.
      const bypassOk = await publishBypassMic();
      if (!bypassOk) {
        console.warn("[LiveKit] Bypass mic failed — proceeding without bypass");
      }

      // Detect song name from tab title in track label
      const trackLabel = audioTrack.label;
      console.log("[LiveKit] System audio track label:", trackLabel);
      let detectedSong: string | null = null;
      if (trackLabel) {
        let songName = trackLabel;
        // Strip "Tab: " prefix if present
        if (songName.startsWith("Tab: ")) {
          songName = songName.slice(5);
        }
        // Strip " - YouTube" suffix if present
        if (songName.endsWith(" - YouTube")) {
          songName = songName.slice(0, -10);
        }
        if (songName.trim()) {
          detectedSong = songName.trim();
        }
      }
      setCurrentSong(detectedSong);

      console.log("[LiveKit] Got system audio track, publishing...");

      const pub = await room.localParticipant.publishTrack(audioTrack, {
        source: Track.Source.ScreenShareAudio,
        name: "karaoke-audio",
        audioPreset: AudioPresets.musicHighQualityStereo,
        dtx: false,
        red: true,
      });

      console.log("[LiveKit] System audio published!", pub.trackSid);

      systemAudioTrackRef.current = audioTrack;
      systemAudioPubRef.current = pub;
      setIsSharing(true);
      setSharingError(null);

      audioTrack.onended = () => {
        console.log("[LiveKit] System audio ended by user");
        if (roomRef.current?.localParticipant && pub.track) {
          void roomRef.current.localParticipant.unpublishTrack(pub.track);
        }
        systemAudioTrackRef.current = null;
        systemAudioPubRef.current = null;
        setIsSharing(false);
        setCurrentSong(null);
        // Restore normal mic
        void unpublishBypassMic();
      };
    } catch (err) {
      // Clean up bypass mic if it was published before the error
      void unpublishBypassMic();
      if (err instanceof Error && err.name === "NotAllowedError") {
        setSharingError(null);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to share audio";
        console.error("[LiveKit] Share error:", err);
        setSharingError(msg);
      }
    }
  }, [publishBypassMic, unpublishBypassMic]);

  const stopSharing = useCallback(() => {
    const room = roomRef.current;
    const track = systemAudioTrackRef.current;
    const pub = systemAudioPubRef.current;

    console.log("[LiveKit] Stopping sharing. track:", !!track, "pub:", !!pub);

    if (pub?.track && room?.localParticipant) {
      void room.localParticipant.unpublishTrack(pub.track);
    }

    if (track) track.stop();

    systemAudioTrackRef.current = null;
    systemAudioPubRef.current = null;
    setIsSharing(false);
    setSharingError(null);
    setCurrentSong(null);

    // Restore normal mic
    void unpublishBypassMic();
  }, [unpublishBypassMic]);

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
    startMicCheck,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    remoteParticipantCount,
    currentSong,
  };
}
