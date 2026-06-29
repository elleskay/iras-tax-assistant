"use client";

import { useEffect, useState } from "react";
import { Wrench, Plus, Trash2, Play, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ToolTemplates } from "@/components/tool-templates";
import {
  type CustomTool,
  CustomToolSchema,
  CUSTOM_TOOLS_CHANGED,
  MAX_CUSTOM_TOOLS,
  loadCustomTools,
  saveCustomTools,
  toolParams,
} from "@/lib/custom-tools";

const SECTIONS = [
  { id: "templates", label: "Templates" },
  { id: "custom", label: "Your tools" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function ToolsPage() {
  const [tab, setTab] = useState<SectionId>("templates");
  const [tools, setTools] = useState<CustomTool[]>([]);
  const [editing, setEditing] = useState<CustomTool | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    const reload = () => setTools(loadCustomTools());
    reload();
    // Re-read when a tool is added/removed elsewhere (e.g. the Templates tab).
    window.addEventListener(CUSTOM_TOOLS_CHANGED, reload);
    return () => window.removeEventListener(CUSTOM_TOOLS_CHANGED, reload);
  }, []);

  function persist(next: CustomTool[]) {
    setTools(next);
    saveCustomTools(next);
  }
  function upsert(tool: CustomTool) {
    const next = tools.some((t) => t.id === tool.id)
      ? tools.map((t) => (t.id === tool.id ? tool : t))
      : [...tools, tool];
    persist(next);
    setShowBuilder(false);
    setEditing(null);
  }
  function openNew() {
    setEditing(null);
    setShowBuilder(true);
    setTab("custom");
  }

  const atLimit = tools.length >= MAX_CUSTOM_TOOLS;

  return (
    <main id="main" className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
        <Wrench className="h-5 w-5" /> AI Tools
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Build tools without code: start from a template or create your own (lookup
        table, message template, or sandboxed calculator). Anything you add is
        available to the assistant straight away, with guardrails applied.
      </p>

      {/* Tabs keep each section focused; "New tool" sits in the bar so it is
          reachable from either tab. */}
      <div className="sticky top-16 z-20 -mx-4 mt-6 border-b bg-background px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <nav className="flex flex-wrap gap-1" aria-label="Tool sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setTab(s.id)}
                aria-current={tab === s.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === s.id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <Button
            size="sm"
            onClick={openNew}
            disabled={atLimit}
            title={
              atLimit
                ? `Tool limit reached (${MAX_CUSTOM_TOOLS}). Delete one under Your tools to add another.`
                : undefined
            }
          >
            <Plus className="h-4 w-4" /> New tool
          </Button>
        </div>
      </div>

      {/* Inactive sections stay mounted (hidden) so in-progress edits survive
          switching tabs. */}
      <div className={tab === "templates" ? "" : "hidden"}>
        <ToolTemplates />
      </div>
      <div className={tab === "custom" ? "" : "hidden"}>
        <CustomTools
          tools={tools}
          onEdit={(t) => { setEditing(t); setShowBuilder(true); }}
          onDelete={(id) => persist(tools.filter((x) => x.id !== id))}
        />
      </div>

      {/* The builder modal lives at the page level so New tool works from any tab. */}
      <Dialog
        open={showBuilder}
        onOpenChange={(open) => {
          if (!open) {
            setShowBuilder(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] w-full overflow-y-auto p-6 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tool" : "New tool"}</DialogTitle>
            <DialogDescription>
              Build a lookup table, a message template, or a sandboxed
              calculator. It stays in your browser and the assistant can call it.
            </DialogDescription>
          </DialogHeader>
          <ToolBuilder
            initial={editing}
            onCancel={() => { setShowBuilder(false); setEditing(null); }}
            onSave={upsert}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Result({ value, testid }: { value: string | null; testid: string }) {
  if (value === null) return null;
  return (
    <pre data-testid={testid} className="whitespace-pre-wrap rounded-md border bg-secondary/40 p-3 text-sm text-foreground">
      {value}
    </pre>
  );
}

/* ---------- custom tools list (built/edited via the page-level modal) ---------- */

function CustomTools({
  tools,
  onEdit,
  onDelete,
}: {
  tools: CustomTool[];
  onEdit: (tool: CustomTool) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="mt-10">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-4 w-4" /> Your tools
      </h3>

      <div className="flex flex-col gap-4">
        {tools.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
              <Sparkles className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No custom tools yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Add one from the Templates tab, or click New tool to build your own. It stays in your browser and the assistant can call it.
              </p>
            </CardContent>
          </Card>
        ) : null}
        {tools.map((t) => (
          <CustomToolCard key={t.id} tool={t} onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} />
        ))}
      </div>
    </section>
  );
}

function CustomToolCard({ tool, onEdit, onDelete }: { tool: CustomTool; onEdit: () => void; onDelete: () => void }) {
  const params = toolParams(tool);
  const [input, setInput] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // All kinds run server-side via /api/tools/run; code tools execute in the
  // QuickJS sandbox there and are never evaluated in the browser.
  async function run() {
    const coerced: Record<string, string | number> = {};
    for (const p of params) coerced[p.name] = p.type === "number" ? Number(input[p.name] ?? "") || 0 : (input[p.name] ?? "");
    setRunning(true);
    try {
      const res = await fetch("/api/tools/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input: coerced }),
      });
      const data = await res.json();
      setResult(res.ok ? data.result : (data.error ?? "Run failed."));
    } catch {
      setResult("Run failed.");
    } finally {
      setRunning(false);
    }
  }
  const sig = `(${params.map((p) => `${p.name}: ${p.type}`).join(", ")})`;

  return (
    <Card className="shadow-soft" data-testid="custom-tool" data-name={tool.name}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="font-mono text-sm font-semibold text-navy">{tool.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{sig}</p>
              <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={onEdit} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent">Edit</button>
            <button type="button" aria-label={`Delete ${tool.name}`} onClick={onDelete} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          {params.map((p) => (
            <div key={p.name} className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`${tool.id}-${p.name}`}>{p.name}</label>
              <input id={`${tool.id}-${p.name}`} inputMode={p.type === "number" ? "numeric" : "text"} value={input[p.name] ?? ""} onChange={(e) => setInput({ ...input, [p.name]: e.target.value })} placeholder={p.description || p.name} className="min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-primary" />
            </div>
          ))}
          <Button onClick={run} disabled={running}><Play className="h-4 w-4" /> {running ? "Running..." : "Run"}</Button>
        </div>
        <Result value={result} testid="custom-tool-result" />
      </CardContent>
    </Card>
  );
}

function genId() {
  return `t_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const CODE_STARTER = `function run(input) {
  // input carries your declared parameters. Return any JSON value.
  return { echo: input };
}`;

function ToolBuilder({ initial, onSave, onCancel }: { initial: CustomTool | null; onSave: (t: CustomTool) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<CustomTool["kind"]>(initial?.kind ?? "lookup");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [paramName, setParamName] = useState(initial?.kind === "lookup" ? initial.paramName : "query");
  const [pairs, setPairs] = useState<{ key: string; value: string }[]>(initial?.kind === "lookup" ? initial.pairs : [{ key: "", value: "" }]);
  const [fallback, setFallback] = useState(initial?.kind === "lookup" ? (initial.fallback ?? "") : "");
  const [params, setParams] = useState<{ name: string; type: "string" | "number" }[]>(
    initial && initial.kind !== "lookup" ? initial.params.map((p) => ({ name: p.name, type: p.type })) : [{ name: "name", type: "string" }],
  );
  const [template, setTemplate] = useState(initial?.kind === "template" ? initial.template : "");
  const [code, setCode] = useState(initial?.kind === "code" ? initial.code : CODE_STARTER);
  const [error, setError] = useState<string | null>(null);

  function save() {
    const draft: Record<string, unknown> = { id: initial?.id ?? genId(), name: name.trim(), description: description.trim(), kind };
    if (kind === "lookup") {
      draft.paramName = paramName.trim() || "query";
      draft.pairs = pairs.filter((p) => p.key.trim() && p.value.trim());
      if (fallback.trim()) draft.fallback = fallback.trim();
    } else if (kind === "template") {
      draft.params = params.filter((p) => p.name.trim());
      draft.template = template;
    } else {
      draft.params = params.filter((p) => p.name.trim());
      draft.code = code;
    }
    const parsed = CustomToolSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Please check the fields."); return; }
    onSave(parsed.data);
  }

  return (
    <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {(["lookup", "template", "code"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-md border px-3 py-1.5 text-sm font-medium ${kind === k ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
              {k === "lookup" ? "Lookup table" : k === "template" ? "Response template" : "Code (sandboxed)"}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tool name (snake_case)">
            <input aria-label="Tool name" value={name} onChange={(e) => setName(e.target.value)} placeholder="my_tool" className="min-h-10 w-full rounded-md border bg-card px-3 font-mono text-sm outline-none focus:border-primary" />
          </Field>
          <Field label="Description">
            <input aria-label="Tool description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this tool does" className="min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-primary" />
          </Field>
        </div>
        {kind === "lookup" ? (
          <>
            <Field label="Input parameter name">
              <input aria-label="Parameter name" value={paramName} onChange={(e) => setParamName(e.target.value)} placeholder="query" className="min-h-10 w-full rounded-md border bg-card px-3 font-mono text-sm outline-none focus:border-primary sm:w-48" />
            </Field>
            <Field label="Keyword to answer pairs">
              <div className="flex flex-col gap-2">
                {pairs.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input aria-label={`Keyword ${i + 1}`} value={p.key} onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="keyword" className="min-h-10 w-1/3 rounded-md border bg-card px-3 text-sm outline-none focus:border-primary" />
                    <input aria-label={`Answer ${i + 1}`} value={p.value} onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="answer returned for this keyword" className="min-h-10 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus:border-primary" />
                    {pairs.length > 1 ? (
                      <button type="button" aria-label={`Remove pair ${i + 1}`} onClick={() => setPairs(pairs.filter((_, j) => j !== i))} className="rounded-md px-2 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button type="button" onClick={() => setPairs([...pairs, { key: "", value: "" }])} className="self-start text-sm font-medium text-primary">+ Add pair</button>
              </div>
            </Field>
            <Field label="Fallback answer (optional)">
              <input aria-label="Fallback answer" value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="Shown when nothing matches" className="min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-primary" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Parameters">
              <div className="flex flex-col gap-2">
                {params.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input aria-label={`Parameter ${i + 1} name`} value={p.name} onChange={(e) => setParams(params.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="param_name" className="min-h-10 flex-1 rounded-md border bg-card px-3 font-mono text-sm outline-none focus:border-primary" />
                    <select aria-label={`Parameter ${i + 1} type`} value={p.type} onChange={(e) => setParams(params.map((x, j) => (j === i ? { ...x, type: e.target.value as "string" | "number" } : x)))} className="min-h-10 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary">
                      <option value="string">string</option>
                      <option value="number">number</option>
                    </select>
                    {params.length > 1 ? (
                      <button type="button" aria-label={`Remove parameter ${i + 1}`} onClick={() => setParams(params.filter((_, j) => j !== i))} className="rounded-md px-2 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button type="button" onClick={() => setParams([...params, { name: "", type: "string" }])} className="self-start text-sm font-medium text-primary">+ Add parameter</button>
              </div>
            </Field>
            {kind === "template" ? (
              <Field label="Response template (use {param} placeholders)">
                <textarea aria-label="Response template" value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="Hello {name}, your reference is {ref}." rows={3} className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
              </Field>
            ) : (
              <>
                <Field label="JavaScript (must define run(input))">
                  <textarea aria-label="Tool code" value={code} onChange={(e) => setCode(e.target.value)} rows={8} spellCheck={false} className="w-full rounded-md border bg-card px-3 py-2 font-mono text-xs outline-none focus:border-primary" />
                </Field>
                <p className="text-xs text-muted-foreground">
                  Runs server-side in a QuickJS WASM sandbox: 1 second deadline, 32MB
                  memory cap, no network, filesystem, or host access.
                </p>
              </>
            )}
          </>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button onClick={save}>Save tool</Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
