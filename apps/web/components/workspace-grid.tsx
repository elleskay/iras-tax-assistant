"use client";

import { useEffect, useState } from "react";
import { Landmark, ArrowRight, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  readWorkspaceCookie,
  setWorkspaceCookie,
} from "@/lib/workspace-cookie";

interface Ws {
  id: string;
  name: string;
  seed?: boolean;
}

/**
 * Platform-home / workspaces-page cards. Opening a workspace sets the active
 * cookie and navigates into the assistant. Custom workspaces can be deleted;
 * the seeded example workspaces (seed: true) cannot.
 */
export function WorkspaceGrid() {
  const [list, setList] = useState<Ws[]>([]);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((d: { workspaces?: Ws[] }) => setList(d.workspaces ?? []))
      .catch(() => {});
  }, []);

  function open(id: string) {
    setWorkspaceCookie(id);
    // Full navigation so the cookie is re-read server-side and the layout
    // (workspace switcher, etc.) remounts on the chosen workspace. ?new=1 opens
    // a fresh chat rather than resuming this workspace's last conversation.
    window.location.assign("/assistant?new=1");
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the "${name}" workspace? This cannot be undone.`))
      return;
    try {
      const res = await fetch("/api/workspaces", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        // Do not remove the card optimistically: a failed delete would
        // resurrect it on the next refresh with no feedback.
        window.alert("Could not delete the workspace. Please try again.");
        return;
      }
    } catch {
      window.alert("Could not delete the workspace. Check your connection.");
      return;
    }
    setList((l) => l.filter((w) => w.id !== id));
    // If the deleted workspace was active, fall back to the flagship.
    if (readWorkspaceCookie() === id) setWorkspaceCookie("individual-income");
  }

  if (list.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((w) => (
        <div key={w.id} className="relative">
          <button onClick={() => open(w.id)} className="block w-full text-left">
            <Card className="h-full shadow-soft transition-shadow hover:shadow-card">
              <CardContent className="flex h-full flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-primary">
                    <Landmark className="h-5 w-5" />
                  </span>
                  <h4 className="text-base font-semibold text-navy">{w.name}</h4>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Open workspace <ArrowRight className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </button>
          {w.seed ? null : (
            <button
              type="button"
              onClick={() => remove(w.id, w.name)}
              aria-label={`Delete ${w.name} workspace`}
              className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
