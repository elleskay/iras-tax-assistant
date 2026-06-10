import { z } from "zod";

/*
 * User-defined ("bring your own") MCP-style tools. A tool is a keyword lookup
 * table, a fixed response template with {placeholder} substitution, or a code
 * tool: a run(input) function executed server-side in the QuickJS sandbox
 * (lib/sandbox.ts) with hard time/memory/output limits. Code is NEVER
 * evaluated in the browser or on the host runtime; see lib/run-tool.ts for
 * the server-side executor. Stored per-browser in localStorage and
 * (optionally) sent to the chat API so the Assistant can call them.
 */

export const MAX_CUSTOM_TOOLS = 10;
const NAME_RE = /^[a-z][a-z0-9_]{1,40}$/;

export const ToolParamSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  type: z.enum(["string", "number"]),
  description: z.string().max(160).optional(),
});

const LookupPairSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string().min(1).max(600),
});

const Base = {
  id: z.string().min(1).max(64),
  name: z.string().regex(NAME_RE),
  description: z.string().min(1).max(300),
};

export const CustomToolSchema = z.discriminatedUnion("kind", [
  z.object({
    ...Base,
    kind: z.literal("lookup"),
    paramName: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/).default("query"),
    paramDescription: z.string().max(160).optional(),
    pairs: z.array(LookupPairSchema).min(1).max(50),
    fallback: z.string().max(400).optional(),
  }),
  z.object({
    ...Base,
    kind: z.literal("template"),
    params: z.array(ToolParamSchema).min(1).max(6),
    template: z.string().min(1).max(1000),
  }),
  z.object({
    ...Base,
    kind: z.literal("code"),
    params: z.array(ToolParamSchema).min(1).max(6),
    code: z.string().min(1).max(4000),
  }),
]);

export type CustomTool = z.infer<typeof CustomToolSchema>;
export const CustomToolsSchema = z.array(CustomToolSchema).max(MAX_CUSTOM_TOOLS);

/**
 * Run a declarative tool against an input object. Pure, deterministic, no
 * eval; safe to call anywhere. Code tools must go through executeCustomTool
 * in lib/run-tool.ts (server-side sandbox), which this never imports so the
 * client bundle stays free of the WASM module.
 */
export function runCustomTool(
  tool: CustomTool,
  input: Record<string, unknown>,
): string {
  if (tool.kind === "code") {
    return "Code tools run server-side. Use POST /api/tools/run.";
  }
  if (tool.kind === "lookup") {
    const raw = String(input[tool.paramName] ?? "").trim();
    const key = raw.toLowerCase().replace(/\s+/g, "_");
    for (const pair of tool.pairs) {
      const k = pair.key.toLowerCase().replace(/\s+/g, "_");
      if (k && (key.includes(k) || k.includes(key))) return pair.value;
    }
    return (
      tool.fallback ??
      `No match for "${raw}". Known keys: ${tool.pairs.map((p) => p.key).join(", ")}.`
    );
  }
  // template
  return tool.template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = input[name];
    return v === undefined || v === null ? `{${name}}` : String(v);
  });
}

/** The JSON-schema-ish parameter list, for display. */
export function toolParams(
  tool: CustomTool,
): { name: string; type: string; description?: string }[] {
  if (tool.kind === "lookup") {
    return [
      { name: tool.paramName, type: "string", description: tool.paramDescription },
    ];
  }
  return tool.params.map((p) => ({
    name: p.name,
    type: p.type,
    description: p.description,
  }));
}

// ---- localStorage (client only) ----

const STORAGE_KEY = "iras-custom-tools";

export function loadCustomTools(): CustomTool[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = CustomToolsSchema.safeParse(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function saveCustomTools(tools: CustomTool[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tools.slice(0, MAX_CUSTOM_TOOLS)));
}
