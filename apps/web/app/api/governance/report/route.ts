import {
  RISK_REGISTER,
  SG_FRAMEWORK_MAP,
  computeStats,
  getEffectivePolicy,
  loadPlatformActivity,
  type GovernancePolicy,
  type GovernanceStats,
} from "@/lib/governance";

export const dynamic = "force-dynamic";

/*
 * Generates an AI Risk Assessment report (Markdown) from the live policy +
 * stores, downloadable from the governance console. Demonstrates the
 * "AI Risk Assessment Framework" + governance-as-code the AIAG role asks for.
 */

function buildReport(stats: GovernanceStats, policy: GovernancePolicy): string {
  const g = policy.guardrails;
  const now = new Date().toISOString().slice(0, 10);

  const gateLine =
    stats.latestPassRate == null
      ? "no eval runs yet"
      : `${stats.latestPassRate}% (gate ≥ ${g.evalGate.threshold}%, ${stats.evalGatePass ? "PASS" : "BELOW GATE"})`;

  const risks = RISK_REGISTER.map(
    (r) => `| ${r.risk} | ${r.severity} | ${r.control} | ${r.status} |`,
  ).join("\n");

  const frameworks = SG_FRAMEWORK_MAP.map(
    (m) => `| ${m.control} | ${m.mgf} | ${m.aiVerify} |`,
  ).join("\n");

  const rules = policy.routing.rules
    .map((r) => `- \`${r.id}\`: ${r.reason} → ${r.modelId} (keywords: ${r.keywords.join(", ")})`)
    .join("\n");

  return `# AI Risk Assessment (AI Tax Assistant Platform demo)

Generated: ${now} · Policy version: ${policy.version}

> Demo report. Framework references illustrate governance alignment.

## 1. Summary (live, across all workspaces)

- Model calls observed: ${stats.totalCalls}
- Eval gate: ${gateLine}
- Calls over cost ceiling ($${g.costCeiling.usdPerCall}): ${stats.overCeiling}
- Provider fallbacks: ${stats.fallbacks}
- Total observed cost: $${stats.totalCostUsd.toFixed(4)}

## 2. Governance policy (governance-as-code)

- **PII escalation** (${g.piiEscalation.id}): ${g.piiEscalation.action}. Triggers: ${g.piiEscalation.triggers.join(", ")}.
- **Eval gate** (${g.evalGate.id}): ${g.evalGate.action} (${g.evalGate.metric} ≥ ${g.evalGate.threshold}).
- **Cost ceiling** (${g.costCeiling.id}): ${g.costCeiling.action} (> $${g.costCeiling.usdPerCall}/call).
- **Grounding** (${g.grounding.id}): ${g.grounding.rule}.

### Deterministic routing rules
${rules}
- fallback: ${policy.routing.fallbackModelId} (${policy.routing.fallbackReason})

## 3. Risk register

| Risk | Severity | Control (enforced) | Status |
|---|---|---|---|
${risks}

## 4. Alignment with Singapore's AI governance frameworks

Mapped to the IMDA/PDPC Model AI Governance Framework (incl. the 2024 Model AI Governance Framework for Generative AI) and AI Verify.

| Control | Model AI Governance Framework | AI Verify |
|---|---|---|
${frameworks}
`;
}

export async function GET() {
  const { calls, runs } = await loadPlatformActivity();
  const policy = await getEffectivePolicy();
  const stats = computeStats(
    calls,
    runs,
    policy.guardrails.costCeiling.usdPerCall,
    policy.guardrails.evalGate.threshold,
  );
  const md = buildReport(stats, policy);

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ai-risk-assessment.md"',
    },
  });
}
