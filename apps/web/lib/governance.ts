import { DEFAULT_CONFIG, type RoutingConfig } from "./routing-rules";
import { listGatewayCalls, type GatewayCall } from "./gateway-store";
import { listEvalRuns, type EvalRun } from "./eval-store";
import { listPrompts } from "./prompt-store";
import { listWorkspaces } from "./workspaces";
import { createJsonStore } from "./store";

/*
 * Governance-as-code. The controls the assistant already enforces at runtime:
 * model routing, PII escalation, eval gating, cost limits, grounding, expressed
 * as one declarative policy object so they can be reviewed, versioned, and mapped
 * to external frameworks (IMDA/PDPC Model AI Governance Framework, AI Verify).
 *
 * This is the data the /governance console renders and the /api/governance/report
 * endpoint turns into an AI Risk Assessment. Nothing here is enforcement on its
 * own; it documents and surfaces the enforcement that lives in routing-rules.ts
 * (routing/PII), eval-store.ts (gate), and gateway-store.ts (cost/audit).
 */

export interface GovernancePolicy {
  version: string;
  updated: string;
  routing: RoutingConfig;
  guardrails: {
    piiEscalation: { id: string; triggers: string[]; action: string };
    evalGate: { id: string; metric: string; threshold: number; action: string };
    costCeiling: { id: string; usdPerCall: number; action: string };
    grounding: { id: string; rule: string };
  };
}

export const POLICY: GovernancePolicy = {
  version: "1.0.0",
  updated: "2026-06-27",
  routing: DEFAULT_CONFIG,
  guardrails: {
    piiEscalation: {
      id: "g-pii",
      triggers: ["nric", "uen", "personal financial details"],
      action:
        "detect, redact in logs, and audit. Taxpayer PII is normal in officer casework and is handled by the officer; PII is never used to route models or to auto-escalate",
    },
    evalGate: {
      id: "g-eval",
      metric: "eval pass-rate (%)",
      threshold: 80,
      action: "block promotion of a prompt version whose pass-rate is below the threshold",
    },
    costCeiling: {
      id: "g-cost",
      usdPerCall: 0.05,
      action: "flag any single model call above the ceiling in the audit log",
    },
    grounding: {
      id: "g-ground",
      rule:
        "answer with general information + citations only; never reproduce source content; always show the 'unofficial, not affiliated with IRAS' disclaimer",
    },
  },
};

// ── Risk register: standard GenAI risks mapped to the enforced control ──

export type Severity = "low" | "medium" | "high";

export interface RiskItem {
  id: string;
  risk: string;
  severity: Severity;
  control: string;
  policyRef: string;
  status: "mitigated" | "monitored";
}

export const RISK_REGISTER: RiskItem[] = [
  {
    id: "risk-pii",
    risk: "Disclosure of personal or financial data (PII) in prompts or replies",
    severity: "high",
    control: "PII detected, redacted in logs, and audited; handled by the officer, never used to route models or auto-escalate",
    policyRef: "g-pii",
    status: "mitigated",
  },
  {
    id: "risk-hallucination",
    risk: "Incorrect or fabricated tax guidance",
    severity: "high",
    control: "Eval gate (keyword + LLM-judge) blocks low-scoring prompts; answers cite sources; disclaimer shown",
    policyRef: "g-eval",
    status: "monitored",
  },
  {
    id: "risk-overreliance",
    risk: "User over-relies on AI for personalised tax advice",
    severity: "medium",
    control: "Answers framed as guidance for the officer's judgement, not a final assessment; the officer reviews every draft",
    policyRef: "g-pii",
    status: "mitigated",
  },
  {
    id: "risk-cost",
    risk: "Runaway model cost",
    severity: "medium",
    control: "Per-call cost ceiling + full per-call cost logging in the gateway",
    policyRef: "g-cost",
    status: "monitored",
  },
  {
    id: "risk-drift",
    risk: "A prompt or model change degrades quality unnoticed",
    severity: "medium",
    control: "Versioned prompts behind an activation pointer + pass-rate trend across eval runs",
    policyRef: "g-eval",
    status: "monitored",
  },
  {
    id: "risk-ip",
    risk: "Reproducing copyrighted source (IRAS) content",
    severity: "medium",
    control: "Grounding rule: facts + citations only, never reproduce source content",
    policyRef: "g-ground",
    status: "mitigated",
  },
];

