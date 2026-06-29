"use client";

import { isToolUIPart, type UIMessage } from "ai";
import { BookOpenIcon, ListOrderedIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StepList } from "./step-trace";
import { SourceList, collectSources } from "./citations";
import type { ToolPart } from "./tool";

/*
 * Inspector panel beside the chat: the agent's tool steps for the active answer
 * on top, the cited document sources below. Clicking a [n] in the answer flashes
 * the matching source row here (see flashCite / makeCiteComponents). Reuses the
 * same StepList and SourceList the inline (mobile) rendering uses.
 */

function PanelSection({
  title,
  icon,
  count,
  className,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm font-semibold text-navy">
        <span className="text-muted-foreground">{icon}</span>
        {title}
        {count > 0 ? (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold text-secondary-foreground">
            {count}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
    </section>
  );
}

function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 py-2 text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

export function Inspector({ message }: { message: UIMessage | null }) {
  const toolParts = (message?.parts ?? []).filter(isToolUIPart) as ToolPart[];
  const sources = message ? collectSources(message.parts) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelSection
        title="Agent steps"
        icon={<ListOrderedIcon className="size-4" />}
        count={toolParts.length}
      >
        {toolParts.length ? (
          <StepList parts={toolParts} />
        ) : (
          <PanelEmpty>
            The agent&apos;s tool calls for the answer you&apos;re viewing appear
            here. Scroll the chat or click an answer to switch.
          </PanelEmpty>
        )}
      </PanelSection>
      <PanelSection
        title="Sources"
        icon={<BookOpenIcon className="size-4" />}
        count={sources.length}
        className="border-t"
      >
        {sources.length && message ? (
          <SourceList sources={sources} messageId={message.id} />
        ) : (
          <PanelEmpty>
            Document passages the answer cites appear here. Click a source to
            expand it, or a [n] in the answer to jump to it.
          </PanelEmpty>
        )}
      </PanelSection>
    </div>
  );
}
