import { test as vitestTest, expect as vitestExpect } from "vitest";
import { recordCoverage } from "./coverage.js";
import type { RequirementCategory } from "./schema.js";

export const expect = vitestExpect;
export const test = vitestTest;

export interface SpecTestOptions {
  category?: RequirementCategory;
}

type SpecTestBody = Parameters<typeof vitestTest>[1];

export function specTest(
  id: string,
  titleOrFn: string | SpecTestBody,
  bodyOrOptions?: SpecTestBody | SpecTestOptions,
  maybeOptions?: SpecTestOptions,
): void {
  const title = typeof titleOrFn === "string" ? titleOrFn : id;
  const body =
    typeof titleOrFn === "function"
      ? titleOrFn
      : (bodyOrOptions as SpecTestBody);
  const opts: SpecTestOptions =
    (typeof titleOrFn === "string"
      ? (maybeOptions as SpecTestOptions | undefined)
      : (bodyOrOptions as SpecTestOptions | undefined)) ?? {};

  if (typeof body !== "function") {
    throw new Error(`specTest(${id}): body function is required`);
  }

  vitestTest(`[${id}] ${title}`, async (ctx) => {
    const start = Date.now();
    let passed = true;
    try {
      await (body as (ctx: unknown) => unknown | Promise<unknown>)(ctx);
    } catch (err) {
      passed = false;
      throw err;
    } finally {
      recordCoverage({
        id,
        status: passed ? "passed" : "failed",
        category: opts.category,
        durationMs: Date.now() - start,
      });
    }
  });
}
