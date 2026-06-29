import { specTest, expect } from "@platform/spec-test/playwright";

/*
 * Journey for the sandboxed code tool: build it in the Tools page builder,
 * run it with an input, and see the server-computed result. Deterministic,
 * no LLM: the run goes through POST /api/tools/run into the real QuickJS
 * sandbox on the dev server.
 */

specTest(
  "IRAS-TOOLS-005",
  "A visitor can build a sandboxed code tool and run it end to end",
  async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("button", { name: "Your tools" }).click();
    await page.getByRole("button", { name: "New tool" }).click();
    await page.getByRole("button", { name: "Code (sandboxed)" }).click();

    await page.getByLabel("Tool name").fill("adder_tool");
    await page.getByLabel("Tool description").fill("Adds two numbers in the sandbox");

    // Two number parameters: a and b.
    await page.getByLabel("Parameter 1 name").fill("a");
    await page.getByLabel("Parameter 1 type").selectOption("number");
    await page.getByRole("button", { name: "+ Add parameter" }).click();
    await page.getByLabel("Parameter 2 name").fill("b");
    await page.getByLabel("Parameter 2 type").selectOption("number");

    await page
      .getByLabel("Tool code")
      .fill("function run(input) { return { sum: input.a + input.b }; }");
    await page.getByRole("button", { name: "Save tool" }).click();

    const card = page.locator('[data-testid="custom-tool"][data-name="adder_tool"]');
    await expect(card).toBeVisible();
    await card.getByLabel("a", { exact: true }).fill("19");
    await card.getByLabel("b", { exact: true }).fill("23");
    await card.getByRole("button", { name: "Run" }).click();

    // Executed server-side in QuickJS; the JSON result renders in the card.
    await expect(card.getByTestId("custom-tool-result")).toContainText('"sum":42');
  },
  { category: "functional" },
);

specTest(
  "IRAS-TOOLS-007",
  "Example tools are preloaded and runnable on first visit",
  async ({ page }) => {
    // Fresh browser context: nothing in localStorage, so the seed applies.
    await page.goto("/tools");
    await page.getByRole("button", { name: "Your tools" }).click();

    // One example per kind (lookup, template, code).
    for (const name of ["case_status", "due_date_reminder", "percentage_of"]) {
      await expect(
        page.locator(`[data-testid="custom-tool"][data-name="${name}"]`),
      ).toBeVisible();
    }

    // The code example runs against the real server sandbox with no setup.
    const calc = page.locator('[data-testid="custom-tool"][data-name="percentage_of"]');
    await calc.getByLabel("amount", { exact: true }).fill("100");
    await calc.getByLabel("rate", { exact: true }).fill("9");
    await calc.getByRole("button", { name: "Run" }).click();
    await expect(calc.getByTestId("custom-tool-result")).toContainText('"result":9');
  },
  { category: "functional" },
);
