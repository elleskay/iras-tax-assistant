"use client";

import { useEffect, useState } from "react";
import { GitBranch, Trash2, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODELS, modelOptionLabel } from "@/lib/model-registry";
import {
  type RoutingConfig,
  DEFAULT_CONFIG,
  applyRoutingRules,
  loadConfig,
  saveConfig,
} from "@/lib/routing-rules";

/*
 * The deterministic model router, editable and persisted per browser. The
 * assistant and the Evals workbench both read this saved config (loadConfig) to
 * route each query, so changes here change how everything routes.
 */

const modelLabel = (id: string) => MODELS.find((m) => m.id === id)?.label ?? id;

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e5).toString(36)}`;
}

export function RoutingRules() {
  const [config, setConfig] = useState<RoutingConfig>(DEFAULT_CONFIG);
  const [hydrated, setHydrated] = useState(false);
  const [testQuery, setTestQuery] = useState("What is the GST registration threshold?");

  useEffect(() => {
    setConfig(loadConfig());
    setHydrated(true);
  }, []);

  function updateConfig(next: RoutingConfig) {
    setConfig(next);
    if (hydrated) saveConfig(next);
  }

  const preview = applyRoutingRules(config, testQuery);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <GitBranch className="h-4 w-4" /> Model routing rules
        </h3>
        <button
          type="button"
          onClick={() => updateConfig(DEFAULT_CONFIG)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
      <Card className="shadow-soft">
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            The first rule with a keyword that appears in the query wins,
            otherwise the fallback. This is the deterministic router the
            assistant uses.
          </p>
          {config.rules.map((rule, i) => (
            <div key={rule.id} className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center">
              <input
                aria-label={`Rule ${i + 1} keywords`}
                value={rule.keywords.join(", ")}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    rules: config.rules.map((r, j) =>
                      j === i ? { ...r, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : r,
                    ),
                  })
                }
                placeholder="keywords, comma separated"
                className="min-h-9 flex-1 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
              />
              <select
                aria-label={`Rule ${i + 1} model`}
                value={rule.modelId}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    rules: config.rules.map((r, j) => (j === i ? { ...r, modelId: e.target.value } : r)),
                  })
                }
                className="min-h-9 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{modelOptionLabel(m)}</option>
                ))}
              </select>
              <input
                aria-label={`Rule ${i + 1} reason`}
                value={rule.reason}
                onChange={(e) =>
                  updateConfig({
                    ...config,
                    rules: config.rules.map((r, j) => (j === i ? { ...r, reason: e.target.value } : r)),
                  })
                }
                placeholder="reason"
                className="min-h-9 w-32 rounded-md border bg-card px-2 font-mono text-xs outline-none focus:border-primary"
              />
              <button
                type="button"
                aria-label={`Remove rule ${i + 1}`}
                onClick={() => updateConfig({ ...config, rules: config.rules.filter((_, j) => j !== i) })}
                className="rounded-md px-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                updateConfig({
                  ...config,
                  rules: [...config.rules, { id: genId("r"), keywords: [], modelId: MODELS[0].id, reason: "custom" }],
                })
              }
              className="text-sm font-medium text-primary"
            >
              + Add rule
            </button>
            <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              Fallback
              <select
                aria-label="Fallback model"
                value={config.fallbackModelId}
                onChange={(e) => updateConfig({ ...config, fallbackModelId: e.target.value })}
                className="min-h-8 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{modelOptionLabel(m)}</option>
                ))}
              </select>
            </span>
          </div>

          {/* Live route preview (free) */}
          <div className="mt-1 flex flex-col gap-2 rounded-md border border-dashed p-2 sm:flex-row sm:items-center">
            <input
              aria-label="Try a query"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="Try a query to see where it routes"
              className="min-h-9 flex-1 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
            />
            <span data-testid="route-preview" className="text-sm">
              routes to <b className="text-navy">{modelLabel(preview.modelId)}</b>{" "}
              <Badge className="bg-accent font-mono text-accent-foreground hover:bg-accent">{preview.reason}</Badge>
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
