"use client";

import { useEffect, useRef, useState } from "react";
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
import { PageGuide } from "@/components/page-guide";
import type { ToolPart } from "@/components/ai-elements/tool";
import { loadCustomTools } from "@/lib/custom-tools";
import { loadConfig } from "@/lib/routing-rules";
import { loadBuiltinConfig } from "@/lib/builtin-tools";
import {
  type Conversation as Convo,
  loadConversations,
  saveConversations,
  loadCurrentId,
  saveCurrentId,
  newConversationId,
  titleFromMessages,
} from "@/lib/conversations";

// Each example exercises a different scenario: a tool, a model route, or the
// multi-step agent loop. Together the chips cover every routing rule and the
// step trace, so they double as a live demo of the whole stack.
const TOPICS = [
  // lookup_tax_info tool, factual-lookup route -> GPT-4o mini
  { label: "GST", hint: "lookup tool, GPT-4o mini", question: "What is the GST registration threshold?" },
  // calculate_tax_estimate tool, calculation route -> GPT-4.1
  {
    label: "Income tax",
    hint: "estimate tool, GPT-4.1",
    question: "Estimate the chargeable income for an annual income of 120000 with 20000 in deductions",
  },
  // Two tools in one turn: the agent loop chains lookup then calculate, and
  // the reply shows the numbered step trace.
  {
    label: "Multi-step",
    hint: "two tools chained, step trace",
    question:
      "What is the GST registration threshold, and calculate my chargeable income for an income of 120000 with 20000 in deductions",
  },
  // complex-reasoning route -> Claude Opus 4.8
  {
    label: "Corporate tax",
    hint: "complex reasoning, Claude Opus 4.8",
    question: "Compare the corporate income tax rate versus the top personal income tax rate",
  },
  // escalate_to_human tool, personalised-advice route -> Claude Sonnet 4.6
  {
    label: "SRS",
    hint: "escalates to a human, Claude Sonnet 4.6",
    question: "Should I contribute to SRS this year?",
  },
  // pii-sensitive route -> Claude Haiku 4.5 (NRIC keyword)
  {
    label: "PII",
    hint: "pii-sensitive route, Claude Haiku 4.5",
    question: "My NRIC is S1234567D, do I need to file a tax return?",
  },
];

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
          builtinConfig: loadBuiltinConfig(),
        },
      }),
    }),
  });

  const [conversations, setConversations] = useState<Convo[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // mobile history panel
  const qSentRef = useRef(false); // guards the ?q= deep link so it sends once

  // Load saved conversations and restore the current one.
  useEffect(() => {
    const list = loadConversations();
    const savedId = loadCurrentId();
    if (list.length > 0) {
      const current = list.find((c) => c.id === savedId) ?? list[0];
      setConversations(list);
      setCurrentId(current.id);
      setMessages(current.messages);
    } else {
      const id = newConversationId();
      const fresh: Convo = { id, title: "New chat", messages: [], updatedAt: Date.now() };
      setConversations([fresh]);
      setCurrentId(id);
      saveCurrentId(id);
    }
    setHydrated(true);
  }, [setMessages]);

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

  // Persist the active conversation when a turn settles (not mid-stream).
  useEffect(() => {
    if (!hydrated || !currentId) return;
    if (status === "submitted" || status === "streaming") return;
    setConversations((prev) => {
      const next = prev.map((c) =>
        c.id === currentId
          ? { ...c, messages, title: titleFromMessages(messages), updatedAt: Date.now() }
          : c,
      );
      saveConversations(next);
      return next;
    });
  }, [messages, status, hydrated, currentId]);

  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

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
    // If the current chat is already empty, stay on it.
    if (messages.length === 0) return;
    const id = newConversationId();
    const fresh: Convo = { id, title: "New chat", messages: [], updatedAt: Date.now() };
    setConversations((prev) => {
      const next = [fresh, ...prev];
      saveConversations(next);
      return next;
    });
    setCurrentId(id);
    saveCurrentId(id);
    setMessages([]);
  }

  function openChat(id: string) {
    setShowHistory(false);
    if (busy || id === currentId) return;
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setCurrentId(id);
    saveCurrentId(id);
    setMessages(conv.messages);
  }

  function deleteChat(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      if (id === currentId) {
        if (next.length > 0) {
          setCurrentId(next[0].id);
          saveCurrentId(next[0].id);
          setMessages(next[0].messages);
        } else {
          const fresh: Convo = {
            id: newConversationId(),
            title: "New chat",
            messages: [],
            updatedAt: Date.now(),
          };
          setCurrentId(fresh.id);
          saveCurrentId(fresh.id);
          setMessages([]);
          const seeded = [fresh];
          saveConversations(seeded);
          return seeded;
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
        aria-label="Ask a tax question"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask anything, e.g. what is the GST registration threshold?"
      />
      <PromptInputFooter>
        <span className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          General information only, not personalised tax advice.
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
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1">
      {/* History sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
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
            className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-4 pb-24 text-center"
          >
            <span className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-gold-foreground">
              Singapore tax, in plain language
            </span>
            <div className="flex flex-col gap-4">
              <h2 className="text-4xl font-semibold tracking-tight text-navy sm:text-5xl">
                Singapore tax,
                <br />
                answered.
              </h2>
              <p className="mx-auto max-w-md text-base leading-relaxed text-muted-foreground">
                Ask about GST, income tax, corporate tax, or SRS. Anything personal is
                routed to a human advisor.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {TOPICS.map((t) => (
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
            <div className="w-full max-w-xl">{composer(true)}</div>
            <PageGuide page="assistant" className="w-full max-w-xl bg-card" />
          </main>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <Conversation className="flex-1">
              <ConversationContent id="main" className="mx-auto w-full max-w-2xl gap-5 px-4 py-6">
                {messages.map((message) => (
                  <Message
                    key={message.id}
                    from={message.role}
                    data-testid="message"
                    data-role={message.role}
                    style={{ animation: "var(--animate-msg-in)" }}
                  >
                    <MessageContent>
                      {groupParts(message.parts).map((group, i) => {
                        if (group.kind === "tools") {
                          return <StepTrace key={i} parts={group.parts} />;
                        }
                        const part = group.part;
                        if (part.type === "text") {
                          return message.role === "assistant" ? (
                            <MessageResponse key={i} className="prose-chat">
                              {part.text}
                            </MessageResponse>
                          ) : (
                            <span key={i} className="whitespace-pre-wrap">
                              {part.text}
                            </span>
                          );
                        }
                        return null;
                      })}
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
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="shrink-0 px-4 py-4">
              <div className="mx-auto w-full max-w-2xl">
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
                  {TOPICS.map((t) => (
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
    </div>
  );
}
