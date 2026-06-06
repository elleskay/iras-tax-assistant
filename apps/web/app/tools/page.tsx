"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Calculator, UserCheck, Wrench, Plus, Trash2, Play, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  type CustomTool,
  CustomToolSchema,
  MAX_CUSTOM_TOOLS,
  loadCustomTools,
  saveCustomTools,
  runCustomTool,
  toolParams,
} from "@/lib/custom-tools";

async function runBuiltin(body: unknown): Promise<string> {
  const res = await fetch("/api/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.result ?? data.error ?? "Something went wrong.";
}

export default function ToolsPage() {
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
    const next = tools.some((t) => t.id === tool.id)
      ? tools.map((t) => (t.id === tool.id ? tool : t))
      : [...tools, tool];
    persist(next);
    setShowBuilder(false);
    setEditing(null);
  }

  function remove(id: string) {
    persist(tools.filter((t) => t.id !== id));
  }

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 pb-16">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
        <Wrench className="h-4 w-4" /> iras-mcp-server
      </div>
      <h2 className="text-xl font-semibold text-navy">MCP tools</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The built-in tools below are exposed by the IRAS MCP server, the same tools
        the assistant calls. You can also build your own and the Assistant will be
        able to call them too.
      </p>

      {/* Built-in tools */}
      <h3 className="mt-7 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Built-in
      </h3>
      <div className="mt-3 flex flex-col gap-4">
        <LookupTool />
        <EstimateTool />
        <EscalateInfo />
      </div>

      {/* Custom tools */}
      <div className="mt-10 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-4 w-4" /> Your tools
        </h3>
        {!showBuilder && tools.length < MAX_CUSTOM_TOOLS ? (
          <Button
            onClick={() => {
              setEditing(null);
              setShowBuilder(true);
            }}
          >
            <Plus className="h-4 w-4" /> New tool
          </Button>
        ) : null}
      </div>

      {showBuilder ? (
        <div className="mt-4">
          <ToolBuilder
            initial={editing}
            onCancel={() => {
              setShowBuilder(false);
              setEditing(null);
            }}
            onSave={upsert}
          />
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        {tools.length === 0 && !showBuilder ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
              <Sparkles className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No custom tools yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Build a keyword lookup or a response template. It stays in your
                browser and the Assistant can call it.
              </p>
            </CardContent>
          </Card>
        ) : null}
        {tools.map((t) => (
          <CustomToolCard
            key={t.id}
            tool={t}
            onEdit={() => {
              setEditing(t);
              setShowBuilder(true);
            }}
            onDelete={() => remove(t.id)}
          />
        ))}
      </div>
    </main>
  );
}

/* ---------- built-in tool cards ---------- */

