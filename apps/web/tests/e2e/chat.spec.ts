import { specTest, expect } from "@platform/spec-test/playwright";

// Build a minimal but protocol-correct UI message stream (SSE) so the chat
// round trip is deterministic and offline. Format verified against
// node_modules/ai/docs/04-ai-sdk-ui/50-stream-protocol.mdx.
function uiMessageStream(text: string): string {
  const events = [
    { type: "start", messageId: "stub-1" },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    { type: "finish" },
  ];
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
}

const ASSISTANT_REPLY =
  "The GST registration threshold is SGD 1,000,000 in taxable turnover over 12 months. This is general information, not personalised tax advice.";

specTest(
  "IRAS-CHAT-001",
  "Home page renders the chat interface",
  async ({ page }) => {
    await page.goto("/assistant");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel("Ask a tax question")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  },
  { category: "ui" },
);

specTest(
  "IRAS-CHAT-003",
  "A general-information disclaimer is always visible on the chat page",
  async ({ page }) => {
    await page.goto("/assistant");
    await expect(
      page.getByText(/general information only, not personalised tax advice/i),
    ).toBeVisible();
  },
  { category: "ui" },
);

specTest(
  "IRAS-CHAT-004",
  "New chat clears the conversation and history keeps the previous one",
  async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: uiMessageStream(ASSISTANT_REPLY),
      });
    });
    await page.goto("/assistant");
    await page.getByLabel("Ask a tax question").fill("What is the GST threshold?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(
      page.locator('[data-testid="message"][data-role="assistant"]'),
    ).toBeVisible();
    await page.waitForTimeout(800); // let the stubbed stream settle

    await page.getByRole("button", { name: "New chat" }).click();

    // Back to the empty state, no messages.
    await expect(page.locator('[data-testid="message"]')).toHaveCount(0);
    await expect(page.getByText("Singapore tax, in plain language")).toBeVisible();
    // The previous conversation is in history.
    await expect(
      page.getByRole("button", { name: "What is the GST threshold?", exact: true }).first(),
    ).toBeVisible();
  },
  { category: "functional" },
);

specTest(
  "IRAS-CHAT-005",
  "A question deep link asks it automatically",
  async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: uiMessageStream(ASSISTANT_REPLY),
      });
    });
    await page.goto("/assistant?q=" + encodeURIComponent("What is the GST threshold?"));
    await expect(
      page.locator('[data-testid="message"][data-role="user"]'),
    ).toContainText("What is the GST threshold?");
  },
  { category: "functional" },
);

specTest(
  "IRAS-CHAT-002",
  "Sending a message shows the user message and the assistant reply",
  async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      // Guard against regressions where the client drops the messages payload
      // (the API would 400). The request must carry a non-empty messages array.
      const sent = route.request().postDataJSON();
      expect(Array.isArray(sent?.messages) && sent.messages.length > 0).toBe(true);
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: uiMessageStream(ASSISTANT_REPLY),
      });
    });

    await page.goto("/assistant");
    await page.getByLabel("Ask a tax question").fill("What is the GST threshold?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(
      page.locator('[data-testid="message"][data-role="user"]'),
    ).toContainText("What is the GST threshold?");
    await expect(
      page.locator('[data-testid="message"][data-role="assistant"]'),
    ).toContainText("GST registration threshold");
  },
  { category: "functional" },
);
