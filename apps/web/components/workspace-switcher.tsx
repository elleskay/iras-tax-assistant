"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import {
  readWorkspaceCookie,
  setWorkspaceCookie,
} from "@/lib/workspace-cookie";

interface Ws {
  id: string;
  name: string;
}

/**
 * Active-workspace switcher (one workspace per tax type). No auth: selecting a
 * workspace sets the `workspace` cookie, which is sent with every request, so
 * server pages and /api/chat scope to it, then reloads. Mirrors to localStorage
 * for client code that reads the active workspace directly.
 */
export function WorkspaceSwitcher() {
  const [list, setList] = useState<Ws[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((d: { workspaces?: Ws[] }) => {
        if (!alive) return;
        const ws = d.workspaces ?? [];
        setList(ws);
        // No cookie yet: show the server's default workspace (lib/workspaces
        // DEFAULT_WORKSPACE = "individual-income"), not the first in the list,
        // so the switcher matches the workspace the backend actually uses.
        const fallback = ws.some((w) => w.id === "individual-income")
          ? "individual-income"
          : (ws[0]?.id ?? "");
        setActive(readWorkspaceCookie() ?? fallback);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function change(id: string) {
    setWorkspaceCookie(id);
    setActive(id);
    location.reload();
  }

  if (list.length === 0) return null;

  return (
    <label className="relative flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-2.5 text-sm">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">Active department workspace</span>
      {/* appearance-none drops the native arrow (which browsers draw over
          long option text); pr-6 reserves room for our chevron instead, and
          truncate ellipsizes names that still do not fit. */}
      <select
        value={active}
        onChange={(e) => change(e.target.value)}
        className="w-full min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent pr-6 text-sm font-medium text-foreground outline-none"
      >
        {list.map((w) => (
          <option
            key={w.id}
            value={w.id}
            className="bg-popover text-popover-foreground"
          >
            {w.name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 h-4 w-4 shrink-0 text-muted-foreground"
      />
    </label>
  );
}
