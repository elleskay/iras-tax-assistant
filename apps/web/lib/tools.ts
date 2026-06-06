import { tool } from "ai";
import { z } from "zod";
import { formatEstimate, lookupTaxFact } from "./tax";
import { addEscalation } from "./hitl-store";

/*
 * Tax tools, ported from iras-mcp-server/tools.mjs to the Vercel AI SDK tool()
 * format. Same behaviour, now callable by the model during a chat turn. The
 * deterministic work lives in lib/tax.ts and lib/hitl-store.ts; these wrappers
 * only adapt it to the SDK.
 */

export const taxTools = {
  lookup_tax_info: tool({
    description:
      "Look up factual information about Singapore tax rules. Use for general questions about GST, income tax, corporate tax rates, or SRS limits.",
    inputSchema: z.object({
      topic: z
        .string()
        .describe("Tax topic to look up, e.g. 'GST', 'income tax', 'corporate tax', 'SRS'"),
    }),
    execute: async ({ topic }) => lookupTaxFact(topic),
  }),

  calculate_tax_estimate: tool({
    description:
      "Calculate a rough chargeable income estimate. Always disclose this is an estimate, not a final tax computation.",
    inputSchema: z.object({
      income: z.number().describe("Annual gross income in SGD"),
      deductions: z.number().describe("Total deductions or reliefs in SGD"),
    }),
    execute: async ({ income, deductions }) => formatEstimate(income, deductions),
  }),

  escalate_to_human: tool({
    description:
      "Escalate to a human tax advisor when the query requires personalised advice, involves complex situations, or goes beyond standard FAQ answers.",
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
  }),
};
