import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV3 } from "ai/test";
import type {
  LanguageModelV3FinishReason,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { specTest, expect } from "@platform/spec-test/vitest";
import { keywordGrade, judgeGrade } from "../../lib/graders";

const STOP: LanguageModelV3FinishReason = { unified: "stop", raw: undefined };

function usage(input: number, output: number): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: input,
      noCache: input,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

function jsonMock(text: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
      finishReason: STOP,
      usage: usage(50, 30),
      warnings: [],
    }),
  });
}

// judgeGrade resolves through the gateway, which logs the call; point the
// store at a temp dir so the test leaves nothing behind.
function withTempStore<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "graders-"));
  process.env.STORE_DIR = dir;
  return fn().finally(() => {
    delete process.env.STORE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });
}

specTest(
  "TAX-EVAL-005",
  "Judge grading returns a structured verdict and fails closed on garbage",
  async () => {
    // Deterministic keyword grading underpins the default path.
    const ok = keywordGrade("The GST threshold is SGD 1,000,000.", [
      "1,000,000",
      "gst",
    ]);
    expect(ok.pass).toBe(true);
    expect(ok.checks).toHaveLength(2);
    expect(ok.checks.every((c) => c.pass)).toBe(true);

    const miss = keywordGrade("No idea.", ["1,000,000"]);
    expect(miss.pass).toBe(false);
    expect(miss.checks[0].pass).toBe(false);

    // Empty expectations cannot pass by default.
    expect(keywordGrade("anything", []).pass).toBe(false);

    await withTempStore(async () => {
      // A well-formed verdict parses into {pass, score, rationale}.
      const verdict = await judgeGrade(
        "What is the GST threshold?",
        "SGD 1,000,000 over 12 months. General info, not advice.",
        undefined,
        {
          model: jsonMock(
            JSON.stringify({
              pass: true,
              score: 87,
              rationale: "Accurate and includes the disclaimer.",
            }),
          ),
        },
      );
      expect(verdict.pass).toBe(true);
      expect(verdict.score).toBe(87);
      expect(verdict.rationale).toBe("Accurate and includes the disclaimer.");

      // Unparseable judge output fails closed instead of throwing or passing.
      const garbage = await judgeGrade("q", "a", undefined, {
        model: jsonMock("definitely not json"),
      });
      expect(garbage.pass).toBe(false);
      expect(garbage.score).toBe(0);
      expect(garbage.rationale).toContain("failing closed");
    });
  },
  { category: "data" },
);
