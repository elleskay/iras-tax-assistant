import { specTest, expect } from "@platform/spec-test/playwright";

// Seed an escalation directly via the API so the admin journey is deterministic
// and does not depend on the (non-deterministic) LLM deciding to escalate.
async function seedEscalation(
  request: { post: (url: string, opts: { data: unknown }) => Promise<unknown> },
  query: string,
): Promise<void> {
  await request.post("/api/hitl", {
    data: { reason: "Personal scenario requiring advisor review", original_query: query },
  });
}

specTest(
  "IRAS-HITL-002",
  "Admin page lists pending escalations from the queue",
  async ({ page, request }) => {
    const query = `Will I owe tax on my bonus? case-${Date.now()}`;
    await seedEscalation(request, query);

    await page.goto("/admin");
    const row = page.locator('[data-testid="escalation"]', { hasText: query });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-status", "pending");
    await expect(row).toContainText("advisor review");
  },
  { category: "functional" },
);

specTest(
  "IRAS-HITL-003",
  "Resolving an escalation marks it resolved end to end",
  async ({ page, request }) => {
    const query = `Should I register for GST? case-${Date.now()}`;
    await seedEscalation(request, query);

    await page.goto("/admin");
    const pendingRow = page.locator('[data-testid="escalation"]', { hasText: query });
    await expect(pendingRow).toHaveAttribute("data-status", "pending");

    await pendingRow.getByRole("button", { name: "Resolve" }).click();

    const resolvedRow = page.locator(
      '[data-testid="escalation"][data-status="resolved"]',
      { hasText: query },
    );
    await expect(resolvedRow).toBeVisible();
    await expect(resolvedRow).toContainText("Resolved");
  },
  { category: "functional" },
);
