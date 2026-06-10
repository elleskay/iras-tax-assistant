import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { specTest, expect } from "@platform/spec-test/vitest";
import { saveEvalRun, listEvalRuns } from "../../lib/eval-store";

function withTempStore<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "eval-store-"));
  process.env.STORE_DIR = dir;
  return fn().finally(() => {
    delete process.env.STORE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

specTest(
  "IRAS-EVAL-004",
  "Eval runs persist and list newest-first with a limit",
  async () => {
    await withTempStore(async () => {
      const first = await saveEvalRun({
        grader: "keyword",
        total: 2,
        passed: 2,
        passRate: 100,
        cases: [
          { query: "q1", modelLabel: "Claude Haiku 4.5", pass: true },
          { query: "q2", modelLabel: "Claude Haiku 4.5", pass: true },
        ],
      });
      // reverseChronoId is millisecond-resolution; space the runs out so the
      // newest-first ordering is deterministic.
      await sleep(5);
      const second = await saveEvalRun({
        grader: "keyword",
        total: 2,
        passed: 1,
        passRate: 50,
        cases: [
          { query: "q1", modelLabel: "Claude Haiku 4.5", pass: true },
          { query: "q2", modelLabel: "Claude Haiku 4.5", pass: false },
        ],
      });

      const runs = await listEvalRuns();
      expect(runs).toHaveLength(2);
      // Newest first.
      expect(runs[0].id).toBe(second.id);
      expect(runs[1].id).toBe(first.id);
      // Round-trips the stats and cases.
      expect(runs[0].passRate).toBe(50);
      expect(runs[0].passed).toBe(1);
      expect(runs[0].total).toBe(2);
      expect(runs[0].cases).toHaveLength(2);
      expect(runs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // The limit caps the listing, still newest-first.
      const limited = await listEvalRuns(1);
      expect(limited).toHaveLength(1);
      expect(limited[0].id).toBe(second.id);
    });
  },
  { category: "data" },
);

specTest(
  "IRAS-EVAL-008",
  "A persisted run records its grader and pinned prompt version",
  async () => {
    await withTempStore(async () => {
      await saveEvalRun({
        grader: "judge",
        promptVersion: 3,
        total: 1,
        passed: 1,
        passRate: 100,
        cases: [
          {
            query: "q1",
            modelLabel: "Claude Haiku 4.5",
            pass: true,
            score: 92,
            rationale: "Accurate and properly caveated.",
          },
        ],
      });

      const runs = await listEvalRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].grader).toBe("judge");
      expect(runs[0].promptVersion).toBe(3);
      expect(runs[0].cases[0].score).toBe(92);
      expect(runs[0].cases[0].rationale).toBe("Accurate and properly caveated.");
    });
  },
  { category: "data" },
);
