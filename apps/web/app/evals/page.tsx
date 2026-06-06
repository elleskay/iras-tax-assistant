import { BarChart3, GitBranch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EVAL_SUMMARY,
  PROVIDERS,
  CATEGORIES,
  ROUTER_RULES,
  SAMPLE_CASES,
} from "@/lib/eval-data";

export const metadata = {
  title: "Evaluations - IRAS Tax Assistant",
};

export default function EvalsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8 pb-16">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
        <BarChart3 className="h-4 w-4" /> llm-eval-iras
      </div>
      <h2 className="text-xl font-semibold text-navy">Evaluations</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The assistant is graded by an offline eval suite: {EVAL_SUMMARY.cases} test
        cases across {CATEGORIES.length} categories, run against two models. This is
        a snapshot from the last run on {EVAL_SUMMARY.generated}.
      </p>

      {/* Summary stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pass rate" value={`${EVAL_SUMMARY.passRate}%`} accent />
        <Stat label="Passed" value={`${EVAL_SUMMARY.passed}/${EVAL_SUMMARY.runs}`} />
        <Stat label="Test cases" value={String(EVAL_SUMMARY.cases)} />
        <Stat label="Run time" value={`${EVAL_SUMMARY.durationMs} ms`} />
      </div>

      {/* Providers compared */}
      <section className="mt-8">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Models compared
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const pct = Math.round((p.pass / p.total) * 100);
            return (
              <Card key={p.label} className="shadow-soft">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-navy">{p.label}</p>
                    <span className="text-sm font-semibold tabular-nums text-primary">
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {p.pass} of {p.total} cases passed
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Categories */}
      <section className="mt-8">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Categories tested
        </h3>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Badge
              key={c}
              className="bg-secondary text-secondary-foreground hover:bg-secondary"
            >
              {c}
            </Badge>
          ))}
        </div>
      </section>

      {/* Router rules */}
      <section className="mt-8">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <GitBranch className="h-4 w-4" /> Model routing rules
        </h3>
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">
          The router picks a model per query: privacy-sensitive and personalised
          questions go to Anthropic, plain factual lookups to the cheaper OpenAI
          model.
        </p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Routes to</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Reason</th>
              </tr>
            </thead>
            <tbody>
              {ROUTER_RULES.map((r) => (
                <tr key={r.reason} className="border-t bg-card align-top">
                  <td className="px-3 py-2">
                    <p className="text-foreground">{r.match}</p>
                    <p className="mt-0.5 text-xs italic text-muted-foreground">
                      e.g. {r.example}
                    </p>
                  </td>
                  <td className="px-3 py-2 font-medium text-navy">{r.route}</td>
                  <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground sm:table-cell">
                    {r.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sample cases */}
      <section className="mt-8">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sample test cases
        </h3>
        <ul className="flex flex-col gap-2">
          {SAMPLE_CASES.map((c) => (
            <li key={c.description}>
              <Card className="shadow-soft">
                <CardContent className="flex flex-col gap-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {c.description}
                    </p>
                    <Badge className="bg-accent text-accent-foreground hover:bg-accent">
                      {c.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.checks}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="shadow-soft">
      <CardContent className="py-4">
        <p
          className={`text-2xl font-semibold tabular-nums ${accent ? "text-primary" : "text-navy"}`}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
