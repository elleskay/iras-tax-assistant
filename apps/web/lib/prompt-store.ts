import { createJsonStore } from "./store";

/*
 * Versioned prompt registry. Each prompt is one record keyed by name; versions
 * are append-only and immutable, and an activeVersion pointer selects which
 * one the app uses. The store is the same dual-backend JSON store as the rest
 * of the app (S3 prefix in prod, prompts.json locally).
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

const store = createJsonStore<PromptRecord>("prompts", {
  compare: (a, b) => a.name.localeCompare(b.name),
});

export async function listPrompts(): Promise<PromptRecord[]> {
  return store.list();
}

export async function getPrompt(name: string): Promise<PromptRecord | null> {
  return store.get(name);
}

/**
 * Append a new immutable version. The first version of a prompt becomes
 * active; later versions never change the pointer until explicitly activated.
 */
export async function addPromptVersion(
  name: string,
  content: string,
  note?: string,
): Promise<PromptRecord> {
  const existing = await store.get(name);
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
  await store.put(name, record);
  return record;
}

/** Point the prompt at an existing version. Returns null when either is missing. */
export async function activatePromptVersion(
  name: string,
  version: number,
): Promise<PromptRecord | null> {
  const existing = await store.get(name);
  if (!existing || !existing.versions.some((v) => v.version === version)) {
    return null;
  }
  const record: PromptRecord = { ...existing, activeVersion: version };
  await store.put(name, record);
  return record;
}

export async function getActivePromptContent(
  name: string,
): Promise<string | null> {
  const record = await store.get(name);
  if (!record) return null;
  return (
    record.versions.find((v) => v.version === record.activeVersion)?.content ??
    null
  );
}

export async function getPromptVersionContent(
  name: string,
  version: number,
): Promise<string | null> {
  const record = await store.get(name);
  return record?.versions.find((v) => v.version === version)?.content ?? null;
}
