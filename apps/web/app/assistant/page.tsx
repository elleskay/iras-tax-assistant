"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { Info, Plus, MessageSquare, Trash2 } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { StepTrace } from "@/components/ai-elements/step-trace";
import {
  Citations,
  collectSources,
  flashCite,
  linkifyCitations,
  makeCiteComponents,
} from "@/components/ai-elements/citations";
import { Inspector } from "@/components/ai-elements/inspector";
import { useResizableWidth, ResizeHandle } from "@/components/resizable";
import type { ToolPart } from "@/components/ai-elements/tool";
import { loadCustomTools } from "@/lib/custom-tools";
import { loadConfig } from "@/lib/routing-rules";
import { cn } from "@/lib/utils";
import {
  type Conversation as Convo,
  loadConversations,
  saveConversations,
  loadCurrentId,
  saveCurrentId,
  newConversationId,
  titleFromMessages,
} from "@/lib/conversations";

// Example chips: each exercises a different scenario (a tool, a model route, or
// the multi-step agent loop), framed as an officer's task: get a cited answer,
// draft a reply for review, or triage a case. The set is per workspace so each
// tax type's chips ask about its own subject matter (and hit its own documents).
interface Topic {
  label: string;
  hint: string;
  question: string;
}

const TOPICS_BY_WORKSPACE: Record<string, Topic[]> = {
  "individual-income": [
    {
      label: "Cited answer",
      hint: "grounded, with source",
      question:
        "What income level makes filing a tax return mandatory, and what is the e-filing deadline? Keep it short and cite the source.",
    },
    {
      label: "Cross-check",
      hint: "pulls from several documents",
      question:
        "A foreigner worked in Singapore for about 100 days last year and earned $90,000. First check whether she is a tax resident, then check whether her income means she must file a return. Cite the guidance for each.",
    },
    {
      label: "Estimate",
      hint: "calculation + cited check",
      question:
        "Estimate the chargeable income for a taxpayer with $120,000 income and $20,000 in reliefs, then confirm the $20,000 is within the personal relief cap, citing it.",
    },
    {
      label: "Multi-step",
      hint: "tools chained, step trace",
      question:
        "A taxpayer earns $120,000 with $20,000 in reliefs and asks whether they must register for GST. Look up the GST threshold, estimate their chargeable income, and confirm the income at which they must file a return, citing our guidance.",
    },
    {
      label: "Draft a reply",
      hint: "review-ready draft, cited",
      question:
        "Draft a reply for my review to a taxpayer who asks whether they must file a return if their only income last year was employment income. Ground it in our guidance and cite it.",
    },
    {
      label: "Triage + PII",
      hint: "summary, flags, real case data",
      question:
        "Triage this case: taxpayer with NRIC S1234567A disputes their $85,000 rental income assessment, was overseas for about 100 days last year, and is missing some documents. Summarise it, flag what needs my attention, and cite the relevant guidance.",
    },
  ],
  corporate: [
    {
      label: "Cited answer",
      hint: "grounded, with source",
      question:
        "What is the corporate income tax rate, and when is the annual corporate income tax return due? Keep it short and cite the source.",
    },
    {
      label: "Cross-check",
      hint: "pulls from several documents",
      question:
        "A company's financial year ended on 31 December. First check when its ECI is due, then check which return form it files if its annual revenue is $4 million. Cite the guidance for each.",
    },
    {
      label: "Estimate",
      hint: "calculation + cited check",
      question:
        "Estimate a company's chargeable income from $800,000 of profit with $150,000 of deductible expenses, then confirm the corporate tax rate that applies, citing it.",
    },
    {
      label: "Multi-step",
      hint: "tools chained, step trace",
      question:
        "A company with $1,000,000 revenue expects $250,000 in chargeable income. Look up the corporate tax rate, estimate the tax payable, and confirm which return form it must file, citing our guidance.",
    },
    {
      label: "Draft a reply",
      hint: "review-ready draft, cited",
      question:
        "Draft a reply for my review to a company asking when its YA 2026 corporate income tax return is due and how to file it. Ground it in our guidance and cite it.",
    },
    {
      label: "Triage + PII",
      hint: "summary, flags, real case data",
      question:
        "Triage this case: company with UEN 201912345A disputes part of its assessment and wants to carry forward unutilised trade losses, but is missing supporting documents. Summarise it, flag what needs my attention, and cite the relevant guidance.",
    },
  ],
};

