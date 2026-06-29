import { specTest, expect } from "@platform/spec-test/playwright";

specTest(
  "TAX-A11Y-001",
  "Page exposes a skip-to-content link and a single h1",
  async ({ page }) => {
    await page.goto("/");
    // The skip link is visually hidden until focused, so assert presence and
    // its target, not visibility.
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toHaveCount(1);
    await expect(skip).toHaveAttribute("href", "#main");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  },
  { category: "a11y" },
);

specTest(
  "TAX-A11Y-002",
  "The chat message input has an accessible label",
  async ({ page }) => {
    await page.goto("/assistant");
    // Resolves only if the textbox has a non-empty accessible name.
    await expect(
      page.getByRole("textbox", { name: /ask a tax question/i }),
    ).toBeVisible();
  },
  { category: "a11y" },
);
