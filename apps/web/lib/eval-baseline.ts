/*
 * Baseline regression check for the eval CLI (scripts/run-eval.ts) and the CI
 * eval gate. The committed baseline (evals/baseline.json) records the expected
 * pass rate; a run is a regression only when it drops more than the tolerance
 * below it, so single-case flakiness does not block PRs.
 */

export interface BaselineComparison {
  regression: boolean;
  /** Run pass rate minus baseline pass rate (negative means worse). */
  delta: number;
}

export const DEFAULT_TOLERANCE = 10;

export function compareToBaseline(
  passRate: number,
  baselinePassRate: number,
  tolerance: number = DEFAULT_TOLERANCE,
): BaselineComparison {
  const delta = passRate - baselinePassRate;
  return { regression: delta < -tolerance, delta };
}
