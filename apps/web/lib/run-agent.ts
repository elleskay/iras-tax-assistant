import {
  smoothStream,
  stepCountIs,
  streamText,
  type ModelMessage,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import {
  gatewayModel,
  type GatewayMeta,
  type GatewayOverrides,
} from "./gateway";
import type { ModelEntry } from "./model-registry";

/*
 * The agent loop, extracted from the chat route so it can be driven directly
 * in tests (vitest with ai/test mock models, zero network). The route stays
 * responsible for validation, rate limiting, routing, and streaming the
 * response; this owns the model invocation: tool loop bounded at MAX_STEPS,
 * temperature 0, output cap, and the gateway wrapper (timing, cost, logging,
 * cross-provider fallback).
 */

export const MAX_STEPS = 5;
export const MAX_OUTPUT_TOKENS = 800;

export interface RunAgentOptions {
  entry: ModelEntry;
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  meta?: GatewayMeta;
  /** Test seam: inject mock primary and fallback models. */
  overrides?: GatewayOverrides;
  /** Word-by-word smoothing for the UI; disable in tests for speed. */
  smooth?: boolean;
}

export function runAgent(
  opts: RunAgentOptions,
): StreamTextResult<ToolSet, never> {
  return streamText({
    model: gatewayModel(opts.entry, opts.meta ?? {}, opts.overrides),
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
    stopWhen: stepCountIs(MAX_STEPS),
    temperature: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Even out uneven token chunks into steady word-by-word output so the
    // answer streams smoothly instead of arriving in patches.
    experimental_transform:
      (opts.smooth ?? true)
        ? smoothStream({ delayInMs: 18, chunking: "word" })
        : undefined,
  });
}