// ── Mapping to Singapore's AI governance frameworks ──
// MGF = IMDA/PDPC Model AI Governance Framework (incl. the 2024 Model AI
// Governance Framework for Generative AI). AI Verify = IMDA's AI testing
// framework principles.

export interface FrameworkMap {
  control: string;
  mgf: string;
  aiVerify: string;
}

export const SG_FRAMEWORK_MAP: FrameworkMap[] = [
  {
    control: "PII detection, redaction, and audit; officer reviews every draft",
    mgf: "Human-in-the-loop / human oversight; Safety; Data governance",
    aiVerify: "Human agency & oversight; Safety; Data governance",
  },
  {
    control: "Eval gate (keyword + LLM-judge) + pass-rate trend",
    mgf: "Testing & assurance (GenAI framework)",
    aiVerify: "Repeatability & reproducibility; Robustness",
  },
  {
    control: "Gateway logging: latency, tokens, cost, provider fallback",
    mgf: "Operations management; Incident reporting (GenAI)",
    aiVerify: "Accountability; Transparency",
  },
  {
    control: "Versioned, diffable prompts behind an activation pointer",
    mgf: "Traceability & accountability",
    aiVerify: "Transparency; Explainability",
  },
  {
    control: "Deterministic, declarative routing (policy-as-code)",
    mgf: "Internal governance & accountability",
    aiVerify: "Accountability; Transparency",
  },
  {
    control: "Grounded answers: facts + citations + disclaimer",
    mgf: "Data; Content provenance & transparency (GenAI)",
    aiVerify: "Data governance; Explainability",
  },
];

// ── Live audit trail + stats, computed from the existing stores ──

export interface AuditEntry {
  ts: string;
  kind: "model-call" | "eval-run" | "prompt-version";
  workspace?: string;
  summary: string;
  detail: string;
  flag?: "fallback" | "over-ceiling";
}

/** One saved system-prompt version, tagged with its workspace, for the audit. */
export interface PromptVersionRef {
  workspace: string;
  name: string;
  version: number;
  createdAt: string;
}

/**
 * The full platform audit: every model call, eval run, and saved instruction
 * version, merged newest-first with no cap. Each is a governance-relevant event
 * the platform records automatically.
 */
export function buildAuditTrail(
  sources: {
    calls: Array<GatewayCall & { workspace?: string }>;
    runs?: EvalRun[];
    promptVersions?: PromptVersionRef[];
  },
  costCeiling: number = POLICY.guardrails.costCeiling.usdPerCall,
): AuditEntry[] {
  const fromCalls: AuditEntry[] = sources.calls.map((c) => ({
    ts: c.timestamp,
    kind: "model-call",
    workspace: c.workspace,
    summary: `Routed to ${c.modelLabel}`,
    detail: `${c.route ?? "n/a"} · ${(c.inputTokens + c.outputTokens).toLocaleString()} tok · $${c.costUsd.toFixed(4)}`,
    flag: c.fallbackUsed
      ? "fallback"
      : c.costUsd > costCeiling
        ? "over-ceiling"
        : undefined,
  }));
  const fromRuns: AuditEntry[] = (sources.runs ?? []).map((r) => ({
    ts: r.timestamp,
    kind: "eval-run",
    summary: `Eval run (${r.grader})`,
    detail: `${r.passed}/${r.total} passed · ${r.passRate}%${
      r.promptVersion !== undefined ? ` · prompt v${r.promptVersion}` : ""
    }`,
  }));
  const fromPrompts: AuditEntry[] = (sources.promptVersions ?? []).map((p) => ({
    ts: p.createdAt,
    kind: "prompt-version",
    workspace: p.workspace,
    summary: `Instruction "${p.name}" v${p.version} saved`,
    detail: "system-prompt version",
  }));
  return [...fromCalls, ...fromRuns, ...fromPrompts].sort((a, b) =>
    b.ts.localeCompare(a.ts),
  );
}

export interface GovernanceStats {
  totalCalls: number;
  latestPassRate: number | null;
  evalGatePass: boolean | null;
  overCeiling: number;
  fallbacks: number;
  totalCostUsd: number;
}

