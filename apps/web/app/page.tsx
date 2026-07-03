import Link from "next/link";
import {
  Building2,
  MessageSquare,
  Files,
  Wrench,
  FileText,
  Lightbulb,
  ArrowRightLeft,
  LayoutDashboard,
  Scale,
  ScrollText,
  BarChart3,
  ShieldCheck,
  Bot,
  Split,
  Gauge,
  Database,
  ClipboardCheck,
  History,
  Code2,
  Info,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "AI Tax Assistant Platform",
};

const CAPABILITIES = [
  {
    icon: Files,
    title: "Document-grounded answers",
    body: "Each workspace uploads its own guidance. The platform chunks, embeds, and indexes it per workspace (OpenAI embeddings over pgvector or a local store), and the assistant answers from that corpus with inline citations you can click back to the source.",
    href: "/documents",
    cta: "Open Documents",
  },
  {
    icon: ShieldCheck,
    title: "Governed to one standard",
    body: "One policy as code: PII detect, redact, and audit, grounding, an eval-score gate, and a per-call cost ceiling, applied uniformly to every workspace. Every model call is routed by rule, logged with its cost, and recorded in the audit trail.",
    href: "/governance",
    cta: "Open the dashboard",
  },
];

const WORKSPACE_FEATURES = [
  {
    icon: MessageSquare,
    title: "Assistant",
    href: "/assistant",
    body: "A multi-step agent that retrieves cited guidance, drafts replies for review, and triages cases, with a step trace and source inspector.",
  },
  {
    icon: Files,
    title: "Documents",
    href: "/documents",
    body: "Upload guidance, then search the index and see chunks, similarity scores, and citations.",
  },
  {
    icon: Wrench,
    title: "AI Tools",
    href: "/tools",
    body: "Build tools without code: lookup tables, message templates, or sandboxed calculators the assistant can call.",
  },
  {
    icon: FileText,
    title: "AI Instructions",
    href: "/prompts",
    body: "The assistant's system prompt for this workspace, versioned with line diffs and an activation pointer.",
  },
  {
    icon: Lightbulb,
    title: "Usage analytics",
    href: "/insights",
    body: "Training needs, documentation gaps, and process hotspots, mined from usage with Python embeddings and clustering.",
  },
  {
    icon: ArrowRightLeft,
    title: "AI Gateway",
    href: "/gateway",
    body: "Every model call with its latency, tokens, cost, and any provider fallback.",
  },
];

const PLATFORM_FEATURES = [
  {
    icon: LayoutDashboard,
    title: "AI Dashboard",
    href: "/governance",
    body: "Platform-wide health: usage, eval pass rate, cost, and reliability across all workspaces.",
  },
  {
    icon: Scale,
    title: "AI Policy",
    href: "/governance/policy",
    body: "The governance policy as code and the deterministic model routing rules, editable in place.",
  },
  {
    icon: ScrollText,
    title: "AI Audit Trail",
    href: "/governance/audit",
    body: "Every model call, eval run, and instruction change across the platform, newest first.",
  },
  {
    icon: BarChart3,
    title: "AI Evaluation",
    href: "/evals",
    body: "Graded test cases with a keyword grader or an LLM judge, behind an eval pass-rate gate.",
  },
];

