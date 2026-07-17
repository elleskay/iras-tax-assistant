"use client";

import { useEffect } from "react";

/**
 * Re-applies the saved theme after hydration. The inline no-flash script in
 * the root layout sets the `dark` class for first paint, but React 19's
 * hydration rewrites the html element's className (which React owns) and
 * wipes that class on every navigation. This effect runs right after
 * hydration and restores it.
 */
export function ThemeSync() {
  useEffect(() => {
    try {
      document.documentElement.classList.toggle(
        "dark",
        localStorage.getItem("theme") === "dark",
      );
    } catch {
      // storage unavailable (private mode); leave the default theme
    }
  }, []);
  return null;
}
