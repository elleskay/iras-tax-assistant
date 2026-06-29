import { specTest, expect } from "@platform/spec-test/playwright";

specTest(
  "IRAS-LANDING-001",
  "Landing page guides the visitor and links into every showcase page",
  async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "One governed AI assistant per department",
      }),
    ).toBeVisible();
    const cta = page.locator('main a[href="/assistant"]').first();
    await expect(cta).toBeVisible();

    // The landing links into every showcase page.
    const hrefs = [
      "/assistant",
      "/documents",
      "/tools",
      "/prompts",
      "/insights",
      "/gateway",
      "/governance",
      "/governance/policy",
      "/governance/audit",
      "/evals",
    ];
    for (const href of hrefs) {
      await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
    }
  },
  { category: "ui" },
);

specTest(
  "IRAS-NAV-001",
  "Primary navigation links to every showcase page",
  async ({ page }) => {
    await page.goto("/");
    // The sidebar (AppShell) is the primary nav. exact: true so "Assistant"
    // does not also match the "AI Tax Assistant Platform" logo link.
    for (const label of [
      "Assistant",
      "Documents",
      "AI Tools",
      "AI Dashboard",
      "AI Policy",
      "AI Audit Trail",
      "AI Instructions",
      "Usage analytics",
      "AI Evaluation",
      "AI Gateway",
    ]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  },
  { category: "functional" },
);

specTest(
  "IRAS-TOOLS-002",
  "A visitor can run a seeded lookup tool and see a result",
  async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("button", { name: "Your tools" }).click();
    // The seeded case_status lookup returns the meaning of a status.
    const card = page.locator('[data-testid="custom-tool"][data-name="case_status"]');
    await expect(card).toBeVisible();
    await card.getByLabel("status", { exact: true }).fill("pending");
    await card.getByRole("button", { name: "Run" }).click();
    await expect(card.getByTestId("custom-tool-result")).toContainText("awaiting review");
  },
  { category: "functional" },
);

specTest(
  "IRAS-TOOLS-003",
  "A visitor can create a custom tool and run it",
  async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("button", { name: "Your tools" }).click();
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
    await page.goto("/governance/policy");
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
  "Evals page shows the test-cases workbench",
  async ({ page }) => {
    await page.goto("/evals");
    await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  },
  { category: "ui" },
);

specTest(
  "IRAS-ROUTE-001",
  "AI Policy page shows the editable model routing rules",
  async ({ page }) => {
    await page.goto("/governance/policy");
    await expect(page.getByRole("heading", { name: "Model routing rules" })).toBeVisible();
    await expect(page.getByLabel("Try a query")).toBeVisible();
  },
  { category: "ui" },
);
