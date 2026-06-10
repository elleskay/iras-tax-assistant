import { specTest, expect } from "@platform/spec-test/vitest";
import { compareToBaseline, DEFAULT_TOLERANCE } from "../../lib/eval-baseline";

specTest(
  "IRAS-EVAL-007",
  "Baseline comparison flags a regression only beyond the tolerance",
  () => {
    // At or above baseline: never a regression.
    expect(compareToBaseline(100, 100)).toEqual({ regression: false, delta: 0 });
    expect(compareToBaseline(100, 80)).toEqual({ regression: false, delta: 20 });

    // Within the tolerance band: not a regression (delta is still reported).
    expect(compareToBaseline(90, 100)).toEqual({ regression: false, delta: -10 });
    expect(compareToBaseline(95, 100, 5)).toEqual({ regression: false, delta: -5 });

    // More than the tolerance below: regression.
    expect(compareToBaseline(89, 100)).toEqual({ regression: true, delta: -11 });
    expect(compareToBaseline(94, 100, 5)).toEqual({ regression: true, delta: -6 });
    expect(compareToBaseline(0, 100)).toEqual({ regression: true, delta: -100 });

    // The default tolerance is the documented 10 points.
    expect(DEFAULT_TOLERANCE).toBe(10);
  },
  { category: "data" },
);
