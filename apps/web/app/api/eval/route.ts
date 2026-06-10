import { generateText, stepCountIs } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  anthropic,
  agentModel,
  resolveSystemPrompt,
  SYSTEM_PROMPT_NAME,
} from "@/lib/agent";
import { getPromptVersionContent } from "@/lib/prompt-store";
import { resolveById } from "@/lib/model-router";
import { gatewayModel } from "@/lib/gateway";
import { findModel } from "@/lib/model-registry";
import { taxTools } from "@/lib/tools";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

// Tighter limit than chat since each run is a full model call on the owner's key.
const limiter = makeLimiter({ tokens: 15, window: "1 m", prefix: "eval" });

const schema = z.object({
  question: z.string().min(1).max(500),
  expects: z.array(z.string().min(1).max(80)).max(8),
  // Optional: run against a specific routed model (from the registry).
  modelId: z.string().max(80).optional(),
  // Optional: evaluate against a specific stored prompt version instead of
  // the active one, so prompt changes can be compared before activation.
  promptVersion: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { question, expects, modelId, promptVersion } = parsed.data;

  // Resolve through the gateway so eval calls are logged and costed like chat
  // calls. Falls back to the raw client only if the model is not in the
  // registry (e.g. an ANTHROPIC_MODEL env override).
  const entry = modelId
    ? (resolveById(modelId)?.entry ?? null)
    : (findModel(agentModel()) ?? null);
  const model = entry
    ? gatewayModel(entry, { route: "eval" })
    : anthropic(agentModel());
  const modelLabel = entry ? entry.label : agentModel();

  // Same prompt and tools as the live assistant, so the check reflects the real
  // thing. A pinned promptVersion overrides the active one for comparisons.
  const system =
    (promptVersion !== undefined
      ? await getPromptVersionContent(SYSTEM_PROMPT_NAME, promptVersion)
      : null) ?? (await resolveSystemPrompt());

  const result = await generateText({
    model,
    system,
    prompt: question,
    tools: taxTools,
    stopWhen: stepCountIs(5),
    temperature: 0,
    maxOutputTokens: 600,
  });

  const answer = result.text ?? "";
  const lower = answer.toLowerCase();
  // icontains assertions, the same style as the llm-eval-iras suite.
  const checks = expects.map((k) => ({
    keyword: k,
    pass: lower.includes(k.toLowerCase()),
  }));
  const pass = checks.length > 0 && checks.every((c) => c.pass);

  return NextResponse.json({ answer, checks, pass, model: modelLabel });
}
