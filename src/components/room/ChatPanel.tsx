"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ChatMessage } from "~/types/room";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myPeerId: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// Deterministic color for a given peer ID - uses fixed palette that works on dark bg in both modes
function nameColor(peerId: string): string {
  const colors = [
    "var(--chat-name-1)",
    "var(--chat-name-2)",
    "var(--chat-name-3)",
    "var(--chat-name-4)",
    "var(--chat-name-5)",
    "var(--chat-name-6)",
    "var(--chat-name-7)",
    "var(--chat-name-8)",
  ];
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = (hash * 31 + peerId.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length]!;
}

export function ChatPanel({ messages, onSend, myPeerId, collapsed, onToggleCollapse }: ChatPanelProps) {
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
            color: "var(--color-primary)",
            fontSize: "0.75rem",
          }}
        >
          Chat
        </h3>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: "var(--color-primary-dim)",
              color: "var(--color-primary)",
            }}
          >
            {messages.length}
          </span>
          {onToggleCollapse ? (
            <button
              onClick={onToggleCollapse}
              className="cursor-pointer inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-all hover:scale-105 active:scale-95"
              style={{
                fontFamily: "var(--font-display)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-muted)",
                background: "var(--color-dark-card)",
              }}
              title={collapsed ? "Expand chat" : "Collapse chat"}
            >
              {collapsed ? <><ChevronUp size={11} />Show</> : <><ChevronDown size={11} />Hide</>}
            </button>
          ) : null}
        </div>
      </div>

      {/* Last message preview when collapsed */}
      {collapsed && messages.length > 0 ? (() => {
        const last = messages[messages.length - 1]!;
        const isMe = last.from === myPeerId;
        return (
          <div className="flex items-baseline gap-2 truncate px-5 py-2">
            <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
              {formatTime(last.timestamp)}
            </span>
            <span className="text-xs font-semibold" style={{ color: isMe ? "var(--color-primary)" : nameColor(last.from) }}>
              {last.fromName}
            </span>
            <span className="truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
              {last.text}
            </span>
          </div>
        );
      })() : null}

      {/* Messages */}
      <div
        ref={listRef}
        className={`overflow-y-auto px-4 py-3 transition-all duration-200 ${collapsed ? "hidden" : "flex-1"}`}
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
                      style={{ color: isMe ? "var(--color-primary)" : nameColor(msg.from) }}
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
        className={`items-center gap-2 border-t px-4 py-3 ${collapsed ? "hidden" : "flex"}`}
        style={{ borderColor: "var(--color-dark-border)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[var(--color-primary)]"
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
              ? "var(--color-primary-dim)"
              : "var(--color-dark-card)",
            color: input.trim()
              ? "var(--color-primary)"
              : "var(--color-text-secondary)",
            borderWidth: "1px",
            borderColor: input.trim()
              ? "var(--color-primary)"
              : "var(--color-dark-border)",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
