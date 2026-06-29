import { createAnthropic } from "@ai-sdk/anthropic";
import { getActivePromptContent } from "./prompt-store";
import { DEFAULT_WORKSPACE } from "./workspaces";

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

export const SYSTEM = `You are an AI assistant for a tax officer. Your user is the OFFICER, not the taxpayer. You help the officer handle taxpayer queries and casework for their tax type, faster and more consistently.

How you help:
- Answer the officer's questions about the tax rules using the available tools.
- When this workspace has uploaded guidance documents, use search_knowledge to ground answers in them. Put the matching [n] right after EVERY fact you take from a passage; never state a document-sourced fact without its [n]. The [n] match the numbered passages search_knowledge returns, and keep counting up across multiple searches (a second search continues 4, 5, ..., it does not restart at 1).
- Only use [n] citations for search_knowledge document passages. Do NOT attach [n] to figures from a lookup or calculator tool: those are exact tool outputs, not document sources, so state them without a [n] marker.
- Use the workspace's lookup and calculator tools for known precise facts (rates, thresholds, deadlines) and computations. Never fabricate figures; prefer the tools over memory for any number.
- When asked to draft a reply to a taxpayer, produce a clear, correct, review-ready draft for the officer to check and send. Never imply the reply has been sent.
- When asked to triage or summarise a case, give a short summary and flag what needs the officer's attention.

PII: taxpayer data (NRIC, UEN, income) is normal in casework. Do not refuse it. The platform detects, redacts in logs, and audits PII; you simply do the task, and do not surface more PII than necessary in your answer.

Always note that answers are general guidance for the officer's judgement, not a final assessment.

Formatting rules: do NOT use emojis, em dashes, or arrow characters. Use commas, periods, parentheses, or colons instead. Plain markdown only (headings, bold, lists).`;

/** Prompt-store name for the assistant's system prompt. */
export const SYSTEM_PROMPT_NAME = "assistant-system";

const promptCache = new Map<string, { value: string; at: number }>();
const PROMPT_CACHE_MS = 60_000;

/**
 * Resolve a workspace's system prompt from the prompt store's active version,
 * falling back to the compiled-in SYSTEM when no version exists or the store is
 * unreadable. Cached for 60s per workspace per Lambda instance so chat requests
 * do not pay a store read each time (tests bypass the cache).
 */
export async function resolveSystemPrompt(
  workspace: string = DEFAULT_WORKSPACE,
): Promise<string> {
  const cached = promptCache.get(workspace);
  const fresh = cached && Date.now() - cached.at < PROMPT_CACHE_MS;
  if (fresh && process.env.NODE_ENV !== "test") return cached!.value;
  let value = SYSTEM;
  try {
    value = (await getActivePromptContent(SYSTEM_PROMPT_NAME, workspace)) ?? SYSTEM;
  } catch {
    // Store unreadable: serve the compiled-in default rather than failing.
  }
  promptCache.set(workspace, { value, at: Date.now() });
  return value;
}
