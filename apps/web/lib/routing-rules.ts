import { z } from "zod";

/*
 * Deterministic, configurable model routing. The original approach (router.mjs):
 * cheap keyword/pattern rules pick a model, no LLM call. Free and instant. The
 * assistant uses DEFAULT_CONFIG; the Evals workbench lets a visitor edit rules
 * and test cases (stored per-browser) to experiment.
 */

export interface RoutingRule {
  id: string;
  keywords: string[];
  modelId: string;
  reason: string;
}

export interface RoutingConfig {
  rules: RoutingRule[];
  fallbackModelId: string;
  fallbackReason: string;
}

export interface TestCase {
  id: string;
  query: string;
  expects: string[];
}

export const DEFAULT_CONFIG: RoutingConfig = {
  // First matching rule wins, so order is specific to general. Reasons double as
  // the route label shown in the gateway log and the route preview.
  rules: [
    {
      // Casework naming an identifier (NRIC, UEN, FIN) is PII-sensitive.
      id: "r-pii",
      keywords: ["nric", "uen", "fin number", "passport number"],
      modelId: "claude-haiku-4-5-20251001",
      reason: "pii-sensitive",
    },
    {
      // Drafting a reply or letter: a strong writer that also cites well.
      id: "r-draft",
      keywords: ["draft", "write a reply", "compose", "reply to the taxpayer"],
      modelId: "claude-sonnet-4-6",
      reason: "drafting",
    },
    {
      // Multi-factor reasoning (comparisons, scenarios, restructuring).
      id: "r-complex",
      keywords: ["compare", "versus", " vs ", "trade-off", "scenario", "implications", "restructure", "optimise", "optimize"],
      modelId: "claude-opus-4-8",
      reason: "complex-reasoning",
    },
    {
      // Numbers: a model with reliable arithmetic.
      id: "r-calc",
      keywords: ["calculate", "estimate", "compute", "how much", "work out", "chargeable income"],
      modelId: "gpt-4.1",
      reason: "calculation",
    },
    {
      // Answers that must quote and cite documents need a model that reliably
      // emits [n] citations; small models drop them.
      id: "r-grounded",
      keywords: ["cite", "citing", "according to", "which document", "source"],
      modelId: "claude-sonnet-4-6",
      reason: "grounded-citation",
    },
    {
      // Quick factual lookups (rates, thresholds, deadlines): cheap and fast.
      id: "r-factual",
      keywords: ["what is", "what are", "rate", "threshold", "deadline", "cap", "when is", "how many days", "due date"],
      modelId: "gpt-4o-mini",
      reason: "factual-lookup",
    },
  ],
  fallbackModelId: "gpt-4o-mini",
  fallbackReason: "general casework",
};

// Default cases route across five different models (factual, calculation,
// grounded-citation, complex-reasoning, pii) and every check is a concrete,
// document-backed individual income tax fact, so a Run is reliably gradeable.
// Evals run against the individual-income baseline (see /api/eval).
export const DEFAULT_CASES: TestCase[] = [
  // factual -> GPT-4o mini
  {
    id: "c1",
    query: "What is the individual income tax e-filing deadline?",
    expects: ["18 April"],
  },
  // calculation -> GPT-4.1
  {
    id: "c2",
    query: "Estimate the chargeable income for a taxpayer with $120,000 income and $20,000 in reliefs.",
    expects: ["100,000"],
  },
  // grounded-citation -> Claude Sonnet 4.6
  {
    id: "c3",
    query: "According to our guidance, how many days of presence make a foreigner a Singapore tax resident? Cite the source.",
    expects: ["183"],
  },
  // complex-reasoning -> Claude Opus 4.8
  {
    id: "c4",
    query: "Compare how a tax resident and a non-resident are taxed on employment income.",
    expects: ["15%"],
  },
  // pii (nric) -> Claude Haiku 4.5
  {
    id: "c5",
    query: "A taxpayer with NRIC S1234567A earned $30,000 last year. Are they above the income threshold that requires a tax return?",
    expects: ["22,000"],
  },
];

export interface RouteResult {
  modelId: string;
  reason: string;
}

/** First rule whose any keyword appears in the query wins; else the fallback. */
export function applyRoutingRules(cfg: RoutingConfig, query: string): RouteResult {
  const q = query.toLowerCase();
  for (const rule of cfg.rules) {
    if (rule.keywords.some((k) => k.trim() && q.includes(k.toLowerCase().trim()))) {
      return { modelId: rule.modelId, reason: rule.reason };
    }
  }
  return { modelId: cfg.fallbackModelId, reason: cfg.fallbackReason };
}

// ---- validation + storage ----

export const RoutingConfigSchema = z.object({
  rules: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        keywords: z.array(z.string().max(60)).max(12),
        modelId: z.string().min(1).max(80),
        reason: z.string().min(1).max(60),
      }),
    )
    .max(12),
  fallbackModelId: z.string().min(1).max(80),
  fallbackReason: z.string().min(1).max(60),
});

export const TestCasesSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      query: z.string().min(1).max(500),
      expects: z.array(z.string().min(1).max(80)).max(8),
    }),
  )
  .max(8);

// Keys are versioned so resetting the defaults (new rules/cases) supersedes any
// older saved customisation: the previous keys are ignored and everyone gets the
// refreshed defaults until they edit again.
const CONFIG_KEY = "iras-routing-config-v2";
const CASES_KEY = "iras-eval-cases-v2";

export function loadConfig(): RoutingConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const parsed = RoutingConfigSchema.safeParse(
      JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null"),
    );
    return parsed.success ? parsed.data : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Fired on the window after the routing config is saved, so other views (e.g.
 * the policy "as code" block) re-read and stay in sync within the same page. */
export const ROUTING_CONFIG_CHANGED = "iras:routing-config-changed";

export function saveConfig(cfg: RoutingConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new Event(ROUTING_CONFIG_CHANGED));
}

export function loadCases(): TestCase[] {
  if (typeof window === "undefined") return DEFAULT_CASES;
  try {
    const parsed = TestCasesSchema.safeParse(
      JSON.parse(localStorage.getItem(CASES_KEY) ?? "null"),
    );
    return parsed.success ? parsed.data : DEFAULT_CASES;
  } catch {
    return DEFAULT_CASES;
  }
}

export function saveCases(cases: TestCase[]): void {
  if (typeof window !== "undefined") localStorage.setItem(CASES_KEY, JSON.stringify(cases));
}
