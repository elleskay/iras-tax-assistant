"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Calculator, UserCheck, Wrench, Plus, Trash2, Play, Plug, Sparkles, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageGuide } from "@/components/page-guide";
import { lookupFromPairs, formatEstimate } from "@/lib/tax";
import {
  type BuiltinToolsConfig,
  DEFAULT_BUILTIN_CONFIG,
  loadBuiltinConfig,
  saveBuiltinConfig,
} from "@/lib/builtin-tools";
import {
  type CustomTool,
  CustomToolSchema,
  MAX_CUSTOM_TOOLS,
  loadCustomTools,
  saveCustomTools,
  toolParams,
} from "@/lib/custom-tools";

export default function ToolsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 pb-16">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
        <Wrench className="h-5 w-5" /> MCP tools
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The built-in tools are configurable: enable or disable each one, edit its
        description, and edit the lookup facts. Your edits apply to the assistant.
        Below them, your own tools (three examples are preloaded) and how to
        connect over MCP.
      </p>

      <PageGuide page="tools" className="mt-4" />

      <BuiltinTools />
      <CustomTools />
      <McpConnect />
    </main>
  );
}

/* ---------- connect via MCP ---------- */

function McpConnect() {
  const [origin, setOrigin] = useState("https://your-deployment");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const endpoint = `${origin}/api/mcp`;
  const config = JSON.stringify(
    { mcpServers: { "iras-tax": { type: "http", url: endpoint } } },
    null,
    2,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions, non-secure context): leave the
      // snippet selectable instead.
    }
  }

  return (
    <section className="mt-10" data-testid="mcp-connect">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Plug className="h-4 w-4" /> Connect via MCP
      </h3>
      <Card className="shadow-soft">
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            These tools are also served over the Model Context Protocol, so any
            MCP client (Claude Code, the MCP inspector) can call them directly.
            The Streamable HTTP endpoint is:
          </p>
          <code data-testid="mcp-endpoint" className="w-fit rounded-md border bg-secondary/40 px-2 py-1 font-mono text-sm text-foreground">
            {endpoint}
          </code>
          <p className="text-sm text-muted-foreground">
            Add it to a client with this <span className="font-mono">.mcp.json</span> entry:
          </p>
          <pre data-testid="mcp-config" className="overflow-x-auto rounded-md border bg-secondary/40 p-3 font-mono text-xs text-foreground">
            {config}
          </pre>
          <div className="flex items-center gap-3">
            <Button onClick={copy}>{copied ? "Copied" : "Copy config"}</Button>
            <p className="text-xs text-muted-foreground">
              lookup and calculate are public (rate limited); escalation requires
              a bearer token when the server sets MCP_API_KEY.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="h-4 w-4 accent-[var(--primary)]"
      />
      {on ? "Enabled" : "Disabled"}
    </label>
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

/* ---------- built-in tools (configurable) ---------- */

function BuiltinTools() {
  const [cfg, setCfg] = useState<BuiltinToolsConfig>(DEFAULT_BUILTIN_CONFIG);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCfg(loadBuiltinConfig());
    setHydrated(true);
  }, []);

  function update(next: BuiltinToolsConfig) {
    setCfg(next);
    if (hydrated) saveBuiltinConfig(next);
  }

  // lookup run
  const [topic, setTopic] = useState("GST");
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  // estimate run
  const [income, setIncome] = useState("120000");
  const [deductions, setDeductions] = useState("20000");
  const [estResult, setEstResult] = useState<string | null>(null);

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Built-in</h3>
        <button type="button" onClick={() => update(DEFAULT_BUILTIN_CONFIG)} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {/* lookup_tax_info */}
        <Card className="shadow-soft">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                  <Search className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-sm font-semibold text-navy">lookup_tax_info</p>
                  <p className="font-mono text-xs text-muted-foreground">(topic: string)</p>
                </div>
              </div>
              <Toggle on={cfg.lookup.enabled} label="Enable lookup_tax_info" onChange={(v) => update({ ...cfg, lookup: { ...cfg.lookup, enabled: v } })} />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <input
                aria-label="lookup_tax_info description"
                value={cfg.lookup.description}
                onChange={(e) => update({ ...cfg, lookup: { ...cfg.lookup, description: e.target.value } })}
                className="min-h-9 w-full rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Facts (keyword to answer)</span>
              {cfg.lookup.facts.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    aria-label={`Fact ${i + 1} keyword`}
                    value={f.key}
                    onChange={(e) => update({ ...cfg, lookup: { ...cfg.lookup, facts: cfg.lookup.facts.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) } })}
                    className="min-h-9 w-1/4 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
                  />
                  <input
                    aria-label={`Fact ${i + 1} answer`}
                    value={f.value}
                    onChange={(e) => update({ ...cfg, lookup: { ...cfg.lookup, facts: cfg.lookup.facts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) } })}
                    className="min-h-9 flex-1 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
                  />
                  <button type="button" aria-label={`Remove fact ${i + 1}`} onClick={() => update({ ...cfg, lookup: { ...cfg.lookup, facts: cfg.lookup.facts.filter((_, j) => j !== i) } })} className="rounded-md px-2 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => update({ ...cfg, lookup: { ...cfg.lookup, facts: [...cfg.lookup.facts, { key: "", value: "" }] } })} className="self-start text-sm font-medium text-primary">
                + Add fact
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="lookup-topic">Topic</label>
              <input id="lookup-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. GST" className="min-h-10 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus:border-primary" />
              <Button onClick={() => setLookupResult(lookupFromPairs(cfg.lookup.facts, topic))} disabled={!topic.trim()}>
                <Play className="h-4 w-4" /> Run
              </Button>
            </div>
            <Result value={lookupResult} testid="tool-result" />
          </CardContent>
        </Card>

        {/* calculate_tax_estimate */}
        <Card className="shadow-soft">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                  <Calculator className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-sm font-semibold text-navy">calculate_tax_estimate</p>
                  <p className="font-mono text-xs text-muted-foreground">(income: number, deductions: number)</p>
                </div>
              </div>
              <Toggle on={cfg.estimate.enabled} label="Enable calculate_tax_estimate" onChange={(v) => update({ ...cfg, estimate: { ...cfg.estimate, enabled: v } })} />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <input
                aria-label="calculate_tax_estimate description"
                value={cfg.estimate.description}
                onChange={(e) => update({ ...cfg, estimate: { ...cfg.estimate, description: e.target.value } })}
                className="min-h-9 w-full rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <p className="text-xs text-muted-foreground">Logic is fixed: chargeable income is income minus deductions, floored at zero.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input aria-label="Gross income" inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="Gross income" className="min-h-10 flex-1 rounded-md border bg-card px-3 text-sm tabular-nums outline-none focus:border-primary" />
              <input aria-label="Deductions" inputMode="numeric" value={deductions} onChange={(e) => setDeductions(e.target.value)} placeholder="Deductions" className="min-h-10 flex-1 rounded-md border bg-card px-3 text-sm tabular-nums outline-none focus:border-primary" />
              <Button onClick={() => setEstResult(formatEstimate(Number(income) || 0, Number(deductions) || 0))}>
                <Play className="h-4 w-4" /> Run
              </Button>
            </div>
            <Result value={estResult} testid="estimate-result" />
          </CardContent>
        </Card>

        {/* escalate_to_human */}
        <Card className="shadow-soft">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                  <UserCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-sm font-semibold text-navy">escalate_to_human</p>
                  <p className="font-mono text-xs text-muted-foreground">(reason: string, original_query: string)</p>
                </div>
              </div>
              <Toggle on={cfg.escalate.enabled} label="Enable escalate_to_human" onChange={(v) => update({ ...cfg, escalate: { ...cfg.escalate, enabled: v } })} />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <input
                aria-label="escalate_to_human description"
                value={cfg.escalate.description}
                onChange={(e) => update({ ...cfg, escalate: { ...cfg.escalate, description: e.target.value } })}
                className="min-h-9 w-full rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Logic is fixed: it writes to the advisor queue.{" "}
              <Link href="/admin" className="font-medium text-primary underline underline-offset-2">See the queue</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/* ---------- custom tools (unchanged builder) ---------- */

