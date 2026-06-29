"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Self-serve workspace onboarding (FR-1.1). Create a new tax-type workspace; it
 * inherits the platform governance standard and gets its own documents, prompt,
 * and tuning.
 */
export function AddWorkspace() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
      >
        <Plus className="h-4 w-4" /> Add a workspace
      </button>
    );
  }

  return (
    <Card className="mt-4 shadow-soft">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. GST"
            className="rounded-md border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <Button onClick={create} disabled={busy || !name.trim()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Create
        </Button>
      </CardContent>
    </Card>
  );
}
