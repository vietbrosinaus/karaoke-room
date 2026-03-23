"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPeerConnection, setOpusHighBitrate } from "~/lib/webrtc";
import type { ClientMessage, ServerMessage, SignalPayload } from "~/types/room";

interface PeerEntry {
  pc: RTCPeerConnection;
  name: string;
  sysAudioSender: RTCRtpSender | null;
}

interface UseWebRTCParams {
  myPeerId: string | null;
  send: (msg: ClientMessage) => void;
  micStream: MediaStream | null;
  systemAudioTrack: MediaStreamTrack | null;
  isMyTurn: boolean;
}

interface UseWebRTCReturn {
  remoteStreams: Map<string, MediaStream>;
  handleServerMessage: (msg: ServerMessage) => void;
  peerCount: number;
}

export function useWebRTC({
  myPeerId,
  send,
  micStream,
  systemAudioTrack,
  isMyTurn,
}: UseWebRTCParams): UseWebRTCReturn {
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map(),
  );
  const [peerCount, setPeerCount] = useState(0);

  // Keep refs for values needed in callbacks
  const myPeerIdRef = useRef(myPeerId);
  const sendRef = useRef(send);
  const micStreamRef = useRef(micStream);
  const systemAudioTrackRef = useRef(systemAudioTrack);
  const isMyTurnRef = useRef(isMyTurn);

  useEffect(() => {
    myPeerIdRef.current = myPeerId;
  }, [myPeerId]);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    micStreamRef.current = micStream;
  }, [micStream]);
  useEffect(() => {
    systemAudioTrackRef.current = systemAudioTrack;
  }, [systemAudioTrack]);
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  const sendSignal = useCallback((to: string, payload: SignalPayload) => {
    sendRef.current({ type: "signal", to, payload });
  }, []);

  const addMicTrackToConnection = useCallback(
    (pc: RTCPeerConnection) => {
      const stream = micStreamRef.current;
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          pc.addTrack(audioTrack, stream);
        }
      }
    },
    [],
  );

  const setupPeerConnection = useCallback(
    (peerId: string, peerName: string): RTCPeerConnection => {
      const pc = createPeerConnection();

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(peerId, {
            kind: "ice-candidate",
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(peerId, stream);
          return next;
        });
      };

      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          offer.sdp = offer.sdp ? setOpusHighBitrate(offer.sdp) : offer.sdp;
          await pc.setLocalDescription(offer);
          if (pc.localDescription?.sdp) {
            sendSignal(peerId, {
              kind: "offer",
              sdp: pc.localDescription.sdp,
            });
          }
        } catch (err) {
          console.error("Negotiation error:", err);
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          console.warn(`Connection to ${peerId} ${pc.connectionState}`);
        }
      };

      peersRef.current.set(peerId, { pc, name: peerName, sysAudioSender: null });
      setPeerCount(peersRef.current.size);

      return pc;
    },
    [sendSignal],
  );

  const removePeer = useCallback((peerId: string) => {
    const entry = peersRef.current.get(peerId);
    if (entry) {
      entry.pc.close();
      peersRef.current.delete(peerId);
      setPeerCount(peersRef.current.size);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    }
  }, []);

  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      const myId = myPeerIdRef.current;
      if (!myId) return;

      switch (msg.type) {
        case "peer-joined": {
          // Lexicographic comparison: higher ID initiates
          if (myId > msg.peerId) {
            const pc = setupPeerConnection(msg.peerId, msg.name);
            addMicTrackToConnection(pc);
            // Explicitly create offer — onnegotiationneeded may not fire if no tracks added
            void (async () => {
              try {
                const offer = await pc.createOffer();
                offer.sdp = offer.sdp ? setOpusHighBitrate(offer.sdp) : offer.sdp;
                await pc.setLocalDescription(offer);
                if (pc.localDescription?.sdp) {
                  sendSignal(msg.peerId, {
                    kind: "offer",
                    sdp: pc.localDescription.sdp,
                  });
                }
              } catch (err) {
                console.error("Error creating initial offer:", err);
              }
            })();
          }
          break;
        }

        case "signal": {
          const { from, payload } = msg;

          if (payload.kind === "offer") {
            // Create connection for this peer if we don't have one
            let entry = peersRef.current.get(from);
            if (!entry) {
              const pc = setupPeerConnection(from, "");
              addMicTrackToConnection(pc);
              entry = peersRef.current.get(from)!;
            }

            const { pc } = entry;
            void (async () => {
              try {
                await pc.setRemoteDescription(
                  new RTCSessionDescription({ type: "offer", sdp: payload.sdp }),
                );
                const answer = await pc.createAnswer();
                answer.sdp = answer.sdp
                  ? setOpusHighBitrate(answer.sdp)
                  : answer.sdp;
                await pc.setLocalDescription(answer);
                if (pc.localDescription?.sdp) {
                  sendSignal(from, {
                    kind: "answer",
                    sdp: pc.localDescription.sdp,
                  });
                }
              } catch (err) {
                console.error("Error handling offer:", err);
              }
            })();
            break;
          }

          if (payload.kind === "answer") {
            const entry = peersRef.current.get(from);
            if (entry) {
              void entry.pc
                .setRemoteDescription(
                  new RTCSessionDescription({
                    type: "answer",
                    sdp: payload.sdp,
                  }),
                )
                .catch((err: unknown) =>
                  console.error("Error setting answer:", err),
                );
            }
            break;
          }

          if (payload.kind === "ice-candidate") {
            const entry = peersRef.current.get(from);
            if (entry) {
              void entry.pc
                .addIceCandidate(new RTCIceCandidate(payload.candidate))
                .catch((err: unknown) =>
                  console.error("Error adding ICE candidate:", err),
                );
            }
            break;
          }

          break;
        }

        case "peer-left": {
          removePeer(msg.peerId);
          break;
        }

        default:
          break;
      }
    },
    [setupPeerConnection, addMicTrackToConnection, removePeer, sendSignal],
  );

  // When micStream changes, add or replace mic track on all connections
  useEffect(() => {
    const newTrack = micStream?.getAudioTracks()[0] ?? null;

    for (const [, { pc }] of peersRef.current) {
      // Find existing mic sender (not the system audio track)
      const micSender = pc
        .getSenders()
        .find(
          (s) =>
            s.track?.kind === "audio" &&
            s.track !== systemAudioTrackRef.current,
        );

      if (micSender && newTrack) {
        void micSender.replaceTrack(newTrack).catch((err: unknown) => {
          console.error("Error replacing mic track:", err);
        });
      } else if (!micSender && newTrack && micStream) {
        // No existing sender — add the track (triggers renegotiation)
        pc.addTrack(newTrack, micStream);
      } else if (micSender && !newTrack) {
        // Mic disconnected — remove the sender
        pc.removeTrack(micSender);
      }
    }
  }, [micStream]);

  // When systemAudioTrack or isMyTurn changes, add/remove system audio
  useEffect(() => {
    for (const [, entry] of peersRef.current) {
      const { pc } = entry;

      if (isMyTurn && systemAudioTrack) {
        if (entry.sysAudioSender) {
          // Replace existing system audio track
          void entry.sysAudioSender
            .replaceTrack(systemAudioTrack)
            .catch((err: unknown) =>
              console.error("Error replacing system audio track:", err),
            );
        } else {
          // Add new system audio track — create a stream wrapper for it
          const sysStream = new MediaStream([systemAudioTrack]);
          const sender = pc.addTrack(systemAudioTrack, sysStream);
          entry.sysAudioSender = sender;
          // onnegotiationneeded will fire automatically
        }
      } else if (entry.sysAudioSender) {
        // Remove system audio sender
        pc.removeTrack(entry.sysAudioSender);
        entry.sysAudioSender = null;
        // onnegotiationneeded will fire automatically
      }
    }
  }, [systemAudioTrack, isMyTurn]);

  // Clean up all connections on unmount
  useEffect(() => {
    return () => {
      for (const [, { pc }] of peersRef.current) {
        pc.close();
      }
      peersRef.current.clear();
    };
  }, []);

  return { remoteStreams, handleServerMessage, peerCount };
}
