import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupTaxFact, formatEstimate } from "@/lib/tax";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = makeLimiter({ tokens: 40, window: "1 m", prefix: "tools" });

// Direct, side-effect-free invocation of the iras-mcp-server tools so the public
// Tools page can let visitors run them. escalate_to_human is intentionally not
// exposed here because it writes to the advisor queue.
const schema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("lookup_tax_info"),
    topic: z.string().min(1).max(100),
  }),
  z.object({
    tool: z.literal("calculate_tax_estimate"),
    income: z.number().min(0).max(1_000_000_000_000),
    deductions: z.number().min(0).max(1_000_000_000_000),
  }),
]);

export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  const result =
    d.tool === "lookup_tax_info"
      ? lookupTaxFact(d.topic)
      : formatEstimate(d.income, d.deductions);
  return NextResponse.json({ result });
}
