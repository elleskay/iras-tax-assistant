import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatEstimate, lookupTaxFact } from "./tax";
import { addEscalation } from "./hitl-store";
import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_CHARS,
  runSandboxed,
} from "./sandbox";

/*
 * Internal MCP server: the assistant's tax tools exposed over the Model
 * Context Protocol so other agents (Claude Code, the MCP inspector, any MCP
 * client) can call them directly. One registration function shared by both
 * transports:
 *  - Streamable HTTP at /api/mcp (app/api/[transport]/route.ts, mcp-handler)
 *  - stdio for local clients (mcp/stdio.ts, `npm run mcp:stdio`)
 *
 * Tools reuse the same libraries as the chat agent: lib/tax.ts for facts and
 * estimates, lib/hitl-store.ts for escalations, lib/sandbox.ts for the
 * QuickJS code runtime. No LLM is involved; the tools are deterministic.
 *
 * Auth: lookup and calculate are public (rate limited at the route). When
 * MCP_API_KEY is set, escalate_to_human requires `Authorization: Bearer`,
 * checked with a constant-time comparison before the tool runs. Unset means
 * open, matching the repo's no-op-without-key convention.
 */

export const MCP_SERVER_INFO = {
  name: "iras-tax-assistant",
  version: "1.0.0",
};

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

export function registerMcpTools(server: McpServer): void {
  server.registerTool(
    "lookup_tax_info",
    {
      title: "Look up Singapore tax facts",
      description:
        "Look up a known Singapore tax fact by topic. Topics: GST, income tax, corporate tax, SRS.",
      inputSchema: {
        topic: z
          .string()
          .min(1)
          .describe("Tax topic, e.g. GST, income tax, corporate tax, SRS"),
      },
    },
    ({ topic }) => text(lookupTaxFact(topic)),
  );

  server.registerTool(
    "calculate_tax_estimate",
    {
      title: "Estimate chargeable income",
      description:
        "Estimate Singapore chargeable income from gross income and deductions. Returns a rough estimate with the mandatory caveat.",
      inputSchema: {
        income: z.number().min(0).describe("Gross annual income in SGD"),
        deductions: z
          .number()
          .min(0)
          .describe("Total deductions and reliefs in SGD"),
      },
    },
    ({ income, deductions }) => text(formatEstimate(income, deductions)),
  );

  server.registerTool(
    "escalate_to_human",
    {
      title: "Escalate to a human officer",
      description:
        "Queue a question for a human tax officer when it cannot be answered from the available facts. Requires a bearer token when the server is configured with MCP_API_KEY.",
      inputSchema: {
        reason: z.string().min(1).describe("Why this needs a human"),
        original_query: z.string().min(1).describe("The user's original question"),
      },
    },
    async ({ reason, original_query }) => {
      const entry = await addEscalation(reason, original_query);
      return text(
        `Escalation #${entry.id} recorded at ${entry.timestamp}. A human officer will follow up.`,
      );
    },
  );

  server.registerTool(
    "run_javascript",
    {
      title: "Run JavaScript in the sandbox",
      description:
        `Execute JavaScript in a QuickJS WASM sandbox (no network, no filesystem, no host globals; ` +
        `${DEFAULT_TIMEOUT_MS}ms deadline, 32MB memory, ${DEFAULT_MAX_OUTPUT_CHARS}-char output cap). ` +
        "The code must define run(input) and return a JSON-serializable value.",
      inputSchema: {
        code: z
          .string()
          .min(1)
          .max(4000)
          .describe("JavaScript source defining run(input)"),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("JSON object passed to run()"),
      },
    },
    async ({ code, input }) => {
      const res = await runSandboxed(code, input ?? {});
      if (!res.ok) {
        return {
          ...text(`Sandbox error: ${res.error}`),
          isError: true,
        };
      }
      return text(
        typeof res.result === "string" ? res.result : JSON.stringify(res.result),
      );
    },
  );
}

/**
 * Constant-time bearer check for escalate_to_human. Open when MCP_API_KEY is
 * unset (the repo's no-op-without-key convention).
 */
export function escalateAllowed(authHeader: string | null): boolean {
  const key = process.env.MCP_API_KEY;
  if (!key) return true;
  if (!authHeader?.startsWith("Bearer ")) return false;
  const presented = Buffer.from(authHeader.slice("Bearer ".length));
  const expected = Buffer.from(key);
  return (
    presented.length === expected.length && timingSafeEqual(presented, expected)
  );
}

/** True when a JSON-RPC body (single or batch) calls escalate_to_human. */
export function isEscalateCall(body: unknown): boolean {
  if (Array.isArray(body)) return body.some(isEscalateCall);
  if (typeof body !== "object" || body === null) return false;
  const msg = body as { method?: unknown; params?: { name?: unknown } };
  return (
    msg.method === "tools/call" && msg.params?.name === "escalate_to_human"
  );
}
