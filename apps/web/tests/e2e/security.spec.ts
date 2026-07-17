import { specTest, expect } from "@platform/spec-test/playwright";

specTest(
  "TAX-SEC-001",
  "Responses carry baseline security headers",
  async ({ page }) => {
    const response = await page.goto("/");
    expect(response).not.toBeNull();
    const headers = response!.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  },
  { category: "security" },
);

specTest(
  "TAX-SEC-002",
  "robots.txt blocks crawler-triggered model calls",
  async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
    const body = await response!.text();
    expect(body).toContain("Disallow: /*?q=");
    expect(body).toContain("Disallow: /api/");
  },
  { category: "security" },
);
