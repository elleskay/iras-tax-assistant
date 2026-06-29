import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText, streamText } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type {
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { specTest, expect } from "@platform/spec-test/vitest";
import { gatewayModel, computeCostUsd } from "../../lib/gateway";
import { listGatewayCalls } from "../../lib/gateway-store";
import { findModel } from "../../lib/model-registry";

const STOP: LanguageModelV3FinishReason = { unified: "stop", raw: undefined };

// V3 usage objects are nested; tests only care about the totals.
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

function generateMock(text: string, input: number, output: number) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
      finishReason: STOP,
      usage: usage(input, output),
      warnings: [],
    }),
  });
}

function withTempStore<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "gateway-"));
  process.env.STORE_DIR = dir;
  return fn().finally(() => {
    delete process.env.STORE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });
}

specTest(
  "TAX-GATEWAY-001",
  "The gateway records model, latency, and token usage for a completed call",
  async () => {
    await withTempStore(async () => {
      const entry = findModel("claude-haiku-4-5-20251001")!;
      const result = await generateText({
        model: gatewayModel(
          entry,
          { route: "unit-test" },
          { model: generateMock("hello", 100, 50) },
        ),
        prompt: "hi",
      });
      expect(result.text).toBe("hello");

      const calls = await listGatewayCalls();
      expect(calls).toHaveLength(1);
      const call = calls[0];
      expect(call.modelId).toBe("claude-haiku-4-5-20251001");
      expect(call.kind).toBe("generate");
      expect(call.route).toBe("unit-test");
      expect(call.latencyMs).toBeGreaterThanOrEqual(0);
      expect(call.inputTokens).toBe(100);
      expect(call.outputTokens).toBe(50);
      expect(call.fallbackUsed).toBe(false);
    });
  },
  { category: "data" },
);

specTest(
  "TAX-GATEWAY-002",
  "Gateway cost is computed from the registry prices for generate and stream",
  async () => {
    await withTempStore(async () => {
      // Haiku list price: $1 in / $5 out per 1M tokens. 1M in + 1M out = $6.
      const entry = findModel("claude-haiku-4-5-20251001")!;
      expect(computeCostUsd(entry, 1_000_000, 1_000_000)).toBeCloseTo(6, 10);

      // Generate path: 500k in, 200k out = 0.5*1 + 0.2*5 = 1.5.
      await generateText({
        model: gatewayModel(entry, {}, { model: generateMock("a", 500_000, 200_000) }),
        prompt: "hi",
      });

      // Stream path: 100k in, 40k out = 0.1*1 + 0.04*5 = 0.3.
      const chunks: LanguageModelV3StreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "streamed" },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: STOP, usage: usage(100_000, 40_000) },
      ];
      const streamMock = new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({ chunks }),
        }),
      });
      const result = streamText({
        model: gatewayModel(entry, {}, { model: streamMock }),
        prompt: "hi",
      });
      // Drain the stream fully so the gateway's flush (which writes the log)
      // has completed before we read the store.
      await result.consumeStream();
      expect(await result.text).toBe("streamed");

      const calls = await listGatewayCalls();
      expect(calls).toHaveLength(2);
      const generated = calls.find((c) => c.kind === "generate")!;
      const streamed = calls.find((c) => c.kind === "stream")!;
      expect(generated.costUsd).toBeCloseTo(1.5, 10);
      expect(streamed.costUsd).toBeCloseTo(0.3, 10);
      expect(streamed.inputTokens).toBe(100_000);
      expect(streamed.outputTokens).toBe(40_000);
    });
  },
  { category: "data" },
);

specTest(
  "TAX-GATEWAY-003",
  "A provider error falls back to the alternate provider and is flagged",
  async () => {
    await withTempStore(async () => {
      const entry = findModel("claude-haiku-4-5-20251001")!;
      const failing = new MockLanguageModelV3({
        doGenerate: async () => {
          throw new Error("provider down");
        },
      });
      const fallbackEntry = findModel("gpt-4o-mini")!;
      const result = await generateText({
        model: gatewayModel(
          entry,
          { route: "fallback-test" },
          {
            model: failing,
            fallback: {
              model: generateMock("fallback answer", 10, 5),
              entry: fallbackEntry,
            },
          },
        ),
        prompt: "hi",
      });
      expect(result.text).toBe("fallback answer");

      const calls = await listGatewayCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].fallbackUsed).toBe(true);
      expect(calls[0].modelId).toBe("gpt-4o-mini");
      expect(calls[0].costUsd).toBeCloseTo(
        computeCostUsd(fallbackEntry, 10, 5),
        10,
      );
    });
  },
  { category: "data" },
);
