import { setupSpecCoverage } from "@platform/spec-test/vitest";

// Per-file setup: registers the afterEach coverage recorder. The JSONL reset
// lives in global-setup.ts (once per run); resetting here would run once per
// test file and delete entries appended by files that already finished.
setupSpecCoverage();
