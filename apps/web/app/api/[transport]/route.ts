import { NextResponse } from "next/server";
import { createMcpHandler } from "mcp-handler";
import {
  MCP_SERVER_INFO,
  escalateAllowed,
  isEscalateCall,
  registerMcpTools,
} from "@/lib/mcp-tools";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * Streamable HTTP MCP endpoint. With basePath "/api" the handler serves
 * /api/mcp (this dynamic [transport] segment never shadows the static API
 * routes; Next.js prefers static matches). Stateless: no Redis, no session
 * resumability, SSE transport disabled, which is all an MCP tool server
 * needs. Static /api/* routes take precedence; unknown /api/* paths fall
 * through to the handler, which 404s anything that is not its endpoint.
 */

const handler = createMcpHandler(
  registerMcpTools,
  { serverInfo: MCP_SERVER_INFO },
  { basePath: "/api", disableSse: true, maxDuration: 60 },
);

const limiter = makeLimiter({ tokens: 60, window: "1 m", prefix: "mcp" });

function rpcError(
  id: unknown,
  code: number,
  message: string,
  status: number,
): Response {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code, message }, id: id ?? null },
    { status },
  );
}

async function guarded(req: Request): Promise<Response> {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return rpcError(null, -32000, "Rate limit exceeded", 429);
  }
  if (req.method === "POST") {
    // Peek at the JSON-RPC body for the escalate auth gate; malformed JSON
    // falls through for the protocol handler to reject properly.
    let body: unknown = null;
    try {
      body = await req.clone().json();
    } catch {
      body = null;
    }
    if (isEscalateCall(body) && !escalateAllowed(req.headers.get("authorization"))) {
      const id =
        typeof body === "object" && body !== null && "id" in body
          ? (body as { id: unknown }).id
          : null;
      return rpcError(
        id,
        -32001,
        "Unauthorized: escalate_to_human requires a valid bearer token",
        401,
      );
    }
  }
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
