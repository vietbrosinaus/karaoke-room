"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePartySocket } from "./usePartySocket";
import type { ChatMessage, ClientMessage, ParticipantStatus, RoomState, ServerMessage } from "~/types/room";

interface UseRoomStateParams {
  roomCode: string;
  playerName: string;
  onRawMessage?: (msg: ServerMessage) => void;
}

export interface Reaction {
  id: string;
  from: string;
  fromName: string;
  emoji: string;
  timestamp: number;
  left: number; // random horizontal position (0-100%), set once at creation
}

interface UseRoomStateReturn {
  roomState: RoomState;
  myPeerId: string | null;
  isConnected: boolean;
  joinQueue: () => void;
  leaveQueue: () => void;
  finishSinging: () => void;
  isMyTurn: boolean;
  send: (msg: ClientMessage) => void;
  sendChat: (text: string) => void;
  sendStatusUpdate: (status: { isMuted: boolean; isSharingAudio: boolean; currentSong: string | null; browser?: string; lkIdentity?: string; autoMix?: boolean }) => void;
  sendReaction: (emoji: string) => void;
  sendMuteAll: () => void;
  sendUnmuteAll: () => void;
  addToQueue: (targetPeerId: string) => void;
  sendMixAdjust: (voice: number, music: number) => void;
  clearPendingMixAdjust: () => void;
  mutedBySinger: string | null;
  pendingMixAdjust: { fromName: string; voice: number; music: number } | null;
  chatMessages: ChatMessage[];
  participantStatus: Record<string, ParticipantStatus>;
  reactions: Reaction[];
}

const INITIAL_ROOM_STATE: RoomState = {
  participants: [],
  queue: [],
  currentSingerId: null,
  chatMessages: [],
  participantStatus: {},
  mutedBySinger: null,
};

