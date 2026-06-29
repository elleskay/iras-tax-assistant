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

export const MAX_CUSTOM_TOOLS = 15;
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

// ---- example tools (seeded on first visit) ----

// One per kind, so a first-time visitor has something to run immediately.
// They behave exactly like user tools: editable, deletable, sent to the
// assistant. The first save (including deleting one) replaces the seed.
export const EXAMPLE_TOOLS: CustomTool[] = [
  {
    id: "example_case_status",
    kind: "lookup",
    name: "case_status",
    description: "Example lookup: what each case status means.",
    paramName: "status",
    paramDescription: "pending, under review, info requested, assessed, or closed",
    pairs: [
      { key: "pending", value: "Pending: the case has been received and is awaiting review." },
      { key: "under review", value: "Under review: an officer is actively assessing the case." },
      { key: "info requested", value: "Information requested: waiting on the taxpayer for documents or clarification." },
      { key: "assessed", value: "Assessed: an assessment or decision has been issued." },
      { key: "closed", value: "Closed: no further action is required." },
    ],
    fallback: "Known statuses: pending, under review, info requested, assessed, closed.",
  },
  {
    id: "example_due_date_reminder",
    kind: "template",
    name: "due_date_reminder",
    description: "Example template: compose a due-date reminder.",
    params: [
      { name: "name", type: "string", description: "Taxpayer name" },
      { name: "item", type: "string", description: "What is due" },
      { name: "deadline", type: "string", description: "Due date" },
    ],
    template:
      "Dear {name}, this is a reminder that your {item} is due by {deadline}. Please complete it on time to avoid late penalties.",
  },
  {
    id: "example_taxable_amount",
    kind: "code",
    name: "taxable_amount",
    description:
      "Example calculator: taxable amount = base minus deductions, floored at zero (e.g. chargeable income).",
    params: [
      { name: "base", type: "number", description: "Gross base amount (e.g. income or turnover)" },
      { name: "deductions", type: "number", description: "Total allowable deductions or reliefs" },
    ],
    code: `function run(input) {
  const base = Number(input.base) || 0;
  const deductions = Number(input.deductions) || 0;
  const taxable = Math.max(0, base - deductions);
  return { base: base, deductions: deductions, taxable: taxable };
}`,
  },
  {
    id: "example_percentage_of",
    kind: "code",
    name: "percentage_of",
    description: "Example calculator: apply a percentage (e.g. a tax rate) to an amount.",
    params: [
      { name: "amount", type: "number", description: "Base amount" },
      { name: "rate", type: "number", description: "Rate as a percentage, e.g. 9" },
    ],
    code: `function run(input) {
  const amount = Number(input.amount) || 0;
  const rate = Number(input.rate) || 0;
  const result = Math.round(amount * rate) / 100;
  return { amount: amount, rate: rate, result: result };
}`,
  },
];

// ---- localStorage (client only), scoped per workspace ----

// Example tools are seeded only for the demo workspaces; a new workspace starts
// empty and officers add tools from the Templates tab. Mirrors the seed
// workspaces in lib/workspaces.ts.
const SEED_TOOL_WORKSPACES = ["individual-income", "corporate"];

// The active workspace is mirrored to localStorage("workspace") by the workspace
// switcher, and switching reloads the page, so a fresh mount reads the right set.
function currentWorkspace(): string {
  try {
    return localStorage.getItem("workspace") || "individual-income";
  } catch {
    return "individual-income";
  }
}

// Tools are per workspace: each tax type keeps its own set.
function toolsKey(): string {
  return `iras-custom-tools:${currentWorkspace()}`;
}

export function loadCustomTools(): CustomTool[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(toolsKey());
    if (raw === null) {
      // First visit for this workspace (nothing saved): seed the examples only
      // for the demo workspaces; a new workspace starts empty.
      return SEED_TOOL_WORKSPACES.includes(currentWorkspace()) ? EXAMPLE_TOOLS : [];
    }
    const parsed = CustomToolsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Fired on the window after any save so every mounted view re-reads in sync. */
export const CUSTOM_TOOLS_CHANGED = "iras:custom-tools-changed";

export function saveCustomTools(tools: CustomTool[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(toolsKey(), JSON.stringify(tools.slice(0, MAX_CUSTOM_TOOLS)));
  window.dispatchEvent(new Event(CUSTOM_TOOLS_CHANGED));
}
