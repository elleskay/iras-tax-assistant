import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { specTest, expect } from "@platform/spec-test/vitest";

specTest(
  "IRAS-HITL-001",
  "Escalation store supports create, list, and resolve",
  async () => {
    // Isolate this test's queue in a temp dir so it never touches the dev /
    // e2e hitl-queue.json.
    const dir = mkdtempSync(join(tmpdir(), "hitl-"));
    process.env.HITL_QUEUE_PATH = join(dir, "queue.json");
    try {
      const store = await import("../../lib/hitl-store");

      const created = await store.addEscalation(
        "Personal income scenario",
        "How much tax will I pay on my salary?",
      );
      expect(created.status).toBe("pending");

      const listed = await store.listEscalations();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(created.id);

      const resolved = await store.resolveEscalation(created.id);
      expect(resolved?.status).toBe("resolved");

      // Resolving an unknown id returns null.
      expect(await store.resolveEscalation(-1)).toBeNull();
    } finally {
      delete process.env.HITL_QUEUE_PATH;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  { category: "data" },
);
