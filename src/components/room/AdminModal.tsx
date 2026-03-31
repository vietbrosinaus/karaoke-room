"use client";

import { useState, useEffect } from "react";
import { Shield } from "lucide-react";

interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  isLocked: boolean;
  onSetPassword: (password: string | null) => void;
}

export function AdminModal({ open, onClose, isLocked, onSetPassword }: AdminModalProps) {
  const [passwordEnabled, setPasswordEnabled] = useState(isLocked);
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPasswordEnabled(isLocked);
    setPassword("");
  }, [isLocked, open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    if (passwordEnabled && password.trim()) {
      onSetPassword(password.trim());
    } else if (!passwordEnabled) {
      onSetPassword(null);
    }
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
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
          <Shield size={16} style={{ color: "var(--color-primary)" }} />
          <h3
            className="text-sm font-bold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
          >
            Room Settings
          </h3>
        </div>

        <label className="mb-3 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={passwordEnabled}
            onChange={(e) => {
              setPasswordEnabled(e.target.checked);
              if (!e.target.checked) setPassword("");
            }}
            className="accent-[var(--color-primary)]"
          />
          <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
            Require password
          </span>
        </label>

        {passwordEnabled && (
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isLocked ? "Enter new password" : "Set password"}
            className="mb-3 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
            style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            disabled={passwordEnabled && !password.trim() && !isLocked}
            className="flex-1 cursor-pointer rounded-lg py-2.5 text-xs font-bold transition-all enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg border px-4 py-2.5 text-xs font-medium transition-all hover:brightness-110"
            style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
