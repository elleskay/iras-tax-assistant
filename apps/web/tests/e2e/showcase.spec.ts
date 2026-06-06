import { specTest, expect } from "@platform/spec-test/playwright";

specTest(
  "IRAS-NAV-001",
  "Primary navigation links to every showcase page",
  async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const label of ["Assistant", "MCP tools", "Evals", "Advisor queue"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  },
  { category: "functional" },
);

specTest(
  "IRAS-TOOLS-001",
  "Tools page lists the MCP server tools",
  async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("lookup_tax_info")).toBeVisible();
    await expect(page.getByText("calculate_tax_estimate")).toBeVisible();
    await expect(page.getByText("escalate_to_human")).toBeVisible();
  },
  { category: "ui" },
);

specTest(
  "IRAS-TOOLS-002",
  "A visitor can run the lookup tool and see a result",
  async ({ page }) => {
    await page.goto("/tools");
    // The lookup tool is the first tool, pre-filled with "GST".
    await page.getByRole("button", { name: "Run" }).first().click();
    await expect(page.getByTestId("tool-result").first()).toContainText("1,000,000");
  },
  { category: "functional" },
);

specTest(
  "IRAS-TOOLS-003",
  "A visitor can create a custom tool and run it",
  async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("button", { name: "New tool" }).click();
    await page.getByLabel("Tool name").fill("greeting_tool");
    await page.getByLabel("Tool description").fill("Greets by keyword");
    await page.getByLabel("Keyword 1").fill("hi");
    await page.getByLabel("Answer 1").fill("Hello there");
    await page.getByRole("button", { name: "Save tool" }).click();

    const card = page.locator('[data-testid="custom-tool"][data-name="greeting_tool"]');
    await expect(card).toBeVisible();
    await card.getByLabel("query").fill("hi");
    await card.getByRole("button", { name: "Run" }).click();
    await expect(card.getByTestId("custom-tool-result")).toContainText("Hello there");
  },
  { category: "functional" },
);

specTest(
  "IRAS-EVAL-002",
  "The route preview shows where a query routes",
  async ({ page }) => {
    await page.goto("/evals");
    // Deterministic, client-side, no model call.
    await page.getByLabel("Try a query").fill("What is the corporate tax rate?");
    const preview = page.getByTestId("route-preview");
    await expect(preview).toContainText("GPT-4o mini");
    await expect(preview).toContainText("factual-lookup");
  },
  { category: "functional" },
);

specTest(
  "IRAS-EVAL-003",
  "Running the test cases populates the result stats",
  async ({ page }) => {
    // Running calls the routed model per case, so stub /api/eval.
    await page.route("**/api/eval", async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          answer: "The GST registration threshold is SGD 1,000,000 in taxable turnover.",
          checks: [{ keyword: "1,000,000", pass: true }],
          pass: true,
          model: "GPT-4o mini",
        },
      });
    });
    await page.goto("/evals");
    await page.getByRole("button", { name: "Run" }).click();
    const stats = page.getByTestId("eval-stats");
    await expect(stats).toBeVisible();
    await expect(stats).toContainText("Pass rate");
  },
  { category: "functional" },
);

specTest(
  "IRAS-EVAL-001",
  "Evals page shows configurable routing rules and test cases",
  async ({ page }) => {
    await page.goto("/evals");
    await expect(page.getByRole("heading", { name: "Model routing rules" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
  },
  { category: "ui" },
);
