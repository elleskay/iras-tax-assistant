"use client";

import { useCallback, useEffect, useState } from "react";
import { diffLines } from "diff";
import {
  CheckCircle2,
  FileText,
  Inbox,
  Loader2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageGuide } from "@/components/page-guide";

interface PromptVersion {
  version: number;
  content: string;
  note?: string;
  createdAt: string;
}

interface PromptRecord {
  name: string;
  activeVersion: number;
  versions: PromptVersion[];
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-SG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/*
 * Line diff of a selected version against the one before it (the first
 * version diffs against empty, so every line shows as added).
 */
function VersionDiff({
  prompt,
  version,
}: {
  prompt: PromptRecord;
  version: number;
}) {
  const sorted = [...prompt.versions].sort((a, b) => a.version - b.version);
  const idx = sorted.findIndex((v) => v.version === version);
  if (idx === -1) return null;
  const current = sorted[idx];
  const previous = idx > 0 ? sorted[idx - 1] : null;
  const parts = diffLines(previous?.content ?? "", current.content);

  return (
    <div data-testid="prompt-diff" className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {previous
          ? `Diff: v${previous.version} to v${current.version}`
          : `v${current.version} (first version)`}
      </p>
      <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-5">
        {parts.flatMap((part, i) => {
          const op = part.added ? "add" : part.removed ? "del" : "same";
          const lines = part.value.replace(/\n$/, "").split("\n");
          return lines.map((line, j) => (
            <div
              key={`${i}-${j}`}
              data-testid="diff-line"
              data-op={op}
              className={
                op === "add"
                  ? "bg-[var(--success)]/15 text-foreground"
                  : op === "del"
                    ? "bg-destructive/10 text-muted-foreground line-through"
                    : "text-muted-foreground"
              }
            >
              <span className="mr-2 select-none font-semibold">
                {op === "add" ? "+" : op === "del" ? "-" : " "}
              </span>
              {line}
            </div>
          ));
        })}
      </pre>
    </div>
  );
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [activating, setActivating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("assistant-system");
  const [content, setContent] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/prompts", { cache: "no-store" });
    const data = await res.json();
    setPrompts(data.prompts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveVersion(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          content,
          ...(note ? { note } : {}),
        }),
      });
      if (!res.ok) {
        setFormError(
          "Could not save: use a lowercase kebab-case name and non-empty content.",
        );
        return;
      }
      setContent("");
      setNote("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function activate(promptName: string, version: number) {
    setActivating(`${promptName}:${version}`);
    try {
      await fetch("/api/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: promptName, version }),
      });
      await load();
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
          <FileText className="h-5 w-5" /> Prompts
        </h2>
        <p className="text-sm text-muted-foreground">
          The assistant&apos;s system prompt is versioned here: versions are
          immutable, one is active at a time, and the chat resolves the active
          version at request time (falling back to the compiled-in default
          when none exists).
        </p>
      </div>

      <PageGuide page="prompts" className="mb-6" />

      <main id="main" className="flex flex-col gap-8">
        {/* Existing prompts */}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading prompts...
          </p>
        ) : prompts.length === 0 ? (
          <Card data-testid="empty-prompts" className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                No stored prompts yet
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                The assistant is running on its compiled-in system prompt. Save
                a first version below to start managing it here.
              </p>
            </CardContent>
          </Card>
        ) : (
          prompts.map((p) => {
            const sorted = [...p.versions].sort((a, b) => b.version - a.version);
            const selectedVersion = selected[p.name] ?? p.activeVersion;
            return (
              <Card
                key={p.name}
                data-testid="prompt"
                data-name={p.name}
                className="shadow-soft"
              >
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm font-semibold text-foreground">
                      {p.name}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {p.versions.length} version{p.versions.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-2">
                    {sorted.map((v) => {
                      const isActive = v.version === p.activeVersion;
                      const isSelected = v.version === selectedVersion;
                      const key = `${p.name}:${v.version}`;
                      return (
                        <li
                          key={v.version}
                          data-testid="prompt-version"
                          data-version={v.version}
                          data-active={isActive}
                        >
                          <div
                            className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 ${
                              isSelected ? "border-primary/50 bg-accent/40" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setSelected((s) => ({ ...s, [p.name]: v.version }))
                              }
                              className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              v{v.version}
                            </button>
                            {isActive ? (
                              <Badge className="gap-1 bg-[var(--success)] text-[var(--success-foreground)] hover:bg-[var(--success)]">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => activate(p.name, v.version)}
                                disabled={activating === key}
                              >
                                {activating === key ? "Activating..." : "Activate"}
                              </Button>
                            )}
                            {v.note ? (
                              <span className="text-xs text-muted-foreground">
                                {v.note}
                              </span>
                            ) : null}
                            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                              {formatTime(v.createdAt)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <VersionDiff prompt={p} version={selectedVersion} />
                </CardContent>
              </Card>
            );
          })
        )}

        {/* New version form */}
        <Card className="shadow-soft">
          <CardContent>
            <form onSubmit={saveVersion} className="flex flex-col gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Plus className="h-4 w-4" /> New version
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                  Prompt name
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="assistant-system"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                  Note
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What changed (optional)"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Prompt content
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="You are an IRAS tax FAQ assistant..."
                  rows={6}
                  required
                />
              </label>
              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" disabled={saving} className="self-start">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {saving ? "Saving..." : "Save version"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
