"use client";

import { useState, useEffect } from "react";
import { Lock } from "lucide-react";

interface AuthModalProps {
  onSubmit: (password: string) => void;
  authFailed: boolean;
}

export function AuthModal({ onSubmit, authFailed }: AuthModalProps) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleSubmit = () => {
    if (password.trim()) {
      onSubmit(password.trim());
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.7)" }}
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5"
        style={{
          background: "var(--color-dark-surface)",
          borderColor: "var(--color-dark-border)",
          animation: "fade-in 0.15s ease-out",
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <Lock size={16} style={{ color: "var(--color-accent)" }} />
          <h3
            className="text-sm font-bold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            Room is locked
          </h3>
        </div>
        <p className="mb-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
          Enter the room password to join.
        </p>

        {authFailed && (
          <p className="mb-3 text-xs" style={{ color: "var(--color-danger)" }}>
            Incorrect password. Try again.
          </p>
        )}

        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="mb-3 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!password.trim()}
          className="w-full cursor-pointer rounded-lg py-2.5 text-xs font-bold transition-all enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
        >
          Enter Room
        </button>
      </div>
    </>
  );
}
