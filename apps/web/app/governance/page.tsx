import { LayoutDashboard, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  aggregateByModel,
  computeStats,
  getEffectivePolicy,
  loadPlatformActivity,
} from "@/lib/governance";

// Reads the live stores at request time, never at build time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Dashboard - AI Tax Assistant Platform",
};

function Stat({
  label,
  value,
  tone,
  sub,
  href,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
  sub?: string;
  href?: string;
}) {
  const card = (
    <Card
      className={`h-full shadow-soft ${href ? "transition-colors hover:border-primary/50" : ""}`}
    >
      <CardContent className="px-4 py-3">
        <div
          className={`text-2xl font-semibold tabular-nums ${
            tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-[var(--warning-foreground)]" : "text-navy"
          }`}
        >
          {value}
        </div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
  return href ? (
    <a href={href} className="block">
      {card}
    </a>
  ) : (
    card
  );
}

function Sparkline({ values, threshold }: { values: number[]; threshold: number }) {
  if (values.length < 2) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Not enough eval runs yet to show a trend.
      </p>
    );
  }
  const w = 280;
  const h = 60;
  const pad = 6;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - v / 100) * (h - 2 * pad);
  const points = values
    .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full text-primary"
      role="img"
      aria-label="Eval pass-rate trend across recent runs"
    >
      <line
        x1={pad}
        y1={y(threshold)}
        x2={w - pad}
        y2={y(threshold)}
        stroke="currentColor"
        strokeDasharray="3 3"
        className="text-muted-foreground/40"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="currentColor" />
      ))}
    </svg>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy">{children}</h3>;
}

export default async function DashboardPage() {
  // Platform-wide: aggregates activity from every workspace, not the selected one.
  const { calls, runs, workspaceCount } = await loadPlatformActivity();
  const policy = await getEffectivePolicy();
  const g = policy.guardrails;
  const ceiling = g.costCeiling.usdPerCall;
  const stats = computeStats(calls, runs, ceiling, g.evalGate.threshold);

  const byModel = aggregateByModel(calls);
  const maxModelCalls = Math.max(1, ...byModel.map((m) => m.calls));
  const trend = [...runs]
    .slice(0, 12)
    .reverse()
    .map((r) => r.passRate);
  const overCeilingRate = stats.totalCalls
    ? (stats.overCeiling / stats.totalCalls) * 100
    : 0;
  const fallbackRate = stats.totalCalls
    ? (stats.fallbacks / stats.totalCalls) * 100
    : 0;
  const times = calls.map((c) => c.timestamp).sort();
  const fromTs = times[0];
  const toTs = times[times.length - 1];
  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-SG", { dateStyle: "medium" });
    } catch {
      return iso;
    }
  };
  const usd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <LayoutDashboard className="h-5 w-5" /> AI Dashboard
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Platform-wide health across all {workspaceCount} workspaces, usage,
          evaluation quality, cost, and reliability under one uniform governance
          standard. Flagged cards link to the detail.
        </p>
      </div>

      <main id="main" className="flex flex-col gap-6">
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="Model calls"
              value={stats.totalCalls.toLocaleString()}
              sub={`across ${workspaceCount} workspaces`}
            />
            <Stat
              label={`Eval gate (≥${g.evalGate.threshold}%)`}
              value={stats.latestPassRate == null ? "n/a" : `${stats.latestPassRate}%`}
              tone={stats.evalGatePass == null ? undefined : stats.evalGatePass ? "good" : "warn"}
              sub={runs.length ? `latest of ${runs.length} runs` : "no runs yet"}
              href="/evals"
            />
            <Stat
              label="Over cost ceiling"
              value={stats.overCeiling.toLocaleString()}
              tone={stats.overCeiling ? "warn" : "good"}
              sub={`${overCeilingRate.toFixed(1)}% of calls`}
              href="/governance/audit"
            />
            <Stat
              label="Fallbacks"
              value={stats.fallbacks.toLocaleString()}
              tone={stats.fallbacks ? "warn" : undefined}
              sub={`${fallbackRate.toFixed(1)}% of calls`}
              href="/governance/audit"
            />
            <Stat
              label="Total cost"
              value={usd(stats.totalCostUsd)}
              sub={`across ${stats.totalCalls.toLocaleString()} calls`}
            />
          </div>
          {fromTs ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Activity from {fmtDate(fromTs)} to {fmtDate(toTs)}, aggregated across
              all workspaces.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-soft">
            <CardContent className="p-4">
              <SectionTitle>Cost and volume by model</SectionTitle>
              {byModel.length === 0 ? (
                <p className="text-sm text-muted-foreground">No model calls yet.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {byModel.map((m) => (
                    <li key={m.model} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-foreground">{m.model}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {m.calls.toLocaleString()} calls &middot; {usd(m.costUsd)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(m.calls / maxModelCalls) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardContent className="p-4">
              <SectionTitle>Eval pass-rate trend</SectionTitle>
              <Sparkline values={trend} threshold={g.evalGate.threshold} />
              <p className="mt-2 text-xs text-muted-foreground">
                Dashed line is the {g.evalGate.threshold}% gate.{" "}
                {stats.latestPassRate == null
                  ? "No runs yet."
                  : `Latest run ${stats.latestPassRate}%.`}
              </p>
            </CardContent>
          </Card>
        </div>

        <div>
          <a
            href="/api/governance/report"
            download
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Download className="h-4 w-4" /> Download AI Risk Assessment (.md)
          </a>
        </div>
      </main>

      <p className="mt-8 text-xs text-muted-foreground">
        Unofficial demo, not affiliated with IRAS.
      </p>
    </div>
  );
}
