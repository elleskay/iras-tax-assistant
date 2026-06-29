/*
 * Client for the Python RAG microservice (services/rag, FastAPI + LlamaIndex +
 * pgvector). The agent's knowledge retrieval and the Documents page call this
 * over HTTP. Scoped by workspace. When RAG_SERVICE_URL is unset the service is
 * considered disabled and every call is a safe no-op, so the app falls back to
 * the deterministic built-in fact lookup.
 */

const RAW_URL = process.env.RAG_SERVICE_URL;
const BASE = RAW_URL ? RAW_URL.replace(/\/$/, "") : null;

export interface KnowledgeChunk {
  text: string;
  score: number;
  source: { doc_id: string; filename: string; location: string };
}

export interface KnowledgeDoc {
  doc_id: string;
  filename: string;
  chunk_count: number;
}

export interface RagDocument {
  doc_id: string;
  filename: string;
  text: string;
}

export function ragEnabled(): boolean {
  return BASE !== null;
}

/**
 * Whether the configured RAG service actually responds. Distinct from
 * ragEnabled() (which only checks that a URL is set), so the UI can tell a
 * down service apart from an empty index.
 */
export async function ragReachable(): Promise<boolean> {
  if (!BASE) return false;
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function call<T>(
  path: string,
  init: RequestInit,
  fallback: T,
  timeoutMs = 8000,
): Promise<T> {
  if (!BASE) return fallback;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export async function searchKnowledge(
  workspace: string,
  query: string,
  topK = 5,
): Promise<KnowledgeChunk[]> {
  const data = await call<{ results?: KnowledgeChunk[] }>(
    "/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, query, top_k: topK }),
    },
    { results: [] },
  );
  return data.results ?? [];
}

export async function indexDocuments(
  workspace: string,
  documents: RagDocument[],
): Promise<{ indexed_docs: number; indexed_chunks: number } | null> {
  if (!BASE) return null;
  return call<{ indexed_docs: number; indexed_chunks: number } | null>(
    "/index",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, documents }),
    },
    null,
    30000,
  );
}

export async function listKnowledgeDocs(
  workspace: string,
): Promise<KnowledgeDoc[]> {
  const data = await call<{ documents?: KnowledgeDoc[] }>(
    `/workspaces/${encodeURIComponent(workspace)}/documents`,
    { method: "GET" },
    { documents: [] },
  );
  return data.documents ?? [];
}

export async function deleteKnowledgeDoc(
  workspace: string,
  docId: string,
): Promise<boolean> {
  if (!BASE) return false;
  try {
    const res = await fetch(`${BASE}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, doc_id: docId }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
