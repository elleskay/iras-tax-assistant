"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface PageTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

/**
 * In-page tabs: a sticky bar of tab buttons over content panels. Inactive
 * panels stay mounted (hidden) so server-rendered tables and in-progress edits
 * survive switching. Styling matches the tools page tab bar. Content is passed
 * in as already-rendered nodes, so this works for both client and server pages.
 */
export function PageTabs({
  tabs,
  ariaLabel,
}: {
  tabs: PageTab[];
  ariaLabel: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  // Support deep-linking and in-page links to a tab via the URL hash (e.g.
  // #audit). Activates the matching tab on load and on any hash change.
  useEffect(() => {
    const ids = new Set(tabs.map((t) => t.id));
    const apply = () => {
      const id = window.location.hash.slice(1);
      if (id && ids.has(id)) setActive(id);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [tabs]);

  return (
    <>
      <div className="sticky top-16 z-20 -mx-4 mt-6 border-b bg-background px-4 py-2">
        <nav className="flex flex-wrap gap-1" aria-label={ariaLabel}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActive(t.id);
                window.history.replaceState(null, "", `#${t.id}`);
              }}
              aria-current={active === t.id ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active === t.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={active === t.id ? "mt-6" : "hidden"}>
          {t.content}
        </div>
      ))}
    </>
  );
}