// Custom workspaces fall back to the individual-income set.
const topicsFor = (ws: string): Topic[] =>
  TOPICS_BY_WORKSPACE[ws] ?? TOPICS_BY_WORKSPACE["individual-income"];

// Group a message's parts so consecutive tool invocations render as one
// numbered step trace (the agent loop made visible) between text segments.
type AnyPart = UIMessage["parts"][number];
type PartGroup =
  | { kind: "tools"; parts: ToolPart[] }
  | { kind: "other"; part: AnyPart };

function groupParts(parts: AnyPart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  for (const part of parts) {
    // Step boundaries are markers, not content. Skipping them keeps a chain
    // of tool calls (one per step) in a single numbered trace.
    if (part.type === "step-start") continue;
    if (isToolUIPart(part)) {
      const last = groups[groups.length - 1];
      if (last?.kind === "tools") last.parts.push(part);
      else groups.push({ kind: "tools", parts: [part] });
    } else {
      groups.push({ kind: "other", part });
    }
  }
  return groups;
}

interface ReplyMetadata {
  model?: string;
  usage?: { input: number; output: number };
  costUsd?: number;
}

/** "Thinking" label with bouncing dots, shown where the answer will type out. */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span>Thinking</span>
      <span aria-hidden className="inline-flex items-end gap-1">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="size-1.5 rounded-full bg-current"
            style={{
              animation: "typing-dot 1s ease-in-out infinite",
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </span>
    </span>
  );
}

