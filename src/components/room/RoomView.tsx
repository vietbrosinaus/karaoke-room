"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRoomState } from "~/hooks/useRoomState";
import { useLiveKit } from "~/hooks/useLiveKit";
import { useAudioDevices } from "~/hooks/useAudioDevices";
import { Settings as SettingsIcon } from "lucide-react";
import { detectBrowser, type BrowserInfo } from "~/lib/browser";
import { StageBanner } from "./StageBanner";
import { RandomWheel } from "./RandomWheel";
import { Toolbar } from "./Toolbar";
import { PeoplePanel } from "./PeoplePanel";
import { ChatPanel } from "./ChatPanel";
import { InviteCode } from "./InviteCode";
import { StatusBar } from "./StatusBar";
import { SettingsDrawer } from "./SettingsDrawer";
import { SoundProfileModal } from "./SoundProfileModal";
import { RecordingModal } from "./RecordingModal";
import { playReactionSound } from "./ReactionBar";
import { WatchPlayer } from "./WatchPlayer";
import { WatchToolbar } from "./WatchToolbar";
import { VideoQueue } from "./VideoQueue";
import { AuthModal } from "./AuthModal";
import { AdminModal } from "./AdminModal";
import { Shield } from "lucide-react";

interface RoomViewProps {
  roomCode: string;
  playerName: string;
  onRename?: (newName: string) => void;
  onNameRejected?: (info: { name: string; suggestions: string[] }) => void;
}

