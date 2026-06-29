import { readFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { createJsonStore } from "./store";

/*
 * Original document text, kept so the Documents page can offer a faithful
 * download. The RAG index only stores chunks (with overlap), so it cannot
 * reproduce a document exactly. Two sources, in priority order:
 *  1. Uploaded docs: saved here (per workspace) when indexed via /api/knowledge.
 *  2. Seeded docs: served from the RAG service's seed markdown files, which the
 *     web app did not upload.
 */

export interface DocumentOriginal {
  filename: string;
  text: string;
}

function store(ws: string) {
  return createJsonStore<DocumentOriginal>("doc-originals", { workspace: ws });
}

export async function saveOriginal(
  ws: string,
  docId: string,
  filename: string,
  text: string,
): Promise<void> {
  await store(ws).put(docId, { filename, text });
}

export async function getOriginal(
  ws: string,
  docId: string,
): Promise<DocumentOriginal | null> {
  return store(ws).get(docId);
}

export async function deleteOriginal(ws: string, docId: string): Promise<void> {
  await store(ws).delete(docId);
}

/**
 * Read a seeded document's markdown from the RAG service's seed folder. Returns
 * null if the file is missing or the name looks unsafe. The dev server runs
 * from apps/web, so the seed dir resolves a couple of levels up; an override
 * env var and a repo-root candidate keep it working in other layouts.
 */
export async function readSeedDoc(
  ws: string,
  filename: string,
): Promise<string | null> {
  const safeName = basename(filename);
  if (!safeName || safeName !== filename) return null; // no path separators
  if (!/^[a-z0-9_-]+$/i.test(ws)) return null;

  const cwd = process.cwd();
  const roots = [
    process.env.RAG_SEED_DIR,
    resolve(cwd, "..", "..", "services", "rag", "seed"),
    resolve(cwd, "services", "rag", "seed"),
  ].filter((d): d is string => Boolean(d));

  for (const root of roots) {
    try {
      return await readFile(join(root, ws, safeName), "utf8");
    } catch {
      // try the next candidate
    }
  }
  return null;
}
