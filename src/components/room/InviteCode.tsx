"use client";

import { useState } from "react";

function copyToClipboard(text: string): boolean {
  // Try modern API first
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return true;
  }

  // Fallback: textarea + execCommand
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const url = `${window.location.origin}/room/${code}?name=`;
    const ok = copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm tracking-[0.2em] transition-all duration-200 hover:scale-105 active:scale-95"
      style={{
        borderColor: copied
          ? "var(--color-neon-cyan)"
          : "var(--color-dark-border)",
        color: copied ? "var(--color-neon-cyan)" : "var(--color-text-primary)",
        background: "var(--color-dark-card)",
      }}
      title="Click to copy invite link"
    >
      <span>{code}</span>
      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}