export function RoomView({ roomCode, playerName, onRename, onNameRejected }: RoomViewProps) {
  const router = useRouter();
  const [browser] = useState<BrowserInfo>(() =>
    typeof window !== "undefined"
      ? detectBrowser()
      : { name: "Unknown", isChromium: true, canSing: true, isMobile: false }
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundProfileOpen, setSoundProfileOpen] = useState(false);
  // Per-mode noise cancellation state — independent of micMode
  // These control the constraints used during mic check and sharing
  const [talkingNC, setTalkingNC] = useState(true);   // ON by default for talking
  const [singingNC, setSingingNC] = useState(false);   // OFF by default for singing
  const [singerMutedAll, setSingerMutedAll] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const authAutoSubmittedRef = useRef(false);

  const {
    roomState,
    myPeerId,
    isConnected: isPartyConnected,
    joinQueue,
    leaveQueue,
    finishSinging,
    isMyTurn,
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
    nameTaken,
    clearNameTaken,
    chatMessages,
    participantStatus,
    reactions,
    sendModeSwitch,
    sendWatchQueueAdd,
    sendWatchQueueRemove,
    sendWatchSync,
    sendWatchSpeed,
    sendWatchSkip,
    sendWatchAdvance,
    watchSync,
    watchSpeed,
    kicked,
    authRequired,
    authFailed,
    sendKick,
    sendTransferAdmin,
    sendSetPassword,
    sendAuth,
  } = useRoomState({ roomCode, playerName });

  const isAdmin = myPeerId !== null && roomState.adminPeerId === myPeerId;

  const {
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId,
    setSelectedOutputId,
    micMode,
    setMicMode,
  } = useAudioDevices();

  const [sessionStartTime] = useState(() => Date.now());
  const [mobileSection, setMobileSection] = useState<"stage" | "chat" | "people">("stage");
  const [chatCollapsed, setChatCollapsed] = useState(false);
  // Default chat to collapsed in watch mode (video takes priority), expanded in karaoke
  const prevModeRef = useRef(roomState.roomMode);
  if (prevModeRef.current !== roomState.roomMode) {
    prevModeRef.current = roomState.roomMode;
    setChatCollapsed(roomState.roomMode === "watch");
  }

  const {
    room,
    isConnected: isLiveKitConnected,
    error: liveKitError,
    isMicEnabled,
    toggleMic,
    setMicMuted,
    micCheckState,
    startTalkingMicCheck,
    startSingingMicCheck,
    stopMicCheck,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    remoteParticipantCount,
    currentSong,
    activeSpeakers,
    setMixMicGain,
    setMixMusicGain,
    voiceEffect,
    setVoiceEffect,
    setEffectWetDry,
    mixMicStream,
    autoMix,
    autoMixDuckedValue,
    autoMixBoostedVoice,
    setAutoMix,
    recordingState,
    recordingDuration,
    recordingBlob,
    startRecording,
    stopRecording,
    clearRecording,
  } = useLiveKit({
    roomCode,
    playerName,
    isMyTurn,
    selectedInputDeviceId: selectedInputId,
    selectedOutputDeviceId: selectedOutputId,
    micMode,
    talkingNC,
    singingNC,
  });

  const isConnected = isPartyConnected && isLiveKitConnected;

  // Volume controls
  const [musicVolume, setMusicVolume] = useState(1);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [personVolumes, setPersonVolumes] = useState<Record<string, number>>({});

  // Collaborative mix values (synced via PartyKit: singer broadcasts to listeners, listeners send to singer)
  const [mixVoiceValue, setMixVoiceValue] = useState(100);
  const [mixMusicValue, setMixMusicValue] = useState(70);

  const applyAllVolumes = useCallback(() => {
    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      if (el.dataset.lkType === "music") {
        el.volume = musicVolume;
      } else {
        const identity = el.dataset.lkIdentity ?? "";
        const personVol = personVolumes[identity] ?? 1;
        el.volume = voiceVolume * personVol;
      }
    });
  }, [musicVolume, voiceVolume, personVolumes]);

  useEffect(() => { applyAllVolumes(); }, [applyAllVolumes]);

  // Ref-stable callback for MutationObserver — avoids re-registering on volume changes
  const applyVolumesRef = useRef(applyAllVolumes);
  applyVolumesRef.current = applyAllVolumes;

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLAudioElement && node.id?.startsWith("lk-audio-")) {
            applyVolumesRef.current();
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, []);

  const handlePersonVolumeChange = useCallback((identity: string, vol: number) => {
    setPersonVolumes((prev) => ({ ...prev, [identity]: vol }));
    // If this person is the current singer, also sync the music volume
    if (roomState.currentSingerId) {
      const singerStatus = participantStatus[roomState.currentSingerId];
      const singerIdentity = singerStatus?.lkIdentity ?? roomState.participants.find((p) => p.id === roomState.currentSingerId)?.name;
      if (singerIdentity && identity === singerIdentity) {
        setMusicVolume(vol);
      }
    }
  }, [roomState.currentSingerId, roomState.participants, participantStatus]);

  // Debounced broadcast of singer's local mix changes to listeners
  const mixBroadcastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMyTurnRef = useRef(isMyTurn);
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
    // Cancel pending broadcast if no longer singer
    if (!isMyTurn && mixBroadcastRef.current) {
      clearTimeout(mixBroadcastRef.current);
      mixBroadcastRef.current = null;
    }
  }, [isMyTurn]);

  const broadcastMix = useCallback((voice: number, music: number) => {
    if (mixBroadcastRef.current) clearTimeout(mixBroadcastRef.current);
    mixBroadcastRef.current = setTimeout(() => {
      if (isMyTurnRef.current) sendMixAdjust(voice, music);
      mixBroadcastRef.current = null;
    }, 150);
  }, [sendMixAdjust]);

  // Handle incoming collaborative mix adjustments
  useEffect(() => {
    if (!pendingMixAdjust) return;
    const { voice, music } = pendingMixAdjust;
    const voicePercent = Math.round(voice * 100);
    const musicPercent = Math.round(music * 100);

    if (isMyTurn) {
      // Singer receives listener's adjustment → apply to gain nodes
      setMixMicGain(voice);
      setMixMusicGain(music);
      setMixVoiceValue(voicePercent);
      setMixMusicValue(musicPercent);
      // Rebroadcast so all other listeners stay in sync
      broadcastMix(voice, music);
    } else {
      // Listener receives singer's broadcast → sync sliders only (no gain, no chat)
      setMixVoiceValue(voicePercent);
      setMixMusicValue(musicPercent);
    }
    clearPendingMixAdjust();
  }, [pendingMixAdjust, isMyTurn, setMixMicGain, setMixMusicGain, clearPendingMixAdjust, broadcastMix]);

  // Forward name-taken rejection to parent so it can show the name modal
  useEffect(() => {
    if (!nameTaken) return;
    onNameRejected?.(nameTaken);
    clearNameTaken(); // always clear to prevent re-firing
  }, [nameTaken, onNameRejected, clearNameTaken]);

  // LiveKit identity for status updates - must be before statusCtxRef
  const lkIdentity = room?.localParticipant?.identity ?? null;

  // Listen for manual song name from singer — ref-stable to avoid re-registration
  const statusCtxRef = useRef({ isMicEnabled, isSharing, browser, sendStatusUpdate, lkIdentity, autoMix });
  statusCtxRef.current = { isMicEnabled, isSharing, browser, sendStatusUpdate, lkIdentity, autoMix };

  useEffect(() => {
    const handler = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (!name) return;
      const { isMicEnabled: mic, isSharing: share, browser: b, sendStatusUpdate: send, lkIdentity: lkId, autoMix: am } = statusCtxRef.current;
      send({ isMuted: !mic, isSharingAudio: share, currentSong: name, browser: b.name + (b.isMobile ? " (Mobile)" : ""), lkIdentity: lkId ?? undefined, autoMix: am });
    };
    window.addEventListener("karaoke-set-song", handler);
    return () => window.removeEventListener("karaoke-set-song", handler);
  }, []);

  // Play sound when new reactions arrive
  const prevReactionCountRef = useRef(0);
  useEffect(() => {
    if (reactions.length > prevReactionCountRef.current && reactions.length > 0) {
      const latest = reactions[reactions.length - 1]!;
      playReactionSound(latest.emoji);
    }
    prevReactionCountRef.current = reactions.length;
  }, [reactions]);

  // Mute/unmute mic when singer sends mute-all
  // Snapshot pre-mute state so unmute only restores those who were unmuted before
  const wasMutedBySingerRef = useRef(false);
  const micWasOnBeforeMuteRef = useRef(false);
  useEffect(() => {
    if (mutedBySinger && !wasMutedBySingerRef.current) {
      wasMutedBySingerRef.current = true;
      micWasOnBeforeMuteRef.current = isMicEnabled;
      if (isMicEnabled) {
        // Use setMicMuted which handles both sharing (Web Audio mix) and non-sharing paths
        void setMicMuted(true);
      }
    }
    if (!mutedBySinger && wasMutedBySingerRef.current) {
      wasMutedBySingerRef.current = false;
      if (micWasOnBeforeMuteRef.current) {
        void setMicMuted(false);
      }
      micWasOnBeforeMuteRef.current = false;
    }
  }, [mutedBySinger, isMicEnabled, setMicMuted]);

  // Auto-switch to singing mode ONCE when becoming the singer
  const wasMyTurnRef = useRef(false);
  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      wasMyTurnRef.current = true;
      if (micMode === "voice") setMicMode("raw");
    }
    if (!isMyTurn && wasMyTurnRef.current) {
      wasMyTurnRef.current = false;
      if (singerMutedAll) setSingerMutedAll(false);
      // Switch back to talking mode when done singing
      if (micMode === "raw") setMicMode("voice");
    }
    if (!isMyTurn) wasMyTurnRef.current = false;
  }, [isMyTurn, micMode, setMicMode]);

  // Send status updates (includes LiveKit identity + auto-mix state)
  useEffect(() => {
    if (!isPartyConnected) return;
    sendStatusUpdate({
      isMuted: !isMicEnabled,
      isSharingAudio: isSharing,
      currentSong,
      browser: browser.name + (browser.isMobile ? " (Mobile)" : ""),
      lkIdentity: lkIdentity ?? undefined,
      autoMix,
    });
  }, [isMicEnabled, isSharing, currentSong, isPartyConnected, sendStatusUpdate, browser, lkIdentity, autoMix]);

  // Broadcast to room when quota is hit so existing users know
  const quotaBroadcastedRef = useRef(false);
  useEffect(() => {
    if (liveKitError?.includes("session limit") && !quotaBroadcastedRef.current && isPartyConnected) {
      quotaBroadcastedRef.current = true;
      sendChat("[System] This room's session quota has been reached. New people can't join. If you need more people, create a new room.");
    }
  }, [liveKitError, isPartyConnected, sendChat]);

  // Auto-submit password from sessionStorage (room creator flow)
  useEffect(() => {
    if (!authRequired || authAutoSubmittedRef.current) return;
    const stored = sessionStorage.getItem(`room-password-${roomCode}`);
    if (stored) {
      authAutoSubmittedRef.current = true;
      sendAuth(stored);
      sessionStorage.removeItem(`room-password-${roomCode}`);
    }
  }, [authRequired, roomCode, sendAuth]);

  // Set password after joining as room creator
  useEffect(() => {
    if (!isAdmin || authAutoSubmittedRef.current) return;
    const stored = sessionStorage.getItem(`room-password-${roomCode}`);
    if (stored) {
      sendSetPassword(stored);
      sessionStorage.removeItem(`room-password-${roomCode}`);
    }
  }, [isAdmin, roomCode, sendSetPassword]);

  // Kicked state - show banner and stop
  if (kicked) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-xl border p-6 text-center"
          style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
        >
          <p className="mb-2 text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-danger)" }}>
            You were kicked by {kicked}
          </p>
          <p className="mb-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
            You can no longer participate in this room.
          </p>
          <button
            onClick={() => router.push("/")}
            className="cursor-pointer rounded-lg px-6 py-2.5 text-xs font-bold transition-all hover:brightness-110"
            style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  // Auth required - show password modal
  if (authRequired) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4">
        <AuthModal onSubmit={sendAuth} authFailed={authFailed} />
      </main>
    );
  }

  return (
    <main data-mode={roomState.roomMode} className="relative flex h-dvh flex-col overflow-hidden">
      {/* Audio unlock prompt — dismisses on first click to satisfy autoplay policy */}
      <AudioUnlockOverlay />

      {/* Ambient background — driven by audio visualizer when someone sings */}
      <div
        id="ambient-bg"
        className="pointer-events-none fixed inset-0 transition-[background] duration-150"
        style={{
          background:
            roomState.roomMode === "watch"
              ? "radial-gradient(ellipse 45% 45% at 18% 78%, var(--color-accent-dim), transparent), radial-gradient(ellipse 35% 35% at 78% 22%, var(--color-accent-dim), transparent)"
              : "radial-gradient(ellipse 40% 40% at 20% 80%, var(--color-primary-dim), transparent), radial-gradient(ellipse 35% 35% at 80% 20%, var(--color-primary-dim), transparent)",
        }}
      />

      {/* Header */}
      <header
        className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b px-2 py-2 sm:px-3 lg:flex-nowrap lg:px-6 lg:py-3"
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <h1
            className="text-lg font-extrabold lg:text-xl"
            style={{
              fontFamily: "var(--font-display)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            KaraOK
          </h1>
          <div className="min-w-0">
            <InviteCode code={roomCode} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Mode toggle */}
          <div
            className="flex items-center rounded-full border p-1"
            style={{ borderColor: "var(--color-dark-border)", background: "rgba(9, 9, 11, 0.25)" }}
          >
            <button
              className="cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                fontFamily: "var(--font-display)",
                background: roomState.roomMode === "karaoke" ? "var(--color-primary-dim)" : "transparent",
                color: roomState.roomMode === "karaoke" ? "var(--color-primary)" : "var(--color-text-muted)",
              }}
              disabled={roomState.roomMode === "watch" && roomState.watchState === "playing"}
              title={roomState.roomMode === "watch" && roomState.watchState === "playing" ? "Pause/stop the video to switch modes" : "Karaoke Mode"}
              onClick={() => sendModeSwitch("karaoke")}
            >
              Karaoke
            </button>
            <button
              className="cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                fontFamily: "var(--font-display)",
                background: roomState.roomMode === "watch" ? "var(--color-primary-dim)" : "transparent",
                color: roomState.roomMode === "watch" ? "var(--color-primary)" : "var(--color-text-muted)",
              }}
              disabled={roomState.roomMode === "karaoke" && roomState.currentSingerId !== null}
              title={roomState.roomMode === "karaoke" && roomState.currentSingerId !== null ? "Wait for the stage to be empty to switch modes" : "Watch Mode"}
              onClick={() => sendModeSwitch("watch")}
            >
              Watch
            </button>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: isConnected ? "var(--color-success)" : "var(--color-accent)" }}
            />
            <span className="hidden sm:inline">
              {isConnected ? "Connected" : "Connecting..."}
            </span>
          </div>

          {/* Name */}
          <EditableName name={playerName} onRename={onRename} />

          {/* Admin settings */}
          {isAdmin && (
            <button
              onClick={() => setAdminModalOpen(true)}
              className="cursor-pointer rounded-lg border p-2 transition-all hover:border-[var(--color-primary)] hover:scale-105"
              style={{ borderColor: "var(--color-dark-border)", color: "var(--color-accent)" }}
              title="Room admin settings"
            >
              <Shield size={13} />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="cursor-pointer rounded-lg border p-2 transition-all hover:border-[var(--color-primary)] hover:scale-105"
            style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
            title="Settings"
          >
            <SettingsIcon size={13} />
          </button>

          {/* Leave */}
          <button
            onClick={() => router.push("/")}
            className="cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all hover:scale-105 active:scale-95 sm:px-3 sm:text-xs"
            style={{ fontFamily: "var(--font-display)", borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
          >
            Leave
          </button>
        </div>
      </header>

      {/* Error banner */}
      {liveKitError && liveKitError !== "Reconnecting..." && (
        <div
          className="relative z-10 mx-4 mt-2 rounded-lg px-4 py-3 text-xs lg:mx-6"
          style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
        >
          <p>{liveKitError}</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => router.push("/")}
              className="cursor-pointer rounded-md px-3 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
              style={{ background: "var(--color-danger)", color: "var(--color-text-primary)" }}
            >
              Create New Room
            </button>
            <button
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
              style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Muted by singer banner */}
      {mutedBySinger && (
        <div
          className="relative z-10 mx-4 mt-2 rounded-lg px-3 py-2 text-xs lg:mx-6"
          style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)" }}
        >
          {mutedBySinger} muted everyone&apos;s mic
        </div>
      )}

      {/* Browser warning */}
      {!browser.canSing && (
        <div
          className="relative z-10 mx-4 mt-2 rounded-lg px-3 py-2 text-xs lg:mx-6"
          style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)" }}
        >
          {browser.isMobile
            ? "Mobile detected — you can listen and chat, but singing requires a desktop Chromium browser."
            : `${browser.name} detected — singing requires a Chromium browser (Chrome, Edge, Brave, Arc...).`}
        </div>
      )}

      {/* Main content */}
      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2 pb-4 lg:flex-row lg:gap-4 lg:overflow-hidden lg:p-4"
      >
        {/* Mobile section switcher */}
        <div className="grid grid-cols-3 gap-1 rounded-lg border p-1 lg:hidden" style={{ borderColor: "var(--color-dark-border)", background: "var(--color-dark-surface)" }}>
          {[
            { key: "stage", label: "Stage" },
            { key: "chat", label: "Chat" },
            { key: "people", label: "People" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setMobileSection(item.key as "stage" | "chat" | "people")}
              className="rounded-md px-2 py-2 text-xs font-semibold transition-all"
              style={{
                fontFamily: "var(--font-display)",
                background: mobileSection === item.key ? "var(--color-primary-dim)" : "transparent",
                color: mobileSection === item.key ? "var(--color-primary)" : "var(--color-text-muted)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Left: Stage + Toolbar + Chat */}
        <div className={`min-h-0 flex-1 flex-col gap-2 lg:flex lg:min-w-0 lg:gap-3 ${mobileSection === "people" ? "hidden" : "flex"}`}>
          <div className={`flex-col gap-2 lg:flex lg:gap-3 ${roomState.roomMode === "watch" && roomState.watchCurrentVideoId ? "flex-1 min-h-0" : ""} ${mobileSection === "stage" ? "flex" : "hidden"}`}>
              {roomState.roomMode === "watch" ? (
                <>
                  <WatchPlayer
                    videoId={roomState.watchCurrentVideoId}
                    title={roomState.watchCurrentTitle}
                    isLeader={myPeerId !== null && roomState.watchLeaderId === myPeerId}
                    watchSync={watchSync}
                    watchSpeed={watchSpeed}
                    onSync={sendWatchSync}
                    onSpeedChange={sendWatchSpeed}
                    onAdvance={sendWatchAdvance}
                  />
                  <WatchToolbar
                    roomState={roomState}
                    myPeerId={myPeerId}
                    isMicEnabled={isMicEnabled}
                    toggleMic={toggleMic}
                    onSoundProfileOpen={() => setSoundProfileOpen(true)}
                    onQueueAdd={sendWatchQueueAdd}
                    onSkip={sendWatchSkip}
                  />
                </>
              ) : (
                <>
                  <StageBanner
                    room={room}
                    roomState={roomState}
                    isMyTurn={isMyTurn}
                    isSharing={isSharing}
                    onStartSharing={startSharing}
                    onStopSharing={stopSharing}
                    onFinishSinging={finishSinging}
                    audioError={sharingError}
                    singerSongName={
                      roomState.currentSingerId
                        ? participantStatus[roomState.currentSingerId]?.currentSong ?? null
                        : null
                    }
                    canSing={browser.canSing}
                    musicVolume={musicVolume}
                    onMusicVolumeChange={(vol: number) => {
                      setMusicVolume(vol);
                      if (roomState.currentSingerId) {
                        const singerStatus = participantStatus[roomState.currentSingerId];
                        const singerId = singerStatus?.lkIdentity ?? roomState.participants.find((p) => p.id === roomState.currentSingerId)?.name ?? "";
                        if (singerId) setPersonVolumes((prev) => ({ ...prev, [singerId]: vol }));
                      }
                    }}
                    onMixMicGain={(v) => { setMixMicGain(v); setMixVoiceValue(Math.round(v * 100)); broadcastMix(v, mixMusicValue / 100); }}
                    onMixMusicGain={(v) => { setMixMusicGain(v); setMixMusicValue(Math.round(v * 100)); broadcastMix(mixVoiceValue / 100, v); }}
                    mixVoiceValue={autoMixBoostedVoice ?? mixVoiceValue}
                    mixMusicValue={autoMixDuckedValue ?? mixMusicValue}
                    ambientId="ambient-bg"
                    ambientColor="violet"
                    onMuteAll={() => { sendMuteAll(); setSingerMutedAll(true); }}
                    onUnmuteAll={() => { sendUnmuteAll(); setSingerMutedAll(false); }}
                    isMutedAll={singerMutedAll}
                    singerAutoMix={roomState.currentSingerId ? participantStatus[roomState.currentSingerId]?.autoMix : false}
                    onMixAdjust={!isMyTurn ? sendMixAdjust : undefined}
                    onMixAdjustDone={!isMyTurn ? (voice, music) => {
                      sendChat(`adjusted mix - Voice ${Math.round(voice * 100)}%, Music ${Math.round(music * 100)}%`);
                    } : undefined}
                    autoMix={autoMix}
                    onAutoMixChange={isSharing ? (on) => { setAutoMix(on); sendChat(on ? "enabled Auto Mix" : "disabled Auto Mix"); } : undefined}
                    recordingState={recordingState}
                    recordingDuration={recordingDuration}
                    onStartRecording={startRecording}
                    onStopRecording={stopRecording}
                  />

                  <Toolbar
                    isMicEnabled={isMicEnabled}
                    toggleMic={toggleMic}
                    micMode={micMode}
                    onSoundProfileOpen={() => setSoundProfileOpen(true)}
                    onReact={sendReaction}
                  />
                </>
              )}
          </div>

          {/* Chat - gets the most space */}
          <div className={`lg:block lg:min-h-0 ${chatCollapsed ? "flex-none" : "flex-1 min-h-[200px]"} ${mobileSection === "chat" ? "block" : "hidden"}`}>
            <ChatPanel
              messages={chatMessages}
              onSend={sendChat}
              myPeerId={myPeerId}
              collapsed={chatCollapsed}
              onToggleCollapse={() => setChatCollapsed((c) => !c)}
            />
          </div>
        </div>

        {/* Right: People panel + Random Wheel */}
        <div className={`w-full flex-col gap-3 pb-1 lg:flex lg:w-72 lg:min-h-0 lg:overflow-auto lg:pb-0 ${mobileSection === "people" ? "flex" : "hidden"}`}>
          {roomState.roomMode === "watch" ? (
            <VideoQueue
              myPeerId={myPeerId}
              current={
                roomState.watchCurrentVideoId
                  ? {
                      videoId: roomState.watchCurrentVideoId,
                      title: roomState.watchCurrentTitle,
                      addedByName: roomState.watchCurrentAddedByName ?? null,
                    }
                  : null
              }
              queue={roomState.watchQueue}
              onRemove={sendWatchQueueRemove}
            />
          ) : null}
          <PeoplePanel
            roomState={roomState}
            myPeerId={myPeerId}
            onJoinQueue={joinQueue}
            onLeaveQueue={leaveQueue}
            onSetSongIntent={(song) => {
              sendStatusUpdate({
                isMuted: !isMicEnabled,
                isSharingAudio: isSharing,
                currentSong: song,
                browser: browser.name + (browser.isMobile ? " (Mobile)" : ""),
                lkIdentity: lkIdentity ?? undefined,
                autoMix,
              });
            }}
            canSing={browser.canSing}
            participantStatus={participantStatus}
            activeSpeakers={activeSpeakers}
            personVolumes={personVolumes}
            onPersonVolumeChange={handlePersonVolumeChange}
            onKick={isAdmin ? sendKick : undefined}
            onTransferAdmin={isAdmin ? sendTransferAdmin : undefined}
          />

          {roomState.roomMode !== "watch" ? (
            <div
              className="rounded-xl border p-3"
              style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
            >
              <div className="-mx-3 mb-2 border-b px-3 pb-2" style={{ borderColor: "var(--color-dark-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>
                  Get someone to sing
                </p>
              </div>
              <RandomWheel
                participants={roomState.participants}
                queue={roomState.queue}
                currentSingerId={roomState.currentSingerId}
                myName={playerName}
                onPick={(p) => {
                  if (p.id === myPeerId) joinQueue();
                  else addToQueue(p.id);
                  sendChat(`spun the wheel - ${p.name} is up next!`);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Floating reactions */}
      {reactions.length > 0 ? (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {reactions.map((r) => (
            <span
              key={r.id}
              className="absolute text-2xl"
              style={{
                left: `${r.left}%`,
                bottom: "10%",
                animation: "reaction-float 3s ease-out forwards",
              }}
            >
              {r.emoji}
            </span>
          ))}
        </div>
      ) : null}

      {/* Status bar */}
      <StatusBar
        room={room}
        isConnected={isConnected}
        isMicEnabled={isMicEnabled}
        isSharing={isSharing}
        remoteParticipantCount={remoteParticipantCount}
        sessionStartTime={sessionStartTime}
        mixMicStream={mixMicStream}
      />

      {/* Settings drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        voiceVolume={voiceVolume}
        onVoiceVolumeChange={setVoiceVolume}
      />

      {/* Sound Profile Modal */}
      <SoundProfileModal
        open={soundProfileOpen}
        onClose={() => setSoundProfileOpen(false)}
        micMode={micMode}
        onMicModeChange={setMicMode}
        voiceEffect={voiceEffect}
        onVoiceEffectChange={setVoiceEffect}
        onEffectWetDry={setEffectWetDry}
        talkingNoiseCancellation={talkingNC}
        onTalkingNoiseCancellationChange={setTalkingNC}
        singingNoiseCancellation={singingNC}
        onSingingNoiseCancellationChange={setSingingNC}

        inputDevices={inputDevices}
        outputDevices={outputDevices}
        selectedInputId={selectedInputId}
        selectedOutputId={selectedOutputId}
        onInputChange={setSelectedInputId}
        onOutputChange={setSelectedOutputId}
        onTalkingMicCheck={() => startTalkingMicCheck(talkingNC)}
        onSingingMicCheck={() => startSingingMicCheck(singingNC)}
        onStopMicCheck={stopMicCheck}
        micCheckState={micCheckState}
      />

      {/* Recording download modal */}
      {recordingBlob && recordingState === "stopped" && (
        <RecordingModal
          open
          blob={recordingBlob}
          duration={recordingDuration}
          songName={currentSong}
          onClose={clearRecording}
        />
      )}

      {/* Admin settings modal */}
      <AdminModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        isLocked={roomState.isLocked}
        onSetPassword={sendSetPassword}
      />
    </main>
  );
}

function EditableName({ name, onRename }: { name: string; onRename?: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!onRename) return null;

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(name); setEditing(true); }}
        className="flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all hover:border-[var(--color-primary)] hover:scale-105"
        style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        title="Click to change name"
      >
        {name}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      </button>
    );
  }

  const submit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value.slice(0, 20))}
      onBlur={submit}
      onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setEditing(false); }}
      className="w-24 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
      style={{ background: "var(--color-dark-card)", borderColor: "var(--color-primary)", color: "var(--color-text-primary)" }}
    />
  );
}

function AudioUnlockOverlay() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center"
      style={{ background: "rgba(9, 9, 11, 0.85)" }}
      onClick={() => setVisible(false)}
    >
      <div className="text-center" style={{ animation: "fade-in 0.3s ease-out" }}>
        <p
          className="text-xl font-bold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
        >
          Click to enter room
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          This enables audio playback
        </p>
      </div>
    </div>
  );
}
