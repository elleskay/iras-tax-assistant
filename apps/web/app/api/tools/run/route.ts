import { NextResponse } from "next/server";
import { z } from "zod";
import { CustomToolSchema } from "@/lib/custom-tools";
import { executeCustomTool } from "@/lib/run-tool";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Sandbox runs are bounded (1s deadline, 32MB) but still cost CPU; cap the
// rate like the other write endpoints.
const limiter = makeLimiter({ tokens: 30, window: "1 m", prefix: "tools-run" });

const schema = z.object({
  tool: CustomToolSchema,
  input: z.record(z.string(), z.union([z.string(), z.number()])),
});

// POST /api/tools/run: execute a custom tool server-side. Code tools run in
// the QuickJS sandbox; code is never evaluated in the browser.
export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const result = await executeCustomTool(parsed.data.tool, parsed.data.input);
  return NextResponse.json({ result });
}
