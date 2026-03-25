import type * as Party from "partykit/server";
import type { ChatMessage, ClientMessage, ParticipantStatus, RoomState, ServerMessage, SignalPayload } from "./types";

interface ParticipantEntry {
  name: string;
  ws: Party.Connection;
}

const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_LENGTH = 500;
const MAX_NAME_LENGTH = 30;
const MAX_BROWSER_LENGTH = 64;
const ALLOWED_EMOJIS = new Set(["🔥", "👏", "😍", "🎵", "💯", "🙌", "😂", "💀", "👎", "😴"]);
const HEARTBEAT_INTERVAL_MS = 15_000; // ping every 15s
const HEARTBEAT_TIMEOUT_MS = 40_000;  // evict after 40s of no pong
const SINGER_TIMEOUT_MS = 60_000;     // auto-advance queue after 60s of inactive singer

export default class KaraokeRoom implements Party.Server {
  participants: Map<string, ParticipantEntry> = new Map();
  queue: string[] = [];
  currentSingerId: string | null = null;
  chatMessages: ChatMessage[] = [];
  participantStatus: Map<string, ParticipantStatus> = new Map();
  mutedBySinger: string | null = null; // persisted so reconnecting clients get correct state

  // Heartbeat: track last pong time per connection
  private lastPong: Map<string, number> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  // Singer timeout: auto-advance if singer goes inactive
  private singerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {}

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      // Ping all connections
      for (const [id, entry] of this.participants) {
        try {
          entry.ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          // Will be cleaned up below
        }
      }
      // Evict connections that haven't ponged in time
      const deadIds: string[] = [];
      for (const [id] of this.participants) {
        const last = this.lastPong.get(id) ?? 0;
        if (now - last > HEARTBEAT_TIMEOUT_MS) {
          deadIds.push(id);
        }
      }
      for (const id of deadIds) {
        console.log(`[KaraokeRoom] Heartbeat timeout for ${id} — evicting`);
        this.removeParticipant(id);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetSingerTimer() {
    if (this.singerTimer) clearTimeout(this.singerTimer);
    this.singerTimer = null;
    if (this.currentSingerId) {
      this.singerTimer = setTimeout(() => {
        if (this.currentSingerId && !this.participants.has(this.currentSingerId)) {
          console.log(`[KaraokeRoom] Singer ${this.currentSingerId} timed out — advancing queue`);
          this.currentSingerId = null;
          this.promoteNextSinger();
          this.broadcastState();
        }
      }, SINGER_TIMEOUT_MS);
    }
  }

  onConnect(conn: Party.Connection) {
    this.lastPong.set(conn.id, Date.now());
    this.startHeartbeat();
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
      case "pong":
        this.lastPong.set(sender.id, Date.now());
        return; // no further processing needed
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
          browser: msg.browser,
          lkIdentity: msg.lkIdentity,
        });
        break;
      case "reaction":
        this.handleReaction(sender, msg.emoji);
        break;
      case "mute-all":
        this.handleMuteAll(sender);
        break;
      case "unmute-all":
        this.handleUnmuteAll(sender);
        break;
      case "add-to-queue":
        this.handleAddToQueue(sender, msg.targetPeerId);
        break;
      case "mix-adjust":
        this.handleMixAdjust(sender, msg.voice, msg.music);
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
    this.lastPong.delete(peerId);

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
      this.lastPong.clear();
      this.stopHeartbeat();
      if (this.singerTimer) clearTimeout(this.singerTimer);
      this.singerTimer = null;
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

    const trimmedName = name.trim().slice(0, MAX_NAME_LENGTH);

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

    const trimmedText = text.trim().slice(0, MAX_CHAT_LENGTH);
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

  private handleReaction(sender: Party.Connection, emoji: string) {
    const participant = this.participants.get(sender.id);
    if (!participant) return;
    if (!ALLOWED_EMOJIS.has(emoji)) return; // reject unknown emojis
    this.broadcast({
      type: "reaction",
      from: sender.id,
      fromName: participant.name,
      emoji,
    });
  }

  private handleStatusUpdate(sender: Party.Connection, status: ParticipantStatus) {
    if (!this.participants.has(sender.id)) return;

    // Cap browser string length to prevent abuse
    if (status.browser) {
      status.browser = status.browser.slice(0, MAX_BROWSER_LENGTH);
    }
    this.participantStatus.set(sender.id, status);
    // Send lightweight status update instead of full room state
    this.broadcast({
      type: "participant-status",
      peerId: sender.id,
      status,
    });
  }

