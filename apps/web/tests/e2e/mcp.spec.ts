import type { APIRequestContext } from "@playwright/test";
import { specTest, expect } from "@platform/spec-test/playwright";

/*
 * Internal MCP server over Streamable HTTP, exercised over the wire against
 * the real /api/mcp endpoint (no LLM involved; the tools are deterministic).
 * Streamable HTTP may frame single replies as SSE, so the helper parses both
 * plain JSON and event-stream bodies. Each test sends initialize first (the
 * protocol handshake) and forwards the session id header if the server
 * assigns one (stateless mode does not).
 */

interface RpcReply {
  status: number;
  sessionId: string | null;
  json: {
    jsonrpc?: string;
    id?: unknown;
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
  } | null;
}

function parseRpcBody(text: string, contentType: string): RpcReply["json"] {
  if (contentType.includes("text/event-stream")) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      try {
        const parsed = JSON.parse(line.slice("data:".length).trim());
        if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) {
          return parsed;
        }
      } catch {
        // keep scanning frames
      }
    }
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function rpc(
  request: APIRequestContext,
  payload: Record<string, unknown>,
  sessionId: string | null = null,
): Promise<RpcReply> {
  const res = await request.post("/api/mcp", {
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    data: payload,
  });
  const headers = res.headers();
  return {
    status: res.status(),
    sessionId: headers["mcp-session-id"] ?? null,
    json: parseRpcBody(await res.text(), headers["content-type"] ?? ""),
  };
}

function initializePayload() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "spec-test", version: "1.0.0" },
    },
  };
}

specTest(
  "IRAS-MCP-001",
  "The MCP endpoint answers a JSON-RPC initialize",
  async ({ request }) => {
    const reply = await rpc(request, initializePayload());
    expect(reply.status).toBe(200);
    expect(reply.json?.error).toBeUndefined();
    const result = reply.json?.result as {
      protocolVersion?: string;
      serverInfo?: { name?: string };
    };
    expect(result?.serverInfo?.name).toBe("iras-tax-assistant");
    expect(result?.protocolVersion).toBeTruthy();
  },
  { category: "functional" },
);

specTest(
  "IRAS-MCP-002",
  "tools/list exposes the run_javascript sandbox tool with a schema",
  async ({ request }) => {
    const init = await rpc(request, initializePayload());
    const reply = await rpc(
      request,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      init.sessionId,
    );
    expect(reply.status).toBe(200);
    const tools = (reply.json?.result as { tools?: { name: string; inputSchema?: unknown }[] })
      ?.tools;
    expect(tools).toBeTruthy();
    const names = tools!.map((t) => t.name);
    expect(names).toContain("run_javascript");
    // The built-in tax tools were removed; officers' tools are not on MCP.
    expect(names).not.toContain("lookup_tax_info");
    expect(names).not.toContain("calculate_tax_estimate");
    for (const tool of tools!) {
      expect(tool.inputSchema).toBeTruthy();
    }
  },
  { category: "functional" },
);

specTest(
  "IRAS-MCP-003",
  "Calling run_javascript over MCP executes the code in the sandbox",
  async ({ request }) => {
    const init = await rpc(request, initializePayload());
    const reply = await rpc(
      request,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "run_javascript",
          arguments: {
            code: "function run(input) { return { sum: input.a + input.b }; }",
            input: { a: 2, b: 3 },
          },
        },
      },
      init.sessionId,
    );
    expect(reply.status).toBe(200);
    const content = (reply.json?.result as { content?: { type: string; text?: string }[] })
      ?.content;
    expect(content).toBeTruthy();
    const text = content!.map((c) => c.text ?? "").join("\n");
    expect(text).toContain("5");
  },
  { category: "functional" },
);