/** The active workspace (client-side), used to scope saved chat history. */
function activeWorkspace(): string {
  if (typeof window === "undefined") return "individual-income";
  return localStorage.getItem("workspace") || "individual-income";
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => ({
        body: {
          id,
          messages,
          trigger,
          messageId,
          ...body,
          customTools: loadCustomTools(),
          routingConfig: loadConfig(),
          workspace:
            (typeof window !== "undefined" &&
              localStorage.getItem("workspace")) ||
            undefined,
        },
      }),
    }),
  });

  const [conversations, setConversations] = useState<Convo[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("individual-income"); // for the per-workspace chips
  const [showHistory, setShowHistory] = useState(false); // mobile history panel
  const [activeMsgId, setActiveMsgId] = useState(""); // answer shown in the inspector
  const [isWide, setIsWide] = useState(false); // xl+: steps/sources move to the side panel
  const qSentRef = useRef(false); // guards the ?q= deep link so it sends once
  const startNewRef = useRef<boolean | null>(null); // decide restore-vs-fresh once
  // Officer-adjustable panel widths (persisted).
  const history = useResizableWidth("iras-history-width", 256, 200, 440, "right");
  const inspector = useResizableWidth("iras-inspector-width", 360, 280, 560, "left");

  // Load saved conversations and restore the current one. Only conversations
  // with messages are kept, so legacy empty "New chat" entries are dropped.
  useEffect(() => {
    const ws = activeWorkspace();
    let list = loadConversations(ws).filter((c) => c.messages.length > 0);
    // One-time migration: fold the old shared history into this workspace so
    // existing chats are not lost when history became per-workspace.
    if (list.length === 0) {
      try {
        const legacy = localStorage.getItem("iras-conversations");
        if (legacy) {
          const parsed: unknown = JSON.parse(legacy);
          if (Array.isArray(parsed)) {
            list = (parsed as Convo[]).filter((c) => c.messages.length > 0);
          }
          localStorage.removeItem("iras-conversations");
          localStorage.removeItem("iras-current-conv");
        }
      } catch {
        // ignore malformed legacy data
      }
    }
    // A fresh start begins a new chat instead of resuming the last one (the
    // history list is still kept). Triggered by Open workspace (?new=1) or by
    // the Assistant nav link (which sets the iras-new-chat flag). The decision
    // is made once and cached so React's dev double-invoke of this effect does
    // not fall back to restoring after the flag/query has been consumed.
    let startNew: boolean;
    if (startNewRef.current !== null) {
      startNew = startNewRef.current;
    } else {
      startNew = new URLSearchParams(window.location.search).get("new") === "1";
      try {
        if (sessionStorage.getItem("iras-new-chat") === "1") startNew = true;
      } catch {
        // ignore
      }
      startNewRef.current = startNew;
      if (startNew) {
        try {
          sessionStorage.removeItem("iras-new-chat");
        } catch {
          // ignore
        }
        window.history.replaceState(null, "", "/assistant");
      }
    }
    const savedId = loadCurrentId(ws);
    if (list.length > 0 && !startNew) {
      const current = list.find((c) => c.id === savedId) ?? list[0];
      setConversations(list);
      setCurrentId(current.id);
      setMessages(current.messages);
    } else {
      const id = newConversationId();
      setConversations(list);
      setCurrentId(id);
      saveCurrentId(ws, id);
    }
    saveConversations(ws, list); // rewrite storage without any empty chats
    setHydrated(true);
  }, [setMessages]);

  // Pick the example chips for the active workspace (after mount, so the first
  // client render still matches the server's default-workspace HTML).
  useEffect(() => {
    setWorkspaceId(activeWorkspace());
  }, []);

  // Deep link: a "?q=" from the landing examples asks the question automatically.
  useEffect(() => {
    if (!hydrated || qSentRef.current) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && q.trim()) {
      qSentRef.current = true;
      window.history.replaceState(null, "", "/assistant");
      sendMessage({ text: q.trim() });
    }
  }, [hydrated, sendMessage]);

  // Persist the active conversation when a turn settles (not mid-stream). An
  // empty chat is never saved; it joins the history on its first message.
  useEffect(() => {
    if (!hydrated || !currentId) return;
    if (status === "submitted" || status === "streaming") return;
    if (messages.length === 0) return;
    const ws = activeWorkspace();
    setConversations((prev) => {
      const entry: Convo = {
        id: currentId,
        title: titleFromMessages(messages),
        messages,
        updatedAt: Date.now(),
      };
      const next = prev.some((c) => c.id === currentId)
        ? prev.map((c) => (c.id === currentId ? entry : c))
        : [entry, ...prev];
      saveConversations(ws, next);
      return next;
    });
  }, [messages, status, hydrated, currentId]);

  // The inspector panel only replaces the inline trace/sources on xl+ screens,
  // where there is room for nav + history + chat + panel without cramping.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  // Show a "thinking" indicator while a turn is in flight but the answer text
  // has not started streaming yet (waiting, or running tools).
  const lastMsg = messages[messages.length - 1];
  const answerStarted =
    lastMsg?.role === "assistant" &&
    lastMsg.parts.some((p) => p.type === "text" && p.text.trim().length > 0);
  const showThinking = busy && !answerStarted;

  // The inspector follows the latest answer; a citation click can focus an
  // earlier one. Reset to the latest whenever a new assistant message arrives.
  let lastAssistantId = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantId = messages[i].id;
      break;
    }
  }
  useEffect(() => {
    if (lastAssistantId) setActiveMsgId(lastAssistantId);
  }, [lastAssistantId]);
  const activeMessage =
    messages.find((m) => m.id === activeMsgId) ?? null;

  // A [n] citation click: focus that answer in the panel, then flash source n.
  const onCite = useCallback((msgId: string, n: number) => {
    setActiveMsgId(msgId);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => flashCite(`cite-${msgId}-${n}`)),
    );
  }, []);

  // Scroll spy: as the officer scrolls the chat, the panel follows the answer in
  // the reading area (the lowest answer whose top has passed a focus line), or
  // the latest answer when scrolled to the bottom.
  useEffect(() => {
    if (!isWide || empty) return;
    const firstMsg = document.querySelector("[data-assistant-id]");
    if (!firstMsg) return;
    let raf = 0;
    const compute = (sc: HTMLElement) => {
      raf = 0;
      if (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80) {
        if (lastAssistantId) setActiveMsgId(lastAssistantId);
        return;
      }
      const focusY = 180;
      let id = "";
      for (const el of document.querySelectorAll<HTMLElement>(
        "[data-assistant-id]",
      )) {
        if (el.getBoundingClientRect().top <= focusY) {
          id = el.dataset.assistantId ?? "";
        } else break;
      }
      if (id) setActiveMsgId(id);
    };
    const onScroll = (e: Event) => {
      const sc = e.target;
      if (!(sc instanceof HTMLElement) || !sc.contains(firstMsg)) return;
      if (raf) return;
      raf = requestAnimationFrame(() => compute(sc));
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isWide, empty, messages.length, lastAssistantId]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput("");
  }
  function handleSubmit(message: PromptInputMessage) {
    submit(message.text ?? input);
  }

  function newChat() {
    setShowHistory(false);
    if (busy) return;
    // If the current chat is already empty, stay on it. The new empty chat is
    // not added to history; it appears once its first message is sent.
    if (messages.length === 0) return;
    const id = newConversationId();
    setCurrentId(id);
    saveCurrentId(activeWorkspace(), id);
    setMessages([]);
  }

  // Clicking "Assistant" in the nav while already on this page starts a fresh
  // chat (the nav dispatches iras:new-chat). A ref keeps the latest newChat so
  // the once-registered listener always sees current state.
  const newChatRef = useRef(newChat);
  newChatRef.current = newChat;
  useEffect(() => {
    const onNew = () => {
      try {
        sessionStorage.removeItem("iras-new-chat");
      } catch {
        // ignore
      }
      newChatRef.current();
    };
    window.addEventListener("iras:new-chat", onNew);
    return () => window.removeEventListener("iras:new-chat", onNew);
  }, []);

  function openChat(id: string) {
    setShowHistory(false);
    if (busy || id === currentId) return;
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setCurrentId(id);
    saveCurrentId(activeWorkspace(), id);
    setMessages(conv.messages);
  }

  function deleteChat(id: string) {
    const ws = activeWorkspace();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(ws, next);
      if (id === currentId) {
        if (next.length > 0) {
          setCurrentId(next[0].id);
          saveCurrentId(ws, next[0].id);
          setMessages(next[0].messages);
        } else {
          // Deleting the last conversation leaves an empty chat, not saved.
          const id = newConversationId();
          setCurrentId(id);
          saveCurrentId(ws, id);
          setMessages([]);
          saveConversations(ws, []);
          return [];
        }
      }
      return next;
    });
  }

  const composer = (large: boolean) => (
    <PromptInput
      onSubmit={handleSubmit}
      className={large ? "rounded-2xl border shadow-sm" : "rounded-xl border"}
    >
      <PromptInputTextarea
        aria-label="Ask the assistant"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about the rules, draft a reply, or triage a case..."
      />
      <PromptInputFooter>
        <span className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          General guidance for the officer&apos;s judgement, not a final assessment.
        </span>
        <PromptInputSubmit
          aria-label="Send"
          status={status}
          disabled={busy || input.trim().length === 0}
        />
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 w-full">
      {/* History sidebar */}
      <aside
        style={{ width: history.width }}
        className="hidden shrink-0 flex-col border-r bg-card md:flex"
      >
        <div className="p-3">
          <button
            type="button"
            onClick={newChat}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New chat
          </button>
        </div>
        <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          History
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {conversations.map((c) => (
                <li key={c.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => openChat(c.id)}
                    aria-current={c.id === currentId ? "true" : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                      c.id === currentId
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.title || "New chat"}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${c.title || "chat"}`}
                    onClick={() => deleteChat(c.id)}
                    className="ml-0.5 rounded-md p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      <ResizeHandle
        onPointerDown={history.onPointerDown}
        className="hidden md:block"
      />

      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile chat bar: history toggle + new chat */}
        <div className="flex items-center justify-between border-b px-4 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-foreground"
          >
            <MessageSquare className="h-4 w-4" /> History
          </button>
          <button
            type="button"
            onClick={newChat}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-foreground"
          >
            <Plus className="h-4 w-4" /> New chat
          </button>
        </div>
        {showHistory ? (
          <div className="max-h-64 overflow-y-auto border-b bg-card p-2 md:hidden">
            {conversations.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">No conversations yet.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {conversations.map((c) => (
                  <li key={c.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => openChat(c.id)}
                      aria-current={c.id === currentId ? "true" : undefined}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                        c.id === currentId
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{c.title || "New chat"}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${c.title || "chat"}`}
                      onClick={() => deleteChat(c.id)}
                      className="ml-0.5 rounded-md p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {empty ? (
          <main
            id="main"
            className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-8 px-4 pt-24 pb-24 text-center"
          >
            <span className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-gold-foreground">
              An assistant for tax officers
            </span>
            <div className="flex flex-col gap-4">
              <h2 className="text-4xl font-semibold tracking-tight text-navy sm:text-5xl">
                Answers from your own documents.
              </h2>
              <p className="mx-auto max-w-md text-base leading-relaxed text-muted-foreground">
                Ask about the rules, draft a reply for your review, or triage a
                case. Every answer is grounded in this workspace&apos;s documents,
                with citations.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {topicsFor(workspaceId).map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => submit(t.question)}
                  title={t.question}
                  className="inline-flex cursor-pointer flex-col items-center rounded-xl bg-secondary px-4 py-2 text-center transition-[filter] hover:brightness-95"
                >
                  <span className="text-sm font-medium text-secondary-foreground">{t.label}</span>
                  <span className="text-[11px] text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>
            <div className="w-full max-w-3xl">{composer(true)}</div>
          </main>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <Conversation className="flex-1">
              <ConversationContent id="main" className="mx-auto w-full max-w-4xl gap-5 px-4 py-6">
                {messages.map((message) => {
                  // Cited sources for this answer, so inline [n] markers can be
                  // linkified to the matching source in the Sources block.
                  const citeNums =
                    message.role === "assistant"
                      ? new Set(collectSources(message.parts).map((s) => s.n))
                      : new Set<number>();
                  const citeComponents =
                    citeNums.size > 0
                      ? makeCiteComponents(message.id, onCite)
                      : undefined;
                  // On xl, an answer can be clicked to show its steps/sources in
                  // the panel (works when there is nothing to scroll). The active
                  // one carries a left accent so it is clear which is shown.
                  const selectable = isWide && message.role === "assistant";
                  const isActiveAnswer = selectable && message.id === activeMsgId;
                  return (
                  <Message
                    key={message.id}
                    from={message.role}
                    data-testid="message"
                    data-role={message.role}
                    data-assistant-id={
                      message.role === "assistant" ? message.id : undefined
                    }
                    onClick={
                      selectable ? () => setActiveMsgId(message.id) : undefined
                    }
                    className={cn(
                      selectable &&
                        "cursor-pointer border-l-2 border-transparent pl-3 transition-colors hover:border-border",
                      isActiveAnswer && "border-primary/60",
                    )}
                    style={{ animation: "var(--animate-msg-in)" }}
                  >
                    <MessageContent>
                      {groupParts(message.parts).map((group, i) => {
                        if (group.kind === "tools") {
                          // On xl+ the trace lives in the side panel.
                          return isWide ? null : (
                            <StepTrace key={i} parts={group.parts} />
                          );
                        }
                        const part = group.part;
                        if (part.type === "text") {
                          return message.role === "assistant" ? (
                            <MessageResponse
                              key={i}
                              className="prose-chat"
                              components={citeComponents}
                            >
                              {linkifyCitations(part.text, citeNums)}
                            </MessageResponse>
                          ) : (
                            <span key={i} className="whitespace-pre-wrap">
                              {part.text}
                            </span>
                          );
                        }
                        return null;
                      })}
                      {message.role === "assistant" &&
                      message.id === lastMsg?.id &&
                      showThinking ? (
                        <ThinkingDots />
                      ) : null}
                      {message.role === "assistant" && !isWide ? (
                        <Citations parts={message.parts} messageId={message.id} />
                      ) : null}
                      {(() => {
                        if (message.role !== "assistant") return null;
                        const meta = (message as { metadata?: ReplyMetadata }).metadata;
                        if (!meta?.model) return null;
                        const tokens = meta.usage
                          ? meta.usage.input + meta.usage.output
                          : null;
                        return (
                          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                            Routed to {meta.model}
                            {tokens !== null ? ` · ${tokens.toLocaleString()} tokens` : ""}
                            {typeof meta.costUsd === "number"
                              ? ` · $${meta.costUsd.toFixed(4)}`
                              : ""}
                          </span>
                        );
                      })()}
                    </MessageContent>
                  </Message>
                  );
                })}
                {showThinking && lastMsg?.role !== "assistant" ? (
                  <Message
                    from="assistant"
                    data-testid="thinking"
                    style={{ animation: "var(--animate-msg-in)" }}
                  >
                    <MessageContent>
                      <ThinkingDots />
                    </MessageContent>
                  </Message>
                ) : null}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="shrink-0 px-4 py-4">
              <div className="mx-auto w-full max-w-4xl">
                {error ? (
                  <p
                    role="alert"
                    className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    Something went wrong reaching the assistant. Please try again.
                  </p>
                ) : null}
                {/* Scenario chips stay available mid-chat so each one can be
                    tried in the same conversation. */}
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {topicsFor(workspaceId).map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => submit(t.question)}
                      title={`${t.question} (${t.hint})`}
                      className="cursor-pointer rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-[filter] hover:brightness-95"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {composer(false)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inspector: agent steps + cited sources for the active answer (xl+) */}
      {isWide ? (
        <>
          <ResizeHandle onPointerDown={inspector.onPointerDown} />
          <aside
            style={{ width: inspector.width }}
            className="flex shrink-0 flex-col border-l bg-card"
          >
            <Inspector message={activeMessage} />
          </aside>
        </>
      ) : null}
    </div>
  );
}
