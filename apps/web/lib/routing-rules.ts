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
  rules: [
    {
      id: "r-pii",
      keywords: ["nric", "uen"],
      modelId: "claude-haiku-4-5-20251001",
      reason: "pii-sensitive",
    },
    {
      id: "r-complex",
      keywords: ["compare", "versus", " vs ", "optimi", "restructure", "trade-off", "scenario"],
      modelId: "claude-opus-4-8",
      reason: "complex-reasoning",
    },
    {
      id: "r-calc",
      keywords: ["calculate", "estimate", "how much", "work out", "compute"],
      modelId: "gpt-4.1",
      reason: "calculation",
    },
    {
      id: "r-personal",
      keywords: ["should i", "will i", "do i", "am i", "my income", "my salary", "my company", "my business"],
      modelId: "claude-sonnet-4-6",
      reason: "personalised-advice",
    },
    {
      id: "r-factual",
      keywords: ["what is", "what are", "deadline", "rate", "threshold", "cap", "when is"],
      modelId: "gpt-4o-mini",
      reason: "factual-lookup",
    },
  ],
  fallbackModelId: "gpt-4.1-nano",
  fallbackReason: "default",
};

// Default cases are chosen so a Run routes across four different models and
// every check is reliably gradeable.
export const DEFAULT_CASES: TestCase[] = [
  // factual -> GPT-4o mini
  { id: "c1", query: "What is the GST registration threshold?", expects: ["1,000,000", "turnover"] },
  // calculation -> GPT-4.1
  {
    id: "c2",
    query: "Estimate the chargeable income for an income of 120000 and deductions of 20000",
    expects: ["100,000"],
  },
  // complex (compare/versus) -> Claude Opus 4.8
  {
    id: "c3",
    query: "Compare the corporate income tax rate versus the top personal income tax rate",
    expects: ["17%"],
  },
  // pii (uen) -> Claude Haiku 4.5
  {
    id: "c4",
    query: "What is the GST registration threshold for a company with a UEN?",
    expects: ["1,000,000"],
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

const CONFIG_KEY = "iras-routing-config";
const CASES_KEY = "iras-eval-cases";

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

export function saveConfig(cfg: RoutingConfig): void {
  if (typeof window !== "undefined") localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
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
