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
import { SYSTEM } from "@/lib/agent";
import { buildTaxTools } from "@/lib/tools";
import { DEFAULT_BUILTIN_CONFIG, BuiltinToolsConfigSchema } from "@/lib/builtin-tools";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";
import { resolveById } from "@/lib/model-router";
import { DEFAULT_MODEL_ID } from "@/lib/model-registry";
import {
  DEFAULT_CONFIG,
  applyRoutingRules,
  RoutingConfigSchema,
} from "@/lib/routing-rules";
import {
  CustomToolsSchema,
  runCustomTool,
  type CustomTool,
} from "@/lib/custom-tools";

function latestUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return last.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ");
}

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

// Node runtime: the HITL store uses node:fs.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return new Response("Too many requests, please slow down.", { status: 429 });
  }

  const body: {
    messages?: UIMessage[];
    customTools?: unknown;
    routingConfig?: unknown;
    builtinConfig?: unknown;
  } = await req.json();
  const messages = body.messages;

  // Bound input size so a single request cannot be huge.
  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES) {
    return new Response("Conversation too long.", { status: 400 });
  }
  const inputChars = JSON.stringify(messages).length;
  if (inputChars > MAX_INPUT_CHARS * MAX_MESSAGES) {
    return new Response("Message too long.", { status: 400 });
  }

  // Built-in tools, configured by the visitor (enable/disable, descriptions,
  // lookup facts), with defaults when no valid config is sent.
  const parsedBuiltin = BuiltinToolsConfigSchema.safeParse(body.builtinConfig);
  const builtinTools = buildTaxTools(
    parsedBuiltin.success ? parsedBuiltin.data : DEFAULT_BUILTIN_CONFIG,
  );

  // Merge any user-defined tools (validated, declarative only).
  const parsedCustom = CustomToolsSchema.safeParse(body.customTools ?? []);
  const customTools = parsedCustom.success
    ? buildCustomTools(parsedCustom.data)
    : {};

  // Deterministic, rule-based routing (no extra model call). Uses the visitor's
  // configured rules from the Evals page when provided and valid, else defaults.
  const parsedConfig = RoutingConfigSchema.safeParse(body.routingConfig);
  const routingConfig = parsedConfig.success ? parsedConfig.data : DEFAULT_CONFIG;
  const route = applyRoutingRules(routingConfig, latestUserText(messages));
  const resolved = resolveById(route.modelId) ?? resolveById(DEFAULT_MODEL_ID)!;

  const result = streamText({
    model: resolved.model,
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    tools: { ...builtinTools, ...customTools },
    stopWhen: stepCountIs(5),
    temperature: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Even out uneven token chunks into steady word-by-word output so the answer
    // streams smoothly instead of arriving in patches.
    experimental_transform: smoothStream({ delayInMs: 18, chunking: "word" }),
  });

  // Tell the client which model was chosen and why.
  return result.toUIMessageStreamResponse({
    messageMetadata: () => ({
      model: resolved.entry.label,
      tier: resolved.entry.tier,
      reason: route.reason,
    }),
  });
}
