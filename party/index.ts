import type * as Party from "partykit/server";
import type { ChatMessage, ClientMessage, ParticipantStatus, RoomState, ServerMessage, SignalPayload } from "./types";

interface ParticipantEntry {
  name: string;
  ws: Party.Connection;
}

const MAX_CHAT_MESSAGES = 100;

export default class KaraokeRoom implements Party.Server {
  participants: Map<string, ParticipantEntry> = new Map();
  queue: string[] = [];
  currentSingerId: string | null = null;
  chatMessages: ChatMessage[] = [];
  participantStatus: Map<string, ParticipantStatus> = new Map();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // Send the new connection its peer ID immediately.
    // The client must follow up with a "join" message to register a name.
    this.send(conn, { type: "you-joined", peerId: conn.id });
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message as string) as ClientMessage;
    } catch {
      this.send(sender, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "join":
        this.handleJoin(sender, msg.name);
        break;
      case "join-queue":
        this.handleJoinQueue(sender);
        break;
      case "leave-queue":
        this.handleLeaveQueue(sender);
        break;
      case "finish-singing":
        this.handleFinishSinging(sender);
        break;
      case "signal":
        this.handleSignal(sender, msg.to, msg.payload);
        break;
      case "chat":
        this.handleChat(sender, msg.text);
        break;
      case "status-update":
        this.handleStatusUpdate(sender, {
          isMuted: msg.isMuted,
          isSharingAudio: msg.isSharingAudio,
          currentSong: msg.currentSong,
        });
        break;
      default:
        this.send(sender, { type: "error", message: "Unknown message type" });
    }
  }

  onClose(conn: Party.Connection) {
    this.removeParticipant(conn.id);
  }

  onError(conn: Party.Connection, _error: Error) {
    console.error(`[KaraokeRoom] Connection error for ${conn.id}`);
    this.removeParticipant(conn.id);
  }

  private removeParticipant(peerId: string) {
    const participant = this.participants.get(peerId);
    if (!participant) return;

    this.participants.delete(peerId);
    this.participantStatus.delete(peerId);

    // Remove from queue
    this.queue = this.queue.filter((id) => id !== peerId);

    // If they were the current singer, promote next
    if (this.currentSingerId === peerId) {
      this.currentSingerId = null;
      this.promoteNextSinger();
    }

    // If room is now empty, reset all state so the DO can be GC'd cleanly
    if (this.participants.size === 0) {
      console.log(`[KaraokeRoom] Room ${this.room.id} is empty — resetting state`);
      this.queue = [];
      this.currentSingerId = null;
      this.chatMessages = [];
      this.participantStatus.clear();
      return; // no one to broadcast to
    }

    this.broadcast({ type: "peer-left", peerId });
    this.broadcastState();
  }

  // ── Handlers ────────────────────────────────────────────────

  private handleJoin(sender: Party.Connection, name: string) {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      this.send(sender, { type: "error", message: "Name is required" });
      return;
    }

    const trimmedName = name.trim();

    // Handle re-join: update name if already present
    const existing = this.participants.get(sender.id);
    if (existing) {
      existing.name = trimmedName;
    } else {
      this.participants.set(sender.id, { name: trimmedName, ws: sender });
    }

    // Notify all OTHER connections about the new peer
    this.broadcast(
      { type: "peer-joined", peerId: sender.id, name: trimmedName },
      sender.id
    );

    // Send full room state to everyone
    this.broadcastState();
  }

  private handleJoinQueue(sender: Party.Connection) {
    if (!this.participants.has(sender.id)) {
      this.send(sender, {
        type: "error",
        message: "Must join the room before joining the queue",
      });
      return;
    }

    // Don't add duplicates
    if (this.queue.includes(sender.id)) {
      return;
    }

    this.queue.push(sender.id);

    // If nobody is singing, promote
    if (this.currentSingerId === null) {
      this.promoteNextSinger();
    }

    this.broadcastState();
  }

  private handleLeaveQueue(sender: Party.Connection) {
    const idx = this.queue.indexOf(sender.id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }

    // If they were the current singer and chose to leave queue, clear them
    if (this.currentSingerId === sender.id) {
      this.currentSingerId = null;
      this.promoteNextSinger();
    }

    this.broadcastState();
  }

  private handleFinishSinging(sender: Party.Connection) {
    if (this.currentSingerId !== sender.id) {
      this.send(sender, {
        type: "error",
        message: "You are not the current singer",
      });
      return;
    }

    this.currentSingerId = null;
    this.promoteNextSinger();
    this.broadcastState();
  }

  private handleSignal(
    sender: Party.Connection,
    to: string,
    payload: SignalPayload
  ) {
    const target = this.participants.get(to);
    if (!target) {
      this.send(sender, { type: "error", message: "Target peer not found" });
      return;
    }

    this.send(target.ws, {
      type: "signal",
      from: sender.id,
      payload,
    });
  }

  private handleChat(sender: Party.Connection, text: string) {
    const participant = this.participants.get(sender.id);
    if (!participant) {
      this.send(sender, { type: "error", message: "Must join the room before chatting" });
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText) return;

    const chatMsg: ChatMessage = {
      from: sender.id,
      fromName: participant.name,
      text: trimmedText,
      timestamp: Date.now(),
    };

    // Store in memory (cap at MAX_CHAT_MESSAGES)
    this.chatMessages.push(chatMsg);
    if (this.chatMessages.length > MAX_CHAT_MESSAGES) {
      this.chatMessages.shift();
    }

    // Broadcast chat message to all participants
    this.broadcast({
      type: "chat",
      from: chatMsg.from,
      fromName: chatMsg.fromName,
      text: chatMsg.text,
      timestamp: chatMsg.timestamp,
    });
  }

  private handleStatusUpdate(sender: Party.Connection, status: ParticipantStatus) {
    if (!this.participants.has(sender.id)) return;

    this.participantStatus.set(sender.id, status);
    // Send lightweight status update instead of full room state
    this.broadcast({
      type: "participant-status",
      peerId: sender.id,
      status,
    });
  }

  // ── Helpers ─────────────────────────────────────────────────

  private promoteNextSinger() {
    if (this.currentSingerId !== null) return;
    if (this.queue.length === 0) return;

    // Only promote participants that are still connected
    while (this.queue.length > 0) {
      const nextId = this.queue.shift()!;
      if (this.participants.has(nextId)) {
        this.currentSingerId = nextId;
        return;
      }
      // If the participant disconnected, skip and try the next one
    }
  }

  private buildRoomState(): RoomState {
    const participants = Array.from(this.participants.entries()).map(
      ([id, entry]) => ({ id, name: entry.name })
    );

    const participantStatus: Record<string, ParticipantStatus> = {};
    for (const [id, status] of this.participantStatus) {
      participantStatus[id] = status;
    }

    return {
      participants,
      queue: [...this.queue],
      currentSingerId: this.currentSingerId,
      chatMessages: [...this.chatMessages],
      participantStatus,
    };
  }

  private broadcastState() {
    const msg: ServerMessage = {
      type: "room-state",
      state: this.buildRoomState(),
    };
    this.broadcast(msg);
  }

  private broadcast(msg: ServerMessage, excludeId?: string) {
    const raw = JSON.stringify(msg);
    const deadIds: string[] = [];
    for (const [id, entry] of this.participants) {
      if (id === excludeId) continue;
      try {
        entry.ws.send(raw);
      } catch {
        // Connection is dead, mark for cleanup
        deadIds.push(id);
      }
    }
    // Clean up any dead connections found during broadcast
    for (const id of deadIds) {
      this.removeParticipant(id);
    }
  }

  private send(conn: Party.Connection, msg: ServerMessage) {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      // Connection is dead, will be cleaned up on onClose/onError
    }
  }
}
