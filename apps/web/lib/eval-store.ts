import { createJsonStore, reverseChronoId } from "./store";

/*
 * Persisted eval runs: one record per completed run, newest-first ids so the
 * history listing needs no extra sort. Evaluation is platform-wide (not scoped
 * per workspace): a single shared history (eval-runs.json locally, S3 prefix in
 * prod).
 */

export type Grader = "keyword" | "judge";

export interface EvalCaseResult {
  query: string;
  modelLabel: string;
  pass: boolean;
  score?: number;
  rationale?: string;
}

export interface EvalRun {
  id: string;
  timestamp: string;
  grader: Grader;
  promptVersion?: number;
  total: number;
  passed: number;
  /** 0-100, rounded. */
  passRate: number;
  cases: EvalCaseResult[];
}

const store = createJsonStore<EvalRun>("eval-runs");

export async function saveEvalRun(
  run: Omit<EvalRun, "id" | "timestamp">,
): Promise<EvalRun> {
  const full: EvalRun = {
    ...run,
    id: reverseChronoId(),
    timestamp: new Date().toISOString(),
  };
  await store.put(full.id, full);
  return full;
}

export async function listEvalRuns(limit = 20): Promise<EvalRun[]> {
  return store.list(limit);
}
