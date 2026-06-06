import { createAnthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  tool,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { taxTools } from "@/lib/tools";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";
import {
  CustomToolsSchema,
  runCustomTool,
  type CustomTool,
} from "@/lib/custom-tools";

// Turn validated, declarative user tool defs into AI SDK tools. execute only
// does a keyword lookup or template fill (runCustomTool); no code is evaluated.
function buildCustomTools(defs: CustomTool[]): ToolSet {
  const out: ToolSet = {};
  for (const def of defs) {
    const shape: Record<string, z.ZodTypeAny> = {};
    if (def.kind === "lookup") {
      shape[def.paramName] = z
        .string()
        .describe(def.paramDescription ?? "lookup query");
    } else {
      for (const p of def.params) {
        shape[p.name] = (p.type === "number" ? z.number() : z.string()).describe(
          p.description ?? "",
        );
      }
    }
    out[def.name] = tool({
      description: def.description,
      inputSchema: z.object(shape),
      execute: async (input) =>
        runCustomTool(def, input as Record<string, unknown>),
    });
  }
  return out;
}

// Public-use guard rails: cap requests per IP and bound the work per request so
// the agent cannot be used to run up cost. Rate limit activates when Upstash is
// configured; it fails open locally.
const limiter = makeLimiter({ tokens: 20, window: "1 m", prefix: "chat" });
const MAX_MESSAGES = 30;
const MAX_INPUT_CHARS = 4000;
const MAX_OUTPUT_TOKENS = 800;

// Pin the API base. The SDK appends "/messages", so the base must include
// "/v1". We do NOT read ANTHROPIC_BASE_URL from the env here on purpose: a bare
// "https://api.anthropic.com" (no /v1) is a common machine-level misconfig that
// 404s. Set ANTHROPIC_BASE_URL_OVERRIDE only if you front the API with a proxy
// or gateway (include the full path, e.g. ".../v1").
const anthropic = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL_OVERRIDE ?? "https://api.anthropic.com/v1",
});

// Node runtime: the HITL store uses node:fs.
export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * System prompt, ported from iras-tax-agent/agent.mjs. The escalation rules are
 * what make the human-in-the-loop flow trigger automatically.
 */
const SYSTEM = `You are an IRAS (Inland Revenue Authority of Singapore) tax FAQ assistant.
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
Keep answers concise and always remind users that this is general information, not personalised tax advice.

Formatting rules: do NOT use emojis, em dashes, or arrow characters. Use commas, periods, parentheses, or colons instead. Plain markdown only (headings, bold, lists).`;

export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return new Response("Too many requests, please slow down.", { status: 429 });
  }

  const body: { messages?: UIMessage[]; customTools?: unknown } = await req.json();
  const messages = body.messages;

  // Bound input size so a single request cannot be huge.
  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES) {
    return new Response("Conversation too long.", { status: 400 });
  }
  const inputChars = JSON.stringify(messages).length;
  if (inputChars > MAX_INPUT_CHARS * MAX_MESSAGES) {
    return new Response("Message too long.", { status: 400 });
  }

  // Merge any user-defined tools (validated, declarative only).
  const parsedCustom = CustomToolsSchema.safeParse(body.customTools ?? []);
  const customTools = parsedCustom.success
    ? buildCustomTools(parsedCustom.data)
    : {};

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const result = streamText({
    model: anthropic(model),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    tools: { ...taxTools, ...customTools },
    stopWhen: stepCountIs(5),
    temperature: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Even out Anthropic's uneven token chunks into steady word-by-word output
    // so the answer streams smoothly instead of arriving in patches.
    experimental_transform: smoothStream({ delayInMs: 18, chunking: "word" }),
  });

  return result.toUIMessageStreamResponse();
}
