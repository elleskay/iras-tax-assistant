/*
 * The models the router can pick from: current chat models across Anthropic and
 * OpenAI that these keys can use, with approximate list prices (USD per 1M
 * tokens, input/output) so the UI can show cost. Prices are approximate and can
 * change; treat them as relative guidance.
 */

export type Provider = "openai" | "anthropic";

export interface ModelEntry {
  id: string;
  provider: Provider;
  label: string;
  tier: "cheap" | "balanced" | "premium";
  costRank: number; // relative, lower is cheaper
  price: { in: number; out: number }; // USD per 1M tokens (approximate)
  use: string;
}

export const MODELS: ModelEntry[] = [
  {
    id: "gpt-4.1-nano",
    provider: "openai",
    label: "GPT-4.1 nano",
    tier: "cheap",
    costRank: 1,
    price: { in: 0.1, out: 0.4 },
    use: "very simple factual lookups, short definitions",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini",
    tier: "cheap",
    costRank: 2,
    price: { in: 0.15, out: 0.6 },
    use: "cheap general factual lookups",
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    tier: "cheap",
    costRank: 3,
    price: { in: 1, out: 5 },
    use: "simple or factual tax questions, and privacy-sensitive queries (NRIC/UEN)",
  },
  {
    id: "gpt-4.1",
    provider: "openai",
    label: "GPT-4.1",
    tier: "balanced",
    costRank: 4,
    price: { in: 2, out: 8 },
    use: "calculations and questions needing solid quality",
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    tier: "balanced",
    costRank: 5,
    price: { in: 3, out: 15 },
    use: "nuanced or personalised scenarios and escalation decisions",
  },
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8",
    tier: "premium",
    costRank: 9,
    price: { in: 15, out: 75 },
    use: "the most complex, comparative, or high-stakes questions",
  },
];

export const DEFAULT_MODEL_ID = "claude-haiku-4-5-20251001";

export function findModel(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Short price label, e.g. "$0.15/$0.60 per 1M". */
export function priceText(m: ModelEntry): string {
  const fmt = (n: number) => (n < 1 ? n.toFixed(2) : String(n));
  return `$${fmt(m.price.in)}/$${fmt(m.price.out)} per 1M`;
}

export function modelOptionLabel(m: ModelEntry): string {
  return `${m.label} (${priceText(m)})`;
}
