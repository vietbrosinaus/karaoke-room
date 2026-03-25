"use client";

import { useState, useRef } from "react";
import type { Participant } from "~/types/room";

interface RandomWheelProps {
  participants: Participant[];
  onPick: (participant: Participant) => void;
}

export function RandomWheel({ participants, onPick }: RandomWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<Participant | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  if (participants.length < 1) return null;

  const segmentAngle = 360 / participants.length;

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

    // Random: 3-5 full rotations + random landing position
    const extraRotations = 3 + Math.random() * 2;
    const landingAngle = Math.random() * 360;
    const totalRotation = rotation + extraRotations * 360 + landingAngle;

    setRotation(totalRotation);

    // After animation ends, determine winner
    setTimeout(() => {
      const normalizedAngle = totalRotation % 360;
      // The pointer is at the top (0 degrees). Find which segment is there.
      // Since the wheel rotates clockwise, the segment at (360 - normalizedAngle) is at the pointer
      const pointerAngle = (360 - (normalizedAngle % 360)) % 360;
      const winnerIndex = Math.floor(pointerAngle / segmentAngle) % participants.length;
      const picked = participants[winnerIndex]!;

      setWinner(picked);
      setSpinning(false);
    }, 3500); // match CSS transition duration
  };

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      {/* Pointer triangle — points DOWN into the wheel (top = 0°) */}
      <div
        className="h-0 w-0"
        style={{
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderBottom: "12px solid var(--color-primary)",
        }}
      />

      {/* Wheel */}
      <div
        ref={wheelRef}
        className="relative h-40 w-40 rounded-full border-2"
        style={{
          borderColor: "var(--color-dark-border)",
          background: `conic-gradient(${participants.map((_, i) => {
            const color = colors[i % colors.length];
            const start = (i * segmentAngle / 360 * 100).toFixed(1);
            const end = ((i + 1) * segmentAngle / 360 * 100).toFixed(1);
            return `${color} ${start}% ${end}%`;
          }).join(", ")})`,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
        }}
      >
        {participants.map((p, i) => {
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
        {participants.map((_, i) => (
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
          <p className="text-xs font-bold" style={{ color: "var(--color-primary)", fontFamily: "var(--font-display)" }}>
            {winner.name}!
          </p>
          <button
            onClick={() => { onPick(winner); setWinner(null); }}
            className="mt-1 cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all hover:brightness-110"
            style={{ background: "var(--color-primary)", color: "#fff" }}
          >
            Add to Queue
          </button>
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
