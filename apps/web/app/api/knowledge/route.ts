import { NextResponse } from "next/server";
import { workspaceFromRequest } from "@/lib/tenant";
import {
  indexDocuments,
  listKnowledgeDocs,
  deleteKnowledgeDoc,
  searchKnowledge,
  ragEnabled,
  ragReachable,
  type RagDocument,
} from "@/lib/rag-client";
import { saveOriginal, deleteOriginal } from "@/lib/document-originals";
import { makeLimiter, isAllowed, clientIp } from "@/lib/rate-limit";

// Per-workspace document RAG: list/index/search/delete the active workspace's
// uploaded documents via the Python RAG service. The active workspace comes
// from the request (cookie). RAG is optional; when unconfigured these are safe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Indexing triggers paid embedding calls in the RAG service (up to 50 docs of
// 200k chars per request), the most expensive unauthenticated operation in the
// app, so it gets the tightest limiter. Searches also embed the query.
const limiter = makeLimiter({ tokens: 10, window: "1 m", prefix: "knowledge" });

// doc_id is embedded in S3 object keys (doc-originals/<ws>/<id>.json) and in
// RAG metadata; restrict it to a key-safe charset instead of trusting callers.
function sanitizeDocId(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^\w.\- ]+/g, "-").slice(0, 160).trim();
  return cleaned || fallback;
}

export async function GET(req: Request) {
  const ws = workspaceFromRequest(req);
  const q = new URL(req.url).searchParams.get("q");
  if (q) {
    // Query embedding is a paid call on the RAG side; throttle like the rest.
    if (!(await isAllowed(clientIp(req), limiter))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    return NextResponse.json({
      enabled: ragEnabled(),
      results: await searchKnowledge(ws, q, 8),
    });
  }
  const enabled = ragEnabled();
  const reachable = enabled ? await ragReachable() : false;
  return NextResponse.json({
    enabled,
    reachable,
    documents: reachable ? await listKnowledgeDocs(ws) : [],
  });
}

export async function POST(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const ws = workspaceFromRequest(req);
  const body = (await req.json().catch(() => null)) as {
    documents?: unknown;
  } | null;
  const raw = Array.isArray(body?.documents) ? body.documents : null;
  if (!raw) {
    return NextResponse.json(
      { error: "Expected { documents: [...] }" },
      { status: 400 },
    );
  }
  const documents: RagDocument[] = raw
    .slice(0, 50)
    .map((d, i): RagDocument => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        doc_id: sanitizeDocId(String(o.doc_id ?? o.filename ?? ""), `doc-${i}`),
        filename: String(o.filename ?? "untitled.txt").slice(0, 200),
        text: String(o.text ?? "").slice(0, 200_000),
      };
    })
    .filter((d) => d.text.trim().length > 0);

  const result = await indexDocuments(ws, documents);
  if (!result) {
    return NextResponse.json(
      { enabled: ragEnabled(), error: "RAG service unavailable" },
      { status: ragEnabled() ? 502 : 200 },
    );
  }
  // Keep the original text so the Documents page can offer a faithful download.
  await Promise.all(
    documents.map((d) => saveOriginal(ws, d.doc_id, d.filename, d.text)),
  );
  return NextResponse.json({ enabled: true, ...result });
}

export async function DELETE(req: Request) {
  if (!(await isAllowed(clientIp(req), limiter))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const ws = workspaceFromRequest(req);
  const body = (await req.json().catch(() => null)) as {
    doc_id?: unknown;
  } | null;
  if (typeof body?.doc_id !== "string") {
    return NextResponse.json({ error: "Expected { doc_id }" }, { status: 400 });
  }
  const ok = await deleteKnowledgeDoc(ws, body.doc_id);
  if (!ok && ragEnabled()) {
    // The doc is still indexed (service down or delete failed): keep the
    // stored original too, or the still-listed doc loses its download forever.
    return NextResponse.json(
      { ok: false, error: "RAG service unavailable" },
      { status: 502 },
    );
  }
  await deleteOriginal(ws, body.doc_id);
  return NextResponse.json({ ok });
}
