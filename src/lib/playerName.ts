const STORAGE_KEY = "karaoke-player-name";
const MAX_NAME_LENGTH = 20;

export function getSavedName(): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

/** Returns true if persisted, false if storage blocked. */
export function saveName(name: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    localStorage.setItem(STORAGE_KEY, name.trim().slice(0, MAX_NAME_LENGTH));
    return true;
  } catch {
    return false;
  }
}

/** Sanitize name from URL — trim, cap length, fallback to Anonymous */
export function sanitizeName(raw: string | null): string {
  if (!raw) return "Anonymous";
  const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || "Anonymous";
}
