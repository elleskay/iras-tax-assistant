import { resetCoverage } from "@platform/spec-test";

// Vitest globalSetup runs exactly once per run, in the main process, before
// any worker starts. The reset must live here, not in setupFiles: those run
// once per test FILE, so a per-file reset deletes the entries already appended
// by earlier files (visible on low-core CI runners where files run in waves,
// hidden on many-core dev machines where all setups fire before any test
// finishes). Vitest runs first in the test:spec pipeline; Playwright then
// appends its results and the coverage gate reads the union.
export default function setup(): void {
  resetCoverage();
}
