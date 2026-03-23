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
} from "livekit-client";

interface UseLiveKitParams {
  roomCode: string;
  playerName: string;
  isMyTurn: boolean;
}

interface UseLiveKitReturn {
  // Connection
  isConnected: boolean;
  error: string | null;

  // Mic
  isMicEnabled: boolean;
  toggleMic: () => Promise<void>;

  // System audio (singer only)
  isSharing: boolean;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  sharingError: string | null;

  // Remote participants
  remoteParticipantCount: number;
}

export function useLiveKit({
  roomCode,
  playerName,
  isMyTurn,
}: UseLiveKitParams): UseLiveKitReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const systemAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const isMyTurnRef = useRef(isMyTurn);

  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  // --- Auto-attach / detach remote audio tracks ---

  const handleTrackSubscribed = useCallback(
    (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      console.log(
        "[LiveKit] TrackSubscribed — attaching audio from",
        participant.identity,
        "source:",
        track.source,
      );
      const el = track.attach();
      el.id = `livekit-audio-${participant.identity}-${track.sid}`;
      el.style.display = "none";
      document.body.appendChild(el);
    },
    [],
  );

  const handleTrackUnsubscribed = useCallback(
    (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      console.log(
        "[LiveKit] TrackUnsubscribed — detaching audio from",
        participant.identity,
      );
      const elements = track.detach();
      for (const el of elements) {
        el.remove();
      }
    },
    [],
  );

  const updateParticipantCount = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const count = room.remoteParticipants.size;
    setRemoteParticipantCount(count);
    console.log("[LiveKit] Remote participant count:", count);
  }, []);

  // --- Connect to LiveKit room ---

  useEffect(() => {
    if (!roomCode || !playerName) return;

    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    // Wire up events before connecting
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, updateParticipantCount);
    room.on(RoomEvent.ParticipantDisconnected, updateParticipantCount);

    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log("[LiveKit] Connection state changed:", state);
      if (cancelled) return;
      setIsConnected(state === ConnectionState.Connected);
      if (state === ConnectionState.Disconnected) {
        setError("Disconnected from room");
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log("[LiveKit] Disconnected from room");
      if (!cancelled) {
        setIsConnected(false);
      }
    });

    const connect = async () => {
      try {
        console.log(
          "[LiveKit] Fetching token for room:",
          roomCode,
          "name:",
          playerName,
        );
        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(playerName)}`,
        );
        if (!res.ok) {
          throw new Error(`Token fetch failed: ${res.status} ${res.statusText}`);
        }
        const { token } = (await res.json()) as { token: string };

        if (cancelled) return;

        const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
        if (!url) {
          throw new Error("NEXT_PUBLIC_LIVEKIT_URL is not set");
        }

        console.log("[LiveKit] Connecting to", url);
        await room.connect(url, token);

        if (cancelled) return;

        console.log("[LiveKit] Connected successfully");
        setIsConnected(true);
        setError(null);
        updateParticipantCount();
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to connect to LiveKit";
        console.error("[LiveKit] Connection error:", err);
        setError(message);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      console.log("[LiveKit] Cleaning up — disconnecting from room");

      // Stop system audio if sharing
      if (systemAudioTrackRef.current) {
        systemAudioTrackRef.current.stop();
        systemAudioTrackRef.current = null;
      }

      room.disconnect();
      roomRef.current = null;
      setIsConnected(false);
      setIsMicEnabled(false);
      setIsSharing(false);
    };
  }, [roomCode, playerName, handleTrackSubscribed, handleTrackUnsubscribed, updateParticipantCount]);

  // --- Microphone ---

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    try {
      const newEnabled = !isMicEnabled;
      console.log("[LiveKit] toggleMic — setting mic enabled:", newEnabled);
      await room.localParticipant.setMicrophoneEnabled(newEnabled);
      setIsMicEnabled(newEnabled);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to toggle microphone";
      console.error("[LiveKit] Mic toggle error:", err);
      setError(message);
    }
  }, [isMicEnabled]);

  // --- System audio sharing ---

  const startSharing = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      setSharingError("Not connected to room");
      return;
    }

    // Stop existing sharing first
    if (systemAudioTrackRef.current) {
      systemAudioTrackRef.current.stop();
    }

    try {
      console.log("[LiveKit] Starting system audio capture");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: 1,
          height: 1,
          frameRate: 1,
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });

      // Immediately stop the video track — we only want audio
      stream.getVideoTracks().forEach((track) => track.stop());

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        setSharingError(
          "No audio track captured. Make sure to share a tab with audio.",
        );
        return;
      }

      console.log(
        "[LiveKit] Captured system audio track:",
        audioTrack.id,
        audioTrack.readyState,
      );

      // Listen for user stopping sharing via browser UI
      audioTrack.onended = () => {
        console.log("[LiveKit] System audio track ended (user stopped sharing)");
        systemAudioTrackRef.current = null;
        setIsSharing(false);
        setSharingError(null);
      };

      // Publish the audio track as screen share audio
      await room.localParticipant.publishTrack(audioTrack, {
        source: Track.Source.ScreenShareAudio,
        name: "karaoke-audio",
      });

      systemAudioTrackRef.current = audioTrack;
      setIsSharing(true);
      setSharingError(null);
      console.log("[LiveKit] System audio track published");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to capture system audio";
      console.error("[LiveKit] System audio capture error:", err);
      setSharingError(message);
    }
  }, []);

  const stopSharing = useCallback(() => {
    const room = roomRef.current;
    const track = systemAudioTrackRef.current;

    if (track) {
      console.log("[LiveKit] Stopping system audio sharing");

      // Unpublish from LiveKit
      if (room) {
        const publications = room.localParticipant.trackPublications;
        for (const [, pub] of publications) {
          if (pub.source === Track.Source.ScreenShareAudio) {
            void room.localParticipant.unpublishTrack(pub.track!);
            break;
          }
        }
      }

      track.stop();
      systemAudioTrackRef.current = null;
      setIsSharing(false);
      setSharingError(null);
    }
  }, []);

  // --- Auto-stop sharing when isMyTurn becomes false ---

  useEffect(() => {
    if (!isMyTurn && isSharing) {
      console.log(
        "[LiveKit] isMyTurn became false — auto-stopping system audio sharing",
      );
      stopSharing();
    }
  }, [isMyTurn, isSharing, stopSharing]);

  return {
    isConnected,
    error,
    isMicEnabled,
    toggleMic,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    remoteParticipantCount,
  };
}
