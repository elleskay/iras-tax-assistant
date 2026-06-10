import { runCustomTool, type CustomTool } from "./custom-tools";
import { runSandboxed } from "./sandbox";

/*
 * Server-side executor for all custom tool kinds. Declarative kinds delegate
 * to the pure runCustomTool; code tools run in the QuickJS sandbox. Kept out
 * of custom-tools.ts so client components that import the schemas never pull
 * the WASM module into the browser bundle.
 */
export async function executeCustomTool(
  tool: CustomTool,
  input: Record<string, unknown>,
): Promise<string> {
  if (tool.kind !== "code") return runCustomTool(tool, input);
  const res = await runSandboxed(tool.code, input);
  if (!res.ok) return `Sandbox error: ${res.error}`;
  return typeof res.result === "string"
    ? res.result
    : JSON.stringify(res.result);
}
