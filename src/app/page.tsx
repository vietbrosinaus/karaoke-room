"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

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
      {/* Background glow effects */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, var(--color-neon-pink), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 right-1/4 h-[400px] w-[400px] rounded-full opacity-15 blur-[100px]"
        style={{
          background:
            "radial-gradient(circle, var(--color-neon-cyan), transparent 70%)",
        }}
      />

      {/* Logo */}
      <div
        className="mb-12"
        style={{ animation: "float-up 0.6s ease-out" }}
      >
        <h1
          className="text-center text-5xl font-bold tracking-tight sm:text-7xl md:text-8xl"
          style={{
            fontFamily: "var(--font-display)",
            background:
              "linear-gradient(135deg, var(--color-neon-pink), var(--color-neon-purple), var(--color-neon-cyan))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 40px rgba(255, 45, 120, 0.3))",
          }}
        >
          KaraOK
        </h1>
        <p
          className="mt-3 text-center text-lg tracking-wide"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Sing together. Zero latency. Zero signup.
        </p>
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl border p-6 sm:p-8"
        style={{
          animation: "float-up 0.8s ease-out",
          background: "var(--color-dark-surface)",
          borderColor: "var(--color-dark-border)",
          boxShadow:
            "0 0 60px rgba(184, 77, 255, 0.08), 0 20px 60px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Name input */}
        <div className="mb-6">
          <label
            className="mb-2 block text-sm font-medium tracking-wide uppercase"
            style={{
              color: "var(--color-neon-cyan)",
              fontFamily: "var(--font-display)",
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
            }}
          >
            Your Stage Name
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
            className="w-full rounded-xl border px-4 py-3 text-base outline-none transition-all duration-200 focus:border-[var(--color-neon-purple)]"
            style={{
              background: "var(--color-dark-card)",
              borderColor: "var(--color-dark-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>

        {error && (
          <p
            className="mb-4 text-sm"
            style={{ color: "var(--color-neon-pink)" }}
          >
            {error}
          </p>
        )}

        {/* Create Room Button */}
        <button
          onClick={handleCreate}
          className="relative mb-4 w-full cursor-pointer overflow-hidden rounded-xl py-4 text-base font-bold tracking-wide transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            fontFamily: "var(--font-display)",
            background:
              "linear-gradient(135deg, var(--color-neon-pink), var(--color-neon-purple))",
            color: "#fff",
            boxShadow: "0 0 30px rgba(255, 45, 120, 0.3)",
          }}
        >
          Create a Room
        </button>

        {/* Divider */}
        <div className="my-5 flex items-center gap-4">
          <div
            className="h-px flex-1"
            style={{ background: "var(--color-dark-border)" }}
          />
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--color-text-secondary)" }}
          >
            or
          </span>
          <div
            className="h-px flex-1"
            style={{ background: "var(--color-dark-border)" }}
          />
        </div>

        {/* Join Room */}
        {mode === "idle" ? (
          <button
            onClick={() => setMode("join")}
            className="w-full cursor-pointer rounded-xl border-2 py-4 text-base font-bold tracking-wide transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-display)",
              borderColor: "var(--color-neon-cyan)",
              color: "var(--color-neon-cyan)",
              background: "transparent",
              boxShadow: "0 0 20px rgba(0, 240, 255, 0.1)",
            }}
          >
            Join with Code
          </button>
        ) : (
          <div
            className="flex gap-2 sm:gap-3"
            style={{ animation: "float-up 0.3s ease-out" }}
          >
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH));
                setError("");
              }}
              placeholder="ABC123"
              maxLength={CODE_LENGTH}
              className="min-w-0 flex-1 rounded-xl border px-3 py-3 text-center font-mono text-base uppercase tracking-[0.2em] outline-none transition-all duration-200 focus:border-[var(--color-neon-cyan)] sm:px-4 sm:text-lg sm:tracking-[0.3em]"
              style={{
                background: "var(--color-dark-card)",
                borderColor: "var(--color-dark-border)",
                color: "var(--color-text-primary)",
              }}
              autoFocus
            />
            <button
              onClick={handleJoin}
              className="shrink-0 cursor-pointer rounded-xl px-5 py-3 font-bold transition-all duration-200 hover:scale-105 active:scale-95 sm:px-6"
              style={{
                fontFamily: "var(--font-display)",
                background: "var(--color-neon-cyan)",
                color: "var(--color-dark-bg)",
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
        style={{ color: "var(--color-text-secondary)", opacity: 0.6 }}
      >
        Works best on Chrome / Edge desktop. Singer shares system audio, everyone
        hears it.
      </p>
    </main>
  );
}
