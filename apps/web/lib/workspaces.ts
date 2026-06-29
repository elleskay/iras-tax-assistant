import { createJsonStore } from "./store";

/*
 * Workspaces: the multi-tenant unit of the platform, one per tax type. Each
 * workspace has its own documents (RAG index), its own prompt, and a few tuning
 * knobs (default model, cost ceiling). The platform governance standard is
 * shared across all workspaces (see lib/governance.ts); only these knobs differ
 * per workspace, that is the whole point: one standard, tuned locally.
 */

/**
 * Tax-type identifier, e.g. "individual-income" or "gst". Free-form so custom
 * workspaces can use any tax type (the create form lets officers type one).
 */
export type TaxType = string;

export interface WorkspaceSettings {
  /** Default model for this workspace's assistant (a model-registry id). */
  defaultModelId: string;
  /** Per-call USD cost ceiling for this workspace. */
  costCeilingUsd: number;
}

export interface Workspace {
  id: string; // slug, e.g. "individual-income"
  name: string; // "Individual Income Tax"
  taxType: TaxType;
  blurb: string;
  settings: WorkspaceSettings;
}

/** The flagship workspace; also the fallback for un-scoped / legacy calls. */
export const DEFAULT_WORKSPACE = "individual-income";

export const SEED_WORKSPACES: Workspace[] = [
  {
    id: "individual-income",
    name: "Individual Income Tax",
    taxType: "individual-income",
    blurb:
      "High-volume, routine taxpayer queries. Cheap, fast default model under the platform governance standard.",
    settings: { defaultModelId: "gpt-4o-mini", costCeilingUsd: 0.03 },
  },
  {
    id: "corporate",
    name: "Corporate Income Tax",
    taxType: "corporate",
    blurb:
      "Complex corporate cases (restructuring, group relief, transfer pricing), under the same platform governance standard as every workspace.",
    settings: { defaultModelId: "claude-opus-4-8", costCeilingUsd: 0.15 },
  },
];

const store = createJsonStore<Workspace>("workspaces");

export async function listWorkspaces(): Promise<Workspace[]> {
  const saved = await store.list();
  // Always include the seeded example workspaces; a saved copy (if edited)
  // overrides the seed default. So creating a workspace never hides the seeds.
  const byId = new Map<string, Workspace>(saved.map((w) => [w.id, w]));
  for (const s of SEED_WORKSPACES) if (!byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  return (
    (await store.get(id)) ?? SEED_WORKSPACES.find((w) => w.id === id) ?? null
  );
}

export async function saveWorkspace(ws: Workspace): Promise<void> {
  await store.put(ws.id, ws);
}

/** True for the built-in example workspaces, which cannot be deleted. */
export function isSeedWorkspace(id: string): boolean {
  return SEED_WORKSPACES.some((w) => w.id === id);
}

/** Delete a custom workspace. Seeded example workspaces are protected. */
export async function deleteWorkspace(id: string): Promise<boolean> {
  if (isSeedWorkspace(id)) return false;
  await store.delete(id);
  return true;
}

/** Seed the two example workspaces if none have been created yet. Idempotent. */
export async function ensureSeeded(): Promise<void> {
  const saved = await store.list();
  if (saved.length) return;
  for (const w of SEED_WORKSPACES) await store.put(w.id, w);
}
