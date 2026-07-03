import { specTest, expect } from "@platform/spec-test/playwright";

specTest(
  "EXAMPLE-AUTH-001",
  "Unauthenticated /admin redirects to /login",
  async ({ page }) => {
    // Observe the redirect itself, not just the final URL: page.goto resolves
    // with the post-redirect response (always ~200), so asserting its status
    // would never see the 307 the spec requires.
    const redirect = page.waitForResponse(
      (res) => res.url().includes("/admin") && res.status() >= 300 && res.status() < 400,
    );
    await page.goto("/admin");
    expect((await redirect).status()).toBe(307);
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
