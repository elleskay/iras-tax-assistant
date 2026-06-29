import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getEffectivePolicy,
  loadPolicyOverrides,
  savePolicyOverrides,
} from "@/lib/governance";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The governance policy is platform-wide, so this endpoint is not workspace
// scoped. Writes are durable, so keep the limiter tight.
const limiter = makeLimiter({ tokens: 20, window: "1 m", prefix: "gov-policy" });

// GET /api/governance/policy: the effective policy plus the raw saved overrides.
export async function GET() {
  return NextResponse.json({
    policy: await getEffectivePolicy(),
    overrides: await loadPolicyOverrides(),
  });
}

const schema = z.object({
  costCeilingUsd: z.number().positive().max(100),
  evalGateThreshold: z.number().int().min(0).max(100),
  piiTriggers: z.array(z.string().min(1).max(60)).min(1).max(12),
  piiAction: z.string().min(1).max(600),
  groundingRule: z.string().min(1).max(600),
});

// PUT /api/governance/policy: overwrite the platform overrides. The editor
// always sends every field, so a save is a full replacement.
export async function PUT(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  await savePolicyOverrides(parsed.data);
  return NextResponse.json({ policy: await getEffectivePolicy() });
}
