"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [mode, setMode] = useState<"idle" | "join">("idle");
  const [error, setError] = useState("");

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Enter your name first");
      return;
    }
    const code = generateRoomCode();
    router.push(`/room/${code}?name=${encodeURIComponent(name.trim())}`);
  };

  const handleJoin = () => {
    if (!name.trim()) {
      setError("Enter your name first");
      return;
    }
    const code = joinCode.toUpperCase().trim();
    if (code.length !== CODE_LENGTH) {
      setError("Code must be 6 characters");
      return;
    }
    router.push(`/room/${code}?name=${encodeURIComponent(name.trim())}`);
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-4">
      {/* Subtle ambient gradients */}
      <div
        className="pointer-events-none absolute -top-60 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-[0.07] blur-[120px]"
        style={{ background: "var(--color-primary)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 right-1/4 h-[300px] w-[400px] rounded-full opacity-[0.05] blur-[100px]"
        style={{ background: "var(--color-accent)" }}
      />

      {/* Logo */}
      <div className="mb-10" style={{ animation: "fade-in 0.5s ease-out" }}>
        <h1
          className="text-center text-5xl font-extrabold tracking-tight sm:text-7xl md:text-8xl"
          style={{
            fontFamily: "var(--font-display)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          KaraOK
        </h1>
        <p
          className="mt-3 text-center text-base tracking-wide sm:text-lg"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Sing together, anywhere. No signup needed.
        </p>
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl border p-6 sm:p-8"
        style={{
          animation: "fade-in 0.6s ease-out 0.1s both",
          background: "var(--color-dark-surface)",
          borderColor: "var(--color-dark-border)",
        }}
      >
        {/* Name input */}
        <div className="mb-6">
          <label
            className="mb-2 block text-xs font-semibold uppercase tracking-widest"
            style={{
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-display)",
            }}
          >
            Your Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="Enter your name..."
            maxLength={20}
            className="w-full rounded-xl border px-4 py-3 text-base outline-none transition-all duration-200 focus:border-[var(--color-primary)]"
            style={{
              background: "var(--color-dark-card)",
              borderColor: "var(--color-dark-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>

        {error && (
          <p className="mb-4 text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        {/* Create Room Button */}
        <button
          onClick={handleCreate}
          className="relative mb-4 w-full cursor-pointer overflow-hidden rounded-xl py-4 text-base font-bold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{
            fontFamily: "var(--font-display)",
            background: "var(--color-primary)",
            color: "#fff",
          }}
        >
          Create a Room
        </button>

        {/* Divider */}
        <div className="my-5 flex items-center gap-4">
          <div className="h-px flex-1" style={{ background: "var(--color-dark-border)" }} />
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>
            or
          </span>
          <div className="h-px flex-1" style={{ background: "var(--color-dark-border)" }} />
        </div>

        {/* Join Room */}
        {mode === "idle" ? (
          <button
            onClick={() => setMode("join")}
            className="w-full cursor-pointer rounded-xl border py-4 text-base font-bold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-display)",
              borderColor: "var(--color-dark-border)",
              color: "var(--color-text-primary)",
              background: "var(--color-dark-card)",
            }}
          >
            Join with Code
          </button>
        ) : (
          <div className="flex gap-2 sm:gap-3" style={{ animation: "fade-in 0.2s ease-out" }}>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH));
                setError("");
              }}
              placeholder="ABC123"
              maxLength={CODE_LENGTH}
              className="min-w-0 flex-1 rounded-xl border px-3 py-3 text-center font-mono text-base uppercase tracking-[0.2em] outline-none transition-all duration-200 focus:border-[var(--color-primary)] sm:px-4 sm:text-lg sm:tracking-[0.3em]"
              style={{
                background: "var(--color-dark-card)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-primary)",
              }}
              autoFocus
            />
            <button
              onClick={handleJoin}
              className="shrink-0 cursor-pointer rounded-xl px-5 py-3 font-bold transition-all duration-200 hover:brightness-110 active:scale-95 sm:px-6"
              style={{
                fontFamily: "var(--font-display)",
                background: "var(--color-primary)",
                color: "#fff",
              }}
            >
              Go
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <p
        className="mt-8 text-center text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        Best on Chromium desktop browsers. Singer shares tab audio, everyone hears it.
      </p>
    </main>
  );
}
