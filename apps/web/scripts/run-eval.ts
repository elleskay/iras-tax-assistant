/*
 * Eval regression CLI: runs the committed suite (evals/suite.json) against the
 * live assistant stack (same system prompt, tools, and gateway as /api/chat),
 * keyword-grades the answers, and compares the pass rate to the committed
 * baseline (evals/baseline.json). Exits 1 on a regression so CI can gate PRs.
 *
 *   npm run eval               compare against the baseline
 *   npm run eval:baseline      rerun and update the baseline file
 *
 * Skips cleanly (exit 0) when ANTHROPIC_API_KEY is absent, e.g. fork PRs.
 * Run from apps/web (npm run eval does this); paths resolve from cwd.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateText, stepCountIs } from "ai";
import { resolveSystemPrompt } from "../lib/agent";
import { findModel, DEFAULT_MODEL_ID } from "../lib/model-registry";
import { gatewayModel } from "../lib/gateway";
import { taxTools } from "../lib/tools";
import { keywordGrade } from "../lib/graders";
import { compareToBaseline, DEFAULT_TOLERANCE } from "../lib/eval-baseline";

interface SuiteCase {
  query: string;
  expects: string[];
}

interface Suite {
  name: string;
  cases: SuiteCase[];
}

interface Baseline {
  passRate: number;
  updatedAt: string;
}

const SUITE_PATH = resolve("evals/suite.json");
const BASELINE_PATH = resolve("evals/baseline.json");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("run-eval: ANTHROPIC_API_KEY not set, skipping (exit 0).");
    return;
  }

  const suite: Suite = JSON.parse(readFileSync(SUITE_PATH, "utf8"));
  const entry = findModel(DEFAULT_MODEL_ID);
  if (!entry) throw new Error(`Model ${DEFAULT_MODEL_ID} not in registry.`);
  const system = await resolveSystemPrompt();

  let passed = 0;
  for (const c of suite.cases) {
    const result = await generateText({
      model: gatewayModel(entry, { route: "eval-cli" }),
      system,
      prompt: c.query,
      tools: taxTools,
      stopWhen: stepCountIs(5),
      temperature: 0,
      maxOutputTokens: 600,
    });
    const grade = keywordGrade(result.text ?? "", c.expects);
    if (grade.pass) passed += 1;
    const misses = grade.checks.filter((k) => !k.pass).map((k) => k.keyword);
    console.log(
      `${grade.pass ? "PASS" : "FAIL"}  ${c.query}` +
        (misses.length ? `  (missing: ${misses.join(", ")})` : ""),
    );
  }

  const passRate = Math.round((passed / suite.cases.length) * 100);
  console.log(`\n${suite.name}: ${passed}/${suite.cases.length} passed (${passRate}%)`);

  if (process.argv.includes("--update-baseline")) {
    const baseline: Baseline = { passRate, updatedAt: new Date().toISOString() };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`Baseline updated to ${passRate}% in evals/baseline.json.`);
    return;
  }

  const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const { regression, delta } = compareToBaseline(passRate, baseline.passRate, DEFAULT_TOLERANCE);
  console.log(
    `Baseline ${baseline.passRate}%, delta ${delta >= 0 ? "+" : ""}${delta} (tolerance ${DEFAULT_TOLERANCE}).`,
  );
  if (regression) {
    console.error("Regression: pass rate dropped more than the tolerance below baseline.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("run-eval failed:", err);
  process.exitCode = 1;
});
