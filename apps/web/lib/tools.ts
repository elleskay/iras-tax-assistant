import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { formatEstimate, lookupFromPairs } from "./tax";
import { addEscalation } from "./hitl-store";
import {
  type BuiltinToolsConfig,
  DEFAULT_BUILTIN_CONFIG,
} from "./builtin-tools";

/*
 * Built-in tax tools, ported from iras-mcp-server. Built from a BuiltinToolsConfig
 * so they are configurable (enable/disable, description, lookup facts). The
 * deterministic work lives in lib/tax.ts and lib/hitl-store.ts.
 */

export function buildTaxTools(cfg: BuiltinToolsConfig): ToolSet {
  const tools: ToolSet = {};

  if (cfg.lookup.enabled) {
    tools.lookup_tax_info = tool({
      description: cfg.lookup.description,
      inputSchema: z.object({
        topic: z.string().describe("Tax topic to look up, e.g. 'GST', 'income tax'"),
      }),
      execute: async ({ topic }) => lookupFromPairs(cfg.lookup.facts, topic),
    });
  }

  if (cfg.estimate.enabled) {
    tools.calculate_tax_estimate = tool({
      description: cfg.estimate.description,
      inputSchema: z.object({
        income: z.number().describe("Annual gross income in SGD"),
        deductions: z.number().describe("Total deductions or reliefs in SGD"),
      }),
      execute: async ({ income, deductions }) => formatEstimate(income, deductions),
    });
  }

  if (cfg.escalate.enabled) {
    tools.escalate_to_human = tool({
      description: cfg.escalate.description,
      inputSchema: z.object({
        reason: z.string().describe("Why this needs human review"),
        original_query: z.string().describe("The user's original question verbatim"),
      }),
      execute: async ({ reason, original_query }) => {
        const entry = await addEscalation(reason, original_query);
        return (
          `Your query has been escalated to a human tax advisor (case #${entry.id}). ` +
          `They will follow up with personalised advice. ` +
          `Please do not act on any figures discussed here as final tax advice.`
        );
      },
    });
  }

  return tools;
}

/** Default tool set (all enabled, default facts), used where no config is sent. */
export const taxTools = buildTaxTools(DEFAULT_BUILTIN_CONFIG);
