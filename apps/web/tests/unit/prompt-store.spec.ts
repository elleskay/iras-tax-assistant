import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { specTest, expect } from "@platform/spec-test/vitest";
import {
  addPromptVersion,
  activatePromptVersion,
  getActivePromptContent,
} from "../../lib/prompt-store";
import { resolveSystemPrompt, SYSTEM, SYSTEM_PROMPT_NAME } from "../../lib/agent";
import { DEFAULT_WORKSPACE } from "../../lib/workspaces";

function withTempStore<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "prompts-"));
  process.env.STORE_DIR = dir;
  return fn(dir).finally(() => {
    delete process.env.STORE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });
}

specTest(
  "TAX-PROMPT-001",
  "Prompt store keeps immutable versions behind an activation pointer",
  async () => {
    await withTempStore(async () => {
      // First version becomes active.
      const v1 = await addPromptVersion("test-prompt", "first content", "v1");
      expect(v1.activeVersion).toBe(1);
      expect(v1.versions).toHaveLength(1);

      // Adding a version appends; the pointer does not move.
      const v2 = await addPromptVersion("test-prompt", "second content");
      expect(v2.activeVersion).toBe(1);
      expect(v2.versions.map((v) => v.version)).toEqual([1, 2]);
      // Earlier content is untouched.
      expect(v2.versions[0].content).toBe("first content");
      expect(await getActivePromptContent("test-prompt")).toBe("first content");

      // Explicit activation moves the pointer.
      const activated = await activatePromptVersion("test-prompt", 2);
      expect(activated?.activeVersion).toBe(2);
      expect(await getActivePromptContent("test-prompt")).toBe("second content");

      // Activating a missing version or prompt fails without side effects.
      expect(await activatePromptVersion("test-prompt", 99)).toBeNull();
      expect(await activatePromptVersion("no-such-prompt", 1)).toBeNull();
      expect(await getActivePromptContent("test-prompt")).toBe("second content");
    });
  },
  { category: "data" },
);

specTest(
  "TAX-PROMPT-002",
  "The system prompt resolves from the active version and falls back to the default",
  async () => {
    await withTempStore(async (dir) => {
      // Empty store: compiled-in default.
      expect(await resolveSystemPrompt()).toBe(SYSTEM);

      // Active stored version wins (the 60s cache is bypassed under test).
      await addPromptVersion(SYSTEM_PROMPT_NAME, "You are a custom prompt.");
      expect(await resolveSystemPrompt()).toBe("You are a custom prompt.");

      // Corrupt store file: falls back to the default, never throws. The store
      // is workspace-scoped, so the default workspace's file is the one read.
      writeFileSync(
        join(dir, `prompts-${DEFAULT_WORKSPACE}.json`),
        "{not json",
        "utf8",
      );
      expect(await resolveSystemPrompt()).toBe(SYSTEM);
    });
  },
  { category: "data" },
);
