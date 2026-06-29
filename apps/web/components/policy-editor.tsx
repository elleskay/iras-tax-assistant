"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GovernancePolicy } from "@/lib/governance";

/*
 * Editor for the platform governance policy. The policy ships as code; this lets
 * an admin override the tunable guardrail values and text. It is platform-wide
 * (one policy for every workspace), so it is not scoped to the workspace
 * switcher. On save it refreshes the server view so the dashboard stats, the
 * over-ceiling audit flags, and the downloaded report reflect the new values.
 */
export function PolicyEditor({ policy }: { policy: GovernancePolicy }) {
  const g = policy.guardrails;
  const router = useRouter();
  const [ceiling, setCeiling] = useState(String(g.costCeiling.usdPerCall));
  const [threshold, setThreshold] = useState(String(g.evalGate.threshold));
  const [triggers, setTriggers] = useState(g.piiEscalation.triggers.join(", "));
  const [piiAction, setPiiAction] = useState(g.piiEscalation.action);
  const [grounding, setGrounding] = useState(g.grounding.rule);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/governance/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costCeilingUsd: Number(ceiling),
          evalGateThreshold: Number(threshold),
          piiTriggers: triggers
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          piiAction,
          groundingRule: grounding,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  const labelCls = "flex flex-col gap-1.5 text-sm font-medium text-foreground";

  return (
    <Card className="shadow-soft">
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground">
          The platform governance policy. Edits apply to every workspace and feed
          the dashboard, the audit flags, and the downloaded report. The model
          routing rules are managed below.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>
            Cost ceiling (USD per call)
            <Input
              type="number"
              step="0.01"
              min="0"
              value={ceiling}
              onChange={(e) => setCeiling(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Eval gate threshold (% pass-rate)
            <Input
              type="number"
              min="0"
              max="100"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
        </div>
        <label className={labelCls}>
          PII triggers (comma separated)
          <Input
            value={triggers}
            onChange={(e) => setTriggers(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          PII handling rule
          <Textarea
            rows={3}
            value={piiAction}
            onChange={(e) => setPiiAction(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          Grounding rule
          <Textarea
            rows={3}
            value={grounding}
            onChange={(e) => setGrounding(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button
            onClick={save}
            disabled={state === "saving"}
            className="self-start"
          >
            {state === "saving" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {state === "saving" ? "Saving..." : "Save policy"}
          </Button>
          {state === "saved" ? (
            <span className="text-sm text-emerald-600">
              Saved. Applied platform-wide.
            </span>
          ) : null}
          {state === "error" ? (
            <span className="text-sm text-red-600">
              Could not save. Try again.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
