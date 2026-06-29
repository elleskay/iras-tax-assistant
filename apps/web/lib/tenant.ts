import { DEFAULT_WORKSPACE } from "./workspaces";

/*
 * Tenant detection. There is no auth in this demo: the active workspace is
 * resolved (in order) from an explicit `x-workspace` header, a `workspace`
 * cookie, or the default workspace. Route handlers may also accept a
 * `workspace` field in the request body and pass it through normaliseWorkspace.
 */

const SLUG = /^[a-z0-9-]{1,40}$/;

/** Validate a candidate workspace slug, falling back to the default. */
export function normaliseWorkspace(value: string | null | undefined): string {
  return value && SLUG.test(value) ? value : DEFAULT_WORKSPACE;
}

/** Resolve the active workspace for a request: header, then cookie, then default. */
export function workspaceFromRequest(req: Request): string {
  const header = req.headers.get("x-workspace");
  if (header && SLUG.test(header)) return header;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)workspace=([^;]+)/);
  if (m) {
    const v = decodeURIComponent(m[1]);
    if (SLUG.test(v)) return v;
  }
  return DEFAULT_WORKSPACE;
}

/**
 * Server-only: the active workspace from the `workspace` cookie, for server
 * components and route handlers. Falls back to the default workspace.
 */
export async function activeWorkspace(): Promise<string> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return normaliseWorkspace(jar.get("workspace")?.value);
}
