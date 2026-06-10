import { wrapLanguageModel, type LanguageModel } from "ai";
import type {
  LanguageModelV3,
  LanguageModelV3Middleware,
} from "@ai-sdk/provider";
import { findModel, type ModelEntry } from "./model-registry";
import { resolveModel } from "./model-router";
import { logGatewayCall } from "./gateway-store";

/*
 * Model gateway: every model call in the app goes through gatewayModel(),
 * which wraps the provider model with middleware that
 *  - times the call and extracts token usage (generate result, or the finish
 *    part of a stream),
 *  - computes cost in USD from the registry list prices,
 *  - retries once against the alternate provider when the primary call throws
 *    (cross-provider fallback), and
 *  - persists a log entry per call (see lib/gateway-store.ts).
 *
 * The log write is awaited inside the middleware (for streams, in the
 * transform's flush) so it completes before the response stream closes:
 * Lambda freezes background work after the response, so a fire-and-forget
 * write would be dropped.
 */

export interface GatewayMeta {
  /** Why this model was picked, shown on the /gateway page. */
  route?: string;
}

interface ResolvedFallback {
  model: LanguageModelV3;
  entry: ModelEntry;
}

/** Test seam: inject mock primary and fallback models. */
export interface GatewayOverrides {
  model?: LanguageModelV3;
  fallback?: ResolvedFallback;
}

/** Cost in USD from the registry's per-1M-token list prices. */
export function computeCostUsd(
  entry: ModelEntry,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * entry.price.in +
    (outputTokens / 1_000_000) * entry.price.out
  );
}

// Cross-provider fallback pairs: an Anthropic outage should not take the
// assistant down, and vice versa.
function defaultFallback(entry: ModelEntry): ResolvedFallback | null {
  const fallbackId =
    entry.provider === "anthropic" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001";
  const fbEntry = findModel(fallbackId);
  if (!fbEntry) return null;
  return { model: resolveModel(fbEntry) as LanguageModelV3, entry: fbEntry };
}

type StreamPart =
  Awaited<ReturnType<LanguageModelV3["doStream"]>>["stream"] extends ReadableStream<
    infer P
  >
    ? P
    : never;

interface V3Usage {
  inputTokens: { total: number | undefined };
  outputTokens: { total: number | undefined };
}

async function persist(
  entry: ModelEntry,
  meta: GatewayMeta,
  kind: "generate" | "stream",
  startedAt: number,
  usage: V3Usage | null,
  fallbackUsed: boolean,
): Promise<void> {
  const inputTokens = usage?.inputTokens.total ?? 0;
  const outputTokens = usage?.outputTokens.total ?? 0;
  try {
    await logGatewayCall({
      modelId: entry.id,
      modelLabel: entry.label,
      provider: entry.provider,
      kind,
      route: meta.route,
      latencyMs: Date.now() - startedAt,
      inputTokens,
      outputTokens,
      costUsd: computeCostUsd(entry, inputTokens, outputTokens),
      fallbackUsed,
    });
  } catch {
    // Observability must never take a request down: drop the log entry.
  }
}

function instrumentation(
  entry: ModelEntry,
  meta: GatewayMeta,
  fallbackOverride?: ResolvedFallback,
): LanguageModelV3Middleware {
  return {
    specificationVersion: "v3",

    wrapGenerate: async ({ doGenerate, params }) => {
      const startedAt = Date.now();
      let used = entry;
      let fallbackUsed = false;
      let result;
      try {
        result = await doGenerate();
      } catch (err) {
        const fb = fallbackOverride ?? defaultFallback(entry);
        if (!fb) throw err;
        used = fb.entry;
        fallbackUsed = true;
        result = await fb.model.doGenerate(params);
      }
      await persist(used, meta, "generate", startedAt, result.usage, fallbackUsed);
      return result;
    },

    wrapStream: async ({ doStream, params }) => {
      const startedAt = Date.now();
      let used = entry;
      let fallbackUsed = false;
      let result;
      try {
        result = await doStream();
      } catch (err) {
        // Fallback covers errors before the stream starts (auth, quota,
        // outage). Mid-stream failures surface to the client as usual.
        const fb = fallbackOverride ?? defaultFallback(entry);
        if (!fb) throw err;
        used = fb.entry;
        fallbackUsed = true;
        result = await fb.model.doStream(params);
      }
      let usage: V3Usage | null = null;
      const tap = new TransformStream<StreamPart, StreamPart>({
        transform(part, controller) {
          if (part.type === "finish") usage = part.usage;
          controller.enqueue(part);
        },
        async flush() {
          // Awaited by the stream machinery before the readable side closes,
          // so the write lands before Lambda freezes the sandbox.
          await persist(used, meta, "stream", startedAt, usage, fallbackUsed);
        },
      });
      return { ...result, stream: result.stream.pipeThrough(tap) };
    },
  };
}

/**
 * Wrap a registry model in the gateway middleware. All app code should obtain
 * models through this (or pass overrides in tests).
 */
export function gatewayModel(
  entry: ModelEntry,
  meta: GatewayMeta = {},
  overrides?: GatewayOverrides,
): LanguageModel {
  const base = (overrides?.model ?? resolveModel(entry)) as LanguageModelV3;
  return wrapLanguageModel({
    model: base,
    middleware: instrumentation(entry, meta, overrides?.fallback),
  });
}
