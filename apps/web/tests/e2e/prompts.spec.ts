import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { specTest, expect } from "@platform/spec-test/playwright";
import { DEFAULT_WORKSPACE } from "../../lib/workspaces";

/*
 * The prompts page talks to /api/prompts, which reads the file-backed store
 * (prompts.json in the server's working directory). The UI test seeds the
 * file directly; the journey test drives the real API through the form.
 */

// The store is per workspace; a fresh page/API context resolves the default
// workspace, so seed and clean that workspace's file (not the legacy path).
const storePath = join(process.cwd(), `prompts-${DEFAULT_WORKSPACE}.json`);

specTest(
  "IRAS-PROMPT-003",
  "The prompts page lists versions and shows a line diff between them",
  async ({ page }) => {
    writeFileSync(
      storePath,
      JSON.stringify({
        "assistant-system": {
          name: "assistant-system",
          activeVersion: 1,
          versions: [
            {
              version: 1,
              content: "line one\nline two",
              createdAt: "2026-06-10T03:00:00.000Z",
            },
            {
              version: 2,
              content: "line one\nline two changed",
              note: "tweak",
              createdAt: "2026-06-10T04:00:00.000Z",
            },
          ],
        },
      }),
      "utf8",
    );
    try {
      await page.goto("/prompts");
      const rows = page.getByTestId("prompt-version");
      await expect(rows).toHaveCount(2);
      await expect(
        page.locator('[data-testid="prompt-version"][data-version="1"]'),
      ).toHaveAttribute("data-active", "true");

      // Select v2: the diff against v1 highlights the changed line.
      await page
        .locator('[data-testid="prompt-version"][data-version="2"]')
        .getByRole("button", { name: "v2" })
        .click();
      const diff = page.getByTestId("prompt-diff");
      await expect(diff).toContainText("Diff: v1 to v2");
      await expect(
        diff.locator('[data-testid="diff-line"][data-op="add"]'),
      ).toContainText("line two changed");
      await expect(
        diff.locator('[data-testid="diff-line"][data-op="del"]'),
      ).toContainText("line two");
    } finally {
      rmSync(storePath, { force: true });
    }
  },
  { category: "ui" },
);

specTest(
  "IRAS-PROMPT-004",
  "Creating and activating a prompt version works end to end",
  async ({ page }) => {
    rmSync(storePath, { force: true });
    try {
      await page.goto("/prompts");
      await expect(page.getByTestId("empty-prompts")).toBeVisible();

      // Save the first version: it becomes active automatically.
      await page.getByLabel("Prompt content").fill("You are version one.");
      await page.getByRole("button", { name: "Save version" }).click();
      const v1 = page.locator('[data-testid="prompt-version"][data-version="1"]');
      await expect(v1).toHaveAttribute("data-active", "true");

      // Save a second version: appended, but not active yet.
      await page.getByLabel("Prompt content").fill("You are version two.");
      await page.getByRole("button", { name: "Save version" }).click();
      const v2 = page.locator('[data-testid="prompt-version"][data-version="2"]');
      await expect(v2).toBeVisible();
      await expect(v2).toHaveAttribute("data-active", "false");

      // Activate v2: the pointer moves.
      await v2.getByRole("button", { name: "Activate" }).click();
      await expect(v2).toHaveAttribute("data-active", "true");
      await expect(v1).toHaveAttribute("data-active", "false");
    } finally {
      rmSync(storePath, { force: true });
    }
  },
  { category: "functional" },
);

specTest(
  "IRAS-PROMPT-005",
  "The prompts write API validates input and is rate limited",
  async ({ request }) => {
    rmSync(storePath, { force: true });
    try {
      // Invalid name (not kebab-case) is rejected.
      const badName = await request.post("/api/prompts", {
        data: { name: "Bad Name!", content: "x" },
      });
      expect(badName.status()).toBe(400);

      // Empty content is rejected.
      const emptyContent = await request.post("/api/prompts", {
        data: { name: "valid-name", content: "" },
      });
      expect(emptyContent.status()).toBe(400);

      // Activating a version that does not exist is a 404.
      const ghost = await request.put("/api/prompts", {
        data: { name: "ghost-prompt", version: 1 },
      });
      expect(ghost.status()).toBe(404);

      // Nothing from the rejected writes was persisted.
      const list = await request.get("/api/prompts");
      expect(list.status()).toBe(200);
      const body = await list.json();
      expect(body.prompts).toEqual([]);
    } finally {
      rmSync(storePath, { force: true });
    }
  },
  { category: "security" },
);
