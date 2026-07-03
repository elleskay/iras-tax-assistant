import {
  convertToModelMessages,
  tool,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { resolveSystemPrompt } from "@/lib/agent";
import { runAgent } from "@/lib/run-agent";
import { buildTaxTools } from "@/lib/tools";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";
import { resolveById } from "@/lib/model-router";
import { computeCostUsd } from "@/lib/gateway";
import { DEFAULT_MODEL_ID } from "@/lib/model-registry";
import {
  DEFAULT_CONFIG,
  applyRoutingRules,
  RoutingConfigSchema,
} from "@/lib/routing-rules";
import { CustomToolsSchema, type CustomTool } from "@/lib/custom-tools";
import { executeCustomTool } from "@/lib/run-tool";
import { normaliseWorkspace, workspaceFromRequest } from "@/lib/tenant";
import { getWorkspace } from "@/lib/workspaces";

function latestUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return last.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ");
}

// Turn validated user tool defs into AI SDK tools. Declarative kinds do a
// keyword lookup or template fill; code tools run in the QuickJS sandbox
// (hard time/memory limits, no host globals). See lib/run-tool.ts.
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
        executeCustomTool(def, input as Record<string, unknown>),
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

// Minimal structural check for UIMessage[]: enough to guarantee the shapes
// latestUserText and convertToModelMessages dereference, so a hand-crafted
// body gets a 400 instead of crashing the handler into a 500.
const MessagesSchema = z.array(
  z.looseObject({
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(z.looseObject({ type: z.string() })),
  }),
);

// Node runtime: the JSON store uses node:fs and the sandbox needs Node APIs.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return new Response("Too many requests, please slow down.", { status: 429 });
  }

  const body: {
    messages?: unknown;
    customTools?: unknown;
    routingConfig?: unknown;
    workspace?: unknown;
  } | null = await req.json().catch(() => null);
  if (!body) {
    return new Response("Invalid JSON body.", { status: 400 });
  }
  const parsedMessages = MessagesSchema.safeParse(body.messages);
  if (!parsedMessages.success || parsedMessages.data.length > MAX_MESSAGES) {
    return new Response("Conversation too long.", { status: 400 });
  }
  const messages = parsedMessages.data as unknown as UIMessage[];

  // Bound input size so a single request cannot be huge: per latest message
  // and across the whole conversation payload.
  if (latestUserText(messages).length > MAX_INPUT_CHARS) {
    return new Response("Message too long.", { status: 400 });
  }
  const inputChars = JSON.stringify(messages).length;
  if (inputChars > MAX_INPUT_CHARS * MAX_MESSAGES) {
    return new Response("Message too long.", { status: 400 });
  }

  // Active workspace (tax type). No auth: request body first, then header/cookie.
  const workspace =
    typeof body.workspace === "string"
      ? normaliseWorkspace(body.workspace)
      : workspaceFromRequest(req);
  const ws = await getWorkspace(workspace);

  // RAG search is the only always-available tool, and only when a RAG service
  // is configured. The officer's lookup/calculator tools arrive via customTools.
  const builtinTools = buildTaxTools(workspace);

  // Merge any user-defined tools (validated; lookup/template run in-process,
  // code tools run in the QuickJS sandbox via executeCustomTool).
  const parsedCustom = CustomToolsSchema.safeParse(body.customTools ?? []);
  const customTools = parsedCustom.success
    ? buildCustomTools(parsedCustom.data)
    : {};

  // Deterministic, rule-based routing (no extra model call). Uses the visitor's
  // configured rules from the Evals page when provided and valid, else defaults.
  const parsedConfig = RoutingConfigSchema.safeParse(body.routingConfig);
  const routingConfig = parsedConfig.success ? parsedConfig.data : DEFAULT_CONFIG;
  const route = applyRoutingRules(routingConfig, latestUserText(messages));
  // Fall back to the workspace's tuned default model, then the global default.
  const resolved =
    resolveById(route.modelId) ??
    resolveById(ws?.settings.defaultModelId ?? DEFAULT_MODEL_ID) ??
    resolveById(DEFAULT_MODEL_ID)!;

  // Conversion can still reject part shapes the structural check admits;
  // that is a malformed request, not a server fault.
  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch {
    return new Response("Invalid message format.", { status: 400 });
  }

  // The agent loop (lib/run-agent.ts): bounded multi-step tool use through
  // the gateway, which times, costs, logs, and falls back across providers.
  const result = runAgent({
    entry: resolved.entry,
    // Active version from the prompt store, or the compiled-in default.
    system: await resolveSystemPrompt(workspace),
    messages: modelMessages,
    tools: { ...builtinTools, ...customTools },
    meta: { route: route.reason, workspace },
  });

  // Tell the client which model was chosen and why; on finish, add token
  // usage and the cost computed from the registry list prices.
  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      const base = {
        model: resolved.entry.label,
        tier: resolved.entry.tier,
        reason: route.reason,
      };
      if (part.type !== "finish") return base;
      const input = part.totalUsage.inputTokens ?? 0;
      const output = part.totalUsage.outputTokens ?? 0;
      return {
        ...base,
        usage: { input, output },
        costUsd: computeCostUsd(resolved.entry, input, output),
      };
    },
  });
}
