import { specTest, expect } from "@platform/spec-test/playwright";

specTest(
  "IRAS-SEC-001",
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
