import { afterEach, vi } from "vitest";
import { specTest, expect } from "@platform/spec-test/vitest";
import { escalateAllowed, isEscalateCall } from "../../lib/mcp-tools";
import { POST } from "../../app/api/[transport]/route";

/*
 * IRAS-MCP-004: when MCP_API_KEY is configured, escalate_to_human over MCP
 * requires a valid bearer token, rejected with 401 before the tool runs.
 * Pure guard helpers plus the real route handler, env stubbed; no live
 * server and no Upstash (the limiter fails open without its env).
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function escalatePayload(id: number) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "escalate_to_human",
      arguments: { reason: "complex case", original_query: "help" },
    },
  };
}

function postRequest(body: unknown, auth?: string) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

specTest(
  "IRAS-MCP-004",
  "Escalation over MCP requires the API key when one is configured",
  async () => {
    // Pure guard: open when no key is configured.
    vi.stubEnv("MCP_API_KEY", "");
    expect(escalateAllowed(null)).toBe(true);
    expect(escalateAllowed("Bearer anything")).toBe(true);

    // Pure guard: with a key, only the exact bearer passes.
    vi.stubEnv("MCP_API_KEY", "s3cret-key");
    expect(escalateAllowed(null)).toBe(false);
    expect(escalateAllowed("Bearer wrong")).toBe(false);
    expect(escalateAllowed("s3cret-key")).toBe(false); // missing Bearer prefix
    expect(escalateAllowed("Bearer s3cret-key2")).toBe(false); // length differs
    expect(escalateAllowed("Bearer s3cret-key")).toBe(true);

    // The guard only gates the escalate tool, single or batch.
    expect(isEscalateCall(escalatePayload(1))).toBe(true);
    expect(isEscalateCall([{ method: "ping" }, escalatePayload(2)])).toBe(true);
    expect(
      isEscalateCall({ method: "tools/call", params: { name: "lookup_tax_info" } }),
    ).toBe(false);
    expect(isEscalateCall({ method: "tools/list" })).toBe(false);
    expect(isEscalateCall(null)).toBe(false);
    expect(isEscalateCall("tools/call")).toBe(false);

    // Route handler: escalate without (or with a wrong) bearer is rejected
    // with a 401 JSON-RPC error before the tool can run.
    const noAuth = await POST(postRequest(escalatePayload(7)));
    expect(noAuth.status).toBe(401);
    const noAuthBody = await noAuth.json();
    expect(noAuthBody.error.code).toBe(-32001);
    expect(noAuthBody.error.message).toContain("Unauthorized");
    expect(noAuthBody.id).toBe(7);

    const wrongAuth = await POST(
      postRequest(escalatePayload(8), "Bearer not-the-key"),
    );
    expect(wrongAuth.status).toBe(401);

    // Public tools are not gated by the key.
    const lookup = await POST(
      postRequest({
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "lookup_tax_info", arguments: { topic: "GST" } },
      }),
    );
    expect(lookup.status).not.toBe(401);
  },
  { category: "security" },
);
