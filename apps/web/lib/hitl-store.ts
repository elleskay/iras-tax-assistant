import { join } from "node:path";
import { createJsonStore } from "./store";

/*
 * HITL (human-in-the-loop) escalation store, built on the generic JSON store
 * (see lib/store.ts): S3 objects under escalations/ in production, a local
 * hitl-queue.json file in dev and tests (path overridable via HITL_QUEUE_PATH).
 */

export type EscalationStatus = "pending" | "resolved";

export interface Escalation {
  id: number;
  timestamp: string;
  reason: string;
  original_query: string;
  status: EscalationStatus;
}

const store = createJsonStore<Escalation>("escalations", {
  compare: (a, b) => b.id - a.id, // newest first
  filePath: () =>
    process.env.HITL_QUEUE_PATH ??
    join(/* turbopackIgnore: true */ process.cwd(), "hitl-queue.json"),
});

export async function addEscalation(
  reason: string,
  originalQuery: string,
): Promise<Escalation> {
  // Millisecond ids; bump on collision so two escalations in the same
  // millisecond both survive.
  let id = Date.now();
  while (await store.get(String(id))) id += 1;
  const entry: Escalation = {
    id,
    timestamp: new Date().toISOString(),
    reason,
    original_query: originalQuery,
    status: "pending",
  };
  await store.put(String(id), entry);
  return entry;
}

export async function listEscalations(): Promise<Escalation[]> {
  return store.list();
}

export async function resolveEscalation(id: number): Promise<Escalation | null> {
  const entry = await store.get(String(id));
  if (!entry) return null;
  entry.status = "resolved";
  await store.put(String(id), entry);
  return entry;
}
