import type { UIMessage } from "ai";

/*
 * Multiple saved conversations for the assistant (chat history + new chat).
 * Stored per-browser in localStorage so they persist across visits. Each
 * conversation holds its own message list.
 */

export interface Conversation {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
}

const KEY = "iras-conversations";
const CURRENT_KEY = "iras-current-conv";
const MAX = 50;

export function newConversationId(): string {
  return `conv_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e5).toString(36)}`;
}

export function titleFromMessages(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser?.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim();
  if (!text) return "New chat";
  return text.length > 38 ? text.slice(0, 38) + "..." : text;
}

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(arr) ? (arr as Conversation[]) : [];
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]): void {
  if (typeof window === "undefined") return;
  const trimmed = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function loadCurrentId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_KEY);
}

export function saveCurrentId(id: string): void {
  if (typeof window !== "undefined") localStorage.setItem(CURRENT_KEY, id);
}