export function computeStats(
  calls: GatewayCall[],
  runs: EvalRun[],
  costCeiling: number = POLICY.guardrails.costCeiling.usdPerCall,
  evalThreshold: number = POLICY.guardrails.evalGate.threshold,
): GovernanceStats {
  const latest = runs[0];
  const latestPassRate = latest ? latest.passRate : null;
  return {
    totalCalls: calls.length,
    latestPassRate,
    evalGatePass:
      latestPassRate == null ? null : latestPassRate >= evalThreshold,
    overCeiling: calls.filter((c) => c.costUsd > costCeiling).length,
    fallbacks: calls.filter((c) => c.fallbackUsed).length,
    totalCostUsd: calls.reduce((s, c) => s + c.costUsd, 0),
  };
}

export interface ModelUsage {
  model: string;
  calls: number;
  costUsd: number;
}

/** Call volume and cost grouped by model, busiest first, for the dashboard. */
export function aggregateByModel(calls: GatewayCall[]): ModelUsage[] {
  const map = new Map<string, ModelUsage>();
  for (const c of calls) {
    const cur = map.get(c.modelLabel) ?? {
      model: c.modelLabel,
      calls: 0,
      costUsd: 0,
    };
    cur.calls += 1;
    cur.costUsd += c.costUsd;
    map.set(c.modelLabel, cur);
  }
  return [...map.values()].sort((a, b) => b.calls - a.calls);
}

/**
 * Platform-wide activity for the governance console: every workspace's recent
 * model calls (merged and tagged with their workspace name for the audit
 * trail), plus the platform-wide eval run history. Governance is uniform, so
 * this view is not tied to the selected workspace.
 */
export async function loadPlatformActivity(
  callsPerWorkspace = 200,
  runLimit = 50,
): Promise<{
  calls: Array<GatewayCall & { workspace: string }>;
  runs: EvalRun[];
  promptVersions: PromptVersionRef[];
  workspaceCount: number;
}> {
  const workspaces = await listWorkspaces();
  const perWs = await Promise.all(
    workspaces.map(async (w) => ({
      name: w.name,
      calls: await listGatewayCalls(callsPerWorkspace, w.id),
      prompts: await listPrompts(w.id),
    })),
  );
  const calls = perWs.flatMap((p) =>
    p.calls.map((c) => ({ ...c, workspace: p.name })),
  );
  const promptVersions: PromptVersionRef[] = perWs.flatMap((p) =>
    p.prompts.flatMap((rec) =>
      rec.versions.map((v) => ({
        workspace: p.name,
        name: rec.name,
        version: v.version,
        createdAt: v.createdAt,
      })),
    ),
  );
  // Eval runs are platform-wide (one shared history), so read them once.
  const runs = await listEvalRuns(runLimit);
  return { calls, runs, promptVersions, workspaceCount: workspaces.length };
}

// ── Editable policy overrides (platform-wide, persisted) ──
// The policy ships as code (POLICY above). An admin can override the tunable
// guardrail values and text through the Governance page; the override is stored
// once for the whole platform (no workspace scope) and merged over POLICY. Only
// these fields are editable in the UI; routing rules are edited on the AI Model
// Routing page.

export interface PolicyOverrides {
  costCeilingUsd?: number;
  evalGateThreshold?: number;
  piiTriggers?: string[];
  piiAction?: string;
  groundingRule?: string;
}

const policyStore = createJsonStore<PolicyOverrides>("governance-policy");
const POLICY_KEY = "current";

export async function loadPolicyOverrides(): Promise<PolicyOverrides> {
  return (await policyStore.get(POLICY_KEY)) ?? {};
}

export async function savePolicyOverrides(o: PolicyOverrides): Promise<void> {
  await policyStore.put(POLICY_KEY, o);
}

/** POLICY with any saved platform overrides applied. */
export async function getEffectivePolicy(): Promise<GovernancePolicy> {
  const o = await loadPolicyOverrides();
  const g = POLICY.guardrails;
  return {
    ...POLICY,
    guardrails: {
      ...g,
      piiEscalation: {
        ...g.piiEscalation,
        ...(o.piiTriggers ? { triggers: o.piiTriggers } : {}),
        ...(o.piiAction ? { action: o.piiAction } : {}),
      },
      evalGate: {
        ...g.evalGate,
        ...(o.evalGateThreshold != null
          ? { threshold: o.evalGateThreshold }
          : {}),
      },
      costCeiling: {
        ...g.costCeiling,
        ...(o.costCeilingUsd != null ? { usdPerCall: o.costCeilingUsd } : {}),
      },
      grounding: {
        ...g.grounding,
        ...(o.groundingRule ? { rule: o.groundingRule } : {}),
      },
    },
  };
}
