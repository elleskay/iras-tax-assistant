import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { specTest, expect } from "@platform/spec-test/playwright";

/*
 * The gateway page reads the file-backed store (gateway.json in the server's
 * working directory) at request time, so the test seeds it directly with two
 * known entries instead of making a live model call.
 */

const storePath = join(process.cwd(), "gateway.json");

function entry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    timestamp: "2026-06-10T03:00:00.000Z",
    modelId: "claude-haiku-4-5-20251001",
    modelLabel: "Claude Haiku 4.5",
    provider: "anthropic",
    kind: "stream",
    route: "default",
    latencyMs: 1234,
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.00042,
    fallbackUsed: false,
    ...overrides,
  };
}

specTest(
  "IRAS-GATEWAY-004",
  "The gateway page lists recent model calls",
  async ({ page }) => {
    const newer = entry("0001-e2e", {
      modelId: "gpt-4o-mini",
      modelLabel: "GPT-4o mini",
      provider: "openai",
      kind: "generate",
      route: "factual-lookup",
      fallbackUsed: true,
    });
    const older = entry("0002-e2e");
    writeFileSync(
      storePath,
      JSON.stringify({ [newer.id]: newer, [older.id]: older }),
      "utf8",
    );
    try {
      await page.goto("/gateway");
      const table = page.getByTestId("gateway-calls");
      await expect(table).toBeVisible();

      const rows = page.getByTestId("gateway-call");
      await expect(rows).toHaveCount(2);

      // Newest-first: the seeded ids sort the GPT call to the top.
      const first = rows.first();
      await expect(first).toContainText("GPT-4o mini");
      await expect(first).toContainText("fallback");
      await expect(first).toContainText("100 / 50");

      const second = rows.nth(1);
      await expect(second).toContainText("Claude Haiku 4.5");
      await expect(second).toContainText("1,234 ms");
      await expect(second).toContainText("$0.0004");
    } finally {
      rmSync(storePath, { force: true });
    }
  },
  { category: "ui" },
);
