"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "~/types/room";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myPeerId: string | null;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// Deterministic color for a given peer ID
function nameColor(peerId: string): string {
  const colors = [
    "var(--color-neon-cyan)",
    "var(--color-neon-pink)",
    "var(--color-neon-purple)",
    "var(--color-neon-yellow)",
    "#ff6b6b",
    "#51cf66",
    "#ff922b",
    "#cc5de8",
  ];
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = (hash * 31 + peerId.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length]!;
}

export function ChatPanel({ messages, onSend, myPeerId }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <div
      className="flex h-full flex-col rounded-2xl border"
      style={{
        background: "var(--color-dark-surface)",
        borderColor: "var(--color-dark-border)",
        height: "320px",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <h3
          className="text-sm uppercase tracking-widest"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-neon-cyan)",
            fontSize: "0.75rem",
          }}
        >
          Chat
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background: "rgba(0, 240, 255, 0.15)",
            color: "var(--color-neon-cyan)",
          }}
        >
          {messages.length}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-dark-border) transparent" }}
      >
        {messages.length === 0 ? (
          <p
            className="py-8 text-center text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            No messages yet. Say hi!
          </p>
        ) : (
          <div className="space-y-2.5">
            {messages.map((msg, i) => {
              const isMe = msg.from === myPeerId;
              return (
                <div key={`${msg.timestamp}-${i}`} className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="shrink-0 text-[10px] tabular-nums"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {formatTime(msg.timestamp)}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: isMe ? "var(--color-neon-cyan)" : nameColor(msg.from) }}
                    >
                      {msg.fromName}
                      {isMe && (
                        <span
                          className="ml-1"
                          style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}
                        >
                          (you)
                        </span>
                      )}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-sm break-words pl-[42px]"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {msg.text}
                  </p>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--color-neon-cyan)]"
          style={{
            borderColor: "var(--color-dark-border)",
            color: "var(--color-text-primary)",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="cursor-pointer rounded-lg px-4 py-2 text-sm font-bold tracking-wide transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-default disabled:opacity-40 disabled:hover:scale-100"
          style={{
            fontFamily: "var(--font-display)",
            background: input.trim()
              ? "rgba(0, 240, 255, 0.15)"
              : "var(--color-dark-card)",
            color: input.trim()
              ? "var(--color-neon-cyan)"
              : "var(--color-text-secondary)",
            borderWidth: "1px",
            borderColor: input.trim()
              ? "var(--color-neon-cyan)"
              : "var(--color-dark-border)",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
