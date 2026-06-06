import { z } from "zod";
import { TAX_FACTS } from "./tax";

/*
 * Configuration for the three built-in MCP tools. What is safely configurable:
 *  - enable/disable each tool (the assistant only gets enabled tools),
 *  - each tool's description (what the model sees when choosing a tool),
 *  - the lookup tool's fact list (its data).
 * The estimate and escalate logic is fixed code (a formula and a queue write),
 * so it is not user-editable, but they can still be renamed, redescribed, or
 * turned off. Config is stored per-browser and sent to the assistant.
 */

export interface FactPair {
  key: string;
  value: string;
}

export interface BuiltinToolsConfig {
  lookup: { enabled: boolean; description: string; facts: FactPair[] };
  estimate: { enabled: boolean; description: string };
  escalate: { enabled: boolean; description: string };
}

export const DEFAULT_BUILTIN_CONFIG: BuiltinToolsConfig = {
  lookup: {
    enabled: true,
    description:
      "Look up factual information about Singapore tax rules. Use for general questions about GST, income tax, corporate tax rates, or SRS limits.",
    facts: [
      { key: "GST", value: TAX_FACTS.gst },
      { key: "income tax", value: TAX_FACTS.income_tax },
      { key: "corporate tax", value: TAX_FACTS.corporate_tax },
      { key: "SRS", value: TAX_FACTS.srs },
    ],
  },
  estimate: {
    enabled: true,
    description:
      "Calculate a rough chargeable income estimate. Always disclose this is an estimate, not a final tax computation.",
  },
  escalate: {
    enabled: true,
    description:
      "Escalate to a human tax advisor when the query requires personalised advice, involves complex situations, or goes beyond standard FAQ answers.",
  },
};

export const BuiltinToolsConfigSchema = z.object({
  lookup: z.object({
    enabled: z.boolean(),
    description: z.string().min(1).max(400),
    facts: z
      .array(z.object({ key: z.string().min(1).max(120), value: z.string().min(1).max(800) }))
      .max(40),
  }),
  estimate: z.object({ enabled: z.boolean(), description: z.string().min(1).max(400) }),
  escalate: z.object({ enabled: z.boolean(), description: z.string().min(1).max(400) }),
});

const KEY = "iras-builtin-tools";

export function loadBuiltinConfig(): BuiltinToolsConfig {
  if (typeof window === "undefined") return DEFAULT_BUILTIN_CONFIG;
  try {
    const parsed = BuiltinToolsConfigSchema.safeParse(
      JSON.parse(localStorage.getItem(KEY) ?? "null"),
    );
    return parsed.success ? parsed.data : DEFAULT_BUILTIN_CONFIG;
  } catch {
    return DEFAULT_BUILTIN_CONFIG;
  }
}

export function saveBuiltinConfig(cfg: BuiltinToolsConfig): void {
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(cfg));
}
