import { specTest, expect } from "@platform/spec-test/vitest";

// Syntax demo only: replace this local function with an import from your app's
// lib/ code. A specTest over test-file-local logic satisfies the coverage gate
// while exercising zero app code, so don't cargo-cult this shape.
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
