import { resetCoverage } from "@platform/spec-test";
import { setupSpecCoverage } from "@platform/spec-test/vitest";

resetCoverage();
// Register the afterEach hook that records each [SPEC-ID] test outcome.
// Without this, Vitest spec coverage is never written to the JSONL.
setupSpecCoverage();
