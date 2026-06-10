import { createJsonStore, reverseChronoId } from "./store";
import type { Provider } from "./model-registry";

/*
 * Persisted request log for the model gateway. One JSON object per model call
 * (S3 in production, gateway.json locally), newest-first via reverse-chrono
 * ids, so the /gateway page can list recent calls without scanning everything.
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

const store = createJsonStore<GatewayCall>("gateway");

export async function logGatewayCall(
  call: Omit<GatewayCall, "id" | "timestamp">,
): Promise<GatewayCall> {
  const entry: GatewayCall = {
    ...call,
    id: reverseChronoId(),
    timestamp: new Date().toISOString(),
  };
  await store.put(entry.id, entry);
  return entry;
}

export async function listGatewayCalls(limit = 50): Promise<GatewayCall[]> {
  return store.list(limit);
}
