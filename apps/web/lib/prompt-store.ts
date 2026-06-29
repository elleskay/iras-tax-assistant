import { createJsonStore } from "./store";
import { DEFAULT_WORKSPACE } from "./workspaces";

/*
 * Versioned prompt registry, scoped per workspace. Each prompt is one record
 * keyed by name; versions are append-only and immutable, and an activeVersion
 * pointer selects which one the workspace's assistant uses. Same dual-backend
 * JSON store as the rest of the app (S3 prefix in prod, prompts-<workspace>.json
 * locally). A workspace's system prompt is its assistant's persona for that tax
 * type.
 */

export interface PromptVersion {
  version: number;
  content: string;
  note?: string;
  createdAt: string;
}

export interface PromptRecord {
  name: string;
  activeVersion: number;
  versions: PromptVersion[];
}

const store = (workspace: string) =>
  createJsonStore<PromptRecord>("prompts", {
    compare: (a, b) => a.name.localeCompare(b.name),
    workspace,
  });

export async function listPrompts(
  workspace: string = DEFAULT_WORKSPACE,
): Promise<PromptRecord[]> {
  return store(workspace).list();
}

export async function getPrompt(
  name: string,
  workspace: string = DEFAULT_WORKSPACE,
): Promise<PromptRecord | null> {
  return store(workspace).get(name);
}

/**
 * Append a new immutable version. The first version of a prompt becomes
 * active; later versions never change the pointer until explicitly activated.
 */
export async function addPromptVersion(
  name: string,
  content: string,
  note?: string,
  workspace: string = DEFAULT_WORKSPACE,
): Promise<PromptRecord> {
  const s = store(workspace);
  const existing = await s.get(name);
  const nextVersion = existing
    ? Math.max(...existing.versions.map((v) => v.version)) + 1
    : 1;
  const version: PromptVersion = {
    version: nextVersion,
    content,
    ...(note ? { note } : {}),
    createdAt: new Date().toISOString(),
  };
  const record: PromptRecord = existing
    ? { ...existing, versions: [...existing.versions, version] }
    : { name, activeVersion: 1, versions: [version] };
  await s.put(name, record);
  return record;
}

/** Point the prompt at an existing version. Returns null when either is missing. */
export async function activatePromptVersion(
  name: string,
  version: number,
  workspace: string = DEFAULT_WORKSPACE,
): Promise<PromptRecord | null> {
  const s = store(workspace);
  const existing = await s.get(name);
  if (!existing || !existing.versions.some((v) => v.version === version)) {
    return null;
  }
  const record: PromptRecord = { ...existing, activeVersion: version };
  await s.put(name, record);
  return record;
}

export async function getActivePromptContent(
  name: string,
  workspace: string = DEFAULT_WORKSPACE,
): Promise<string | null> {
  const record = await store(workspace).get(name);
  if (!record) return null;
  return (
    record.versions.find((v) => v.version === record.activeVersion)?.content ??
    null
  );
}

export async function getPromptVersionContent(
  name: string,
  version: number,
  workspace: string = DEFAULT_WORKSPACE,
): Promise<string | null> {
  const record = await store(workspace).get(name);
  return record?.versions.find((v) => v.version === version)?.content ?? null;
}
