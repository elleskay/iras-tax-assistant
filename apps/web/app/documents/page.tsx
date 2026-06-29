"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Search,
  Trash2,
  Upload,
  Loader2,
  Info,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Doc {
  doc_id: string;
  filename: string;
  chunk_count: number;
}
interface Chunk {
  text: string;
  score: number;
  source: { doc_id: string; filename: string; location: string };
}

export default function DocumentsPage() {
  const [enabled, setEnabled] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Chunk[] | null>(null);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge", { cache: "no-store" });
      const data = await res.json();
      setEnabled(Boolean(data.enabled));
      setReachable(Boolean(data.reachable));
      setDocs(data.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const documents = await Promise.all(
        Array.from(files).map(async (f) => ({
          doc_id: f.name,
          filename: f.name,
          text: await f.text(),
        })),
      );
      await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents }),
      });
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(docId: string) {
    await fetch("/api/knowledge", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_id: docId }),
    });
    await load();
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/knowledge?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  }

  const usable = enabled && reachable;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <FileText className="h-5 w-5" /> Documents
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload this workspace&apos;s guidance documents. They are chunked,
          embedded, and indexed for retrieval (RAG), and the assistant cites them
          when it answers. Uploads go to the active workspace (top-right switcher).
        </p>
      </div>

      {!enabled ? (
        <Card className="mb-6 border-dashed">
          <CardContent className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            The RAG service is not configured (set RAG_SERVICE_URL). Uploads and
            search are disabled here; the assistant falls back to its built-in
            fact lookup.
          </CardContent>
        </Card>
      ) : !reachable ? (
        <Card className="mb-6 border-dashed border-[var(--warning)]">
          <CardContent className="flex items-start gap-2 py-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-foreground)]" />
            The RAG service is configured but not responding, so this workspace&apos;s
            documents cannot be loaded right now. Start the service on
            RAG_SERVICE_URL and refresh. Your indexed documents are not lost.
          </CardContent>
        </Card>
      ) : null}

      <main id="main" className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <div>
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={!usable || uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Indexing..." : "Upload documents (.txt, .md)"}
            </Button>
          </div>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </p>
          ) : docs.length === 0 ? (
            usable ? (
              <p className="text-sm text-muted-foreground">
                No documents indexed for this workspace yet.
              </p>
            ) : null
          ) : (
            <ul className="flex flex-col gap-2">
              {docs.map((d) => (
                <li key={d.doc_id}>
                  <Card className="shadow-soft">
                    <CardContent className="flex items-center justify-between gap-3 py-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <FileText className="h-4 w-4 text-primary" /> {d.filename}
                        <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">
                          {d.chunk_count} chunks
                        </Badge>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <a
                          href={`/api/knowledge/download?doc_id=${encodeURIComponent(d.doc_id)}&filename=${encodeURIComponent(d.filename)}`}
                          download={d.filename}
                          aria-label={`Download ${d.filename}`}
                          className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <Button
                          variant="ghost"
                          onClick={() => remove(d.doc_id)}
                          aria-label={`Remove ${d.filename}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Knowledge search
          </h3>
          <form onSubmit={search} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the indexed documents..."
              className="flex-1 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              disabled={!usable}
            />
            <Button type="submit" disabled={!usable || searching}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </Button>
          </form>
          {results ? (
            results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No matching passages.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {results.map((c, i) => (
                  <li key={i}>
                    <Card className="shadow-soft">
                      <CardContent className="py-3">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {c.source.filename} &middot; {c.source.location}
                          </span>
                          <span className="tabular-nums">
                            score {c.score.toFixed(3)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">{c.text}</p>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      </main>
    </div>
  );
}
