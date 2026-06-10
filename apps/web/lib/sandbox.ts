import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import variant from "@jitl/quickjs-singlefile-cjs-release-sync";

/*
 * Secure sandbox runtime for user-written code tools. Executes JavaScript in
 * a QuickJS WASM interpreter: a separate engine with no host globals (no
 * fetch, require, process, fs) and hard limits enforced by the runtime, not
 * by convention:
 *  - wall-clock deadline via an interrupt handler (default 1s)
 *  - memory cap via setMemoryLimit (default 32MB)
 *  - bounded stack and bounded serialized output (default 8KB)
 *
 * The singlefile variant inlines the WASM into the JS module as base64, so
 * there is no separate .wasm asset to route (CLAUDE.md gotcha 10) and it
 * works the same in vitest, next build, and on Lambda. Server-side only:
 * never import this from client components (the inlined WASM is large).
 *
 * Contract: the user code must define run(input); the sandbox calls it with
 * the parsed input object and JSON-serializes the return value. A fresh
 * runtime and context are created per call and disposed in finally, so calls
 * cannot leak state into each other.
 */

export interface SandboxLimits {
  /** Wall-clock execution deadline in ms. Default 1000. */
  timeoutMs?: number;
  /** Hard memory cap in bytes. Default 32MB. */
  memoryBytes?: number;
  /** Cap on the serialized result length in characters. Default 8192. */
  maxOutputChars?: number;
}

export interface SandboxResult {
  ok: boolean;
  /** Parsed JSON result, or the truncated JSON string when truncated. */
  result?: unknown;
  error?: string;
  durationMs: number;
  truncated?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 1000;
export const DEFAULT_MEMORY_BYTES = 32 * 1024 * 1024;
export const DEFAULT_MAX_OUTPUT_CHARS = 8192;
const MAX_STACK_BYTES = 512 * 1024;
export const TRUNCATION_MARKER = "...[truncated]";

// The WASM module is expensive to instantiate; load it once per process and
// share it. Runtimes and contexts (the isolation boundary) are per-call.
let modulePromise: Promise<QuickJSWASMModule> | null = null;
function getModule(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return modulePromise;
}

export async function runSandboxed(
  code: string,
  input: unknown,
  limits: SandboxLimits = {},
): Promise<SandboxResult> {
  const timeoutMs = limits.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const memoryBytes = limits.memoryBytes ?? DEFAULT_MEMORY_BYTES;
  const maxOutputChars = limits.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

  const quickjs = await getModule();
  const started = Date.now();
  const runtime = quickjs.newRuntime();
  try {
    runtime.setMemoryLimit(memoryBytes);
    runtime.setMaxStackSize(MAX_STACK_BYTES);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(started + timeoutMs));
    const context = runtime.newContext();
    try {
      // The input crosses the boundary as a JSON string literal; the user
      // code never receives host object references.
      const program = `${code}\n;JSON.stringify(run(JSON.parse(${JSON.stringify(
        JSON.stringify(input ?? null),
      )})));`;
      const evaluated = context.evalCode(program);
      if (evaluated.error) {
        const err: unknown = context.dump(evaluated.error);
        evaluated.error.dispose();
        const message =
          typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
        return { ok: false, error: message, durationMs: Date.now() - started };
      }
      const serialized: unknown = context.dump(evaluated.value);
      evaluated.value.dispose();
      const durationMs = Date.now() - started;
      // JSON.stringify(undefined) inside the sandbox yields undefined.
      if (typeof serialized !== "string") {
        return { ok: true, result: null, durationMs };
      }
      if (serialized.length > maxOutputChars) {
        return {
          ok: true,
          result: serialized.slice(0, maxOutputChars) + TRUNCATION_MARKER,
          truncated: true,
          durationMs,
        };
      }
      return { ok: true, result: JSON.parse(serialized), durationMs };
    } finally {
      context.dispose();
    }
  } catch (err) {
    // Out-of-memory and interpreter aborts can surface as thrown errors.
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  } finally {
    runtime.dispose();
  }
}
