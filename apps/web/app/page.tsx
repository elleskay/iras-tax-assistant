"use client";

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { Info } from "lucide-react";
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
import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { loadCustomTools } from "@/lib/custom-tools";
import { loadConfig } from "@/lib/routing-rules";
import { loadBuiltinConfig } from "@/lib/builtin-tools";

const TOPICS = [
  { label: "GST", question: "What is the GST registration threshold?" },
  { label: "Income tax", question: "When is the income tax filing deadline?" },
  { label: "Corporate tax", question: "What is the corporate tax rate in Singapore?" },
  { label: "SRS", question: "What is the SRS contribution cap?" },
];

export default function ChatPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Attach the visitor's own tools (from the Tools page) so the Assistant
      // can call them. The return value REPLACES the request body, so the full
      // payload (id, messages, trigger) must be reconstructed, not just merged.
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

  // Persist to sessionStorage so navigating to /admin and back, or a refresh,
  // does not reset the conversation. Cleared when the tab closes.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const saved = sessionStorage.getItem("iras-chat");
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        /* ignore malformed cache */
      }
    }
    setHydrated(true);
  }, [setMessages]);
  useEffect(() => {
    if (!hydrated || status === "submitted" || status === "streaming") return;
    sessionStorage.setItem("iras-chat", JSON.stringify(messages));
  }, [messages, hydrated, status]);

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
    <>
      {empty ? (
        /* Immersive landing */
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
                className="inline-flex cursor-pointer items-center rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-[filter] hover:brightness-95"
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="w-full max-w-xl">{composer(true)}</div>
        </main>
      ) : (
        /* Active conversation */
        <div className="flex min-h-0 flex-1 flex-col">
          <Conversation className="flex-1">
            <ConversationContent
              id="main"
              className="mx-auto w-full max-w-2xl gap-5 px-4 py-6"
            >
              {messages.map((message) => (
                <Message
                  key={message.id}
                  from={message.role}
                  data-testid="message"
                  data-role={message.role}
                  style={{ animation: "var(--animate-msg-in)" }}
                >
                  <MessageContent>
                    {message.parts.map((part, i) => {
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
                      if (isToolUIPart(part)) {
                        return (
                          <Tool key={i} className="my-1">
                            <ToolHeader
                              type={part.type as `tool-${string}`}
                              state={part.state}
                            />
                          </Tool>
                        );
                      }
                      return null;
                    })}
                    {message.role === "assistant" &&
                    (message as { metadata?: { model?: string } }).metadata?.model ? (
                      <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                        Routed to{" "}
                        {(message as { metadata?: { model?: string } }).metadata!.model}
                      </span>
                    ) : null}
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
              {composer(false)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
