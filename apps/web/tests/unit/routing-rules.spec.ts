import { specTest, expect } from "@platform/spec-test/vitest";
import { applyRoutingRules, DEFAULT_CONFIG } from "../../lib/routing-rules";

specTest(
  "IRAS-ROUTER-001",
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

    // Personalised intent routes to a balanced Anthropic model.
    const personal = applyRoutingRules(DEFAULT_CONFIG, "Should I contribute to SRS?");
    expect(personal.modelId).toBe("claude-sonnet-4-6");
    expect(personal.reason).toBe("personalised-advice");

    // PII (NRIC/UEN) routes to Anthropic Haiku.
    const pii = applyRoutingRules(DEFAULT_CONFIG, "My NRIC is on the form");
    expect(pii.modelId).toBe("claude-haiku-4-5-20251001");
    expect(pii.reason).toBe("pii-sensitive");

    // No signal falls back.
    const fallback = applyRoutingRules(DEFAULT_CONFIG, "tell me about taxes");
    expect(fallback.reason).toBe("default");
  },
  { category: "data" },
);
