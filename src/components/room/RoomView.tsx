"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRoomState } from "~/hooks/useRoomState";
import { useLiveKit } from "~/hooks/useLiveKit";
import { useAudioDevices } from "~/hooks/useAudioDevices";
import { detectBrowser, type BrowserInfo } from "~/lib/browser";
import { QueuePanel } from "./QueuePanel";
import { AudioControls } from "./AudioControls";
import { ParticipantList } from "./ParticipantList";
import { NowSinging } from "./NowSinging";
import { InviteCode } from "./InviteCode";
import { StatusBar } from "./StatusBar";
import { ChatPanel } from "./ChatPanel";
import { ReactionBar } from "./ReactionBar";

interface RoomViewProps {
  roomCode: string;
  playerName: string;
  onRename?: (newName: string) => void;
}

export function RoomView({ roomCode, playerName, onRename }: RoomViewProps) {
  const router = useRouter();
  const [browser, setBrowser] = useState<BrowserInfo>({ name: "Unknown", isChromium: true, canSing: true, isMobile: false });
  useEffect(() => { setBrowser(detectBrowser()); }, []);

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
    chatMessages,
    participantStatus,
    reactions,
  } = useRoomState({ roomCode, playerName });

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

  const {
    room,
    isConnected: isLiveKitConnected,
    error: liveKitError,
    isMicEnabled,
    toggleMic,
    micCheckState,
    startMicCheck,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    remoteParticipantCount,
    currentSong,
    activeSpeakers,
  } = useLiveKit({
    roomCode,
    playerName,
    isMyTurn,
    selectedInputDeviceId: selectedInputId,
    selectedOutputDeviceId: selectedOutputId,
    micMode,
  });

  const isConnected = isPartyConnected && isLiveKitConnected;

  // Volume controls
  const [musicVolume, setMusicVolume] = useState(1);    // music (system audio)
  const [voiceVolume, setVoiceVolume] = useState(1);    // all voices (master)
  const [personVolumes, setPersonVolumes] = useState<Record<string, number>>({}); // per-person

  // Apply volumes to all audio elements
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

  const handleMusicVolumeChange = useCallback((vol: number) => {
    setMusicVolume(vol);
  }, []);

  const handleVoiceVolumeChange = useCallback((vol: number) => {
    setVoiceVolume(vol);
  }, []);

  const handlePersonVolumeChange = useCallback((identity: string, vol: number) => {
    setPersonVolumes((prev) => ({ ...prev, [identity]: vol }));
  }, []);

  // Re-apply whenever any volume changes
  useEffect(() => {
    applyAllVolumes();
  }, [applyAllVolumes]);

  // Apply correct volume to new remote audio elements as they appear
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLAudioElement && node.id?.startsWith("lk-audio-")) {
            applyAllVolumes();
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [applyAllVolumes]);

  // Send status updates when mic/sharing/song changes
  useEffect(() => {
    if (!isPartyConnected) return;
    sendStatusUpdate({
      isMuted: !isMicEnabled,
      isSharingAudio: isSharing,
      currentSong,
      browser: browser.name + (browser.isMobile ? " (Mobile)" : ""),
    });
  }, [isMicEnabled, isSharing, currentSong, isPartyConnected, sendStatusUpdate, browser]);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      {/* Subtle ambient background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, var(--color-primary), transparent 50%), radial-gradient(ellipse at 80% 50%, var(--color-accent), transparent 50%)",
        }}
      />

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <div className="flex items-center gap-4">
          <h1
            className="text-2xl font-extrabold"
            style={{
              fontFamily: "var(--font-display)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            KaraOK
          </h1>
          <InviteCode code={roomCode} />
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: isConnected
                  ? "var(--color-success)"
                  : "var(--color-accent)",
              }}
            />
            {isConnected
              ? "Connected"
              : isLiveKitConnected
                ? "Connecting to room..."
                : "Connecting to audio..."}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>as</span>
            <EditableName name={playerName} onRename={onRename} />
          </div>
          <button
            onClick={() => router.push("/")}
            className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              fontFamily: "var(--font-display)",
              borderColor: "var(--color-dark-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            Leave
          </button>
        </div>
      </header>

      {/* Error banner */}
      {liveKitError && (
        <div
          className="relative z-10 mx-6 mt-4 rounded-lg px-4 py-2 text-sm"
          style={{
            background: "var(--color-danger-dim)",
            color: "var(--color-danger)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
          }}
        >
          {liveKitError}
        </div>
      )}

      {/* Browser warning */}
      {!browser.canSing && (
        <div
          className="relative z-10 mx-6 mt-4 rounded-lg px-4 py-2.5 text-sm"
          style={{
            background: "var(--color-accent-dim)",
            color: "var(--color-accent)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
          }}
        >
          {browser.isMobile
            ? "📱 Mobile detected — you can listen and chat, but singing (audio sharing) requires a desktop Chromium browser."
            : `⚠ ${browser.name} detected — singing (audio sharing) works best on Chrome or Edge. You can still listen and chat!`}
        </div>
      )}

      {/* Main content — scrolls between fixed header and footer */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6 lg:flex-row">
        {/* Left: Stage area */}
        <div className="flex flex-1 flex-col gap-6">
          <NowSinging
            roomState={roomState}
            isMyTurn={isMyTurn}
            myPeerId={myPeerId}
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
            musicVolume={musicVolume}
            onMusicVolumeChange={handleMusicVolumeChange}
          />

          <ReactionBar
            reactions={reactions}
            onReact={sendReaction}
          />

          <AudioControls
            isMicEnabled={isMicEnabled}
            toggleMic={toggleMic}
            micCheckState={micCheckState}
            onMicCheck={startMicCheck}
            inputDevices={inputDevices}
            outputDevices={outputDevices}
            selectedInputId={selectedInputId}
            selectedOutputId={selectedOutputId}
            onInputChange={setSelectedInputId}
            onOutputChange={setSelectedOutputId}
            micMode={micMode}
            onMicModeChange={setMicMode}
            voiceVolume={voiceVolume}
            onVoiceVolumeChange={handleVoiceVolumeChange}
          />
        </div>

        {/* Right: Sidebar */}
        <div className="flex w-full flex-col gap-6 lg:w-80">
          <QueuePanel
            roomState={roomState}
            myPeerId={myPeerId}
            onJoinQueue={joinQueue}
            onLeaveQueue={leaveQueue}
            canSing={browser.canSing}
          />
          <ParticipantList
            participants={roomState.participants}
            currentSingerId={roomState.currentSingerId}
            myPeerId={myPeerId}
            participantStatus={participantStatus}
            activeSpeakers={activeSpeakers}
            personVolumes={personVolumes}
            onPersonVolumeChange={handlePersonVolumeChange}
          />
          <ChatPanel
            messages={chatMessages}
            onSend={sendChat}
            myPeerId={myPeerId}
          />
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        room={room}
        isConnected={isConnected}
        isMicEnabled={isMicEnabled}
        isSharing={isSharing}
        remoteParticipantCount={remoteParticipantCount}
        sessionStartTime={sessionStartTime}
      />
    </main>
  );
}

function EditableName({ name, onRename }: { name: string; onRename?: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!onRename) {
    return (
      <span
        className="rounded-lg border px-3 py-1.5 text-xs font-medium"
        style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
      >
        {name}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(name); setEditing(true); }}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:border-[var(--color-primary)] hover:scale-105 active:scale-95"
        style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        title="Click to change your name"
      >
        {name}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </button>
    );
  }

  const submit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value.slice(0, 20))}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-28 rounded-lg border px-3 py-1.5 text-xs font-medium outline-none"
      style={{
        background: "var(--color-dark-card)",
        borderColor: "var(--color-primary)",
        color: "var(--color-text-primary)",
      }}
    />
  );
}
