"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GitBranch,
  FlaskConical,
  History,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODELS, modelOptionLabel } from "@/lib/model-registry";
import {
  type RoutingConfig,
  type TestCase,
  DEFAULT_CONFIG,
  DEFAULT_CASES,
  applyRoutingRules,
  loadConfig,
  saveConfig,
  loadCases,
  saveCases,
} from "@/lib/routing-rules";

interface CaseResult {
  id: string;
  query: string;
  modelLabel: string;
  reason: string;
  pass: boolean;
  checks: { keyword: string; pass: boolean }[];
  answer: string;
  score?: number;
  rationale?: string;
  error?: string;
}

type Grader = "keyword" | "judge";

interface RunSummary {
  id: string;
  timestamp: string;
  grader: Grader;
  promptVersion?: number;
  total: number;
  passed: number;
  passRate: number;
}

const modelLabel = (id: string) => MODELS.find((m) => m.id === id)?.label ?? id;

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e5).toString(36)}`;
}

export function EvalsWorkbench() {
  const [config, setConfig] = useState<RoutingConfig>(DEFAULT_CONFIG);
  const [cases, setCases] = useState<TestCase[]>(DEFAULT_CASES);
  const [hydrated, setHydrated] = useState(false);
  const [testQuery, setTestQuery] = useState("What is the GST registration threshold?");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CaseResult[] | null>(null);
  const [grader, setGrader] = useState<Grader>("keyword");
  const [promptVersion, setPromptVersion] = useState<string>("");
  const [promptVersions, setPromptVersions] = useState<number[]>([]);
  const [history, setHistory] = useState<RunSummary[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/eval/runs", { cache: "no-store" });
      const data = await res.json();
      setHistory(data.runs ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    setConfig(loadConfig());
    setCases(loadCases());
    setHydrated(true);
    void loadHistory();
    // Offer the stored versions of the assistant prompt for pinned-version runs.
    void fetch("/api/prompts", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { prompts?: { name: string; versions: { version: number }[] }[] }) => {
        const record = data.prompts?.find((p) => p.name === "assistant-system");
        setPromptVersions(record?.versions.map((v) => v.version) ?? []);
      })
      .catch(() => setPromptVersions([]));
  }, [loadHistory]);

  function updateConfig(next: RoutingConfig) {
    setConfig(next);
    if (hydrated) saveConfig(next);
  }
  function updateCases(next: TestCase[]) {
    setCases(next);
    if (hydrated) saveCases(next);
  }

  const preview = applyRoutingRules(config, testQuery);

  async function run() {
    setRunning(true);
    setResults(null);
    const pinnedVersion = promptVersion ? Number(promptVersion) : undefined;
    const out = await Promise.all(
      cases.map(async (c): Promise<CaseResult> => {
        const route = applyRoutingRules(config, c.query);
        try {
          const res = await fetch("/api/eval", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: c.query,
              expects: c.expects,
              modelId: route.modelId,
              grader,
              ...(pinnedVersion !== undefined ? { promptVersion: pinnedVersion } : {}),
            }),
          });
          if (!res.ok) {
            return {
              id: c.id, query: c.query, modelLabel: modelLabel(route.modelId),
              reason: route.reason, pass: false, checks: [], answer: "",
              error: res.status === 429 ? "rate limited" : "failed",
            };
          }
          const data = await res.json();
          return {
            id: c.id, query: c.query, modelLabel: data.model ?? modelLabel(route.modelId),
            reason: route.reason, pass: data.pass, checks: data.checks ?? [], answer: data.answer ?? "",
            ...(typeof data.score === "number" ? { score: data.score } : {}),
            ...(data.rationale ? { rationale: data.rationale } : {}),
          };
        } catch {
          return {
            id: c.id, query: c.query, modelLabel: modelLabel(route.modelId),
            reason: route.reason, pass: false, checks: [], answer: "", error: "failed",
          };
        }
      }),
    );
    setResults(out);
    // Persist the run for the history trend, then refresh it. Errored cases
    // count as fails; storage failures only affect the history panel.
    try {
      await fetch("/api/eval/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grader,
          ...(pinnedVersion !== undefined ? { promptVersion: pinnedVersion } : {}),
          cases: out.map((r) => ({
            query: r.query,
            modelLabel: r.modelLabel,
            pass: r.pass,
            ...(typeof r.score === "number" ? { score: r.score } : {}),
            ...(r.rationale ? { rationale: r.rationale } : {}),
          })),
        }),
      });
      await loadHistory();
    } catch {
      // History is best-effort; the in-page results are already shown.
    }
    setRunning(false);
  }

  // Stats
  const total = results?.length ?? 0;
  const passed = results?.filter((r) => r.pass).length ?? 0;
  const rate = total ? Math.round((passed / total) * 100) : 0;
  const perModel = new Map<string, { pass: number; total: number }>();
  for (const r of results ?? []) {
    const m = perModel.get(r.modelLabel) ?? { pass: 0, total: 0 };
    m.total += 1;
    if (r.pass) m.pass += 1;
    perModel.set(r.modelLabel, m);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Routing rules */}
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
              First rule whose any keyword appears in the query wins, otherwise the
              fallback. This is the deterministic router the assistant uses.
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

      {/* Test cases */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <FlaskConical className="h-4 w-4" /> Test cases
        </h3>
        <Card className="shadow-soft">
          <CardContent className="flex flex-col gap-3">
            {cases.map((c, i) => (
              <div key={c.id} className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row">
                <input
                  aria-label={`Case ${i + 1} query`}
                  value={c.query}
                  onChange={(e) => updateCases(cases.map((x, j) => (j === i ? { ...x, query: e.target.value } : x)))}
                  placeholder="question"
                  className="min-h-9 flex-1 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
                />
                <input
                  aria-label={`Case ${i + 1} expected keywords`}
                  value={c.expects.join(", ")}
                  onChange={(e) =>
                    updateCases(cases.map((x, j) => (j === i ? { ...x, expects: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)))
                  }
                  placeholder="must contain (comma separated)"
                  className="min-h-9 flex-1 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  aria-label={`Remove case ${i + 1}`}
                  onClick={() => updateCases(cases.filter((_, j) => j !== i))}
                  className="rounded-md px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {cases.length < 8 ? (
                <button
                  type="button"
                  onClick={() => updateCases([...cases, { id: genId("c"), query: "", expects: [] }])}
                  className="text-sm font-medium text-primary"
                >
                  + Add case
                </button>
              ) : <span />}
              <span className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Grader"
                  value={grader}
                  onChange={(e) => setGrader(e.target.value as Grader)}
                  className="min-h-9 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
                >
                  <option value="keyword">Keyword grader</option>
                  <option value="judge">LLM judge</option>
                </select>
                {promptVersions.length > 0 ? (
                  <select
                    aria-label="Prompt version"
                    value={promptVersion}
                    onChange={(e) => setPromptVersion(e.target.value)}
                    className="min-h-9 rounded-md border bg-card px-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Active prompt</option>
                    {promptVersions.map((v) => (
                      <option key={v} value={v}>Prompt v{v}</option>
                    ))}
                  </select>
                ) : null}
                <Button onClick={run} disabled={running || cases.length === 0}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {running ? "Running..." : "Run"}
                </Button>
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Stats (populated on run) */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Results
        </h3>
        {!results ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Edit the rules and cases above, then click Run to populate the stats.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4" data-testid="eval-stats">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Pass rate" value={`${rate}%`} accent />
              <Stat label="Passed" value={`${passed}/${total}`} />
              <Stat label="Models used" value={String(perModel.size)} />
            </div>

            {perModel.size > 0 ? (
              <Card className="shadow-soft">
                <CardContent className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    By model
                  </p>
                  {[...perModel.entries()].map(([label, s]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{label}</span>
                      <span className="tabular-nums text-muted-foreground">{s.pass}/{s.total} passed</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <ul className="flex flex-col gap-2">
              {results.map((r) => (
                <li key={r.id}>
                  <Card className="shadow-soft">
                    <CardContent className="flex flex-col gap-1 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {r.pass ? (
                            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          {r.query}
                        </span>
                        <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">
                          {r.modelLabel}
                        </Badge>
                      </div>
                      {r.error ? (
                        <p className="pl-6 text-xs text-destructive">{r.error}</p>
                      ) : (
                        <>
                          {r.checks.length > 0 ? (
                            <p className="pl-6 text-xs text-muted-foreground">
                              {r.checks.map((c) => `${c.pass ? "ok" : "miss"}: ${c.keyword}`).join("  |  ")}
                            </p>
                          ) : null}
                          {r.rationale ? (
                            <p className={`pl-6 text-xs ${r.pass ? "text-muted-foreground" : "text-destructive"}`}>
                              {typeof r.score === "number" ? `Judge score ${r.score}: ` : ""}
                              {r.rationale}
                            </p>
                          ) : null}
                          {r.answer ? (
                            <details className="pl-6 text-xs">
                              <summary className="cursor-pointer text-primary">
                                Show response
                              </summary>
                              <pre className="mt-1 whitespace-pre-wrap rounded-md border bg-secondary/40 p-2 text-foreground">
                                {r.answer}
                              </pre>
                            </details>
                          ) : null}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Run history (persisted server-side) */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <History className="h-4 w-4" /> Run history
        </h3>
        {history.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No runs recorded yet. Completed runs are stored server-side and the
              pass-rate trend appears here.
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-soft" data-testid="run-history">
            <CardContent className="flex flex-col gap-4">
              {/* Oldest to newest, left to right */}
              <div className="flex h-16 items-end gap-1">
                {[...history].reverse().map((r) => (
                  <div
                    key={r.id}
                    data-testid="run-bar"
                    title={`${r.passRate}%`}
                    style={{ height: `${Math.max(8, r.passRate)}%` }}
                    className="w-3 rounded-sm bg-primary/70"
                  />
                ))}
              </div>
              <ul className="flex flex-col gap-2">
                {history.map((r) => (
                  <li
                    key={r.id}
                    data-testid="run-entry"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {new Date(r.timestamp).toLocaleString()}
                      </span>
                      <Badge className="bg-secondary font-mono text-secondary-foreground hover:bg-secondary">
                        {r.grader}
                      </Badge>
                      {r.promptVersion !== undefined ? (
                        <Badge className="bg-accent font-mono text-accent-foreground hover:bg-accent">
                          Prompt v{r.promptVersion}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.passed}/{r.total} <b className="text-navy">{r.passRate}%</b>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="shadow-soft">
      <CardContent className="py-4">
        <p className={`text-2xl font-semibold tabular-nums ${accent ? "text-primary" : "text-navy"}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
