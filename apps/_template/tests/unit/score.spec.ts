import { specTest, expect } from "@platform/spec-test/vitest";

function computeScore({ ok, total }: { ok: number; total: number }): number {
  if (total === 0) return 100;
  return Math.round((ok / total) * 100);
}

specTest(
  "EXAMPLE-MATH-001",
  "Score is round(ok / total * 100)",
  () => {
    expect(computeScore({ ok: 5, total: 6 })).toBe(83);
    expect(computeScore({ ok: 6, total: 6 })).toBe(100);
    expect(computeScore({ ok: 0, total: 6 })).toBe(0);
    expect(computeScore({ ok: 0, total: 0 })).toBe(100);
  },
  { category: "data" },
);
