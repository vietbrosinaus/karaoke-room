"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

interface UsePaneSplitParams {
  storageKey: string;
  minPx: number;
  maxPx: number;
  defaultPx: number;
}

export function usePaneSplit({ storageKey, minPx, maxPx, defaultPx }: UsePaneSplitParams) {
  const [rightPx, setRightPx] = useState<number>(() => {
    if (typeof window === "undefined") return defaultPx;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const n = raw ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return defaultPx;
      return Math.max(minPx, Math.min(maxPx, n));
    } catch {
      return defaultPx;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(rightPx));
    } catch {
      // ignore
    }
  }, [rightPx, storageKey]);

  const dragRef = useRef<{ startX: number; startRight: number } | null>(null);

  const onMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startRight: rightPx };
    e.preventDefault();
  }, [rightPx]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      // dragging handle left increases right pane, dragging right decreases
      const next = drag.startRight - dx;
      setRightPx(Math.max(minPx, Math.min(maxPx, next)));
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minPx, maxPx]);

  return {
    rightPx,
    setRightPx,
    onMouseDown,
  };
}

