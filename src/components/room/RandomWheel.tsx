"use client";

import { useState, useRef } from "react";
import { ChevronDown } from "lucide-react";
import type { Participant } from "~/types/room";

interface RandomWheelProps {
  participants: Participant[];
  queue: string[];
  currentSingerId: string | null;
  myName?: string;
  onPick: (participant: Participant) => void;
}

export function RandomWheel({ participants, queue, currentSingerId, myName, onPick }: RandomWheelProps) {
  const [spunBy, setSpunBy] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<Participant | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Only show people who are NOT in queue and NOT singing
  const queueSet = new Set(queue);
  const available = participants.filter((p) => !queueSet.has(p.id) && p.id !== currentSingerId);

  if (available.length < 1) {
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {participants.length < 1 ? "No one here yet" : "Everyone is queued or singing!"}
        </p>
      </div>
    );
  }

  const segmentAngle = 360 / available.length;

  // Colors for wheel segments — cycle through these
  const colors = [
    "rgba(139, 92, 246, 0.3)",  // violet
    "rgba(245, 158, 11, 0.3)",  // amber
    "rgba(34, 197, 94, 0.3)",   // green
    "rgba(239, 68, 68, 0.3)",   // red
    "rgba(59, 130, 246, 0.3)",  // blue
    "rgba(168, 85, 247, 0.3)",  // purple
    "rgba(236, 72, 153, 0.3)",  // pink
    "rgba(20, 184, 166, 0.3)",  // teal
  ];

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setWinner(null);
    setSpunBy(myName ?? null);

    // Random: 3-5 full rotations + random landing position
    const extraRotations = 3 + Math.random() * 2;
    const landingAngle = Math.random() * 360;
    const totalRotation = rotation + extraRotations * 360 + landingAngle;

    setRotation(totalRotation);

    // Capture at spin time to prevent stale closure if available list changes mid-spin
    const spinParticipants = [...available];
    const spinSegmentAngle = 360 / spinParticipants.length;

    // After animation ends, determine winner
    setTimeout(() => {
      const normalizedAngle = totalRotation % 360;
      const pointerAngle = (360 - (normalizedAngle % 360)) % 360;
      const winnerIndex = Math.floor(pointerAngle / spinSegmentAngle) % spinParticipants.length;
      const picked = spinParticipants[winnerIndex]!;

      setWinner(picked);
      setSpinning(false);
    }, 3500);
  };

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      {/* Pointer — points down into the wheel */}
      <ChevronDown size={24} style={{ color: "var(--color-primary)" }} />

      {/* Wheel */}
      <div
        ref={wheelRef}
        className="relative h-40 w-40 rounded-full border-2"
        style={{
          borderColor: "var(--color-dark-border)",
          background: `conic-gradient(${available.map((_, i) => {
            const color = colors[i % colors.length];
            const start = (i * segmentAngle / 360 * 100).toFixed(1);
            const end = ((i + 1) * segmentAngle / 360 * 100).toFixed(1);
            return `${color} ${start}% ${end}%`;
          }).join(", ")})`,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
        }}
      >
        {available.map((p, i) => {
          const startAngle = i * segmentAngle;
          const midAngle = startAngle + segmentAngle / 2;
          // Position text at the midpoint of each segment
          const textRadius = 50; // px from center
          const x = 80 + textRadius * Math.sin((midAngle * Math.PI) / 180);
          const y = 80 - textRadius * Math.cos((midAngle * Math.PI) / 180);

          return (
            <div key={p.id}>
              {/* Segment background using conic gradient is handled by the overall background */}
              <span
                className="absolute text-[10px] font-bold"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `translate(-50%, -50%) rotate(${midAngle}deg)`,
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-display)",
                  textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                }}
              >
                {p.name.length > 8 ? p.name.slice(0, 7) + "…" : p.name}
              </span>
            </div>
          );
        })}

        {/* Segment dividers */}
        {available.map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-0 h-1/2 w-px origin-bottom"
            style={{
              background: "var(--color-dark-border)",
              transform: `rotate(${i * segmentAngle}deg)`,
            }}
          />
        ))}

        {/* Center dot */}
        <div
          className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "var(--color-primary)" }}
        />
      </div>

      {/* Spin button or winner display */}
      {winner ? (
        <div className="text-center" style={{ animation: "fade-in 0.3s ease-out" }}>
          {spunBy && (
            <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              spun by {spunBy}
            </p>
          )}
          <p className="text-xs font-bold" style={{ color: "var(--color-primary)", fontFamily: "var(--font-display)" }}>
            {winner.name}!
          </p>
          <div className="mt-1.5 flex items-center justify-center gap-2">
            <button
              onClick={() => { onPick(winner); setWinner(null); }}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
              style={{ background: "var(--color-primary)", color: "#fff" }}
            >
              Add to Queue
            </button>
            <button
              onClick={() => setWinner(null)}
              className="cursor-pointer rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
              style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={spin}
          disabled={spinning}
          className="cursor-pointer rounded-lg px-4 py-2 text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
        >
          {spinning ? "Spinning..." : "Spin the Wheel"}
        </button>
      )}
    </div>
  );
}
