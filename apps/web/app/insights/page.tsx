"use client";

import { useEffect, useState } from "react";
import {
  Lightbulb,
  GraduationCap,
  FileWarning,
  Timer,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTabs } from "@/components/page-tabs";

interface TrainingNeed {
  label: string;
  count: number;
  examplePrompts: string[];
  recommendation: string;
}
interface DocGap {
  topic: string;
  reason: string;
  count: number;
}
interface ProcImp {
  topic: string;
  avgTurns: number;
  avgSteps: number;
  avgTimeSeconds: number;
  count: number;
}
interface WsInsights {
  name: string;
  generatedAt: string;
  synthetic: boolean;
  totalInteractions: number;
  trainingNeeds: TrainingNeed[];
  docGaps: DocGap[];
  processImprovements: ProcImp[];
}
type Meta = { embeddingPath: string; clusterPath: string; note: string };
type InsightsFile = Record<string, WsInsights | Meta>;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function Section({
  icon: Icon,
  title,
  blurb,
  children,
}: {
  icon: typeof Lightbulb;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-navy">
          <Icon className="h-4 w-4" /> {title}
        </h3>
        <p className="text-sm text-muted-foreground">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsFile | null>(null);
  const [ws, setWs] = useState("individual-income");
  const [err, setErr] = useState(false);

  useEffect(() => {
    setWs(readCookie("workspace") ?? "individual-income");
    fetch("/insights.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no data"))))
      .then((d: InsightsFile) => setData(d))
      .catch(() => setErr(true));
  }, []);

  const meta = data?._meta as Meta | undefined;
  // No cross-workspace fallback: a workspace with no usage data shows the reset
  // (empty) state rather than another workspace's analytics.
  const cur = data?.[ws] as WsInsights | undefined;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <Lightbulb className="h-5 w-5" /> Usage analytics
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          What this workspace&apos;s own usage reveals: the topics officers ask
          about most (training needs), where guidance is missing (documentation
          gaps), and where work takes longest (process improvement). Mined in
          Python with embeddings and clustering.
        </p>
      </div>

      {err ? (
        <p className="text-sm text-muted-foreground">
          No insights artifact found. Generate it with{" "}
          <code>services/insights/generate.py</code>.
        </p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !cur ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Info className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No usage analytics for this workspace yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Analytics are mined from this workspace&apos;s own usage, so a new
              workspace starts empty and fills in as officers use the assistant.
            </p>
          </CardContent>
        </Card>
      ) : (
        <main id="main">
          <Card className="mb-6 border-dashed">
            <CardContent className="flex items-start gap-2 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Illustrative, <span className="font-medium">synthetic</span> usage data
              (live usage is too sparse for a demo).
              {meta ? (
                <span>
                  {" "}
                  Embedding: {meta.embeddingPath}; clustering: {meta.clusterPath}.
                </span>
              ) : null}
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{cur.name}</span> &middot;{" "}
            {cur.totalInteractions.toLocaleString()} interactions analysed.
          </p>
          <PageTabs
            ariaLabel="Usage analytics sections"
            tabs={[
              {
                id: "training",
                label: "Training needs",
                content: (
                  <Section
                    icon={GraduationCap}
                    title="Training needs"
                    blurb="Largest clusters of similar prompts: topics officers ask about repeatedly, where focused training would help most."
                  >
                    <ul className="flex flex-col gap-2">
                      {cur.trainingNeeds.map((t, i) => (
                        <li key={i}>
                          <Card className="shadow-soft">
                            <CardContent className="py-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground">{t.label}</span>
                                <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">
                                  {t.count} queries
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">{t.recommendation}</p>
                              {t.examplePrompts?.length ? (
                                <p className="mt-1 text-xs italic text-muted-foreground">
                                  e.g. {t.examplePrompts.slice(0, 2).join("  /  ")}
                                </p>
                              ) : null}
                            </CardContent>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ),
              },
              {
                id: "gaps",
                label: "Doc & process gaps",
                content: (
                  <Section
                    icon={FileWarning}
                    title="Documentation / process gaps"
                    blurb="Topics where retrieval found little or answers scored low: the guidance that is missing or unclear."
                  >
                    <ul className="flex flex-col gap-2">
                      {cur.docGaps.map((d, i) => (
                        <li key={i}>
                          <Card className="shadow-soft">
                            <CardContent className="py-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground">{d.topic}</span>
                                <Badge className="bg-[var(--warning)] text-[var(--warning-foreground)] hover:bg-[var(--warning)]">
                                  {d.count} queries
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">{d.reason}</p>
                            </CardContent>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ),
              },
              {
                id: "process",
                label: "Process improvement",
                content: (
                  <Section
                    icon={Timer}
                    title="Process-improvement areas"
                    blurb="Topics where officers spend the most effort (turns, steps, time): candidates for process redesign."
                  >
                    <Card className="shadow-soft">
                      <CardContent className="overflow-x-auto p-0">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="px-4 py-3 font-semibold">Topic</th>
                              <th className="px-4 py-3 text-right font-semibold">Avg turns</th>
                              <th className="px-4 py-3 text-right font-semibold">Avg steps</th>
                              <th className="px-4 py-3 text-right font-semibold">Avg time</th>
                              <th className="px-4 py-3 text-right font-semibold">Cases</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cur.processImprovements.map((p, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="px-4 py-2.5 font-medium text-foreground">{p.topic}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{p.avgTurns}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{p.avgSteps}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{p.avgTimeSeconds}s</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{p.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  </Section>
                ),
              },
            ]}
          />
        </main>
      )}
    </div>
  );
}
