"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutTemplate, Check, Plus, X, ShieldCheck, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  loadCustomTools,
  saveCustomTools,
  CUSTOM_TOOLS_CHANGED,
  MAX_CUSTOM_TOOLS,
  type CustomTool,
} from "@/lib/custom-tools";
import { TOOL_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/tool-templates";

function genId() {
  return `t_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const kindLabel: Record<CustomTool["kind"], string> = {
  lookup: "Lookup table",
  template: "Message template",
  code: "Calculator (sandboxed)",
};

export function ToolTemplates() {
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    const reload = () => setAddedNames(new Set(loadCustomTools().map((t) => t.name)));
    reload();
    // Stay in sync when tools change elsewhere (the "Your tools" tab, another add).
    window.addEventListener(CUSTOM_TOOLS_CHANGED, reload);
    return () => window.removeEventListener(CUSTOM_TOOLS_CHANGED, reload);
  }, []);

  function remove(tool: CustomTool) {
    const next = loadCustomTools().filter((t) => t.name !== tool.name);
    saveCustomTools(next);
    setAddedNames(new Set(next.map((t) => t.name)));
    if (justAdded === tool.name) setJustAdded(null);
    setLimitHit(false);
  }

  function use(tool: CustomTool) {
    const current = loadCustomTools();
    if (current.some((t) => t.name === tool.name)) {
      setAddedNames(new Set(current.map((t) => t.name)));
      setJustAdded(tool.name);
      return;
    }
    if (current.length >= MAX_CUSTOM_TOOLS) {
      setLimitHit(true);
      return;
    }
    const next = [...current, { ...tool, id: genId() }];
    saveCustomTools(next);
    setAddedNames(new Set(next.map((t) => t.name)));
    setJustAdded(tool.name);
    setLimitHit(false);
  }

  return (
    <section className="mt-7" data-testid="tool-templates">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <LayoutTemplate className="h-4 w-4" /> Start from a template
      </h3>
      <p className="mb-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Pick a ready-made tool and click <span className="font-medium text-foreground">Use this template</span> to add it
        to your tools. Every tool is governed by default: routing, PII redaction, eval gates, and audit.{" "}
        <Link href="/governance" className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2">
          <ShieldCheck className="h-3.5 w-3.5" /> See governance
        </Link>
      </p>

      {justAdded ? (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          <Check className="h-4 w-4" />
          <span>
            <span className="font-mono font-medium">{justAdded}</span> is now live in the assistant.
          </span>
          <Link href="/assistant" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
            Try it in the Assistant <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <span className="text-emerald-700">(also under the &quot;Your tools&quot; tab)</span>
        </div>
      ) : null}

      {limitHit ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          You have reached the limit of {MAX_CUSTOM_TOOLS} tools. Delete one under &quot;Your tools&quot; to add another.
        </p>
      ) : null}

      <div className="flex flex-col gap-5">
        {TEMPLATE_CATEGORIES.map((cat) => {
          const items = TOOL_TEMPLATES.filter((t) => t.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{cat}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(({ tool, blurb }) => {
                  const added = addedNames.has(tool.name);
                  return (
                    <Card key={tool.id} className="shadow-soft">
                      <CardContent className="flex h-full flex-col gap-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-sm font-semibold text-navy">{tool.name}</p>
                          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
                            {kindLabel[tool.kind]}
                          </span>
                        </div>
                        <p className="flex-1 text-sm text-muted-foreground">{blurb}</p>
                        <Button
                          variant={added ? "outline" : "default"}
                          onClick={() => (added ? remove(tool) : use(tool))}
                          className={
                            added
                              ? "group/tpl mt-1 w-full hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                              : "mt-1 w-full"
                          }
                          aria-label={
                            added ? `Remove template ${tool.name}` : `Use template ${tool.name}`
                          }
                          title={added ? "Added to your tools. Click to remove." : undefined}
                        >
                          {added ? (
                            <>
                              <Check className="h-4 w-4 group-hover/tpl:hidden" />
                              <X className="hidden h-4 w-4 group-hover/tpl:block" />
                              <span className="group-hover/tpl:hidden">Added</span>
                              <span className="hidden group-hover/tpl:inline">Remove</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" /> Use this template
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
