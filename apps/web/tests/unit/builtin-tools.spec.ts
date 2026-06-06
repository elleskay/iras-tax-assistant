import { specTest, expect } from "@platform/spec-test/vitest";
import { buildTaxTools } from "../../lib/tools";
import { DEFAULT_BUILTIN_CONFIG } from "../../lib/builtin-tools";
import { lookupFromPairs } from "../../lib/tax";

specTest(
  "IRAS-TOOLS-004",
  "Built-in tools respect their configuration",
  () => {
    // Default config exposes all three tools.
    const all = buildTaxTools(DEFAULT_BUILTIN_CONFIG);
    expect(Object.keys(all).sort()).toEqual([
      "calculate_tax_estimate",
      "escalate_to_human",
      "lookup_tax_info",
    ]);

    // Disabling tools omits them from the set.
    const onlyLookup = buildTaxTools({
      ...DEFAULT_BUILTIN_CONFIG,
      estimate: { ...DEFAULT_BUILTIN_CONFIG.estimate, enabled: false },
      escalate: { ...DEFAULT_BUILTIN_CONFIG.escalate, enabled: false },
    });
    expect(Object.keys(onlyLookup)).toEqual(["lookup_tax_info"]);

    // Lookup returns the configured fact for a matching keyword.
    expect(lookupFromPairs([{ key: "gst", value: "configured answer" }], "GST")).toBe(
      "configured answer",
    );
    expect(lookupFromPairs([{ key: "gst", value: "x" }], "unknown")).toMatch(
      /Available topics/i,
    );
  },
  { category: "data" },
);
