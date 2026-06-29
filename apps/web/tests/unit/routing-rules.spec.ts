import { specTest, expect } from "@platform/spec-test/vitest";
import { applyRoutingRules, DEFAULT_CONFIG } from "../../lib/routing-rules";

specTest(
  "TAX-ROUTER-001",
  "The deterministic routing rules pick the right model per query",
  () => {
    // Factual lookups route to the cheaper OpenAI model.
    const factual = applyRoutingRules(DEFAULT_CONFIG, "What is the GST threshold?");
    expect(factual.modelId).toBe("gpt-4o-mini");
    expect(factual.reason).toBe("factual-lookup");

    // Calculations route to a balanced OpenAI model.
    const calc = applyRoutingRules(DEFAULT_CONFIG, "Estimate the tax for an income of 100000");
    expect(calc.modelId).toBe("gpt-4.1");
    expect(calc.reason).toBe("calculation");

    // Complex comparisons route to the premium Anthropic model.
    const complex = applyRoutingRules(DEFAULT_CONFIG, "Compare a sole proprietorship versus a Pte Ltd");
    expect(complex.modelId).toBe("claude-opus-4-8");
    expect(complex.reason).toBe("complex-reasoning");

    // Drafting a reply routes to a strong writer that also cites well.
    const draft = applyRoutingRules(DEFAULT_CONFIG, "Draft a reply to the taxpayer about their filing");
    expect(draft.modelId).toBe("claude-sonnet-4-6");
    expect(draft.reason).toBe("drafting");

    // PII (NRIC/UEN) routes to Anthropic Haiku.
    const pii = applyRoutingRules(DEFAULT_CONFIG, "My NRIC is on the form");
    expect(pii.modelId).toBe("claude-haiku-4-5-20251001");
    expect(pii.reason).toBe("pii-sensitive");

    // No signal falls back to a capable general-casework model (not the weakest).
    const fallback = applyRoutingRules(DEFAULT_CONFIG, "tell me about taxes");
    expect(fallback.modelId).toBe("gpt-4o-mini");
    expect(fallback.reason).toBe("general casework");
  },
  { category: "data" },
);
