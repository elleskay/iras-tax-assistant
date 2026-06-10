import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MCP_SERVER_INFO, registerMcpTools } from "../lib/mcp-tools";

/*
 * stdio transport for local MCP clients (Claude Code, the MCP inspector).
 * Same tools as the HTTP endpoint at /api/mcp; see lib/mcp-tools.ts.
 *
 * Run: npm run mcp:stdio (from apps/web), or wire it into a client:
 *
 *   {
 *     "mcpServers": {
 *       "iras-tax": {
 *         "command": "npm",
 *         "args": ["run", "mcp:stdio", "--silent"],
 *         "cwd": "apps/web"
 *       }
 *     }
 *   }
 */

async function main() {
  const server = new McpServer(MCP_SERVER_INFO);
  registerMcpTools(server);
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol; log to stderr only.
  console.error(`${MCP_SERVER_INFO.name} MCP server listening on stdio`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
