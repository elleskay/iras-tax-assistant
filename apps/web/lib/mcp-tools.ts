import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_CHARS,
  runSandboxed,
} from "./sandbox";

/*
 * Internal MCP server: a deterministic sandbox tool exposed over the Model
 * Context Protocol so other agents (Claude Code, the MCP inspector, any MCP
 * client) can call it directly. One registration function shared by both
 * transports:
 *  - Streamable HTTP at /api/mcp (app/api/[transport]/route.ts, mcp-handler)
 *  - stdio for local clients (mcp/stdio.ts, `npm run mcp:stdio`)
 *
 * The tool reuses lib/sandbox.ts for the QuickJS code runtime. No LLM is
 * involved; it is deterministic. Public (rate limited at the route).
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
