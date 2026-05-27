import { specTest, expect } from "@platform/spec-test/playwright";

specTest(
  "EXAMPLE-AUTH-001",
  "Unauthenticated /admin redirects to /login",
  async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/);
  },
  { category: "security" },
);

specTest(
  "EXAMPLE-UI-001",
  "Home renders an h1",
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  },
  { category: "ui" },
);
