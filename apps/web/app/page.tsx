import Link from "next/link";
import {
  MessageSquare,
  Wrench,
  BarChart3,
  ShieldCheck,
  Landmark,
  Info,
  Gauge,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "IRAS Tax Assistant - how to use",
};

const STEPS = [
  {
    href: "/assistant",
    icon: MessageSquare,
    title: "Assistant",
    body: "Ask Singapore tax questions in plain language. The agent chains tools across steps (look up a fact, then run a calculation) and each reply shows the step trace, the routed model, tokens, and cost. Personal questions escalate to a human advisor.",
    cta: "Open the assistant",
  },
  {
    href: "/tools",
    icon: Wrench,
    title: "MCP tools",
    body: "Run and configure the tools the assistant calls, or build your own: lookup tables, response templates, or JavaScript that executes server-side in a locked-down sandbox. Any MCP client can call the same tools over HTTP.",
    cta: "Open the tools",
  },
  {
    href: "/evals",
    icon: BarChart3,
    title: "Evals",
    body: "Configure the routing rules and test cases, then run them with keyword or LLM-judge grading. Failed cases explain why, every run lands in a history with a pass-rate trend, and you can pin the prompt version a run targets.",
    cta: "Open Evals",
  },
  {
    href: "/gateway",
    icon: Gauge,
    title: "Gateway",
    body: "Every model call (chat, evals, the judge) flows through one gateway that records latency, tokens, and USD cost from list prices, and falls back to the other provider on errors. The log of recent calls lives here.",
    cta: "Open the gateway",
  },
  {
    href: "/prompts",
    icon: FileText,
    title: "Prompts",
    body: "The assistant's system prompt is versioned: save new versions, diff them line by line, and activate the one to use. The live assistant resolves the active version on its next reply.",
    cta: "Open Prompts",
  },
  {
    href: "/admin",
    icon: ShieldCheck,
    title: "Advisor queue",
    body: "When the assistant escalates a personal or complex question, it lands here for a human advisor to review and resolve.",
    cta: "Open the advisor queue",
  },
];

// Each links into the assistant and asks the question (via ?q=). Together they
// cover every scenario: lookup, calculation, the multi-step agent loop with its
// step trace, complex reasoning, human escalation, and PII routing. They match
// the assistant's demo chips.
const EXAMPLES = [
  { label: "What is the GST registration threshold?", q: "What is the GST registration threshold?" },
  {
    label: "Estimate chargeable income (120k income, 20k deductions)",
    q: "Estimate the chargeable income for an annual income of 120000 with 20000 in deductions",
  },
  {
    label: "Multi-step: GST threshold + my estimate (watch the step trace)",
    q: "What is the GST registration threshold, and calculate my chargeable income for an income of 120000 with 20000 in deductions",
  },
  {
    label: "Compare corporate vs top personal tax rates",
    q: "Compare the corporate income tax rate versus the top personal income tax rate",
  },
  { label: "Should I contribute to SRS this year?", q: "Should I contribute to SRS this year?" },
  {
    label: "PII routing: a question containing an NRIC",
    q: "My NRIC is S1234567D, do I need to file a tax return?",
  },
];

export default function LandingPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-12 pb-20">
      {/* Hero */}
      <section className="flex flex-col items-center gap-5 text-center">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-white shadow-soft"
        >
          <Landmark className="h-7 w-7" />
        </span>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
          Singapore tax, answered in your browser
        </h2>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
          A multi-step tax agent for GST, income tax, corporate tax, and SRS, plus
          everything behind it: the MCP tool server, a sandboxed code runtime, a
          model gateway with cost tracking, versioned prompts, and an eval
          workbench. No install, no terminal, no API key of your own.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/assistant"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-brand-from to-brand-to px-5 font-medium text-white shadow-soft transition-all hover:shadow-pop"
          >
            <MessageSquare className="h-4 w-4" /> Start asking
          </Link>
          <Link
            href="/tools"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-5 font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Wrench className="h-4 w-4" /> Explore the tools
          </Link>
        </div>
      </section>

      {/* How to use */}
      <section className="mt-14">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          How to use it
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ href, icon: Icon, title, body, cta }) => (
            <Card key={href} className="shadow-soft transition-shadow hover:shadow-card">
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h4 className="text-base font-semibold text-navy">{title}</h4>
                </div>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                <Link href={href} className="text-sm font-medium text-primary underline underline-offset-2">
                  {cta}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Try asking */}
      <section className="mt-12">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Good first questions
        </h3>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <Link
              key={ex.label}
              href={`/assistant?q=${encodeURIComponent(ex.q)}`}
              className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-[filter] hover:brightness-95"
            >
              {ex.label}
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-12 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Unofficial demo, not affiliated with IRAS. General information only, not
        personalised tax advice. Built on iras-mcp-server, iras-tax-agent, and llm-eval-iras.
      </p>
    </main>
  );
}
