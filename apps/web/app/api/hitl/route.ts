import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addEscalation,
  listEscalations,
  resolveEscalation,
} from "@/lib/hitl-store";

export const runtime = "nodejs";

// GET /api/hitl: list all escalations, most recent first.
export async function GET() {
  const escalations = await listEscalations();
  return NextResponse.json({ escalations });
}

const createSchema = z.object({
  reason: z.string().min(1),
  original_query: z.string().min(1),
});

// POST /api/hitl: create an escalation (manual advisor entry, also used to seed
// the journey e2e deterministically without invoking the LLM).
export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "reason and original_query are required" },
      { status: 400 },
    );
  }
  const entry = await addEscalation(parsed.data.reason, parsed.data.original_query);
  return NextResponse.json({ escalation: entry }, { status: 201 });
}

const patchSchema = z.object({ id: z.number() });

// PATCH /api/hitl: mark an escalation resolved.
export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "id (number) is required" }, { status: 400 });
  }
  const updated = await resolveEscalation(parsed.data.id);
  if (!updated) {
    return NextResponse.json({ error: "Escalation not found" }, { status: 404 });
  }
  return NextResponse.json({ escalation: updated });
}
