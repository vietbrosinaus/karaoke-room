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
      // Read ground truth from LiveKit directly (not React state) to avoid race
      const micIsOn = room?.localParticipant?.isMicrophoneEnabled ?? false;
      micWasOnBeforeMuteRef.current = micIsOn;
      if (micIsOn && room?.localParticipant) {
        void room.localParticipant.setMicrophoneEnabled(false);
      }
    }
    if (!mutedBySinger && wasMutedBySingerRef.current) {
      wasMutedBySingerRef.current = false;
      // Only restore mic if it was on before the mute-all
      if (micWasOnBeforeMuteRef.current && room?.localParticipant) {
        void room.localParticipant.setMicrophoneEnabled(true);
      }
      micWasOnBeforeMuteRef.current = false;
    }
  }, [mutedBySinger, room]);

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

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      {/* Audio unlock prompt — dismisses on first click to satisfy autoplay policy */}
      <AudioUnlockOverlay />

      {/* Ambient background — driven by audio visualizer when someone sings */}
      <div
        id="ambient-bg"
        className="pointer-events-none fixed inset-0 transition-[background] duration-150"
        style={{ background: "radial-gradient(ellipse 40% 40% at 20% 80%, rgba(139, 92, 246, 0.03), transparent), radial-gradient(ellipse 35% 35% at 80% 20%, rgba(245, 158, 11, 0.02), transparent)" }}
      />

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between border-b px-3 py-2 lg:px-6 lg:py-3"
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
            <SettingsIcon size={14} />
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
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-4 lg:p-4">
        {/* Left: Stage + Toolbar + Chat */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:gap-3">
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
              // Sync per-person volume for the singer too
              if (roomState.currentSingerId) {
                const singerStatus = participantStatus[roomState.currentSingerId];
                const singerId = singerStatus?.lkIdentity ?? roomState.participants.find((p) => p.id === roomState.currentSingerId)?.name ?? "";
                if (singerId) setPersonVolumes((prev) => ({ ...prev, [singerId]: vol }));
              }
            }}
            onMixMicGain={(v) => { setMixMicGain(v); setMixVoiceValue(Math.round(v * 100)); broadcastMix(v, mixMusicValue / 100); }}
            onMixMusicGain={(v) => { setMixMusicGain(v); setMixMusicValue(Math.round(v * 100)); broadcastMix(mixVoiceValue / 100, v); }}
            mixVoiceValue={mixVoiceValue}
            mixMusicValue={mixMusicValue}
            ambientId="ambient-bg"
            onMuteAll={() => { sendMuteAll(); setSingerMutedAll(true); }}
            onUnmuteAll={() => { sendUnmuteAll(); setSingerMutedAll(false); }}
            isMutedAll={singerMutedAll}
            singerAutoMix={roomState.currentSingerId ? participantStatus[roomState.currentSingerId]?.autoMix : false}
            onMixAdjust={!isMyTurn ? sendMixAdjust : undefined}
            onMixAdjustDone={!isMyTurn ? (voice, music) => {
              sendChat(`adjusted mix — Voice ${Math.round(voice * 100)}%, Music ${Math.round(music * 100)}%`);
            } : undefined}
            autoMix={autoMix}
            onAutoMixChange={(on) => { setAutoMix(on); sendChat(on ? "enabled Auto Mix" : "disabled Auto Mix"); }}
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

          {/* Chat — gets the most space */}
          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={chatMessages}
              onSend={sendChat}
              myPeerId={myPeerId}
            />
          </div>
        </div>

        {/* Right: People panel + Random Wheel */}
        <div className="flex w-full flex-col gap-3 lg:w-72 lg:min-h-0 lg:overflow-auto">
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
          />

          {/* Random Wheel — fills remaining space in sidebar */}
          <div
            className="rounded-xl border p-3"
            style={{ background: "var(--color-dark-surface)", borderColor: "var(--color-dark-border)" }}
          >
            <RandomWheel
              participants={roomState.participants}
              queue={roomState.queue}
              currentSingerId={roomState.currentSingerId}
              myName={playerName}
              onPick={(p) => {
              if (p.id === myPeerId) joinQueue();
              else addToQueue(p.id);
              sendChat(`spun the wheel — ${p.name} is up next!`);
            }}
            />
          </div>
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
