"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Follow-along guide shown at the top of each feature page. Expanded on a
 * first visit so newcomers can work through the steps in place; collapsing it
 * is remembered per page (localStorage), so it stays out of the way after.
 */

const GUIDES = {
  assistant: {
    intro:
      "A multi-step tax agent: every reply shows the routed model, tokens, and cost, plus a step trace when tools ran.",
    steps: [
      "Click the GST chip (or ask about the GST registration threshold). The reply cites SGD 1,000,000 and the badge under it reads \"Routed to GPT-4o mini\" with tokens and cost.",
      "Click Multi-step: the agent chains lookup_tax_info then calculate_tax_estimate in one turn. Expand \"Agent steps (2)\" in the reply to see each tool's input and output.",
      "Click SRS: personalised questions route to Claude Sonnet 4.6 and escalate to the advisor queue with a case number.",
      "Click PII: a question containing an NRIC routes to Claude Haiku 4.5 under the pii-sensitive rule.",
      "Use New chat to start over; past conversations stay in the history sidebar (this browser only).",
    ],
  },
  tools: {
    intro:
      "The tools the assistant calls, plus a builder for your own. Three examples are preloaded so you can run one immediately.",
    steps: [
      "Run the built-in lookup with topic GST: the deterministic fact appears, including the SGD 1,000,000 threshold.",
      "Under Your tools, run the example gst_calculator with amount 100: it executes in the server-side QuickJS sandbox and returns the GST and total.",
      "Edit a built-in tool (toggle it, change the description, edit the lookup facts): the config rides along with every chat request, so the assistant honours it.",
      "Build your own with New tool. The Code (sandboxed) kind runs run(input) under a 1 second deadline and 32MB cap with no network or filesystem; paste while(true){} to watch the deadline stop it safely.",
      "Ask the assistant to use your tool by name, then expand the reply's step trace to watch the call.",
      "Connect any MCP client with the config in Connect via MCP at the bottom; the endpoint is /api/mcp.",
    ],
  },
  evals: {
    intro:
      "A workbench for the routing rules and a graded test suite, with a persisted run history.",
    steps: [
      "Type a query into the route preview to see which model the rules would pick and why.",
      "Edit the routing rules (keywords, model, reason) and the test cases (query plus expected keywords). Both stay in your browser.",
      "Click Run with the keyword grader: failed cases name the missed keywords, and Show response reveals the graded answer.",
      "Switch the grader to LLM judge and run again: each case gets a score and a rationale, shown on the case when it fails.",
      "Pin a prompt version to evaluate an older or newer system prompt against the same cases.",
      "Every run lands in the history with a pass-rate trend bar, persisted server-side.",
    ],
  },
  gateway: {
    intro:
      "Every model call in the app (chat, evals, the judge) flows through one gateway that observes and logs it.",
    steps: [
      "Send a chat message or run an eval first, then refresh this page.",
      "Each call lists the model, latency, input and output tokens, and the USD cost computed from list prices, newest first.",
      "If a provider call fails, the gateway retries on the other provider and the entry is flagged fallbackUsed.",
    ],
  },
  prompts: {
    intro:
      "The assistant's system prompt is versioned: immutable versions behind an activation pointer.",
    steps: [
      "Save a new version with a visible change, e.g. \"Always answer in exactly one sentence.\"",
      "Select a version to see a line diff against its predecessor, additions and removals highlighted.",
      "Click Activate, then ask the assistant anything: it resolves the active version within about a minute. Re-activate the old version to undo.",
    ],
  },
  admin: {
    intro:
      "Escalations from the assistant land here for a human to resolve: the human-in-the-loop half of the agent.",
    steps: [
      "Ask the assistant a personalised question first (the SRS chip) so a case exists.",
      "The escalation appears as pending with its reason and the original question.",
      "Click Resolve: the case flips to resolved end to end.",
    ],
  },
} satisfies Record<string, { intro: string; steps: string[] }>;

export type GuidePage = keyof typeof GUIDES;

export function PageGuide({
  page,
  className,
}: {
  page: GuidePage;
  className?: string;
}) {
  const guide = GUIDES[page];
  const storageKey = `iras-guide-collapsed:${page}`;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "1") setOpen(false);
  }, [storageKey]);

  const toggle = () => {
    setOpen((v) => {
      localStorage.setItem(storageKey, v ? "1" : "0");
      return !v;
    });
  };

  return (
    <section
      data-testid="page-guide"
      className={cn("rounded-lg border bg-accent/40 text-left", className)}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-navy">
          <BookOpen className="h-4 w-4 text-primary" /> How to use this page
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t px-4 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{guide.intro}</p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-foreground">
            {guide.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
