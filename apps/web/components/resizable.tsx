"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * A persisted, drag-resizable panel width. The officer can widen/narrow the
 * history and inspector panels; the choice is remembered in localStorage.
 * `edge` is the side the drag handle sits on relative to the panel: a panel on
 * the left (history) has its handle on the right, a panel on the right
 * (inspector) has its handle on the left.
 */
export function useResizableWidth(
  key: string,
  initial: number,
  min: number,
  max: number,
  edge: "left" | "right",
) {
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isFinite(saved) && saved >= min && saved <= max) setWidth(saved);
    } catch {
      // ignore
    }
  }, [key, min, max]);

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
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try {
        localStorage.setItem(key, String(Math.round(latest)));
      } catch {
        // ignore
      }
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return { width, onPointerDown };
}

/** Thin vertical drag handle that sits between two panels. */
export function ResizeHandle({
  onPointerDown,
  className,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      title="Drag to resize"
      className={cn(
        "group relative w-1.5 shrink-0 cursor-col-resize touch-none select-none",
        className,
      )}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary" />
    </div>
  );
}
