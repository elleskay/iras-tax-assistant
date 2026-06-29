"use client";

import { useState } from "react";
import { isToolUIPart, type UIMessage } from "ai";
import { ChevronDown } from "lucide-react";
import type { Components } from "streamdown";
import { cn } from "@/lib/utils";
import type { ToolPart } from "./tool";

/*
 * Citations for an assistant answer. The agent's search_knowledge tool returns
 * passages formatted "[n] (filename, location)\n<text>", and the model cites
 * those [n] in its answer. We (1) render a numbered Sources block under the
 * answer and (2) turn the inline [n] markers into clickable refs that scroll to
 * and flash the matching source. Numbering follows retrieval order, which is
 * what the model cites.
 */

interface Source {
  n: number;
  filename: string;
  location: string;
  text: string;
}

function toolName(part: ToolPart): string {
  if (part.type === "dynamic-tool") return part.toolName;
  return part.type.split("-").slice(1).join("-");
}

function parseSources(output: string): Source[] {
  const re = /\[(\d+)\]\s*\(([^,]+),\s*([^)]+)\)/g;
  const matches = [...output.matchAll(re)];
  return matches.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < matches.length ? matches[i + 1].index ?? output.length : output.length;
    return {
      n: Number(m[1]),
      filename: m[2].trim(),
      location: m[3].trim(),
      text: output.slice(start, end).trim(),
    };
  });
}

/** The [n] numbers the answer text actually cites. */
function citedNumbers(parts: UIMessage["parts"]): Set<number> {
  const nums = new Set<number>();
  for (const part of parts) {
    if (part.type !== "text" || typeof part.text !== "string") continue;
    for (const m of part.text.matchAll(/\[(\d+)\]/g)) nums.add(Number(m[1]));
  }
  return nums;
}

/**
 * Sources for a message: the retrieved passages, but limited to the ones the
 * answer actually cites (so we do not list everything the agent searched). If
 * the answer cites nothing, fall back to the full retrieval so the panel is not
 * empty when documents were searched.
 */
export function collectSources(parts: UIMessage["parts"]): Source[] {
  const all: Source[] = [];
  for (const part of parts) {
    if (!isToolUIPart(part)) continue;
    const tp = part as ToolPart;
    if (toolName(tp) !== "search_knowledge") continue;
    if (tp.state !== "output-available" || typeof tp.output !== "string") continue;
    for (const s of parseSources(tp.output)) all.push(s);
  }
  // Show exactly the passages the answer cites; no dedup, so every [n] resolves
  // even when a later search re-surfaced a chunk under a new number. When the
  // answer cites nothing this is empty by design: the full retrieval stays
  // visible in the Agent steps trace, so nothing is hidden.
  const cited = citedNumbers(parts);
  return all.filter((s) => cited.has(s.n)).sort((a, b) => a.n - b.n);
}

/** Turn `[n]` markers that have a source into links the override picks up. */
export function linkifyCitations(text: string, nums: Set<number>): string {
  if (nums.size === 0) return text;
  return text.replace(/\[(\d+)\]/g, (m, d: string) =>
    nums.has(Number(d)) ? `[${d}](#cite-${d})` : m,
  );
}

/** Scroll a source row (in the panel or inline) into view and flash it. */
export function flashCite(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("cite-flash");
  void el.offsetWidth; // restart the animation if it is already running
  el.classList.add("cite-flash");
  window.setTimeout(() => el.classList.remove("cite-flash"), 1600);
  // Expand the cited passage so it is visible right away (no-op if already open).
  el.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click();
}

/**
 * Streamdown component overrides for one message: render `#cite-n` links as
 * bracketed refs that activate this message's source `n` (the host decides how:
 * highlight it in the panel, or flash the inline list), leaving other links as
 * normal external links.
 */
export function makeCiteComponents(
  messageId: string,
  onCite?: (messageId: string, n: number) => void,
): Components {
  return {
    a: ({ href, children }) => {
      if (typeof href === "string" && href.startsWith("#cite-")) {
        const n = Number(href.slice("#cite-".length));
        const targetId = `cite-${messageId}-${n}`;
        return (
          <a
            href={`#${targetId}`}
            className="cite-ref"
            onClick={(e) => {
              e.preventDefault();
              if (onCite) onCite(messageId, n);
              else flashCite(targetId);
            }}
          >
            [{children}]
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  };
}

/** One source row: click (or its [n] ref) to expand the cited passage. */
function SourceItem({ source, id }: { source: Source; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li id={id} className="rounded">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-xs leading-relaxed transition-colors hover:bg-accent"
      >
        <span className="font-semibold text-primary">[{source.n}]</span>
        <span className="min-w-0 flex-1">
          <span className="font-medium text-foreground">{source.filename}</span>
          <span className="text-muted-foreground"> · {source.location}</span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="mx-1.5 mb-1 mt-0.5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/80">
          {source.text}
        </div>
      ) : null}
    </li>
  );
}

/** Numbered source rows; each row is the scroll/flash target for its [n] ref.
 *  Shared by the inline (mobile) block and the inspector panel. */
export function SourceList({
  sources,
  messageId,
}: {
  sources: ReturnType<typeof collectSources>;
  messageId: string;
}) {
  return (
    <ol className="flex flex-col gap-0.5">
      {sources.map((s) => (
        <SourceItem
          key={`${s.n}::${s.filename}::${s.location}`}
          source={s}
          id={`cite-${messageId}-${s.n}`}
        />
      ))}
    </ol>
  );
}

/** Inline Sources block under an answer (used on narrow screens). */
export function Citations({
  parts,
  messageId,
}: {
  parts: UIMessage["parts"];
  messageId: string;
}) {
  const sources = collectSources(parts);
  if (sources.length === 0) return null;

  return (
    <div
      data-testid="citations"
      className="not-prose mt-2 w-full rounded-md border bg-muted/30 px-3 py-2"
    >
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sources
      </p>
      <SourceList sources={sources} messageId={messageId} />
    </div>
  );
}
