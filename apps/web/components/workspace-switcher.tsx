"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

interface Ws {
  id: string;
  name: string;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
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
        setActive(readCookie("workspace") ?? ws[0]?.id ?? "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function change(id: string) {
    document.cookie = `workspace=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem("workspace", id);
    } catch {
      // ignore storage failures
    }
    setActive(id);
    location.reload();
  }

  if (list.length === 0) return null;

  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-md border bg-card px-2.5 text-sm">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">Active department workspace</span>
      <select
        value={active}
        onChange={(e) => change(e.target.value)}
        className="w-full flex-1 cursor-pointer bg-popover text-sm font-medium text-popover-foreground outline-none"
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
    </label>
  );
}
