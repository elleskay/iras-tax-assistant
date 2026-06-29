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

// A multi-step agent turn: two chained tool invocations, then the answer.
// Same UI message stream protocol, exercising the step-trace rendering path.
const MULTI_STEP_ANSWER =
  "Your chargeable income is SGD 100,000, and the GST registration threshold is SGD 1,000,000.";

function multiStepStream(): string {
  const events = [
    { type: "start", messageId: "stub-2" },
    { type: "start-step" },
    { type: "tool-input-start", toolCallId: "c1", toolName: "lookup_tax_info" },
    {
      type: "tool-input-available",
      toolCallId: "c1",
      toolName: "lookup_tax_info",
      input: { topic: "GST" },
    },
    {
      type: "tool-output-available",
      toolCallId: "c1",
      output: "GST registration threshold: SGD 1,000,000 in taxable turnover.",
    },
    { type: "finish-step" },
    { type: "start-step" },
    {
      type: "tool-input-start",
      toolCallId: "c2",
      toolName: "calculate_tax_estimate",
    },
    {
      type: "tool-input-available",
      toolCallId: "c2",
      toolName: "calculate_tax_estimate",
      input: { income: 120000, deductions: 20000 },
    },
    {
      type: "tool-output-available",
      toolCallId: "c2",
      output: "Estimated chargeable income: SGD 100,000.",
    },
    { type: "finish-step" },
    { type: "start-step" },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: MULTI_STEP_ANSWER },
    { type: "text-end", id: "t1" },
    { type: "finish-step" },
    {
      type: "finish",
      messageMetadata: {
        model: "Claude Haiku 4.5",
        tier: "fast",
        reason: "default",
        usage: { input: 180, output: 60 },
        costUsd: 0.00048,
      },
    },
  ];
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
}

specTest(
  "TAX-CHAT-001",
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
  "TAX-CHAT-006",
  "Assistant example chips cover each scenario and stay available mid-chat",
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
    // Label and route hint per scenario: lookup, calculation, multi-step,
    // complex reasoning, escalation, PII.
    const chips: [string, string][] = [
      ["GST", "lookup tool"],
      ["Income tax", "estimate tool"],
      ["Multi-step", "two tools chained, step trace"],
      ["Corporate tax", "complex reasoning"],
      ["PII", "pii-sensitive route"],
    ];
    for (const [label, hint] of chips) {
      const chip = page.getByRole("button", { name: new RegExp(`^${label}\\b`) });
      await expect(chip).toBeVisible();
      await expect(chip).toContainText(hint);
    }

    // Start a chat from a chip, then try another scenario in the SAME chat:
    // the chips stay above the composer, no New chat needed.
    await page.getByRole("button", { name: /^GST\b/ }).click();
    await expect(
      page.locator('[data-testid="message"][data-role="assistant"]'),
    ).toBeVisible();
    for (const [label] of chips) {
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "Multi-step", exact: true }).click();
    await expect(
      page.locator('[data-testid="message"][data-role="user"]'),
    ).toHaveCount(2);
  },
  { category: "ui" },
);

specTest(
  "TAX-CHAT-003",
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
  "TAX-CHAT-004",
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
  "TAX-CHAT-005",
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
  "TAX-CHAT-002",
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

specTest(
  "TAX-AGENT-002",
  "Assistant replies show a numbered step trace of tool use",
  async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: multiStepStream(),
      });
    });

    // Below xl the trace renders inline; at xl+ it moves to the side panel.
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/assistant");
    await page.getByLabel("Ask a tax question").fill("GST threshold and my estimate?");
    await page.getByRole("button", { name: "Send" }).click();

    // Collapsed by default: the trace header is visible, the steps are not.
    const trace = page.getByTestId("step-trace");
    await expect(trace).toBeVisible();
    await expect(trace).toContainText("Agent steps (2)");
    await expect(page.getByTestId("step")).toHaveCount(0);

    // Expanding lists each step, numbered, with tool name, input, and output.
    await trace.getByRole("button", { name: /Agent steps/ }).click();
    const steps = page.getByTestId("step");
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toContainText("1");
    await expect(steps.nth(0)).toContainText("lookup_tax_info");
    await expect(steps.nth(0).getByTestId("step-input")).toContainText("GST");
    await expect(steps.nth(0).getByTestId("step-output")).toContainText(
      "SGD 1,000,000",
    );
    await expect(steps.nth(1)).toContainText("2");
    await expect(steps.nth(1)).toContainText("calculate_tax_estimate");
  },
  { category: "ui" },
);

specTest(
  "TAX-AGENT-003",
  "A multi-step reply renders the full trace and the answer",
  async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: multiStepStream(),
      });
    });

    // Below xl the trace renders inline; at xl+ it moves to the side panel.
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/assistant");
    await page
      .getByLabel("Ask a tax question")
      .fill("What is the GST threshold, and my chargeable income on 120000 with 20000 deductions?");
    await page.getByRole("button", { name: "Send" }).click();

    // The answer text arrives after the chained tool steps.
    const reply = page.locator('[data-testid="message"][data-role="assistant"]');
    await expect(reply).toContainText("Your chargeable income is SGD 100,000");

    // The full trace: both tools in order with inputs and outputs.
    await reply.getByRole("button", { name: /Agent steps/ }).click();
    const steps = page.getByTestId("step");
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toContainText("lookup_tax_info");
    await expect(steps.nth(1)).toContainText("calculate_tax_estimate");
    await expect(steps.nth(1).getByTestId("step-input")).toContainText("120000");
    await expect(steps.nth(1).getByTestId("step-output")).toContainText(
      "SGD 100,000",
    );

    // The reply badge carries the routing and cost metadata from the stream.
    await expect(reply).toContainText("Routed to Claude Haiku 4.5");
    await expect(reply).toContainText("240 tokens");
  },
  { category: "functional" },
);