function ToolShell({
  icon: Icon,
  name,
  signature,
  description,
  badge,
  children,
}: {
  icon: typeof Search;
  name: string;
  signature: string;
  description: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="shadow-soft">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-mono text-sm font-semibold text-navy">{name}</p>
              <p className="font-mono text-xs text-muted-foreground">{signature}</p>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {badge}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Result({ value, testid }: { value: string | null; testid: string }) {
  if (value === null) return null;
  return (
    <pre
      data-testid={testid}
      className="whitespace-pre-wrap rounded-md border bg-secondary/40 p-3 text-sm text-foreground"
    >
      {value}
    </pre>
  );
}

function LookupTool() {
  const [topic, setTopic] = useState("GST");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <ToolShell
      icon={Search}
      name="lookup_tax_info"
      signature="(topic: string)"
      description="Look up factual Singapore tax rules: GST, income tax, corporate tax, or SRS."
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="lookup-topic">
          Topic
        </label>
        <input
          id="lookup-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. GST"
          className="min-h-10 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus:border-primary"
        />
        <Button
          onClick={async () => {
            setLoading(true);
            try {
              setResult(await runBuiltin({ tool: "lookup_tax_info", topic }));
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading || !topic.trim()}
        >
          {loading ? "Running..." : "Run"}
        </Button>
      </div>
      <Result value={result} testid="tool-result" />
    </ToolShell>
  );
}

function EstimateTool() {
  const [income, setIncome] = useState("120000");
  const [deductions, setDeductions] = useState("20000");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <ToolShell
      icon={Calculator}
      name="calculate_tax_estimate"
      signature="(income: number, deductions: number)"
      description="Estimate chargeable income from gross income and deductions, in SGD."
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Gross income"
          inputMode="numeric"
          value={income}
          onChange={(e) => setIncome(e.target.value)}
          placeholder="Gross income"
          className="min-h-10 flex-1 rounded-md border bg-card px-3 text-sm tabular-nums outline-none focus:border-primary"
        />
        <input
          aria-label="Deductions"
          inputMode="numeric"
          value={deductions}
          onChange={(e) => setDeductions(e.target.value)}
          placeholder="Deductions"
          className="min-h-10 flex-1 rounded-md border bg-card px-3 text-sm tabular-nums outline-none focus:border-primary"
        />
        <Button
          onClick={async () => {
            setLoading(true);
            try {
              setResult(
                await runBuiltin({
                  tool: "calculate_tax_estimate",
                  income: Number(income) || 0,
                  deductions: Number(deductions) || 0,
                }),
              );
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
        >
          {loading ? "Running..." : "Run"}
        </Button>
      </div>
      <Result value={result} testid="tool-result" />
    </ToolShell>
  );
}

function EscalateInfo() {
  return (
    <ToolShell
      icon={UserCheck}
      name="escalate_to_human"
      signature="(reason: string, original_query: string)"
      description="Routes personal or complex queries to a human advisor. Not runnable here because it writes to the advisor queue."
    >
      <Link
        href="/admin"
        className="text-sm font-medium text-primary underline underline-offset-2"
      >
        See escalations in the advisor queue
      </Link>
    </ToolShell>
  );
}

/* ---------- custom tool card + runner ---------- */

function CustomToolCard({
  tool,
  onEdit,
  onDelete,
}: {
  tool: CustomTool;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const params = toolParams(tool);
  const [input, setInput] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);

  function run() {
    const coerced: Record<string, unknown> = {};
    for (const p of params) {
      coerced[p.name] = p.type === "number" ? Number(input[p.name] ?? "") : input[p.name] ?? "";
    }
    setResult(runCustomTool(tool, coerced));
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
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
            >
              Edit
            </button>
            <button
              type="button"
              aria-label={`Delete ${tool.name}`}
              onClick={onDelete}
              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          {params.map((p) => (
            <div key={p.name} className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`${tool.id}-${p.name}`}>
                {p.name}
              </label>
              <input
                id={`${tool.id}-${p.name}`}
                inputMode={p.type === "number" ? "numeric" : "text"}
                value={input[p.name] ?? ""}
                onChange={(e) => setInput({ ...input, [p.name]: e.target.value })}
                placeholder={p.description || p.name}
                className="min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-primary"
              />
            </div>
          ))}
          <Button onClick={run}>
            <Play className="h-4 w-4" /> Run
          </Button>
        </div>
        <Result value={result} testid="custom-tool-result" />
      </CardContent>
    </Card>
  );
}

/* ---------- builder ---------- */

function genId() {
  return `t_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function ToolBuilder({
  initial,
  onSave,
  onCancel,
}: {
  initial: CustomTool | null;
  onSave: (t: CustomTool) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<CustomTool["kind"]>(initial?.kind ?? "lookup");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // lookup
  const [paramName, setParamName] = useState(
    initial?.kind === "lookup" ? initial.paramName : "query",
  );
  const [pairs, setPairs] = useState<{ key: string; value: string }[]>(
    initial?.kind === "lookup" ? initial.pairs : [{ key: "", value: "" }],
  );
  const [fallback, setFallback] = useState(
    initial?.kind === "lookup" ? (initial.fallback ?? "") : "",
  );
  // template
  const [params, setParams] = useState<{ name: string; type: "string" | "number" }[]>(
    initial?.kind === "template" ? initial.params.map((p) => ({ name: p.name, type: p.type })) : [{ name: "name", type: "string" }],
  );
  const [template, setTemplate] = useState(
    initial?.kind === "template" ? initial.template : "",
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    const draft: Record<string, unknown> = {
      id: initial?.id ?? genId(),
      name: name.trim(),
      description: description.trim(),
      kind,
    };
    if (kind === "lookup") {
      draft.paramName = paramName.trim() || "query";
      draft.pairs = pairs.filter((p) => p.key.trim() && p.value.trim());
      if (fallback.trim()) draft.fallback = fallback.trim();
    } else {
      draft.params = params.filter((p) => p.name.trim());
      draft.template = template;
    }
    const parsed = CustomToolSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the fields.");
      return;
    }
    onSave(parsed.data);
  }

  return (
    <Card className="border-primary/40 shadow-soft">
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          {(["lookup", "template"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium capitalize ${
                kind === k ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"
              }`}
            >
              {k === "lookup" ? "Lookup table" : "Response template"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tool name (snake_case)">
            <input
              aria-label="Tool name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_tool"
              className="min-h-10 w-full rounded-md border bg-card px-3 font-mono text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Description">
            <input
              aria-label="Tool description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this tool does"
              className="min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>

        {kind === "lookup" ? (
          <>
            <Field label="Input parameter name">
              <input
                aria-label="Parameter name"
                value={paramName}
                onChange={(e) => setParamName(e.target.value)}
                placeholder="query"
                className="min-h-10 w-full rounded-md border bg-card px-3 font-mono text-sm outline-none focus:border-primary sm:w-48"
              />
            </Field>
            <Field label="Keyword to answer pairs">
              <div className="flex flex-col gap-2">
                {pairs.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      aria-label={`Keyword ${i + 1}`}
                      value={p.key}
                      onChange={(e) =>
                        setPairs(pairs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                      }
                      placeholder="keyword"
                      className="min-h-10 w-1/3 rounded-md border bg-card px-3 text-sm outline-none focus:border-primary"
                    />
                    <input
                      aria-label={`Answer ${i + 1}`}
                      value={p.value}
                      onChange={(e) =>
                        setPairs(pairs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                      }
                      placeholder="answer returned for this keyword"
                      className="min-h-10 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus:border-primary"
                    />
                    {pairs.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove pair ${i + 1}`}
                        onClick={() => setPairs(pairs.filter((_, j) => j !== i))}
                        className="rounded-md px-2 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPairs([...pairs, { key: "", value: "" }])}
                  className="self-start text-sm font-medium text-primary"
                >
                  + Add pair
                </button>
              </div>
            </Field>
            <Field label="Fallback answer (optional)">
              <input
                aria-label="Fallback answer"
                value={fallback}
                onChange={(e) => setFallback(e.target.value)}
                placeholder="Shown when nothing matches"
                className="min-h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-primary"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Parameters">
              <div className="flex flex-col gap-2">
                {params.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      aria-label={`Parameter ${i + 1} name`}
                      value={p.name}
                      onChange={(e) =>
                        setParams(params.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder="param_name"
                      className="min-h-10 flex-1 rounded-md border bg-card px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                    <select
                      aria-label={`Parameter ${i + 1} type`}
                      value={p.type}
                      onChange={(e) =>
                        setParams(params.map((x, j) => (j === i ? { ...x, type: e.target.value as "string" | "number" } : x)))
                      }
                      className="min-h-10 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                    </select>
                    {params.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove parameter ${i + 1}`}
                        onClick={() => setParams(params.filter((_, j) => j !== i))}
                        className="rounded-md px-2 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setParams([...params, { name: "", type: "string" }])}
                  className="self-start text-sm font-medium text-primary"
                >
                  + Add parameter
                </button>
              </div>
            </Field>
            <Field label="Response template (use {param} placeholders)">
              <textarea
                aria-label="Response template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Hello {name}, your reference is {ref}."
                rows={3}
                className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
          </>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button onClick={save}>Save tool</Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
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
