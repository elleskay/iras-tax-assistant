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

// Storage is keyed per workspace so each tax type keeps its own chat history.
const KEY = "iras-conversations";
const CURRENT_KEY = "iras-current-conv";
const MAX = 50;

const listKey = (workspace: string) => `${KEY}:${workspace}`;
const currentKey = (workspace: string) => `${CURRENT_KEY}:${workspace}`;

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

export function loadConversations(workspace: string): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(listKey(workspace)) ?? "[]");
    return Array.isArray(arr) ? (arr as Conversation[]) : [];
  } catch {
    return [];
  }
}

export function saveConversations(workspace: string, list: Conversation[]): void {
  if (typeof window === "undefined") return;
  const trimmed = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX);
  localStorage.setItem(listKey(workspace), JSON.stringify(trimmed));
}

export function loadCurrentId(workspace: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(currentKey(workspace));
}

export function saveCurrentId(workspace: string, id: string): void {
  if (typeof window !== "undefined")
    localStorage.setItem(currentKey(workspace), id);
}
