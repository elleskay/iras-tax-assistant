"use client";

import { useState } from "react";
import { Sliders, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const MODELS = [
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano (cheapest)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (cheap, fast)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (cheap, fast)" },
  { id: "gpt-4.1", label: "GPT-4.1 (balanced)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (premium)" },
];

/**
 * Per-workspace AI-framework tuning (B2): the knobs that genuinely differ per
 * tax type, default model and cost ceiling, while the platform governance
 * standard (policy, risk register, frameworks) is shared and enforced on every
 * workspace.
 */
export function WorkspaceTuning({
  id,
  name,
  defaultModelId,
  costCeilingUsd,
}: {
  id: string;
  name: string;
  defaultModelId: string;
  costCeilingUsd: number;
}) {
  const [model, setModel] = useState(defaultModelId);
  const [ceiling, setCeiling] = useState(String(costCeilingUsd));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          defaultModelId: model,
          costCeilingUsd: Number(ceiling),
        }),
      });
      location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 shadow-soft">
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Sliders className="h-4 w-4" /> AI framework, tuned for {name}
        </div>
        <p className="text-xs text-muted-foreground">
          The platform governance standard (PII detect/redact/audit, grounding,
          eval gate) is shared and enforced on every workspace. These two knobs
          are the only things tuned per workspace.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Default model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-md border bg-card px-3 py-2 outline-none"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Cost ceiling (USD/call)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={ceiling}
              onChange={(e) => setCeiling(e.target.value)}
              className="w-40 rounded-md border bg-card px-3 py-2 outline-none"
            />
          </label>
          <Button onClick={save} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save tuning
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
