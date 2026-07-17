import { specTest, expect } from "@platform/spec-test/playwright";

// BAD: no expect() in the body; the lint rule must flag exactly this one.
specTest("EX-AUTH-001", "Unauthed users redirected", async ({ page }) => {
  await page.goto("/admin");
});

// GOOD: asserts behavior.
specTest("EX-AUTH-002", "Officers blocked from admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/login/);
});
