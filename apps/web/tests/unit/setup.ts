import { resetCoverage } from "@platform/spec-test";
import { setupSpecCoverage } from "@platform/spec-test/vitest";

// Vitest runs first in the test:spec pipeline, so it resets the shared JSONL.
// Playwright then appends its results, and the coverage gate reads the union.
resetCoverage();
setupSpecCoverage();
