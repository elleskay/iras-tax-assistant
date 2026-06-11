import { rmSync } from "node:fs";
import { join } from "node:path";
import { specTest, expect } from "@platform/spec-test/playwright";

/*
 * Run history journey: /api/eval (the model call) is stubbed so no LLM runs,
 * but /api/eval/runs is exercised for real against the file-backed store
 * (eval-runs.json in the server's working directory). The test starts from an
 * empty store and cleans up after itself.
 */

const storePath = join(process.cwd(), "eval-runs.json");

specTest(
  "IRAS-EVAL-006",
  "A completed run is persisted and shown in the history trend",
  async ({ page }) => {
    rmSync(storePath, { force: true });
    try {
      // Stub only the per-case model call; the runs API stays real.
      await page.route("**/api/eval", async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            answer: "The GST registration threshold is SGD 1,000,000.",
            checks: [{ keyword: "1,000,000", pass: true }],
            pass: true,
            model: "GPT-4o mini",
          },
        });
      });

      await page.goto("/evals");
      await page.getByRole("button", { name: "Run" }).click();
      await expect(page.getByTestId("eval-stats")).toBeVisible();

      // The run was POSTed to /api/eval/runs and the history reloaded.
      const history = page.getByTestId("run-history");
      await expect(history).toBeVisible();
      const entry = page.getByTestId("run-entry").first();
      await expect(entry).toContainText("keyword");
      await expect(entry).toContainText("100%");
      expect(await page.getByTestId("run-bar").count()).toBeGreaterThanOrEqual(1);

      // Persisted server-side: a fresh load still shows it.
      await page.reload();
      await expect(page.getByTestId("run-history")).toBeVisible();
      await expect(page.getByTestId("run-entry").first()).toContainText("100%");
    } finally {
      rmSync(storePath, { force: true });
    }
  },
  { category: "functional" },
);

specTest(
  "IRAS-EVAL-009",
  "A failed eval case explains why it failed",
  async ({ page }) => {
    rmSync(storePath, { force: true });
    try {
      // Phase 1: keyword grader, a case that misses an expected keyword.
      await page.route("**/api/eval", async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            answer: "GST registration depends on turnover.",
            checks: [
              { keyword: "threshold", pass: true },
              { keyword: "1,000,000", pass: false },
            ],
            pass: false,
            model: "GPT-4o mini",
          },
        });
      });

      await page.goto("/evals");
      await page.getByRole("button", { name: "Run" }).click();
      await expect(page.getByTestId("eval-stats")).toBeVisible();
      // The miss is named, not just a red icon.
      await expect(page.getByText("miss: 1,000,000").first()).toBeVisible();

      // Phase 2: judge grader, a failing verdict with score and rationale.
      await page.unroute("**/api/eval");
      await page.route("**/api/eval", async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            answer: "GST registration depends on turnover.",
            checks: [],
            pass: false,
            score: 35,
            rationale: "The answer omits the SGD 1,000,000 registration threshold.",
            model: "Claude Haiku 4.5",
          },
        });
      });

      await page.getByLabel("Grader").selectOption("judge");
      await page.getByRole("button", { name: "Run" }).click();
      // The judge's verdict is shown on the failed case.
      await expect(
        page.getByText("omits the SGD 1,000,000 registration threshold").first(),
      ).toBeVisible();
      await expect(page.getByText(/Judge score 35/).first()).toBeVisible();
    } finally {
      rmSync(storePath, { force: true });
    }
  },
  { category: "functional" },
);
