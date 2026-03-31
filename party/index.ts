import type * as Party from "partykit/server";
import type { ChatMessage, ClientMessage, ParticipantStatus, RoomState, ServerMessage, SignalPayload, WatchQueueItem } from "./types";

interface ParticipantEntry {
  name: string;
  ws: Party.Connection;
}

const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_LENGTH = 500;
const MAX_NAME_LENGTH = 20; // must match client-side MAX_NAME_LENGTH in src/lib/playerName.ts
const MAX_BROWSER_LENGTH = 64;
const ALLOWED_EMOJIS = new Set(["🔥", "👏", "😍", "🎵", "💯", "🙌", "😂", "💀", "👎", "😴"]);
const HEARTBEAT_INTERVAL_MS = 15_000; // ping every 15s
const HEARTBEAT_TIMEOUT_MS = 40_000;  // evict after 40s of no pong
const SINGER_TIMEOUT_MS = 60_000;     // auto-advance queue after 60s of inactive singer
const WATCH_MAX_QUEUE_ITEMS = 20;

export default class KaraokeRoom implements Party.Server {
  participants: Map<string, ParticipantEntry> = new Map();
  queue: string[] = [];
  currentSingerId: string | null = null;
  chatMessages: ChatMessage[] = [];
  participantStatus: Map<string, ParticipantStatus> = new Map();
  mutedBySinger: string | null = null; // persisted so reconnecting clients get correct state

  // Admin & password
  adminPeerId: string | null = null;
  passwordHash: string | null = null;
  pendingAuth: Map<string, { name: string; ws: Party.Connection }> = new Map();

  // Watch mode state (YouTube watch party)
  roomMode: "karaoke" | "watch" = "karaoke";
  watchQueue: WatchQueueItem[] = [];
  watchCurrentVideoId: string | null = null;
  watchCurrentTitle: string | null = null;
  watchCurrentAddedById: string | null = null;
  watchCurrentAddedByName: string | null = null;
  watchLeaderId: string | null = null; // peerId
  watchState: "playing" | "paused" | null = null;
  watchTime = 0;

