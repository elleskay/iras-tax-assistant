import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listPrompts,
  addPromptVersion,
  activatePromptVersion,
} from "@/lib/prompt-store";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Writes create durable store objects, so they are tighter than chat.
const limiter = makeLimiter({ tokens: 20, window: "1 m", prefix: "prompts" });

// GET /api/prompts: every prompt with its full version history.
export async function GET() {
  const prompts = await listPrompts();
  return NextResponse.json({ prompts });
}

const createSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "lowercase kebab-case, max 64 chars"),
  content: z.string().min(1).max(8000),
  note: z.string().max(200).optional(),
});

// POST /api/prompts: append a new immutable version to a prompt.
export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { name, content, note } = parsed.data;
  const prompt = await addPromptVersion(name, content, note);
  return NextResponse.json({ prompt }, { status: 201 });
}

const activateSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  version: z.number().int().positive(),
});

// PUT /api/prompts: move the activeVersion pointer to an existing version.
export async function PUT(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = activateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const prompt = await activatePromptVersion(
    parsed.data.name,
    parsed.data.version,
  );
  if (!prompt) {
    return NextResponse.json(
      { error: "Prompt or version not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ prompt });
}
