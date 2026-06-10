import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { specTest, expect } from "@platform/spec-test/vitest";
import { createJsonStore, reverseChronoId } from "../../lib/store";

interface Note {
  body: string;
}

specTest(
  "IRAS-STORE-001",
  "Generic JSON store round-trips values and lists newest-first",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "store-"));
    process.env.STORE_DIR = dir;
    try {
      const store = createJsonStore<Note>("notes");

      // Reverse-chronological ids: a later timestamp sorts lexicographically
      // BEFORE an earlier one, so plain ascending key order is newest-first.
      const older = reverseChronoId(1_000_000);
      const newer = reverseChronoId(2_000_000);
      expect(newer < older).toBe(true);

      await store.put(older, { body: "older" });
      await store.put(newer, { body: "newer" });

      expect(await store.get(older)).toEqual({ body: "older" });
      expect(await store.get(newer)).toEqual({ body: "newer" });
      expect(await store.get("missing")).toBeNull();

      const listed = await store.list();
      expect(listed.map((n) => n.body)).toEqual(["newer", "older"]);

      // Limit caps the result, keeping the newest.
      expect((await store.list(1)).map((n) => n.body)).toEqual(["newer"]);

      // A custom comparator overrides the key order.
      const byBodyDesc = createJsonStore<Note>("notes", {
        compare: (a, b) => b.body.localeCompare(a.body),
      });
      expect((await byBodyDesc.list()).map((n) => n.body)).toEqual([
        "older",
        "newer",
      ]);
    } finally {
      delete process.env.STORE_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  { category: "data" },
);
