const STORAGE_KEY = "karaoke-player-name";

export function getSavedName(): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private browsing or storage blocked — silently ignore
  }
}