  private handleMuteAll(sender: Party.Connection) {
    // Only the current singer can mute everyone
    if (this.currentSingerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the singer can mute all" });
      return;
    }
    const participant = this.participants.get(sender.id);
    if (!participant) return;

    this.mutedBySinger = participant.name;

    // Broadcast to all except the singer
    for (const [id, entry] of this.participants) {
      if (id !== sender.id) {
        this.send(entry.ws, { type: "mute-all", singerName: participant.name });
      }
    }
  }

  private handleUnmuteAll(sender: Party.Connection) {
    if (this.currentSingerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the singer can unmute all" });
      return;
    }

    this.mutedBySinger = null;

    // Broadcast to all except the singer
    for (const [id, entry] of this.participants) {
      if (id !== sender.id) {
        this.send(entry.ws, { type: "unmute-all" });
      }
    }
  }

  private handleMixAdjust(sender: Party.Connection, voice: number, music: number) {
    if (!this.currentSingerId) return;
    if (!Number.isFinite(voice) || !Number.isFinite(music)) return;
    const participant = this.participants.get(sender.id);
    if (!participant) return;

    const clampedVoice = Math.max(0, Math.min(1.5, voice));
    const clampedMusic = Math.max(0, Math.min(1.5, music));
    const isSinger = sender.id === this.currentSingerId;

    if (isSinger) {
      // Singer adjusted — broadcast to all listeners so their sliders sync
      for (const [id, entry] of this.participants) {
        if (id !== sender.id) {
          this.send(entry.ws, { type: "mix-adjust", fromName: participant.name, voice: clampedVoice, music: clampedMusic });
        }
      }
    } else {
      // Listener adjusted — send to singer to apply gain + announce in chat
      const singer = this.participants.get(this.currentSingerId);
      if (!singer) return;
      this.send(singer.ws, { type: "mix-adjust", fromName: participant.name, voice: clampedVoice, music: clampedMusic });
    }
  }

  private handleAddToQueue(sender: Party.Connection, targetPeerId: string) {
    // Anyone can add someone to the queue
    if (!this.participants.has(targetPeerId)) {
      this.send(sender, { type: "error", message: "Target participant not found" });
      return;
    }
    if (this.queue.includes(targetPeerId)) {
      return; // already in queue
    }
    if (this.currentSingerId === targetPeerId) {
      return; // already singing
    }

    this.queue.push(targetPeerId);

    if (this.currentSingerId === null) {
      this.promoteNextSinger();
    }

    this.broadcastState();
  }

  // ── Helpers ─────────────────────────────────────────────────

  private promoteNextSinger() {
    if (this.currentSingerId !== null) return;
    // Clear mute-all when no singer is active
    this.mutedBySinger = null;
    if (this.queue.length === 0) {
      this.resetSingerTimer();
      return;
    }

    // Only promote participants that are still connected
    while (this.queue.length > 0) {
      const nextId = this.queue.shift()!;
      if (this.participants.has(nextId)) {
        this.currentSingerId = nextId;
        this.resetSingerTimer();
        return;
      }
    }
    this.resetSingerTimer();
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
      // Only include queue entries that are still connected
      queue: this.queue.filter((id) => this.participants.has(id)),
      currentSingerId: this.currentSingerId,
      chatMessages: [...this.chatMessages],
      participantStatus,
      mutedBySinger: this.mutedBySinger,
    };
  }

  private broadcastState() {
    const msg: ServerMessage = {
      type: "room-state",
      state: this.buildRoomState(),
    };
    this.broadcast(msg);
  }

  private isBroadcasting = false;
  private pendingRemovals: string[] = [];

  private broadcast(msg: ServerMessage, excludeId?: string) {
    const raw = JSON.stringify(msg);
    const deadIds: string[] = [];
    this.isBroadcasting = true;
    for (const [id, entry] of this.participants) {
      if (id === excludeId) continue;
      try {
        entry.ws.send(raw);
      } catch {
        deadIds.push(id);
      }
    }
    this.isBroadcasting = false;

    // Clean up dead connections found during broadcast.
    // Defer if we're inside a re-entrant broadcast to prevent double-cleanup.
    this.pendingRemovals.push(...deadIds);
    if (this.pendingRemovals.length > 0) {
      const toRemove = [...new Set(this.pendingRemovals)];
      this.pendingRemovals = [];
      for (const id of toRemove) {
        this.removeParticipant(id);
      }
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
