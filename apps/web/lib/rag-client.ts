import { z } from "zod";

/*
 * Client for the Python RAG microservice (services/rag, FastAPI + LlamaIndex +
 * pgvector). The agent's knowledge retrieval and the Documents page call this
 * over HTTP. Scoped by workspace. When RAG_SERVICE_URL is unset the service is
 * considered disabled and every call is a safe no-op, so the app falls back to
 * the deterministic built-in fact lookup.
 *
 * When RAG_SERVICE_TOKEN is set it is sent as a bearer token; set the same
 * value on the service side to require it (services/rag/README.md).
 *
 * Responses are external input, so they are zod-validated rather than cast:
 * a malformed or version-skewed service reply degrades to the fallback value
 * instead of throwing mid-agent-loop.
 */

const RAW_URL = process.env.RAG_SERVICE_URL;
const BASE = RAW_URL ? RAW_URL.replace(/\/$/, "") : null;

const SourceSchema = z.object({
  doc_id: z.string(),
  filename: z.string(),
  location: z.string(),
});

const SearchResponseSchema = z.object({
  results: z
    .array(
      z.object({
        text: z.string(),
        score: z.number(),
        source: SourceSchema,
      }),
    )
    .default([]),
});

const IndexResponseSchema = z.object({
  indexed_docs: z.number(),
  indexed_chunks: z.number(),
});

const DocumentListSchema = z.object({
  documents: z
    .array(
      z.object({
        doc_id: z.string(),
        filename: z.string(),
        chunk_count: z.number(),
      }),
    )
    .default([]),
});

export type KnowledgeChunk = z.infer<typeof SearchResponseSchema>["results"][number];
export type KnowledgeDoc = z.infer<typeof DocumentListSchema>["documents"][number];

export interface RagDocument {
  doc_id: string;
  filename: string;
  text: string;
}

export function ragEnabled(): boolean {
  return BASE !== null;
}

function authHeaders(): Record<string, string> {
  const token = process.env.RAG_SERVICE_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
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

async function call<S extends z.ZodType>(
  path: string,
  init: RequestInit,
  schema: S,
  fallback: z.infer<S>,
  timeoutMs = 8000,
): Promise<z.infer<S>> {
  if (!BASE) return fallback;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...init.headers, ...authHeaders() },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return fallback;
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export async function searchKnowledge(
  workspace: string,
  query: string,
  topK = 5,
): Promise<KnowledgeChunk[]> {
  const data = await call(
    "/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, query, top_k: topK }),
    },
    SearchResponseSchema,
    { results: [] },
  );
  return data.results;
}

export async function indexDocuments(
  workspace: string,
  documents: RagDocument[],
): Promise<{ indexed_docs: number; indexed_chunks: number } | null> {
  if (!BASE) return null;
  return call(
    "/index",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, documents }),
    },
    IndexResponseSchema.nullable(),
    null,
    30000,
  );
}

export async function listKnowledgeDocs(
  workspace: string,
): Promise<KnowledgeDoc[]> {
  const data = await call(
    `/workspaces/${encodeURIComponent(workspace)}/documents`,
    { method: "GET" },
    DocumentListSchema,
    { documents: [] },
  );
  return data.documents;
}

export async function deleteKnowledgeDoc(
  workspace: string,
  docId: string,
): Promise<boolean> {
  if (!BASE) return false;
  try {
    const res = await fetch(`${BASE}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ workspace, doc_id: docId }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
