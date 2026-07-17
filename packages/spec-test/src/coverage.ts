import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";

export interface CoverageEntry {
  id: string;
  status: "passed" | "failed";
  /** Which runner recorded the entry; stamped by the wrappers, not authors. */
  layer?: "vitest" | "playwright";
  category?: string;
  file?: string;
  durationMs?: number;
  timestamp: string;
}

// Read the env var at call time, not import time, so tests and tools that set
// SPEC_COVERAGE_FILE programmatically after import are not silently ignored.
export function getCoveragePath(): string {
  return process.env.SPEC_COVERAGE_FILE ?? ".spec-coverage/results.jsonl";
}

export function recordCoverage(entry: Omit<CoverageEntry, "timestamp">): void {
  const path = getCoveragePath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const line = JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  appendFileSync(path, line + "\n", "utf8");
}

function isValidEntry(value: unknown): value is CoverageEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    (e.status === "passed" || e.status === "failed")
  );
}

export function readCoverage(path: string = getCoveragePath()): CoverageEntry[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const entries: CoverageEntry[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    // The file is appended by multiple worker processes; a torn or corrupt
    // line must not crash the gate with a raw SyntaxError, and an entry with
    // no id/status would land requirements in nonsense buckets.
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.error(`spec-coverage: skipping corrupt coverage line: ${line.slice(0, 120)}`);
      continue;
    }
    if (!isValidEntry(parsed)) {
      console.error(`spec-coverage: skipping malformed coverage entry: ${line.slice(0, 120)}`);
      continue;
    }
    entries.push(parsed);
  }
  return entries;
}

export function resetCoverage(path: string = getCoveragePath()): void {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch (err) {
    // Race: another setup file may have unlinked it between existsSync and
    // unlinkSync. Safe to ignore ENOENT.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}
