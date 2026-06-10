import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type {
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { specTest, expect } from "@platform/spec-test/vitest";
import { runAgent, MAX_STEPS } from "../../lib/run-agent";
import { SYSTEM } from "../../lib/agent";
import { taxTools } from "../../lib/tools";
import { findModel, DEFAULT_MODEL_ID } from "../../lib/model-registry";

/*
 * IRAS-AGENT-001: the agent loop chains tools across steps. A mock model
 * scripts the conversation (lookup, then calculate, then the answer); the
 * tools themselves are the real deterministic implementations from
 * lib/tax.ts. Zero network, zero LLM.
 */

const STOP: LanguageModelV3FinishReason = { unified: "stop", raw: undefined };
const TOOL_CALLS: LanguageModelV3FinishReason = {
  unified: "tool-calls",
  raw: undefined,
};

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

function toolCallStep(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
): LanguageModelV3StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
    { type: "finish", finishReason: TOOL_CALLS, usage: usage(50, 10) },
  ];
}

function answerStep(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    { type: "finish", finishReason: STOP, usage: usage(80, 40) },
  ];
}

function withTempStore<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "agent-"));
  process.env.STORE_DIR = dir;
  return fn().finally(() => {
    delete process.env.STORE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });
}

specTest(
  "IRAS-AGENT-001",
  "The agent loop chains tools across steps until the answer",
  async () => {
    await withTempStore(async () => {
      const ANSWER =
        "Your chargeable income is SGD 100,000 and the GST threshold is SGD 1,000,000.";
      let call = 0;
      const model = new MockLanguageModelV3({
        doStream: async () => {
          call += 1;
          const chunks =
            call === 1
              ? toolCallStep("c1", "lookup_tax_info", { topic: "GST" })
              : call === 2
                ? toolCallStep("c2", "calculate_tax_estimate", {
                    income: 120000,
                    deductions: 20000,
                  })
                : answerStep(ANSWER);
          return { stream: simulateReadableStream({ chunks }) };
        },
      });

      const result = runAgent({
        entry: findModel(DEFAULT_MODEL_ID)!,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content:
              "What is the GST threshold, and what is my chargeable income on 120000 with 20000 deductions?",
          },
        ],
        tools: taxTools,
        overrides: { model },
        smooth: false,
      });
      await result.consumeStream();

      // Three model invocations: tool step, tool step, answer step. Well
      // inside the loop bound.
      expect(call).toBe(3);
      expect(MAX_STEPS).toBeGreaterThanOrEqual(3);

      const steps = await result.steps;
      expect(steps).toHaveLength(3);

      // Tool calls executed in order, against the real implementations.
      const toolCalls = steps.flatMap((s) => s.toolCalls);
      expect(toolCalls.map((c) => c.toolName)).toEqual([
        "lookup_tax_info",
        "calculate_tax_estimate",
      ]);

      const toolResults = steps.flatMap((s) => s.toolResults);
      expect(toolResults).toHaveLength(2);
      expect(String(toolResults[0].output)).toContain("SGD 1,000,000");
      expect(String(toolResults[1].output)).toContain(
        "Estimated chargeable income: SGD 100,000",
      );

      // The final text lands after the chain.
      expect(await result.text).toBe(ANSWER);
    });
  },
  { category: "data" },
);
