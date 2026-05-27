import { test as base, expect as pwExpect } from "@playwright/test";
import { recordCoverage } from "./coverage.js";
import type { RequirementCategory } from "./schema.js";

export const expect = pwExpect;
export const test = base;

export interface SpecTestOptions {
  category?: RequirementCategory;
}

type SpecTestFn = Parameters<typeof base>[1];

export function specTest(
  id: string,
  titleOrFn: string | SpecTestFn,
  bodyOrOptions?: SpecTestFn | SpecTestOptions,
  maybeOptions?: SpecTestOptions,
): void {
  const title = typeof titleOrFn === "string" ? titleOrFn : id;
  const body =
    typeof titleOrFn === "function" ? titleOrFn : (bodyOrOptions as SpecTestFn);
  const opts: SpecTestOptions =
    (typeof titleOrFn === "string"
      ? (maybeOptions as SpecTestOptions | undefined)
      : (bodyOrOptions as SpecTestOptions | undefined)) ?? {};

  if (typeof body !== "function") {
    throw new Error(`specTest(${id}): body function is required`);
  }

  const runner = body as (...args: unknown[]) => unknown | Promise<unknown>;
  base(`[${id}] ${title}`, async (fixtures, testInfo) => {
    const start = Date.now();
    let passed = true;
    try {
      await runner(fixtures, testInfo);
    } catch (err) {
      passed = false;
      throw err;
    } finally {
      recordCoverage({
        id,
        status: passed ? "passed" : "failed",
        category: opts.category,
        file: testInfo.file,
        durationMs: Date.now() - start,
      });
    }
  });
}
