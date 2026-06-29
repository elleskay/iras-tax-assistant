import { NextResponse } from "next/server";
import { z } from "zod";
import { saveEvalRun, listEvalRuns } from "@/lib/eval-store";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = makeLimiter({ tokens: 20, window: "1 m", prefix: "eval-runs" });

// GET /api/eval/runs: the platform-wide run history, newest first.
export async function GET() {
  const runs = await listEvalRuns(20);
  return NextResponse.json({ runs });
}

const caseSchema = z.object({
  query: z.string().min(1).max(500),
  modelLabel: z.string().min(1).max(80),
  pass: z.boolean(),
  score: z.number().min(0).max(100).optional(),
  rationale: z.string().max(2000).optional(),
});

const createSchema = z.object({
  grader: z.enum(["keyword", "judge"]),
  promptVersion: z.number().int().positive().optional(),
  cases: z.array(caseSchema).min(1).max(20),
});

// POST /api/eval/runs: persist a completed run. Totals are computed server
// side so a client cannot store inconsistent stats.
export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { grader, promptVersion, cases } = parsed.data;
  const passed = cases.filter((c) => c.pass).length;
  const run = await saveEvalRun({
    grader,
    ...(promptVersion !== undefined ? { promptVersion } : {}),
    total: cases.length,
    passed,
    passRate: Math.round((passed / cases.length) * 100),
    cases,
  });
  return NextResponse.json({ run }, { status: 201 });
}
