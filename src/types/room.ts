export interface Participant {
  id: string;
  name: string;
}

export interface ChatMessage {
  from: string;
  fromName: string;
  text: string;
  timestamp: number;
}

export interface ParticipantStatus {
  isMuted: boolean;
  isSharingAudio: boolean;
  currentSong: string | null;
  browser?: string;
  lkIdentity?: string;
  autoMix?: boolean;
}

export interface RoomState {
  participants: Participant[];
  queue: string[];
  currentSingerId: string | null;
  chatMessages: ChatMessage[];
  participantStatus: Record<string, ParticipantStatus>;
  mutedBySinger: string | null;
}

// Client → Server
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "join-queue" }
  | { type: "leave-queue" }
  | { type: "finish-singing" }
  | { type: "signal"; to: string; payload: SignalPayload }
  | { type: "chat"; text: string }
  | { type: "status-update"; isMuted: boolean; isSharingAudio: boolean; currentSong: string | null; browser?: string; lkIdentity?: string; autoMix?: boolean }
  | { type: "reaction"; emoji: string }
  | { type: "mute-all" }
  | { type: "unmute-all" }
  | { type: "add-to-queue"; targetPeerId: string }
  | { type: "mix-adjust"; voice: number; music: number }
  | { type: "pong" };

// Server → Client
export type ServerMessage =
  | { type: "room-state"; state: RoomState }
  | { type: "signal"; from: string; payload: SignalPayload }
  | { type: "peer-joined"; peerId: string; name: string }
  | { type: "peer-left"; peerId: string }
  | { type: "you-joined"; peerId: string }
  | { type: "error"; message: string }
  | { type: "chat"; from: string; fromName: string; text: string; timestamp: number }
  | { type: "participant-status"; peerId: string; status: ParticipantStatus }
  | { type: "reaction"; from: string; fromName: string; emoji: string }
  | { type: "mute-all"; singerName: string }
  | { type: "unmute-all" }
  | { type: "mix-adjust"; fromName: string; voice: number; music: number }
  | { type: "ping" };

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };
