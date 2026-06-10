import { generateObject } from "ai";
import { z } from "zod";
import { gatewayModel, type GatewayOverrides } from "./gateway";
import { findModel } from "./model-registry";

/*
 * Grading strategies for the eval harness.
 *  - keywordGrade: deterministic icontains checks (free, no model call).
 *  - judgeGrade: LLM-as-judge via generateObject against a cheap model,
 *    resolved through the gateway so judge calls are logged and costed like
 *    any other call. Fails closed: an unparseable or failed verdict grades
 *    as a fail rather than throwing or passing by default.
 */

export interface KeywordCheck {
  keyword: string;
  pass: boolean;
}

export interface KeywordGrade {
  pass: boolean;
  checks: KeywordCheck[];
}

export function keywordGrade(answer: string, expects: string[]): KeywordGrade {
  const lower = answer.toLowerCase();
  const checks = expects.map((k) => ({
    keyword: k,
    pass: lower.includes(k.toLowerCase()),
  }));
  return { pass: checks.length > 0 && checks.every((c) => c.pass), checks };
}

export const JudgeVerdictSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(100),
  rationale: z.string().max(2000),
});

export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

/** Cheap, fast model for grading; judges do not need the flagship tier. */
export const JUDGE_MODEL_ID = "claude-haiku-4-5-20251001";

export const DEFAULT_RUBRIC =
  "The answer must be factually consistent with Singapore tax rules, directly address the question, and remind the user it is general information rather than personalised advice.";

export async function judgeGrade(
  question: string,
  answer: string,
  rubric: string = DEFAULT_RUBRIC,
  overrides?: GatewayOverrides,
): Promise<JudgeVerdict> {
  const entry = findModel(JUDGE_MODEL_ID);
  if (!entry) {
    return { pass: false, score: 0, rationale: "Judge model not in registry." };
  }
  try {
    const { object } = await generateObject({
      model: gatewayModel(entry, { route: "judge" }, overrides),
      schema: JudgeVerdictSchema,
      temperature: 0,
      prompt: [
        "You are grading an AI tax assistant's answer.",
        `Rubric: ${rubric}`,
        `Question: ${question}`,
        `Answer: ${answer}`,
        "Return pass (does the answer satisfy the rubric), score (0-100), and a one-sentence rationale.",
      ].join("\n\n"),
    });
    return object;
  } catch {
    // Unparseable verdict or provider failure: fail closed.
    return {
      pass: false,
      score: 0,
      rationale: "Judge verdict unavailable or unparseable; failing closed.",
    };
  }
}
