import { test, expect, afterEach, type TestContext } from "vitest";
import { recordCoverage } from "./coverage.js";

export { test, expect };

const SPEC_ID_RE = /^\[([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+-\d{3,})\]/;

// Spec category per id, populated by specTest() at collection time and read by
// the afterEach recorder at run time so the coverage report can detect a test
// covering a requirement in the wrong layer (category mismatch).
const categoryById = new Map<string, string>();

/**
 * Register a global afterEach hook that parses the test name for a spec ID
 * and records pass/fail to the coverage JSONL. Call this once from a Vitest
 * setupFile.
 */
export function setupSpecCoverage(): void {
  afterEach((ctx) => {
    const taskName = ctx.task?.name ?? "";
    const m = SPEC_ID_RE.exec(taskName);
    if (!m) return;
    const id = m[1] as string;
    const failed = !!ctx.task?.result?.errors?.length;
    recordCoverage({
      id,
      status: failed ? "failed" : "passed",
      category: categoryById.get(id),
      durationMs: ctx.task?.result?.duration,
    });
  });
}

export interface SpecTestOptions {
  /** Requirement category, used for coverage category-mismatch detection. */
  category?: string;
}

/**
 * Register a Vitest test bound to a spec requirement id. The id is prefixed to
 * the test title as "[ID] " so the coverage recorder (see setupSpecCoverage)
 * picks it up. Use for `data` requirements (pure logic).
 */
export function specTest(
  id: string,
  title: string,
  // A plain test body. Not `Parameters<typeof test>[1]`: Vitest's `test` is
  // overloaded, so that index resolves to `TestOptions` on current versions,
  // which makes every specTest() call fail typecheck in a strict app. The body
  // may be sync or async; the optional Vitest TestContext is passed through.
  fn: (context: TestContext) => void | Promise<void>,
  opts: SpecTestOptions = {},
): void {
  if (opts.category) categoryById.set(id, opts.category);
  test(`[${id}] ${title}`, fn);
}
