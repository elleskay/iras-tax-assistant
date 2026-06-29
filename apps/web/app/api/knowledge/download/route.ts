import { workspaceFromRequest } from "@/lib/tenant";
import { getOriginal, readSeedDoc } from "@/lib/document-originals";

// Download a document's original text. Uploaded docs come from the per-workspace
// originals store; seeded docs fall back to the RAG seed markdown. The active
// workspace is taken from the request cookie.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = workspaceFromRequest(req);
  const url = new URL(req.url);
  const docId = url.searchParams.get("doc_id") ?? "";
  const filename = url.searchParams.get("filename") ?? "";
  if (!docId && !filename) {
    return new Response("Missing doc_id", { status: 400 });
  }

  const stored = docId ? await getOriginal(ws, docId) : null;
  const text = stored?.text ?? (filename ? await readSeedDoc(ws, filename) : null);
  if (text == null) {
    return new Response("Document not found", { status: 404 });
  }

  const name = (stored?.filename ?? filename ?? "document.txt").replace(
    /[^\w.\- ]+/g,
    "_",
  );
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
