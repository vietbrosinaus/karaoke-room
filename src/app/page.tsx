"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mic, Users, Music, ArrowRight } from "lucide-react";
import { getSavedName, saveName, MAX_NAME_LENGTH } from "~/lib/playerName";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generateRoomCode(): string {
  const array = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => CHARSET[b % CHARSET.length]).join("");
}

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // Pre-fill name from localStorage (already normalized by getSavedName)
  useEffect(() => {
    const saved = getSavedName();
    if (saved) setName(saved);
  }, []);

  const handleCreate = () => {
    if (!name.trim()) { setError("Enter your name first"); return; }
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
    const persisted = saveName(trimmed);
    const param = persisted ? "" : `?name=${encodeURIComponent(trimmed)}`;
    router.push(`/room/${generateRoomCode()}${param}`);
  };

  const handleJoin = () => {
    if (!name.trim()) { setError("Enter your name first"); return; }
    const code = joinCode.toUpperCase().trim();
    if (code.length !== CODE_LENGTH) { setError("Code must be 6 characters"); return; }
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
    const persisted = saveName(trimmed);
    const param = persisted ? "" : `?name=${encodeURIComponent(trimmed)}`;
    router.push(`/room/${code}${param}`);
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Background */}
      <div className="pointer-events-none absolute -top-60 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-[0.06] blur-[120px]" style={{ background: "var(--color-primary)" }} />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[300px] w-[400px] rounded-full opacity-[0.04] blur-[100px]" style={{ background: "var(--color-accent)" }} />

      {/* Logo */}
      <div className="mb-8" style={{ animation: "fade-in 0.5s ease-out" }}>
        <h1
          className="text-center text-5xl font-extrabold tracking-tight sm:text-6xl"
          style={{
            fontFamily: "var(--font-display)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          KaraOK
        </h1>
        <p className="mt-2 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Sing together, anywhere. No signup needed.
        </p>
      </div>

      {/* Features row */}
      <div className="mb-8 flex gap-6" style={{ animation: "fade-in 0.6s ease-out 0.1s both" }}>
        {[
          { icon: <Mic size={16} />, text: "Voice effects" },
          { icon: <Music size={16} />, text: "Share music" },
          { icon: <Users size={16} />, text: "Sing together" },
        ].map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <span style={{ color: "var(--color-primary)" }}>{f.icon}</span>
            {f.text}
          </div>
        ))}
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl border p-6"
        style={{
          animation: "fade-in 0.7s ease-out 0.2s both",
          background: "var(--color-dark-surface)",
          borderColor: "var(--color-dark-border)",
        }}
      >
        {/* Name */}
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="Your name"
          maxLength={20}
          className="mb-4 w-full rounded-lg border px-4 py-3 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
        />

        {error && (
          <p className="mb-3 text-xs" style={{ color: "var(--color-danger)" }}>{error}</p>
        )}

        {/* Create */}
        <button
          onClick={handleCreate}
          className="mb-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
        >
          Create a Room
          <ArrowRight size={14} />
        </button>

        {/* Join */}
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH)); setError(""); }}
            placeholder="Room code"
            maxLength={CODE_LENGTH}
            className="min-w-0 flex-1 rounded-lg border px-3 py-3 text-center font-mono text-sm uppercase tracking-[0.2em] outline-none transition-all focus:border-[var(--color-primary)]"
            style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
          />
          <button
            onClick={handleJoin}
            className="shrink-0 cursor-pointer rounded-lg border px-4 py-3 text-sm font-bold transition-all hover:border-[var(--color-primary)] hover:brightness-110 active:scale-95"
            style={{ fontFamily: "var(--font-display)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
          >
            Join
          </button>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        Works on all browsers. Singing requires Chromium (Chrome, Edge, Brave, Arc).
      </p>
    </main>
  );
}
