"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * A persisted, drag- and keyboard-resizable panel width. The officer can
 * widen/narrow the history and inspector panels; the choice is remembered in
 * localStorage. `edge` is the side the drag handle sits on relative to the
 * panel: a panel on the left (history) has its handle on the right, a panel on
 * the right (inspector) has its handle on the left.
 */

const KEYBOARD_STEP = 16;

export function useResizableWidth(
  key: string,
  initial: number,
  min: number,
  max: number,
  edge: "left" | "right",
) {
  const [width, setWidth] = useState(initial);
  // Cleanup for an in-flight drag, so unmounting mid-drag does not leak the
  // window listeners or leave the body cursor/user-select overrides behind.
  const dragCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isFinite(saved) && saved >= min && saved <= max) setWidth(saved);
    } catch {
      // ignore
    }
  }, [key, min, max]);

  useEffect(
    () => () => {
      dragCleanup.current?.();
    },
    [],
  );

  const persist = useCallback(
    (value: number) => {
      try {
        localStorage.setItem(key, String(Math.round(value)));
      } catch {
        // ignore
      }
    },
    [key],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let latest = startW;
    const onMove = (ev: PointerEvent) => {
      const delta = edge === "left" ? startX - ev.clientX : ev.clientX - startX;
      latest = Math.min(max, Math.max(min, startW + delta));
      setWidth(latest);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      dragCleanup.current = null;
    };
    const onUp = () => {
      cleanup();
      persist(latest);
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    dragCleanup.current = cleanup;
  };

  // Keyboard path for the separator (WCAG 2.1.1): arrow keys nudge the width.
  const onKeyDown = (e: React.KeyboardEvent) => {
    let delta = 0;
    if (e.key === "ArrowLeft") delta = edge === "left" ? KEYBOARD_STEP : -KEYBOARD_STEP;
    else if (e.key === "ArrowRight") delta = edge === "left" ? -KEYBOARD_STEP : KEYBOARD_STEP;
    else if (e.key === "Home") {
      e.preventDefault();
      setWidth(min);
      persist(min);
      return;
    } else if (e.key === "End") {
      e.preventDefault();
      setWidth(max);
      persist(max);
      return;
    } else {
      return;
    }
    e.preventDefault();
    setWidth((w) => {
      const next = Math.min(max, Math.max(min, w + delta));
      persist(next);
      return next;
    });
  };

  return { width, min, max, onPointerDown, onKeyDown };
}

type ResizeHandleProps = {
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Current/min/max width of the controlled panel, for aria-valuenow. */
  value?: { width: number; min: number; max: number };
  label?: string;
  className?: string;
};

/** Thin vertical drag handle that sits between two panels. */
export function ResizeHandle({
  onPointerDown,
  onKeyDown,
  value,
  label = "Resize panel",
  className,
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value ? Math.round(value.width) : undefined}
      aria-valuemin={value?.min}
      aria-valuemax={value?.max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      title="Drag to resize (arrow keys when focused)"
      className={cn(
        "group relative w-1.5 shrink-0 cursor-col-resize touch-none select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary" />
    </div>
  );
}
