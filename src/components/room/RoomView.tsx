"use client";

import { useCallback, useEffect, useState } from "react";
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
}

export function RoomView({ roomCode, playerName }: RoomViewProps) {
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
    isMonitoring,
    toggleMonitor,
    isSharing,
    startSharing,
    stopSharing,
    sharingError,
    remoteParticipantCount,
    currentSong,
  } = useLiveKit({
    roomCode,
    playerName,
    isMyTurn,
    selectedInputDeviceId: selectedInputId,
    selectedOutputDeviceId: selectedOutputId,
    micMode,
  });

  const isConnected = isPartyConnected && isLiveKitConnected;

  // Separate volume controls: music (singer's system audio) vs voices (mics)
  const [musicVolume, setMusicVolume] = useState(1);
  const [voiceVolume, setVoiceVolume] = useState(1);

  const applyVolumes = useCallback((music: number, voice: number) => {
    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      el.volume = el.dataset.lkType === "music" ? music : voice;
    });
  }, []);

  const handleMusicVolumeChange = useCallback((vol: number) => {
    setMusicVolume(vol);
    applyVolumes(vol, voiceVolume);
  }, [voiceVolume, applyVolumes]);

  const handleVoiceVolumeChange = useCallback((vol: number) => {
    setVoiceVolume(vol);
    applyVolumes(musicVolume, vol);
  }, [musicVolume, applyVolumes]);

  // Apply correct volume to new remote audio elements as they appear
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLAudioElement && node.id?.startsWith("lk-audio-")) {
            node.volume = node.dataset.lkType === "music" ? musicVolume : voiceVolume;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [musicVolume, voiceVolume]);

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
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-10"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, var(--color-neon-pink), transparent 50%), radial-gradient(ellipse at 80% 50%, var(--color-neon-cyan), transparent 50%)",
        }}
      />

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <div className="flex items-center gap-4">
          <h1
            className="text-2xl font-bold"
            style={{
              fontFamily: "var(--font-display)",
              background:
                "linear-gradient(135deg, var(--color-neon-pink), var(--color-neon-cyan))",
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
                  ? "var(--color-neon-cyan)"
                  : "var(--color-neon-pink)",
                boxShadow: isConnected
                  ? "0 0 8px var(--color-neon-cyan)"
                  : "0 0 8px var(--color-neon-pink)",
              }}
            />
            {isConnected
              ? "Connected"
              : isLiveKitConnected
                ? "Connecting to room..."
                : "Connecting to audio..."}
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
            background: "rgba(255, 45, 120, 0.1)",
            color: "var(--color-neon-pink)",
            border: "1px solid rgba(255, 45, 120, 0.3)",
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
            background: "rgba(255, 225, 86, 0.1)",
            color: "var(--color-neon-yellow)",
            border: "1px solid rgba(255, 225, 86, 0.25)",
          }}
        >
          {browser.isMobile
            ? "📱 Mobile detected — you can listen and chat, but singing (audio sharing) requires a desktop Chromium browser."
            : `⚠ ${browser.name} detected — singing (audio sharing) works best on Chrome or Edge. You can still listen and chat!`}
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col gap-6 p-6 lg:flex-row">
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
          />

          <ReactionBar
            reactions={reactions}
            onReact={sendReaction}
          />

          <AudioControls
            isMicEnabled={isMicEnabled}
            toggleMic={toggleMic}
            isMonitoring={isMonitoring}
            toggleMonitor={toggleMonitor}
            inputDevices={inputDevices}
            outputDevices={outputDevices}
            selectedInputId={selectedInputId}
            selectedOutputId={selectedOutputId}
            onInputChange={setSelectedInputId}
            onOutputChange={setSelectedOutputId}
            micMode={micMode}
            onMicModeChange={setMicMode}
            musicVolume={musicVolume}
            onMusicVolumeChange={handleMusicVolumeChange}
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
