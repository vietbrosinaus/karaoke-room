/**
 * Browser detection utilities for KaraOK.
 * System audio sharing (getDisplayMedia with audio) only works reliably on Chromium browsers.
 */

export interface BrowserInfo {
  name: string;
  isChromium: boolean;
  canSing: boolean; // can share system audio
  isMobile: boolean;
}

export function detectBrowser(): BrowserInfo {
  if (typeof navigator === "undefined") {
    return { name: "Unknown", isChromium: false, canSing: false, isMobile: false };
  }

  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  // Check Chromium-based browsers (Chrome, Edge, Brave, Opera, Arc, Vivaldi)
  // They all have "Chrome/" in UA. Safari has "Safari/" but not "Chrome/".
  const isChromium = /Chrome\//.test(ua) && !/Edg\//.test(ua) ? true
    : /Edg\//.test(ua) ? true  // Edge is Chromium-based
    : false;

  // Firefox detection
  const isFirefox = /Firefox\//.test(ua);

  // Safari detection (non-Chromium)
  const isSafari = /Safari\//.test(ua) && !isChromium && !isFirefox;

  let name = "Unknown";
  if (/Edg\//.test(ua)) name = "Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) name = "Opera";
  else if (/Brave/.test(ua)) name = "Brave";
  else if (/Chrome\//.test(ua)) name = "Chrome";
  else if (isFirefox) name = "Firefox";
  else if (isSafari) name = "Safari";

  // Can sing = Chromium + Desktop (getDisplayMedia with audio)
  const canSing = isChromium && !isMobile;

  return { name, isChromium, canSing, isMobile };
}

/** Short label for the participant list */
export function browserLabel(info: BrowserInfo): string {
  if (info.isMobile) return `${info.name} (Mobile)`;
  return info.name;
}
