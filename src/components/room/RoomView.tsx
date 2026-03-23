"use client";

import { useState } from "react";
import { useRoomState } from "~/hooks/useRoomState";
import { useLiveKit } from "~/hooks/useLiveKit";
import { useAudioDevices } from "~/hooks/useAudioDevices";
import { QueuePanel } from "./QueuePanel";
import { AudioControls } from "./AudioControls";
import { ParticipantList } from "./ParticipantList";
import { NowSinging } from "./NowSinging";
import { InviteCode } from "./InviteCode";
import { StatusBar } from "./StatusBar";

interface RoomViewProps {
  roomCode: string;
  playerName: string;
}

export function RoomView({ roomCode, playerName }: RoomViewProps) {
  const {
    roomState,
    myPeerId,
    isConnected: isPartyConnected,
    joinQueue,
    leaveQueue,
    finishSinging,
    isMyTurn,
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
  } = useLiveKit({
    roomCode,
    playerName,
    isMyTurn,
    selectedInputDeviceId: selectedInputId,
    selectedOutputDeviceId: selectedOutputId,
    micMode,
  });

  const isConnected = isPartyConnected && isLiveKitConnected;

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
          />
        </div>

        {/* Right: Sidebar */}
        <div className="flex w-full flex-col gap-6 lg:w-80">
          <QueuePanel
            roomState={roomState}
            myPeerId={myPeerId}
            onJoinQueue={joinQueue}
            onLeaveQueue={leaveQueue}
          />
          <ParticipantList
            participants={roomState.participants}
            currentSingerId={roomState.currentSingerId}
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
