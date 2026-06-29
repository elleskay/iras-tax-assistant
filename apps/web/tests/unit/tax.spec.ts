import { specTest, expect } from "@platform/spec-test/vitest";
import {
  calculateChargeableIncome,
  formatEstimate,
  lookupTaxFact,
} from "../../lib/tax";

specTest(
  "TAX-TAX-001",
  "Chargeable income is gross income minus deductions, floored at zero",
  () => {
    expect(calculateChargeableIncome(100000, 20000)).toBe(80000);
    expect(calculateChargeableIncome(50000, 50000)).toBe(0);
    // Deductions exceeding income never produce a negative figure.
    expect(calculateChargeableIncome(30000, 90000)).toBe(0);
    // The formatted estimate carries the mandatory not-final-advice caveat.
    expect(formatEstimate(100000, 20000)).toContain("80,000");
    expect(formatEstimate(100000, 20000)).toMatch(/estimate only/i);
  },
  { category: "data" },
);

specTest(
  "TAX-TAX-002",
  "Tax lookup returns the known fact for a supported topic",
  () => {
    expect(lookupTaxFact("GST")).toMatch(/1,000,000/);
    expect(lookupTaxFact("income tax")).toMatch(/18 April/);
    expect(lookupTaxFact("corporate tax")).toMatch(/17%/);
    expect(lookupTaxFact("SRS")).toMatch(/15,300/);
    // Unknown topics return guidance listing the available topics.
    expect(lookupTaxFact("crypto staking")).toMatch(/Available topics/i);
  },
  { category: "data" },
);