  // Heartbeat: track last pong time per connection
  private lastPong: Map<string, number> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  // Singer timeout: auto-advance if singer goes inactive
  private singerTimer: ReturnType<typeof setTimeout> | null = null;
  // Registry reporting (debounced - max once per 30s)
  private lastRegistryReport = 0;
  private registryTimer: ReturnType<typeof setTimeout> | null = null;

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
        if (!this.currentSingerId) return;
        // Fire for both disconnected AND idle connected singers
        console.log(`[KaraokeRoom] Singer ${this.currentSingerId} timed out - advancing queue`);
        this.currentSingerId = null;
        this.mutedBySinger = null;
        this.promoteNextSinger();
        this.broadcastState();
      }, SINGER_TIMEOUT_MS);
    }
  }

  // HTTP health endpoint for monitoring (GET /parties/main/<room-id>)
  async onRequest(req: Party.Request) {
    if (req.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    return new Response(JSON.stringify({
      status: "ok",
      participants: this.participants.size,
      queue: this.queue.length,
      hasSinger: this.currentSingerId !== null,
      roomMode: this.roomMode,
      watchQueue: this.watchQueue.length,
      hasWatchVideo: this.watchCurrentVideoId !== null,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  onConnect(conn: Party.Connection) {
    this.lastPong.set(conn.id, Date.now());
    this.startHeartbeat();
    this.send(conn, { type: "you-joined", peerId: conn.id });

    // Evict connections that don't join within 30s (extra time for name-taken flow)
    setTimeout(() => {
      if (!this.participants.has(conn.id)) {
        console.log(`[KaraokeRoom] Connection ${conn.id} never joined - disconnecting`);
        this.lastPong.delete(conn.id);
        try { conn.close(); } catch { /* already closed */ }
      }
    }, 30_000);
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
          autoMix: msg.autoMix === true,
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
      case "mode-switch":
        this.handleModeSwitch(sender, msg.mode);
        break;
      case "watch-queue-add":
        this.handleWatchQueueAdd(sender, msg.videoId, msg.title);
        break;
      case "watch-queue-remove":
        this.handleWatchQueueRemove(sender, msg.videoId);
        break;
      case "watch-sync":
        this.handleWatchSync(sender, msg.state, msg.time);
        break;
      case "watch-speed":
        this.handleWatchSpeed(sender, msg.rate);
        break;
      case "watch-skip":
        this.handleWatchSkip(sender);
        break;
      case "watch-advance":
        this.handleWatchAdvance(sender);
        break;
      case "kick":
        this.handleKick(sender, msg.peerId);
        break;
      case "set-password":
        void this.handleSetPassword(sender, msg.password);
        break;
      case "transfer-admin":
        this.handleTransferAdmin(sender, msg.peerId);
        break;
      case "auth":
        void this.handleAuth(sender, msg.password);
        break;
      default:
        this.send(sender, { type: "error", message: "Unknown message type" });
    }
  }

  onClose(conn: Party.Connection) {
    // Clean up pending auth and lastPong for pre-join connections
    this.pendingAuth.delete(conn.id);
    if (!this.participants.has(conn.id)) {
      this.lastPong.delete(conn.id);
    }
    this.removeParticipant(conn.id);
  }

  onError(conn: Party.Connection, _error: Error) {
    console.error(`[KaraokeRoom] Connection error for ${conn.id}`);
    this.pendingAuth.delete(conn.id);
    if (!this.participants.has(conn.id)) {
      this.lastPong.delete(conn.id);
    }
    this.removeParticipant(conn.id);
  }

  private removeParticipant(peerId: string) {
    const participant = this.participants.get(peerId);
    if (!participant) return;

    this.participants.delete(peerId);
    this.participantStatus.delete(peerId);
    this.lastPong.delete(peerId);
    this.pendingAuth.delete(peerId);


    // If they were admin, auto-promote next participant
    if (this.adminPeerId === peerId) {
      this.adminPeerId = null;
      for (const [id, entry] of this.participants) {
        this.adminPeerId = id;
        this.broadcastSystemChat(`${entry.name} is now the room admin`);
        break;
      }
    }

    // If they were the watch leader, reassign
    if (this.watchLeaderId === peerId) {
      this.watchLeaderId = this.pickFallbackWatchLeaderId();
    }

    // Remove from queue
    this.queue = this.queue.filter((id) => id !== peerId);

    // If they were the current singer, promote next
    if (this.currentSingerId === peerId) {
      this.currentSingerId = null;
      this.promoteNextSinger();
    }

    // If room is now empty, reset ALL state so the DO can be GC'd cleanly
    if (this.participants.size === 0) {
      console.log(`[KaraokeRoom] Room ${this.room.id} is empty - resetting state`);
      this.queue = [];
      this.currentSingerId = null;
      this.mutedBySinger = null;
      this.chatMessages = [];
      this.participantStatus.clear();
      this.lastPong.clear();
      this.adminPeerId = null;
      this.passwordHash = null;
      this.pendingAuth.clear();
      this.roomMode = "karaoke";
      this.wipeWatchState();
      this.stopHeartbeat();
      if (this.singerTimer) clearTimeout(this.singerTimer);
      this.singerTimer = null;
      if (this.registryTimer) clearTimeout(this.registryTimer);
      this.registryTimer = null;
      this.deleteFromRegistry();
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

    // Check for duplicate names (case-insensitive)
    // Allow "Anonymous" duplicates - multiple unnamed users is expected
    // Skip check for existing participants updating their own name (rename flow)
    const existing = this.participants.get(sender.id);
    const isAnonymous = trimmedName.toLowerCase() === "anonymous";

    // Find any existing participant with the same name (not this connection)
    let duplicatePeerId: string | null = null;
    if (!isAnonymous) {
      const now = Date.now();
      for (const [id, p] of this.participants) {
        if (p.name.toLowerCase() === trimmedName.toLowerCase() && id !== sender.id) {
          // Check if old connection is stale (no pong for >20s - likely a refresh)
          const lastPong = this.lastPong.get(id) ?? 0;
          if (now - lastPong > 20_000) {
            // Stale ghost from refresh - evict and close the old socket
            try { p.ws.close(); } catch { /* already closed */ }
            this.removeParticipant(id);
          } else {
            // Active connection - real duplicate
            duplicatePeerId = id;
          }
          break;
        }
      }
    }

    if (duplicatePeerId) {
      const suggestions: string[] = [];
      for (let i = 2; i <= 10; i++) {
        const suffix = String(i);
        // Truncate base name to make room for suffix within MAX_NAME_LENGTH
        const base = trimmedName.slice(0, MAX_NAME_LENGTH - suffix.length);
        const candidate = `${base}${suffix}`;
        const taken = Array.from(this.participants.values()).some(
          (p) => p.name.toLowerCase() === candidate.toLowerCase()
        );
        if (!taken && candidate.toLowerCase() !== trimmedName.toLowerCase()) suggestions.push(candidate);
        if (suggestions.length >= 3) break;
      }
      this.send(sender, { type: "name-taken", name: trimmedName, suggestions });
      return;
    }

    // Update name if already a participant (rename), otherwise add new
    if (existing) {
      existing.name = trimmedName;
    } else {
      // If room has a password, require auth before adding (first joiner exempt - they're creating the room)
      if (this.passwordHash !== null && this.participants.size > 0) {
        this.pendingAuth.set(sender.id, { name: trimmedName, ws: sender });
        this.send(sender, { type: "auth-required" });
        return;
      }
      this.participants.set(sender.id, { name: trimmedName, ws: sender });
      // First joiner becomes admin
      if (this.adminPeerId === null) {
        this.adminPeerId = sender.id;
      }
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

  private broadcastSystemChat(text: string) {
    const trimmedText = text.trim().slice(0, MAX_CHAT_LENGTH);
    if (!trimmedText) return;
    const chatMsg: ChatMessage = {
      from: "system",
      fromName: "KaraOK",
      text: trimmedText,
      timestamp: Date.now(),
    };
    this.chatMessages.push(chatMsg);
    if (this.chatMessages.length > MAX_CHAT_MESSAGES) {
      this.chatMessages.shift();
    }
    this.broadcast({
      type: "chat",
      from: chatMsg.from,
      fromName: chatMsg.fromName,
      text: chatMsg.text,
      timestamp: chatMsg.timestamp,
    });
  }

  // ── Watch Mode Handlers ────────────────────────────────────

  private handleModeSwitch(sender: Party.Connection, mode: "karaoke" | "watch") {
    const participant = this.participants.get(sender.id);
    if (!participant) {
      this.send(sender, { type: "error", message: "Must join the room before switching modes" });
      return;
    }

    if (mode === this.roomMode) return;

    if (mode === "watch") {
      // Prevent switching while someone is singing
      if (this.currentSingerId !== null) {
        this.send(sender, { type: "error", message: "Cannot switch modes while someone is on stage" });
        return;
      }
      this.roomMode = "watch";
      // Start clean when entering watch mode
      this.wipeWatchState();
    } else {
      // Prevent switching while a video is playing
      if (this.watchCurrentVideoId !== null && this.watchState === "playing") {
        this.send(sender, { type: "error", message: "Cannot switch modes while a video is playing" });
        return;
      }
      this.roomMode = "karaoke";
      // Always wipe any queued videos when leaving watch mode
      this.wipeWatchState();
      if (this.currentSingerId === null && this.queue.length > 0) {
        this.promoteNextSinger();
      }
    }

    this.handleChat(sender, `switched to ${mode === "watch" ? "Watch" : "Karaoke"} Mode`);
    this.broadcastState();
  }

  private handleWatchQueueAdd(sender: Party.Connection, videoId: string, title: string) {
    const participant = this.participants.get(sender.id);
    if (!participant) return;
    if (this.roomMode !== "watch") {
      this.send(sender, { type: "error", message: "Not in Watch Mode" });
      return;
    }

    const trimmedVideoId = String(videoId ?? "").trim();
    const trimmedTitle = String(title ?? "").trim().slice(0, 120);
    if (!/^[a-zA-Z0-9_-]{11}$/.test(trimmedVideoId)) return;
    if (!trimmedTitle) return;

    if (this.watchQueue.length >= WATCH_MAX_QUEUE_ITEMS) {
      this.send(sender, { type: "error", message: "Watch queue is full" });
      return;
    }

    this.watchQueue.push({
      videoId: trimmedVideoId,
      title: trimmedTitle,
      addedBy: sender.id,
      addedByName: participant.name,
    });

    this.handleChat(sender, `queued "${trimmedTitle}"`);

    // Auto-start if nothing playing (after queue message, so chat reads naturally)
    if (this.watchCurrentVideoId === null) {
      this.startNextWatchVideo();
    }

    this.broadcastState();
  }

  private handleWatchQueueRemove(sender: Party.Connection, videoId: string) {
    const participant = this.participants.get(sender.id);
    if (!participant) return;
    if (this.roomMode !== "watch") return;

    const vid = String(videoId ?? "").trim();
    if (!vid) return;
    if (this.watchCurrentVideoId === vid) return;

    const idx = this.watchQueue.findIndex((q) => q.videoId === vid && q.addedBy === sender.id);
    if (idx === -1) return;
    const [removed] = this.watchQueue.splice(idx, 1);
    if (removed) {
      this.handleChat(sender, `removed "${removed.title}" from the queue`);
      this.broadcastState();
    }
  }

  private handleWatchSync(sender: Party.Connection, state: "playing" | "paused", time: number) {
    const participant = this.participants.get(sender.id);
    if (!participant) return;
    if (this.roomMode !== "watch") return;
    if (!this.watchCurrentVideoId) return;
    if (!Number.isFinite(time)) return;

    const clampedTime = Math.max(0, time);
    const prevState = this.watchState;
    const nextState: "playing" | "paused" = state === "paused" ? "paused" : "playing";

    // If state changed, accept from anyone (play/pause command)
    if (prevState !== nextState) {
      this.watchState = nextState;
      this.watchTime = clampedTime;
      this.broadcast(
        { type: "watch-sync", state: nextState, time: clampedTime, from: participant.name },
      );
      this.handleChat(sender, `${nextState === "paused" ? "paused" : "resumed"} the video`);
      return;
    }

    // If state did not change, treat as a position heartbeat (leader only)
    if (this.watchLeaderId && sender.id !== this.watchLeaderId) return;
    if (!this.watchLeaderId) this.watchLeaderId = sender.id;

    this.watchTime = clampedTime;
    this.broadcast(
      { type: "watch-sync", state: nextState, time: clampedTime, from: participant.name },
    );
  }

  private handleWatchSpeed(sender: Party.Connection, rate: number) {
    const participant = this.participants.get(sender.id);
    if (!participant) return;
    if (this.roomMode !== "watch") return;
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 2) return;

    this.broadcast({ type: "watch-speed", rate, from: participant.name });
    this.handleChat(sender, `changed playback speed to ${rate}x`);
  }

  private handleWatchSkip(sender: Party.Connection) {
    const participant = this.participants.get(sender.id);
    if (!participant) return;
    if (this.roomMode !== "watch") return;
    if (!this.watchCurrentVideoId) return;

    const prevTitle = this.watchCurrentTitle;
    this.watchCurrentVideoId = null;
    this.watchCurrentTitle = null;
    this.watchState = null;
    this.watchTime = 0;
    this.watchLeaderId = null;

    this.handleChat(sender, `skipped${prevTitle ? ` "${prevTitle}"` : ""}`);
    this.startNextWatchVideo();
    this.broadcastState();
  }

  private handleWatchAdvance(sender: Party.Connection) {
    const participant = this.participants.get(sender.id);
    if (!participant) return;
    if (this.roomMode !== "watch") return;
    if (!this.watchCurrentVideoId) return;

    // Leader only
    if (this.watchLeaderId && sender.id !== this.watchLeaderId) return;

    this.watchCurrentVideoId = null;
    this.watchCurrentTitle = null;
    this.watchState = null;
    this.watchTime = 0;
    this.watchLeaderId = null;

    this.startNextWatchVideo();
    this.broadcastState();
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

    // Singer timer: cancel while sharing, restart when idle
    if (sender.id === this.currentSingerId) {
      if (status.isSharingAudio) {
        // Actively sharing - cancel idle timer (unlimited singing time)
        if (this.singerTimer) { clearTimeout(this.singerTimer); this.singerTimer = null; }
      } else {
        // Not sharing - restart idle timer (60s to start/resume or get auto-advanced)
        this.resetSingerTimer();
      }
    }
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

  // ── Admin Handlers ──────────────────────────────────────────

  private handleKick(sender: Party.Connection, targetPeerId: string) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can kick" });
      return;
    }
    const admin = this.participants.get(sender.id);
    const target = this.participants.get(targetPeerId);
    if (!admin || !target) return;
    if (targetPeerId === sender.id) return; // can't kick yourself

    const targetName = target.name;
    this.send(target.ws, { type: "kicked", by: admin.name });
    try { target.ws.close(); } catch { /* already closed */ }
    this.removeParticipant(targetPeerId);
    this.broadcastSystemChat(`${targetName} was kicked by ${admin.name}`);
  }

  private handleTransferAdmin(sender: Party.Connection, targetPeerId: string) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can transfer admin" });
      return;
    }
    const target = this.participants.get(targetPeerId);
    if (!target) return;

    this.adminPeerId = targetPeerId;
    this.broadcast({ type: "admin-changed", peerId: targetPeerId, name: target.name });
    this.broadcastSystemChat(`${target.name} is now the room admin`);
    this.broadcastState();
  }

  private async handleSetPassword(sender: Party.Connection, password: string | null) {
    if (this.adminPeerId !== sender.id) {
      this.send(sender, { type: "error", message: "Only the admin can set a password" });
      return;
    }

    if (password === null || password === "") {
      this.passwordHash = null;
    } else {
      this.passwordHash = await this.hashPassword(password);
    }
    this.broadcastSystemChat(this.passwordHash ? "Room is now locked" : "Room is now unlocked");
    this.broadcastState();
  }

  private async handleAuth(sender: Party.Connection, password: string) {
    const pending = this.pendingAuth.get(sender.id);
    if (!pending) {
      this.send(sender, { type: "error", message: "No pending auth" });
      return;
    }

    if (!this.passwordHash) {
      // Password was removed while they were entering it - let them in
      this.pendingAuth.delete(sender.id);
      this.participants.set(sender.id, pending);
      if (this.adminPeerId === null) {
        this.adminPeerId = sender.id;
      }
      this.broadcast({ type: "peer-joined", peerId: sender.id, name: pending.name }, sender.id);
      this.broadcastState();
      return;
    }

    const inputHash = await this.hashPassword(password);
    if (!this.constantTimeEqual(inputHash, this.passwordHash)) {
      this.send(sender, { type: "auth-failed" });
      return;
    }

    // Auth passed - add to participants
    this.pendingAuth.delete(sender.id);
    this.participants.set(sender.id, pending);
    this.broadcast({ type: "peer-joined", peerId: sender.id, name: pending.name }, sender.id);
    this.broadcastState();
  }

  private async hashPassword(password: string): Promise<string> {
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private promoteNextSinger() {
    if (this.roomMode === "watch") return;
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
      roomMode: this.roomMode,
      watchQueue: [...this.watchQueue],
      watchCurrentVideoId: this.watchCurrentVideoId,
      watchCurrentTitle: this.watchCurrentTitle,
      watchCurrentAddedById: this.watchCurrentAddedById,
      watchCurrentAddedByName: this.watchCurrentAddedByName,
      watchLeaderId: this.watchLeaderId,
      watchState: this.watchState,
      watchTime: this.watchTime,
      adminPeerId: this.adminPeerId,
      isLocked: this.passwordHash !== null,
    };
  }

  private wipeWatchState() {
    this.watchQueue = [];
    this.watchCurrentVideoId = null;
    this.watchCurrentTitle = null;
    this.watchCurrentAddedById = null;
    this.watchCurrentAddedByName = null;
    this.watchLeaderId = null;
    this.watchState = null;
    this.watchTime = 0;
  }

  private pickFallbackWatchLeaderId(): string | null {
    // Prefer existing watch leader if connected, otherwise first connected participant.
    if (this.watchLeaderId && this.participants.has(this.watchLeaderId)) return this.watchLeaderId;
    for (const [id] of this.participants) return id;
    return null;
  }

  private startNextWatchVideo() {
    if (this.watchCurrentVideoId !== null) return;
    const next = this.watchQueue.shift();
    if (!next) {
      this.wipeWatchState();
      this.broadcastSystemChat("Watch queue finished");
      return;
    }
    this.watchCurrentVideoId = next.videoId;
    this.watchCurrentTitle = next.title;
    this.watchCurrentAddedById = next.addedBy;
    this.watchCurrentAddedByName = next.addedByName;
    this.watchLeaderId = this.participants.has(next.addedBy) ? next.addedBy : this.pickFallbackWatchLeaderId();
    this.watchState = "playing";
    this.watchTime = 0;
    this.broadcastSystemChat(`Now playing: "${next.title}"`);
    // Kick off playback immediately instead of waiting for leader heartbeat.
    this.broadcast({ type: "watch-sync", state: "playing", time: 0, from: "KaraOK" });
  }

  private broadcastState() {
    const msg: ServerMessage = {
      type: "room-state",
      state: this.buildRoomState(),
    };
    this.broadcast(msg);
    this.reportToRegistry();
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

  // ── Registry reporting ──────────────────────────────────────

  private reportToRegistry() {
    const now = Date.now();
    const elapsed = now - this.lastRegistryReport;
    if (elapsed < 30_000) {
      // Debounce: schedule a report after the remaining cooldown
      if (!this.registryTimer) {
        this.registryTimer = setTimeout(() => {
          this.registryTimer = null;
          this.doRegistryReport();
        }, 30_000 - elapsed);
      }
      return;
    }
    this.doRegistryReport();
  }

  private doRegistryReport() {
    this.lastRegistryReport = Date.now();
    const singerEntry = this.currentSingerId
      ? this.participants.get(this.currentSingerId)
      : undefined;
    const singerStatus = this.currentSingerId
      ? this.participantStatus.get(this.currentSingerId)
      : undefined;

    const currentSong = this.roomMode === "watch"
      ? this.watchCurrentTitle
      : (singerStatus?.currentSong ?? null);

    const body = JSON.stringify({
      participantCount: this.participants.size,
      mode: this.roomMode,
      currentSinger: singerEntry?.name ?? null,
      currentSong,
      isLocked: this.passwordHash !== null,
    });

    const registry = this.room.parties.registry;
    if (!registry) return;
    const stub = registry.get("global");
    void stub.fetch(`?room=${encodeURIComponent(this.room.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  }

  private deleteFromRegistry() {
    const registry = this.room.parties.registry;
    if (!registry) return;
    const stub = registry.get("global");
    void stub.fetch(`?room=${encodeURIComponent(this.room.id)}`, {
      method: "DELETE",
    }).catch(() => {});
  }
}
