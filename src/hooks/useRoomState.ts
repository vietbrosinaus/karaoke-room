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
  sendStatusUpdate: (status: { isMuted: boolean; isSharingAudio: boolean; currentSong: string | null }) => void;
  sendReaction: (emoji: string) => void;
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
  const reactionIdRef = useRef(0);
  const hasSentJoinRef = useRef(false);
  const onRawMessageRef = useRef(onRawMessage);

  useEffect(() => {
    onRawMessageRef.current = onRawMessage;
  }, [onRawMessage]);

  const hasReceivedInitialStateRef = useRef(false);

  const onMessage = useCallback((msg: ServerMessage) => {
    console.log("[RoomState] Received message:", msg.type);
    // Forward all messages to the raw handler (for useWebRTC)
    onRawMessageRef.current?.(msg);

    switch (msg.type) {
      case "room-state":
        setRoomState(msg.state);
        setParticipantStatus(msg.state.participantStatus);
        // Only sync chat from room-state on first load (catch-up).
        // After that, chat arrives via individual "chat" events.
        if (!hasReceivedInitialStateRef.current) {
          setChatMessages(msg.state.chatMessages);
          hasReceivedInitialStateRef.current = true;
        }
        break;
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
      case "reaction":
        setReactions((prev) => {
          const id = `r-${++reactionIdRef.current}`;
          const next = [...prev, { id, from: msg.from, fromName: msg.fromName, emoji: msg.emoji, timestamp: Date.now() }];
          // Keep max 20 active reactions
          return next.length > 20 ? next.slice(-20) : next;
        });
        // Auto-remove after 3 seconds
        setTimeout(() => {
          setReactions((prev) => prev.slice(1));
        }, 3000);
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

  // Send join message once connected
  useEffect(() => {
    if (isConnected && !hasSentJoinRef.current) {
      send({ type: "join", name: playerName });
      hasSentJoinRef.current = true;
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

  const sendStatusUpdate = useCallback((status: { isMuted: boolean; isSharingAudio: boolean; currentSong: string | null }) => {
    send({
      type: "status-update",
      isMuted: status.isMuted,
      isSharingAudio: status.isSharingAudio,
      currentSong: status.currentSong,
    });
  }, [send]);

  const sendReaction = useCallback((emoji: string) => {
    send({ type: "reaction", emoji });
  }, [send]);

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
    chatMessages,
    participantStatus,
    reactions,
  };
}
