import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { anthropic } from "./agent";
import { findModel, type ModelEntry } from "./model-registry";

/** Resolve a registry entry to an AI SDK model instance. */
export function resolveModel(entry: ModelEntry): LanguageModel {
  return entry.provider === "openai" ? openai(entry.id) : anthropic(entry.id);
}

/** Resolve a registry model id to a model instance plus its entry. */
export function resolveById(
  modelId: string,
): { model: LanguageModel; entry: ModelEntry } | null {
  const entry = findModel(modelId);
  if (!entry) return null;
  return { model: resolveModel(entry), entry };
}
