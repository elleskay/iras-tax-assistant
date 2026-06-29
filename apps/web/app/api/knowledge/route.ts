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

// Per-workspace document RAG: list/index/search/delete the active workspace's
// uploaded documents via the Python RAG service. The active workspace comes
// from the request (cookie). RAG is optional; when unconfigured these are safe.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = workspaceFromRequest(req);
  const q = new URL(req.url).searchParams.get("q");
  if (q) {
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
  const ws = workspaceFromRequest(req);
  const body = (await req.json().catch(() => null)) as {
    documents?: unknown;
  } | null;
  const raw = Array.isArray(body?.documents) ? body.documents : null;
  if (!raw) {
    return new Response("Expected { documents: [...] }", { status: 400 });
  }
  const documents: RagDocument[] = raw
    .slice(0, 50)
    .map((d, i): RagDocument => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        doc_id: String(o.doc_id ?? o.filename ?? `doc-${i}`).slice(0, 160),
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
  const ws = workspaceFromRequest(req);
  const body = (await req.json().catch(() => null)) as {
    doc_id?: unknown;
  } | null;
  if (typeof body?.doc_id !== "string") {
    return new Response("Expected { doc_id }", { status: 400 });
  }
  const ok = await deleteKnowledgeDoc(ws, body.doc_id);
  await deleteOriginal(ws, body.doc_id);
  return NextResponse.json({ ok });
}
