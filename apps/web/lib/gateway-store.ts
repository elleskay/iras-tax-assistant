import { createJsonStore, reverseChronoId } from "./store";
import { DEFAULT_WORKSPACE } from "./workspaces";
import type { Provider } from "./model-registry";

/*
 * Persisted request log for the model gateway. One JSON object per model call
 * (S3 in production, gateway-<workspace>.json locally), newest-first via
 * reverse-chrono ids. Scoped per workspace so each tax type's /gateway and
 * audit views show only its own calls.
 */

export interface GatewayCall {
  id: string;
  timestamp: string;
  modelId: string;
  modelLabel: string;
  provider: Provider;
  kind: "generate" | "stream";
  /** Why the router picked this model (routing reason, "eval", ...). */
  route?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  fallbackUsed: boolean;
}

const store = (workspace: string) =>
  createJsonStore<GatewayCall>("gateway", { workspace });

export async function logGatewayCall(
  call: Omit<GatewayCall, "id" | "timestamp">,
  workspace: string = DEFAULT_WORKSPACE,
): Promise<GatewayCall> {
  const entry: GatewayCall = {
    ...call,
    id: reverseChronoId(),
    timestamp: new Date().toISOString(),
  };
  await store(workspace).put(entry.id, entry);
  return entry;
}

export async function listGatewayCalls(
  limit = 50,
  workspace: string = DEFAULT_WORKSPACE,
): Promise<GatewayCall[]> {
  return store(workspace).list(limit);
}