const UNDER_THE_HOOD = [
  {
    icon: Bot,
    title: "Bounded agent loop",
    body: "A capped loop (up to 5 steps, temperature 0) on the Vercel AI SDK, with cited retrieval and tool calls.",
  },
  {
    icon: Split,
    title: "Deterministic routing",
    body: "Keyword rules pick one of six models per query, no extra model call, with cross-provider fallback between Anthropic and OpenAI.",
  },
  {
    icon: Gauge,
    title: "One model gateway",
    body: "Every call is wrapped to record latency, tokens, and USD cost, logged per workspace.",
  },
  {
    icon: Database,
    title: "RAG service",
    body: "Python FastAPI and LlamaIndex with OpenAI embeddings over pgvector or a local store, one index per workspace.",
  },
  {
    icon: ClipboardCheck,
    title: "Eval harness",
    body: "Keyword and LLM-as-judge graders with a pass-rate gate and a trend across runs.",
  },
  {
    icon: History,
    title: "Versioned prompts",
    body: "Immutable prompt versions behind an activation pointer, with line diffs.",
  },
  {
    icon: Code2,
    title: "Sandboxed code tools",
    body: "Custom calculators run in a QuickJS WASM sandbox: a 1s deadline, 32MB, and no host access.",
  },
  {
    icon: Lightbulb,
    title: "Usage insights",
    body: "Python embeddings and KMeans clustering turn usage into training needs and documentation gaps.",
  },
];

function SectionHeading({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <h3 className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {children}
        </h3>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      {sub ? <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  href,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full shadow-soft transition-all duration-200 group-hover:shadow-card group-hover:ring-primary/30">
        <CardContent className="flex h-full flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 ring-inset transition-colors group-hover:bg-primary/15">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <h4 className="text-base font-semibold text-navy">{title}</h4>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function PlatformHome() {
  return (
    <main id="main" className="relative mx-auto w-full max-w-7xl px-4 py-16 pb-20">
      {/* Hero backdrop: accent glow over a fading blueprint grid */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[26rem]">
        <div className="bg-grid absolute inset-0" />
        <div className="hero-glow absolute inset-0" />
      </div>

      {/* Hero */}
      <section className="flex flex-col items-center gap-6 text-center">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-white shadow-pop ring-1 ring-white/25 ring-inset"
        >
          <Building2 className="h-7 w-7" />
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-primary" />
          Grounded, cited, and audited by design
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-navy sm:text-5xl">
          One <span className="text-gradient">governed</span> AI assistant per
          department
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Every department gets its own workspace and a document-grounded assistant
          for officers, to ask questions, draft replies for review, and triage
          cases. Answers are cited, and every model call is routed, logged, and
          costed under one platform-wide governance standard.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/workspaces"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-brand-from to-brand-to px-5 font-medium text-white shadow-soft transition-all duration-200 hover:shadow-pop"
          >
            Browse workspaces <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/assistant"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-5 font-medium text-foreground shadow-soft transition-all duration-200 hover:bg-accent"
          >
            Try the assistant
          </Link>
        </div>
      </section>

      {/* Two capabilities */}
      <section className="mt-16">
        <SectionHeading>Two capabilities</SectionHeading>
        <div className="grid gap-4 md:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, body, href, cta }) => (
            <Card key={title} className="group shadow-soft transition-all duration-200 hover:shadow-card hover:ring-primary/30">
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-from to-brand-to text-white shadow-soft ring-1 ring-white/20 ring-inset">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h4 className="text-lg font-semibold text-navy">{title}</h4>
                </div>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary"
                >
                  {cta}{" "}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* In each workspace */}
      <section className="mt-16">
        <SectionHeading sub="Scoped to the department you select. Documents, chat history, tools, and instructions stay per workspace.">
          In each workspace
        </SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WORKSPACE_FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* Platform-wide governance */}
      <section className="mt-12">
        <SectionHeading sub="One standard across every workspace, with live aggregates and a full audit trail.">
          Platform-wide governance
        </SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* Under the hood */}
      <section className="mt-16">
        <SectionHeading sub="Three pieces across two runtimes: a Next.js app (the agent, gateway, routing, evals, and governance), a Python RAG service, and a Python insights pipeline. Built so every model decision is deterministic, logged, and reversible.">
          Under the hood
        </SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {UNDER_THE_HOOD.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="shadow-soft">
              <CardContent className="flex h-full flex-col gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 ring-inset">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <h4 className="text-sm font-semibold text-navy">{title}</h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <p className="mt-14 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        General information only. Demo documents are self-authored, open, or
        synthetic.
      </p>
    </main>
  );
}
