"use client";

import { useState } from "react";
import { ChevronDownIcon, ListOrderedIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusBadge, type ToolPart } from "./tool";

/*
 * Numbered trace of the agent's tool steps inside one assistant reply.
 * Collapsed by default (the answer is the point; the trace is the proof).
 * Each step shows the tool name, its input, and its output, in the order
 * the agent ran them.
 */

function toolName(part: ToolPart): string {
  if (part.type === "dynamic-tool") return part.toolName;
  return part.type.split("-").slice(1).join("-");
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

/** The numbered list of tool steps. Reused inline (collapsible) and in the
 *  inspector panel (always shown). */
export function StepList({
  parts,
  className,
}: {
  parts: ToolPart[];
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-col gap-3", className)}>
      {parts.map((part, i) => (
        <li key={part.toolCallId ?? i} data-testid="step" className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-navy">
                {toolName(part)}
              </span>
              {getStatusBadge(part.state)}
            </span>
            {part.input !== undefined ? (
              <pre
                data-testid="step-input"
                className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-xs text-muted-foreground"
              >
                {asText(part.input)}
              </pre>
            ) : null}
            {part.state === "output-available" ? (
              <pre
                data-testid="step-output"
                className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-xs text-foreground"
              >
                {asText(part.output)}
              </pre>
            ) : null}
            {part.state === "output-error" ? (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-2 font-mono text-xs text-destructive">
                {part.errorText}
              </pre>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function StepTrace({
  parts,
  className,
}: {
  parts: ToolPart[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (parts.length === 0) return null;

  return (
    <div
      data-testid="step-trace"
      className={cn("not-prose my-1 w-full rounded-md border", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 p-3"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ListOrderedIcon className="size-4 text-muted-foreground" />
          Agent steps ({parts.length})
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? <StepList parts={parts} className="border-t p-3" /> : null}
    </div>
  );
}
