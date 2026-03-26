const STORAGE_KEY = "karaoke-player-name";
const MAX_NAME_LENGTH = 20;

/** Get saved name — returns null if empty, whitespace-only, or storage blocked. */
export function getSavedName(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
    return trimmed || null; // treat whitespace-only as no name
  } catch {
    return null;
  }
}

/** Save name (normalized). Returns true if persisted, false if storage blocked. */
export function saveName(name: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    const normalized = name.trim().slice(0, MAX_NAME_LENGTH);
    if (!normalized) {
      localStorage.removeItem(STORAGE_KEY); // don't store empty/whitespace
      return true;
    }
    localStorage.setItem(STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

/** Sanitize name — trim, cap length, fallback to Anonymous */
export function sanitizeName(raw: string | null): string {
  if (!raw) return "Anonymous";
  const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || "Anonymous";
}