export function useRoomState({
  roomCode,
  playerName,
  onRawMessage,
}: UseRoomStateParams): UseRoomStateReturn {
  const [roomState, setRoomState] = useState<RoomState>(INITIAL_ROOM_STATE);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [participantStatus, setParticipantStatus] = useState<Record<string, ParticipantStatus>>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [mutedBySinger, setMutedBySinger] = useState<string | null>(null);
  const [pendingMixAdjust, setPendingMixAdjust] = useState<{ fromName: string; voice: number; music: number } | null>(null);
  const reactionIdRef = useRef(0);
  const hasSentJoinRef = useRef(false);
  const onRawMessageRef = useRef(onRawMessage);

  useEffect(() => {
    onRawMessageRef.current = onRawMessage;
  }, [onRawMessage]);

  const hasReceivedInitialStateRef = useRef(false);
  const sendRef = useRef<((msg: ClientMessage) => void) | null>(null);

  const onMessage = useCallback((msg: ServerMessage) => {
    console.log("[RoomState] Received message:", msg.type);
    onRawMessageRef.current?.(msg);

    switch (msg.type) {
      case "ping":
        sendRef.current?.({ type: "pong" });
        return;
      case "room-state": {
        // Defensive defaults for fields that may be missing from older PartyKit servers
        const state = {
          ...msg.state,
          chatMessages: msg.state.chatMessages ?? [],
          participantStatus: msg.state.participantStatus ?? {},
          queue: msg.state.queue ?? [],
          participants: msg.state.participants ?? [],
        };
        setRoomState(state);
        // Sync mutedBySinger from server state (persisted across reconnects)
        setMutedBySinger(state.mutedBySinger ?? null);
        setParticipantStatus(state.participantStatus);
        // Only sync chat from room-state on first load (catch-up).
        // After that, chat arrives via individual "chat" events.
        if (!hasReceivedInitialStateRef.current) {
          setChatMessages(state.chatMessages);
          hasReceivedInitialStateRef.current = true;
        }
        break;
      }
      case "participant-status":
        setParticipantStatus((prev) => ({
          ...prev,
          [msg.peerId]: msg.status,
        }));
        break;
      case "peer-left":
        setParticipantStatus((prev) => {
          const next = { ...prev };
          delete next[msg.peerId];
          return next;
        });
        break;
      case "chat":
        setChatMessages((prev) => {
          const updated = [...prev, { from: msg.from, fromName: msg.fromName, text: msg.text, timestamp: msg.timestamp }];
          if (updated.length > 100) {
            return updated.slice(-100);
          }
          return updated;
        });
        break;
      case "reaction": {
        const reactionId = `r-${++reactionIdRef.current}`;
        setReactions((prev) => {
          const left = Math.random() * 80 + 10; // 10-90%
          const next = [...prev, { id: reactionId, from: msg.from, fromName: msg.fromName, emoji: msg.emoji, timestamp: Date.now(), left }];
          return next.length > 20 ? next.slice(-20) : next;
        });
        // Remove this specific reaction by ID after 3 seconds
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== reactionId));
        }, 3000);
        break;
      }
      case "mute-all":
        console.log("[RoomState] Muted by singer:", msg.singerName);
        setMutedBySinger(msg.singerName);
        break;
      case "unmute-all":
        console.log("[RoomState] Unmuted by singer");
        setMutedBySinger(null);
        break;
      case "mix-adjust":
        console.log("[RoomState] Mix adjusted by:", msg.fromName, "voice:", msg.voice, "music:", msg.music);
        setPendingMixAdjust({ fromName: msg.fromName, voice: msg.voice, music: msg.music });
        break;
      case "you-joined":
        console.log("[RoomState] My peer ID:", msg.peerId);
        setMyPeerId(msg.peerId);
        break;
      case "error":
        console.error("[RoomState] Server error:", msg.message);
        break;
      default:
        break;
    }
  }, []);

  const { send, isConnected } = usePartySocket({ roomCode, onMessage });
  sendRef.current = send;

  // Send join message on connect and on name change
  const prevNameRef = useRef(playerName);
  useEffect(() => {
    if (!isConnected) return;
    // Send join on first connect or when name changes
    if (!hasSentJoinRef.current || prevNameRef.current !== playerName) {
      send({ type: "join", name: playerName });
      hasSentJoinRef.current = true;
      prevNameRef.current = playerName;
    }
  }, [isConnected, playerName, send]);

  // Reset flags if disconnected
  useEffect(() => {
    if (!isConnected) {
      hasSentJoinRef.current = false;
      hasReceivedInitialStateRef.current = false;
    }
  }, [isConnected]);

  const joinQueue = useCallback(() => {
    send({ type: "join-queue" });
  }, [send]);

  const leaveQueue = useCallback(() => {
    send({ type: "leave-queue" });
  }, [send]);

  const finishSinging = useCallback(() => {
    send({ type: "finish-singing" });
  }, [send]);

  const sendChat = useCallback((text: string) => {
    if (text.trim()) {
      send({ type: "chat", text });
    }
  }, [send]);

  const sendStatusUpdate = useCallback((status: { isMuted: boolean; isSharingAudio: boolean; currentSong: string | null; browser?: string; lkIdentity?: string; autoMix?: boolean }) => {
    send({
      type: "status-update",
      isMuted: status.isMuted,
      isSharingAudio: status.isSharingAudio,
      currentSong: status.currentSong,
      browser: status.browser,
      lkIdentity: status.lkIdentity,
      autoMix: status.autoMix,
    });
  }, [send]);

  const sendReaction = useCallback((emoji: string) => {
    send({ type: "reaction", emoji });
  }, [send]);

  const sendMuteAll = useCallback(() => {
    send({ type: "mute-all" });
  }, [send]);

  const sendUnmuteAll = useCallback(() => {
    send({ type: "unmute-all" });
  }, [send]);

  const addToQueue = useCallback((targetPeerId: string) => {
    send({ type: "add-to-queue", targetPeerId });
  }, [send]);

  const sendMixAdjust = useCallback((voice: number, music: number) => {
    send({ type: "mix-adjust", voice, music });
  }, [send]);

  const clearPendingMixAdjust = useCallback(() => {
    setPendingMixAdjust(null);
  }, []);

  const isMyTurn = myPeerId !== null && roomState.currentSingerId === myPeerId;

  return {
    roomState,
    myPeerId,
    isConnected,
    joinQueue,
    leaveQueue,
    finishSinging,
    isMyTurn,
    send,
    sendChat,
    sendStatusUpdate,
    sendReaction,
    sendMuteAll,
    sendUnmuteAll,
    addToQueue,
    sendMixAdjust,
    clearPendingMixAdjust,
    mutedBySinger,
    pendingMixAdjust,
    chatMessages,
    participantStatus,
    reactions,
  };
}
