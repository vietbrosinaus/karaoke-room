"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { getSavedName, saveName, sanitizeName } from "~/lib/playerName";

const RoomView = dynamic(
  () => import("~/components/room/RoomView").then((m) => m.RoomView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", animation: "fade-in 0.5s ease-out" }}>
          Loading room...
        </div>
      </div>
    ),
  }
);

function RoomContent() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = params.code?.toUpperCase() ?? "";

  // Name priority: URL param (backward compat) > localStorage > prompt modal
  const urlName = searchParams.get("name");
  const [name, setName] = useState(() => sanitizeName(urlName ?? getSavedName()));
  const [showNameModal, setShowNameModal] = useState(false);

  // If name came from URL param, save to localStorage and clean URL
  useEffect(() => {
    if (!urlName || !code) return;
    const clean = sanitizeName(urlName);
    const persisted = saveName(clean);
    // Only strip ?name= if we successfully saved (otherwise it's the only transport)
    if (persisted) router.replace(`/room/${code}`);
  }, [urlName, code, router]);

  // Show name modal if no saved name and no URL param (new user via direct link)
  useEffect(() => {
    if (!urlName && !getSavedName()) {
      setShowNameModal(true);
    }
  }, [urlName]);

  if (!code) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p style={{ color: "var(--color-danger)" }}>Invalid room code.</p>
      </div>
    );
  }

  const handleRename = (newName: string) => {
    const clean = sanitizeName(newName);
    setName(clean);
    saveName(clean);
  };

  const handleNameSubmit = (newName: string) => {
    const clean = sanitizeName(newName);
    setName(clean);
    saveName(clean);
    setShowNameModal(false);
  };

  return (
    <>
      <RoomView roomCode={code} playerName={name} onRename={handleRename} />
      {showNameModal && <NameModal onSubmit={handleNameSubmit} />}
    </>
  );
}

function NameModal({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onSubmit(""); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSubmit]);

  return (
    <>
      <div className="fixed inset-0 z-[60]" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => onSubmit("")} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Enter your name"
        className="fixed left-1/2 top-1/2 z-[61] w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6"
        style={{ background: "var(--color-dark-bg)", borderColor: "var(--color-dark-border)", animation: "fade-in 0.2s ease-out" }}
      >
        <h2
          className="mb-1 text-sm font-bold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
        >
          What should we call you?
        </h2>
        <p className="mb-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
          Or skip to join as Anonymous.
        </p>
        <label htmlFor="name-input" className="sr-only">Your name</label>
        <input
          id="name-input"
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 20))}
          placeholder="Your name"
          className="mb-3 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--color-primary)]"
          style={{ background: "var(--color-dark-card)", borderColor: "var(--color-dark-border)", color: "var(--color-text-primary)" }}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(draft); }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit(draft)}
            className="flex-1 cursor-pointer rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110"
            style={{ fontFamily: "var(--font-display)", background: "var(--color-primary)", color: "#fff" }}
          >
            {draft.trim() ? "Join" : "Join as Anonymous"}
          </button>
          <button
            onClick={() => onSubmit("")}
            className="cursor-pointer rounded-lg border px-4 py-2.5 text-xs font-medium transition-all hover:brightness-110"
            style={{ borderColor: "var(--color-dark-border)", color: "var(--color-text-muted)" }}
          >
            Skip
          </button>
        </div>
      </div>
    </>
  );
}

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center">
          <div className="text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--color-primary)", animation: "fade-in 0.5s ease-out" }}>
            Entering room...
          </div>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
