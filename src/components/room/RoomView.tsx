"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRoomState } from "~/hooks/useRoomState";
import { useLiveKit } from "~/hooks/useLiveKit";
import { useAudioDevices } from "~/hooks/useAudioDevices";
import { detectBrowser, type BrowserInfo } from "~/lib/browser";
import { useAudioLevel } from "~/hooks/useAudioLevel";
import { StageBanner } from "./StageBanner";
import { Toolbar } from "./Toolbar";
import { PeoplePanel } from "./PeoplePanel";
import { ChatPanel } from "./ChatPanel";
import { InviteCode } from "./InviteCode";
import { StatusBar } from "./StatusBar";
import { SettingsDrawer } from "./SettingsDrawer";
import { playReactionSound } from "./ReactionBar";

interface RoomViewProps {
  roomCode: string;
  playerName: string;
  onRename?: (newName: string) => void;
}

export function RoomView({ roomCode, playerName, onRename }: RoomViewProps) {
  const router = useRouter();
  const [browser, setBrowser] = useState<BrowserInfo>({ name: "Unknown", isChromium: true, canSing: true, isMobile: false });
  useEffect(() => { setBrowser(detectBrowser()); }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);

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
    setMixMicGain,
    setMixMusicGain,
  } = useLiveKit({
    roomCode,
    playerName,
    isMyTurn,
    selectedInputDeviceId: selectedInputId,
    selectedOutputDeviceId: selectedOutputId,
    micMode,
  });

  const { inboundLevel } = useAudioLevel(room);

  const isConnected = isPartyConnected && isLiveKitConnected;

  // Volume controls
  const [musicVolume, setMusicVolume] = useState(1);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [personVolumes, setPersonVolumes] = useState<Record<string, number>>({});

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

  const handlePersonVolumeChange = useCallback((identity: string, vol: number) => {
    setPersonVolumes((prev) => ({ ...prev, [identity]: vol }));
    // If this person is the current singer, also sync the music volume
    // (since music + voice are mixed into one stream tagged as "music")
    if (roomState.currentSingerId) {
      const singer = roomState.participants.find((p) => p.id === roomState.currentSingerId);
      if (singer && (identity.startsWith(singer.name + "-") || identity === singer.name)) {
        setMusicVolume(vol);
      }
    }
  }, [roomState.currentSingerId, roomState.participants]);

  // Listen for manual song name from singer
  useEffect(() => {
    const handler = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name) {
        sendStatusUpdate({
          isMuted: !isMicEnabled,
          isSharingAudio: isSharing,
          currentSong: name,
          browser: browser.name + (browser.isMobile ? " (Mobile)" : ""),
        });
      }
    };
    window.addEventListener("karaoke-set-song", handler);
    return () => window.removeEventListener("karaoke-set-song", handler);
  }, [isMicEnabled, isSharing, browser, sendStatusUpdate]);

  // Play sound when new reactions arrive
  const prevReactionCountRef = useRef(0);
  useEffect(() => {
    if (reactions.length > prevReactionCountRef.current && reactions.length > 0) {
      const latest = reactions[reactions.length - 1]!;
      playReactionSound(latest.emoji);
    }
    prevReactionCountRef.current = reactions.length;
  }, [reactions]);

  // Send status updates
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
      {/* Audio unlock prompt — dismisses on first click to satisfy autoplay policy */}
      <AudioUnlockOverlay />

      {/* Ambient background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{ background: "radial-gradient(ellipse at 20% 50%, var(--color-primary), transparent 50%), radial-gradient(ellipse at 80% 50%, var(--color-accent), transparent 50%)" }}
      />

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between border-b px-4 py-3 lg:px-6"
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <div className="flex items-center gap-3">
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
          <InviteCode code={roomCode} />
        </div>

        <div className="flex items-center gap-2">
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

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="cursor-pointer rounded-lg border p-2 transition-all hover:border-[var(--color-primary)] hover:scale-105"
            style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* Leave */}
          <button
            onClick={() => router.push("/")}
            className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:scale-105 active:scale-95"
            style={{ fontFamily: "var(--font-display)", borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
          >
            Leave
          </button>
        </div>
      </header>

      {/* Error banner */}
      {liveKitError && liveKitError !== "Reconnecting..." && (
        <div
          className="relative z-10 mx-4 mt-2 rounded-lg px-3 py-2 text-xs lg:mx-6"
          style={{ background: "var(--color-danger-dim)", color: "var(--color-danger)" }}
        >
          {liveKitError}
        </div>
      )}

      {/* Browser warning */}
      {!browser.canSing && (
        <div
          className="relative z-10 mx-4 mt-2 rounded-lg px-3 py-2 text-xs lg:mx-6"
          style={{ background: "var(--color-accent-dim)", color: "var(--color-accent)" }}
        >
          {browser.isMobile
            ? "Mobile detected — you can listen and chat, but singing requires desktop Chrome/Edge."
            : `${browser.name} detected — singing works best on Chrome or Edge.`}
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row lg:gap-4 lg:p-4">
        {/* Left: Stage + Toolbar + Chat */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <StageBanner
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
            audioLevel={inboundLevel}
            musicVolume={musicVolume}
            onMusicVolumeChange={(vol: number) => {
              setMusicVolume(vol);
              // Sync per-person volume for the singer too
              if (roomState.currentSingerId) {
                const singer = roomState.participants.find((p) => p.id === roomState.currentSingerId);
                if (singer) {
                  const el = document.querySelector<HTMLAudioElement>(
                    `audio[data-lk-identity^="${CSS.escape(singer.name)}-"]`
                  );
                  const id = el?.dataset.lkIdentity ?? singer.name;
                  setPersonVolumes((prev) => ({ ...prev, [id]: vol }));
                }
              }
            }}
            onMixMicGain={setMixMicGain}
            onMixMusicGain={setMixMusicGain}
          />

          <Toolbar
            isMicEnabled={isMicEnabled}
            toggleMic={toggleMic}
            micMode={micMode}
            onMicModeChange={setMicMode}
            micCheckState={micCheckState}
            onMicCheck={startMicCheck}
            onReact={sendReaction}
            isMixActive={!!isSharing}
          />

          {/* Chat — gets the most space */}
          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={chatMessages}
              onSend={sendChat}
              myPeerId={myPeerId}
            />
          </div>
        </div>

        {/* Right: People panel */}
        <div className="flex w-full flex-col lg:w-72">
          <PeoplePanel
            roomState={roomState}
            myPeerId={myPeerId}
            onJoinQueue={joinQueue}
            onLeaveQueue={leaveQueue}
            onSetSongIntent={(song) => {
              // Broadcast song intent via status update
              sendStatusUpdate({
                isMuted: !isMicEnabled,
                isSharingAudio: isSharing,
                currentSong: song,
                browser: browser.name + (browser.isMobile ? " (Mobile)" : ""),
              });
            }}
            canSing={browser.canSing}
            participantStatus={participantStatus}
            activeSpeakers={activeSpeakers}
            personVolumes={personVolumes}
            onPersonVolumeChange={handlePersonVolumeChange}
          />
        </div>
      </div>

      {/* Floating reactions */}
      {reactions.length > 0 && (
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
      )}

      {/* Status bar */}
      <StatusBar
        room={room}
        isConnected={isConnected}
        isMicEnabled={isMicEnabled}
        isSharing={isSharing}
        remoteParticipantCount={remoteParticipantCount}
        sessionStartTime={sessionStartTime}
      />

      {/* Settings drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        voiceVolume={voiceVolume}
        onVoiceVolumeChange={setVoiceVolume}
        inputDevices={inputDevices}
        outputDevices={outputDevices}
        selectedInputId={selectedInputId}
        selectedOutputId={selectedOutputId}
        onInputChange={setSelectedInputId}
        onOutputChange={setSelectedOutputId}
        micMode={micMode}
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
