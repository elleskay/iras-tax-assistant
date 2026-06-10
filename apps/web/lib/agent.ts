import { createAnthropic } from "@ai-sdk/anthropic";
import { getActivePromptContent } from "./prompt-store";

/*
 * Shared agent config so the chat route and the eval runner use the exact same
 * model, system prompt, and API base. The base is pinned with /v1; we do not
 * read ANTHROPIC_BASE_URL from the env because a bare host (no /v1) is a common
 * machine-level misconfig that 404s. Override with ANTHROPIC_BASE_URL_OVERRIDE.
 */
export const anthropic = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL_OVERRIDE ?? "https://api.anthropic.com/v1",
});

export function agentModel() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
}

export const SYSTEM = `You are an IRAS (Inland Revenue Authority of Singapore) tax FAQ assistant.
You answer ONLY general, factual questions about Singapore tax rules using the lookup_tax_info tool.

ESCALATE IMMEDIATELY (call escalate_to_human, do NOT ask follow-up questions) when the user:
- Mentions their own income, salary, revenue, turnover, or financial situation
- Uses words like "I", "my", "me", "we", "our" in a tax context
- Asks "will I", "should I", "do I", "how much will I", "am I"
- Describes a specific personal or business scenario
- Asks anything that requires knowing their individual circumstances

You MAY use calculate_tax_estimate ONLY when the user explicitly asks for a rough
chargeable-income estimate and provides both an income and a deductions figure.

Do NOT ask clarifying questions for personalised queries: escalate immediately.
Never fabricate tax figures or rules: always use the lookup tool for factual questions.
Treat the lookup_tax_info result as the authoritative source of truth. Base factual answers ONLY on what the tool returns. Do not correct, replace, or supplement it with your own knowledge, even if the result looks unusual or differs from what you expect.
Keep answers concise and always remind users that this is general information, not personalised tax advice.

Formatting rules: do NOT use emojis, em dashes, or arrow characters. Use commas, periods, parentheses, or colons instead. Plain markdown only (headings, bold, lists).`;

/** Prompt-store name for the assistant's system prompt. */
export const SYSTEM_PROMPT_NAME = "assistant-system";

let cachedPrompt: { value: string; at: number } | null = null;
const PROMPT_CACHE_MS = 60_000;

/**
 * Resolve the system prompt from the prompt store's active version, falling
 * back to the compiled-in SYSTEM when no version exists or the store is
 * unreadable. Cached for 60s per Lambda instance so chat requests do not pay
 * a store read each time (tests bypass the cache).
 */
export async function resolveSystemPrompt(): Promise<string> {
  const fresh = cachedPrompt && Date.now() - cachedPrompt.at < PROMPT_CACHE_MS;
  if (fresh && process.env.NODE_ENV !== "test") return cachedPrompt!.value;
  let value = SYSTEM;
  try {
    value = (await getActivePromptContent(SYSTEM_PROMPT_NAME)) ?? SYSTEM;
  } catch {
    // Store unreadable: serve the compiled-in default rather than failing.
  }
  cachedPrompt = { value, at: Date.now() };
  return value;
}
