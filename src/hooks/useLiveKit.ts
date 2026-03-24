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

interface UseLiveKitReturn {
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;
  isMonitoring: boolean;
  toggleMonitor: () => void;
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

  const [isMonitoring, setIsMonitoring] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const systemAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const systemAudioPubRef = useRef<LocalTrackPublication | null>(null);
  const monitorAudioRef = useRef<HTMLAudioElement | null>(null);
  const micModeRef = useRef<MicMode>(micMode);
  micModeRef.current = micMode;

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
        // Browsers block autoplay — startAudio() registers a click handler to resume.
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

    // Resume audio on first user interaction (autoplay policy workaround).
    // This ensures remote audio plays even if the user hasn't toggled their mic.
    const resumeAudio = () => {
      room.startAudio().then(() => {
        // After audio context is resumed, play all audio elements
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
    void room.switchActiveDevice("audioinput", selectedInputDeviceId).catch((err) => {
      console.error("[LiveKit] Error switching input device:", err);
    });
  }, [selectedInputDeviceId, isConnected]);

  // --- Switch mic mode without reconnecting ---
  // Republish the mic track with new audio processing constraints.

  const prevMicModeRef = useRef<MicMode>(micMode);
  useEffect(() => {
    if (prevMicModeRef.current === micMode) return;
    prevMicModeRef.current = micMode;

    const room = roomRef.current;
    if (!room || !isConnected || !isMicEnabled) return;

    const isRaw = micMode === "raw";
    console.log("[LiveKit] Switching mic mode to:", micMode);

    // Unpublish current mic, then re-enable with new constraints
    void (async () => {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
        // Update room options for new mic capture
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
  }, [selectedOutputDeviceId, isConnected]);

  // --- Mic monitor (loopback to hear yourself) ---

  const toggleMonitor = useCallback(() => {
    setIsMonitoring((prev) => !prev);
  }, []);

  // Effect: attach/detach local mic to a hidden <audio> for monitoring
  useEffect(() => {
    const room = roomRef.current;
    if (!isMonitoring || !isMicEnabled || !room) {
      // Stop monitoring
      if (monitorAudioRef.current) {
        monitorAudioRef.current.srcObject = null;
        monitorAudioRef.current.remove();
        monitorAudioRef.current = null;
        console.log("[LiveKit] Mic monitor OFF");
      }
      return;
    }

    // Find the local mic track
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const mediaTrack = micPub?.track?.mediaStreamTrack;
    if (!mediaTrack) {
      console.log("[LiveKit] No mic track to monitor");
      return;
    }

    // Create a hidden audio element playing the local mic
    const audio = document.createElement("audio");
    audio.id = "lk-mic-monitor";
    audio.style.display = "none";
    audio.srcObject = new MediaStream([mediaTrack]);
    audio.volume = 1.0;
    document.body.appendChild(audio);
    void audio.play().catch((err) => console.warn("[LiveKit] Monitor autoplay blocked:", err));
    monitorAudioRef.current = audio;
    console.log("[LiveKit] Mic monitor ON");

    return () => {
      audio.srcObject = null;
      audio.remove();
      monitorAudioRef.current = null;
    };
  }, [isMonitoring, isMicEnabled]);

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

  // Force mic to raw/singing mode: no echo cancellation, no noise suppression,
  // no AGC, stereo 48kHz. This prevents the browser from nerfing the singer's
  // voice when system audio is also being published.
  const forceMicRaw = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !isMicEnabled) return;
    console.log("[LiveKit] Forcing mic to raw mode for sharing...");
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      room.options.audioCaptureDefaults = {
        ...room.options.audioCaptureDefaults,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      };
      room.options.publishDefaults = {
        ...room.options.publishDefaults,
        audioPreset: AudioPresets.musicHighQualityStereo,
        dtx: false, // never drop "silent" packets — singing has quiet moments
      };
      await room.localParticipant.setMicrophoneEnabled(true);
      console.log("[LiveKit] Mic republished in raw mode");
    } catch (err) {
      console.error("[LiveKit] Error forcing mic to raw:", err);
    }
  }, [isMicEnabled]);

  // Restore mic to its configured mode (based on micModeRef)
  const restoreMicMode = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !isMicEnabled) return;
    const isRaw = micModeRef.current === "raw";
    console.log("[LiveKit] Restoring mic to", micModeRef.current, "mode");
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
      room.options.publishDefaults = {
        ...room.options.publishDefaults,
        audioPreset: isRaw ? AudioPresets.musicHighQualityStereo : AudioPresets.music,
        dtx: !isRaw,
      };
      await room.localParticipant.setMicrophoneEnabled(true);
      console.log("[LiveKit] Mic restored to", micModeRef.current);
    } catch (err) {
      console.error("[LiveKit] Error restoring mic mode:", err);
    }
  }, [isMicEnabled]);

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
        setSharingError("No audio captured. Check 'Share audio' in the dialog.");
        return;
      }

      // Force mic to raw mode BEFORE publishing system audio.
      // This eliminates processing-induced latency between the two tracks
      // and prevents echo cancellation from suppressing the singer's voice.
      if (micModeRef.current !== "raw") {
        await forceMicRaw();
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
        // Restore mic to configured mode
        void restoreMicMode();
      };
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setSharingError(null);
      } else {
        const msg = err instanceof Error ? err.message : "Failed to share audio";
        console.error("[LiveKit] Share error:", err);
        setSharingError(msg);
      }
    }
  }, [forceMicRaw, restoreMicMode]);

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

    // Restore mic to configured mode after sharing ends
    void restoreMicMode();
  }, [restoreMicMode]);

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
    isMonitoring,
    toggleMonitor,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    remoteParticipantCount,
    currentSong,
  };
}
