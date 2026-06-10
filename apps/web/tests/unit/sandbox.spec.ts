import { specTest, expect } from "@platform/spec-test/vitest";
import {
  runSandboxed,
  TRUNCATION_MARKER,
  DEFAULT_MAX_OUTPUT_CHARS,
} from "../../lib/sandbox";

/*
 * Real QuickJS WASM sandbox, no mocks: these tests prove the actual limits
 * hold. Deterministic and fully offline.
 */

specTest(
  "IRAS-SANDBOX-001",
  "A code tool runs in the sandbox and returns a JSON result",
  async () => {
    const res = await runSandboxed(
      "function run(input) { return { doubled: input.x * 2, label: input.label }; }",
      { x: 21, label: "answer" },
    );
    expect(res.ok).toBe(true);
    expect(res.result).toEqual({ doubled: 42, label: "answer" });
    expect(res.durationMs).toBeGreaterThanOrEqual(0);

    // A thrown error inside run() comes back as a safe failure.
    const thrown = await runSandboxed(
      "function run() { throw new Error('boom'); }",
      {},
    );
    expect(thrown.ok).toBe(false);
    expect(thrown.error).toContain("boom");

    // Code without a run() function fails cleanly too.
    const noRun = await runSandboxed("const x = 1;", {});
    expect(noRun.ok).toBe(false);
    expect(noRun.error).toBeTruthy();
  },
  { category: "data" },
);

specTest(
  "IRAS-SANDBOX-002",
  "Infinite loops and allocation bombs are stopped by hard limits",
  async () => {
    // Infinite loop: the interrupt handler fires at the deadline.
    const loop = await runSandboxed("function run() { while (true) {} }", {});
    expect(loop.ok).toBe(false);
    expect(loop.error).toBeTruthy();
    // Interrupted around the 1s default deadline, well before any test timeout.
    expect(loop.durationMs).toBeGreaterThanOrEqual(900);
    expect(loop.durationMs).toBeLessThan(5000);

    // Allocation bomb: the 32MB memory cap fails the allocation. Generous
    // deadline so the memory limit (not the clock) is what stops it.
    const bomb = await runSandboxed(
      "function run() { const a = []; while (true) { a.push(new Array(65536).fill(123)); } }",
      {},
      { timeoutMs: 10_000 },
    );
    expect(bomb.ok).toBe(false);
    expect(bomb.error).toBeTruthy();
    expect(bomb.durationMs).toBeLessThan(10_000);
  },
  { category: "security" },
);

specTest(
  "IRAS-SANDBOX-003",
  "The sandbox exposes no host capabilities",
  async () => {
    const res = await runSandboxed(
      `function run() {
        return {
          fetch: typeof fetch,
          require: typeof require,
          process: typeof process,
          fs: typeof fs,
          XMLHttpRequest: typeof XMLHttpRequest,
          WebSocket: typeof WebSocket,
          Buffer: typeof Buffer,
          setTimeout: typeof setTimeout,
          globalKeys: Object.getOwnPropertyNames(globalThis).length,
        };
      }`,
      {},
    );
    expect(res.ok).toBe(true);
    const probes = res.result as Record<string, unknown>;
    for (const key of [
      "fetch",
      "require",
      "process",
      "fs",
      "XMLHttpRequest",
      "WebSocket",
      "Buffer",
      "setTimeout",
    ]) {
      expect(probes[key], `host global ${key} must not exist`).toBe("undefined");
    }
  },
  { category: "security" },
);

specTest(
  "IRAS-SANDBOX-004",
  "Oversized output is capped with a truncation marker",
  async () => {
    const res = await runSandboxed(
      "function run() { return 'x'.repeat(20000); }",
      {},
    );
    expect(res.ok).toBe(true);
    expect(res.truncated).toBe(true);
    const out = res.result as string;
    expect(out.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(out.length).toBe(DEFAULT_MAX_OUTPUT_CHARS + TRUNCATION_MARKER.length);

    // Output under the cap is returned in full, untruncated.
    const small = await runSandboxed("function run() { return 'ok'; }", {});
    expect(small.ok).toBe(true);
    expect(small.result).toBe("ok");
    expect(small.truncated).toBeUndefined();
  },
  { category: "data" },
);
