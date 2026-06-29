/*
 * Pure tax logic, ported from the original MCP server tool handlers.
 * Kept free of any I/O or SDK imports so it is deterministic and unit testable
 * (these back the `data` category spec requirements).
 *
 * NOTE: the factual data is hardcoded, as in the original MCP server. For
 * production, replace TAX_FACTS with a live tax data source or retrieval layer.
 */

export const TAX_FACTS: Record<string, string> = {
  gst: "GST registration threshold: SGD 1,000,000 in taxable turnover over 12 months. The prevailing GST rate is 9%.",
  income_tax:
    "Income tax e-filing deadline: 18 April (paper: 15 April). Singapore uses progressive resident rates from 0% up to 24%.",
  corporate_tax:
    "Corporate income tax rate: 17% (flat). Partial tax exemptions apply for qualifying companies, plus a start-up tax exemption scheme.",
  srs: "SRS (Supplementary Retirement Scheme) annual contribution cap: SGD 15,300 for Singapore Citizens and PRs, SGD 35,700 for foreigners.",
};

/** Chargeable income is gross income minus deductions, never below zero. */
export function calculateChargeableIncome(
  income: number,
  deductions: number,
): number {
  return Math.max(0, income - deductions);
}

/** Human-readable estimate string with the mandatory not-final-advice caveat. */
export function formatEstimate(income: number, deductions: number): string {
  const chargeable = calculateChargeableIncome(income, deductions);
  return (
    `Estimated chargeable income: SGD ${chargeable.toLocaleString("en-SG")}. ` +
    `(Income SGD ${income.toLocaleString("en-SG")} minus deductions SGD ${deductions.toLocaleString("en-SG")}.) ` +
    `This is a rough estimate only. Actual tax liability depends on reliefs, residency status, and the final tax assessment. ` +
    `Consult a tax professional for personalised advice.`
  );
}

/** Look up a known tax fact by topic, with a guidance fallback. */
export function lookupTaxFact(topic: string): string {
  const key = topic.toLowerCase().replace(/\s+/g, "_");
  for (const [k, v] of Object.entries(TAX_FACTS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return `No specific fact found for "${topic}". Available topics: GST, income tax, corporate tax, SRS.`;
}

/** Same matching, over a configurable key/value fact list. */
export function lookupFromPairs(
  pairs: { key: string; value: string }[],
  topic: string,
): string {
  const key = topic.toLowerCase().replace(/\s+/g, "_");
  for (const p of pairs) {
    const k = p.key.toLowerCase().replace(/\s+/g, "_");
    if (k && (key.includes(k) || k.includes(key))) return p.value;
  }
  const topics = pairs.map((p) => p.key).join(", ");
  return `No specific fact found for "${topic}". Available topics: ${topics}.`;
}