function CustomTools() {
  const [tools, setTools] = useState<CustomTool[]>([]);
  const [editing, setEditing] = useState<CustomTool | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    setTools(loadCustomTools());
  }, []);

  function persist(next: CustomTool[]) {
    setTools(next);
    saveCustomTools(next);
  }
  function upsert(tool: CustomTool) {
    const next = tools.some((t) => t.id === tool.id) ? tools.map((t) => (t.id === tool.id ? tool : t)) : [...tools, tool];
    persist(next);
    setShowBuilder(false);
    setEditing(null);
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-4 w-4" /> Your tools
        </h3>
        {!showBuilder && tools.length < MAX_CUSTOM_TOOLS ? (
          <Button onClick={() => { setEditing(null); setShowBuilder(true); }}>
            <Plus className="h-4 w-4" /> New tool
          </Button>
        ) : null}
      </div>

      {showBuilder ? (
        <div className="mb-4">
          <ToolBuilder initial={editing} onCancel={() => { setShowBuilder(false); setEditing(null); }} onSave={upsert} />
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {tools.length === 0 && !showBuilder ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
              <Sparkles className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No custom tools yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Build a keyword lookup, a response template, or a sandboxed code tool. It stays in your browser and the Assistant can call it.
              </p>
            </CardContent>
          </Card>
        ) : null}
        {tools.map((t) => (
          <CustomToolCard key={t.id} tool={t} onEdit={() => { setEditing(t); setShowBuilder(true); }} onDelete={() => persist(tools.filter((x) => x.id !== t.id))} />
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
    <Card className="border-primary/40 shadow-soft">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(["lookup", "template", "code"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-md border px-3 py-1.5 text-sm font-medium ${kind === k ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
              {k === "lookup" ? "Lookup table" : k === "template" ? "Response template" : "Code (sandboxed)"}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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
      </CardContent>
    </Card>
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
