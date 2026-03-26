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

export interface WatchQueueItem {
  videoId: string;
  title: string;
  addedBy: string; // peerId
  addedByName: string; // display name
}

export interface RoomState {
  participants: Participant[];
  queue: string[];
  currentSingerId: string | null;
  chatMessages: ChatMessage[];
  participantStatus: Record<string, ParticipantStatus>;
  mutedBySinger: string | null;
  roomMode: "karaoke" | "watch";
  watchQueue: WatchQueueItem[];
  watchCurrentVideoId: string | null;
  watchCurrentTitle: string | null;
  watchCurrentAddedById: string | null;
  watchCurrentAddedByName: string | null;
  watchLeaderId: string | null;
  watchState: "playing" | "paused" | null;
  watchTime: number;
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
  | { type: "mode-switch"; mode: "karaoke" | "watch" }
  | { type: "watch-queue-add"; videoId: string; title: string }
  | { type: "watch-queue-remove"; videoId: string }
  | { type: "watch-sync"; state: "playing" | "paused"; time: number }
  | { type: "watch-skip" }
  | { type: "watch-advance" }
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
  | { type: "name-taken"; name: string; suggestions: string[] }
  | { type: "watch-sync"; state: "playing" | "paused"; time: number; from: string }
  | { type: "ping" };

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };
