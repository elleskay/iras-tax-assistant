/*
 * The one definition of what a spec requirement id looks like. Previously this
 * regex was duplicated (with subtle grouping differences) across schema.ts,
 * vitest.ts, playwright.ts, and eslint-rule.ts; a drift in any copy silently
 * changed which tests were recorded or linted.
 */

/** Bare id, e.g. "TAX-CHAT-001" (spec YAML and specTest()'s first argument). */
export const BARE_SPEC_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+-\d{3,}$/;

/** Title prefix form, e.g. "[TAX-CHAT-001] streams an answer". */
export const BRACKETED_SPEC_ID_RE = /^\[([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)+-\d{3,})\]/;

/**
 * Throw at registration time when a specTest id cannot ever be recorded.
 * Silently accepting a malformed id (lowercase, 2-digit suffix, ...) runs the
 * test but never records coverage, so the gate reports the requirement
 * "uncovered" with no hint that a test exists.
 */
export function assertSpecId(id: string): void {
  if (!BARE_SPEC_ID_RE.test(id)) {
    throw new Error(
      `specTest id "${id}" does not match the required pattern ` +
        `(e.g. "TAX-CHAT-001"): uppercase segments separated by "-", ` +
        `ending in a 3+ digit number.`,
    );
  }
}
