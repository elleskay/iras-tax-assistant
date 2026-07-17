/*
 * Client-side helpers for the active-workspace cookie. The cookie is the
 * tenancy signal every request carries (see lib/tenant.ts server-side), and it
 * is mirrored to localStorage for client code that reads the workspace
 * directly (lib/custom-tools.ts, lib/conversations.ts keys). Kept in one place
 * so the cookie attributes and the mirror never drift between components.
 */

export function readWorkspaceCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )workspace=([^;]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function setWorkspaceCookie(id: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `workspace=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem("workspace", id);
  } catch {
    // ignore storage failures
  }
}
