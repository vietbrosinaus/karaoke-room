"use client";

import { useCallback, useRef } from "react";
import type { Reaction } from "~/hooks/useRoomState";

const REACTIONS = [
  { emoji: "🔥", label: "Fire" },
  { emoji: "👏", label: "Clap" },
  { emoji: "😍", label: "Love" },
  { emoji: "🎵", label: "Music" },
  { emoji: "💯", label: "100" },
  { emoji: "🙌", label: "Raise" },
];

interface ReactionBarProps {
  reactions: Reaction[];
  onReact: (emoji: string) => void;
}

export function ReactionBar({ reactions, onReact }: ReactionBarProps) {
  const cooldownRef = useRef(false);

  const handleReact = useCallback(
    (emoji: string) => {
      if (cooldownRef.current) return;
      cooldownRef.current = true;
      onReact(emoji);
      setTimeout(() => {
        cooldownRef.current = false;
      }, 500);
    },
    [onReact],
  );

  return (
    <div className="relative">
      {/* Floating reactions */}
      <div className="pointer-events-none absolute inset-x-0 -top-12 h-16 overflow-hidden">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="absolute text-2xl"
            style={{
              left: `${Math.random() * 80 + 10}%`,
              animation: "reaction-float 2.5s ease-out forwards",
            }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Reaction buttons */}
      <div
        className="flex items-center gap-1.5 rounded-xl border px-3 py-2"
        style={{
          background: "var(--color-dark-surface)",
          borderColor: "var(--color-dark-border)",
        }}
      >
        <span
          className="mr-1 text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          React
        </span>
        {REACTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            onClick={() => handleReact(emoji)}
            className="cursor-pointer rounded-lg px-2 py-1 text-lg transition-transform duration-150 hover:scale-125 active:scale-90"
            style={{ background: "transparent" }}
            title={label}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
