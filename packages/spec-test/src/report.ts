import type { Requirement, SpecFile } from "./schema.js";
import type { CoverageEntry } from "./coverage.js";

export interface CoverageReport {
  totalRequirements: number;
  coveredRequirements: number;
  uncoveredRequirements: Requirement[];
  failingRequirements: { req: Requirement; failingTests: CoverageEntry[] }[];
  categoryMismatches: { req: Requirement; observed: Set<string> }[];
  /** Recorded ids that exist in no spec requirement (typos, stale renames). */
  unknownIds: string[];
  coveragePct: number;
  passed: boolean;
}

// Which runner layer a spec category is expected to pass in. `security` may
// legitimately live in either layer (e.g. sandbox limits are unit-testable),
// so it accepts both.
const EXPECTED_LAYERS: Record<string, ReadonlySet<string>> = {
  data: new Set(["vitest"]),
  ui: new Set(["playwright"]),
  functional: new Set(["playwright"]),
  a11y: new Set(["playwright"]),
  security: new Set(["vitest", "playwright"]),
};

export function buildReport(
  spec: SpecFile,
  entries: CoverageEntry[],
): CoverageReport {
  const byId = new Map<string, CoverageEntry[]>();
  for (const e of entries) {
    const arr = byId.get(e.id) ?? [];
    arr.push(e);
    byId.set(e.id, arr);
  }

  const uncovered: Requirement[] = [];
  const failing: { req: Requirement; failingTests: CoverageEntry[] }[] = [];
  const categoryMismatches: { req: Requirement; observed: Set<string> }[] = [];

  for (const req of spec.requirements) {
    const hits = byId.get(req.id) ?? [];
    const passing = hits.filter((h) => h.status === "passed");
    const failures = hits.filter((h) => h.status === "failed");

    if (hits.length === 0) {
      uncovered.push(req);
      continue;
    }
    if (passing.length === 0) {
      failing.push({ req, failingTests: failures });
      continue;
    }

    // Mismatch detection considers only PASSING entries: a failing right-layer
    // test plus a passing wrong-layer test must not read as correctly covered.
    // The layer is stamped by the runner wrappers, so unlike the author-copied
    // category label it cannot trivially agree with the spec.
    const expected = EXPECTED_LAYERS[req.category];
    const passingLayers = new Set<string>(
      passing.flatMap((h) => (h.layer ? [h.layer] : [])),
    );
    const layerOk =
      !expected ||
      passingLayers.size === 0 || // pre-layer entries: cannot judge
      [...passingLayers].some((l) => expected.has(l));
    const observedCategories = new Set(
      passing.map((h) => h.category).filter((c): c is string => Boolean(c)),
    );
    const categoryOk =
      observedCategories.size === 0 || observedCategories.has(req.category);
    if (!layerOk || !categoryOk) {
      categoryMismatches.push({
        req,
        observed: passingLayers.size > 0 ? passingLayers : observedCategories,
      });
    }
  }

  const specIds = new Set(spec.requirements.map((r) => r.id));
  const unknownIds = [...byId.keys()].filter((id) => !specIds.has(id)).sort();

  const covered = spec.requirements.length - uncovered.length - failing.length;
  const total = spec.requirements.length;

  return {
    totalRequirements: total,
    coveredRequirements: covered,
    uncoveredRequirements: uncovered,
    failingRequirements: failing,
    categoryMismatches,
    unknownIds,
    coveragePct: total === 0 ? 100 : Math.round((covered / total) * 1000) / 10,
    passed:
      uncovered.length === 0 &&
      failing.length === 0 &&
      categoryMismatches.length === 0,
  };
}

export function renderMarkdown(spec: SpecFile, report: CoverageReport): string {
  const lines: string[] = [];
  lines.push(`# Spec coverage: ${spec.app} v${spec.version}`);
  lines.push("");
  lines.push(
    `**${report.coveragePct}% covered** (${report.coveredRequirements}/${report.totalRequirements} requirements passed at least one test)`,
  );
  lines.push("");

  if (report.passed) {
    lines.push("All requirements covered by passing tests.");
    lines.push("");
  }

  if (report.uncoveredRequirements.length > 0) {
    lines.push(`## Uncovered (${report.uncoveredRequirements.length})`);
    lines.push("");
    lines.push("| ID | Title | Category | Severity |");
    lines.push("|---|---|---|---|");
    for (const req of report.uncoveredRequirements) {
      lines.push(
        `| \`${req.id}\` | ${req.title} | ${req.category} | ${req.severity} |`,
      );
    }
    lines.push("");
  }

  if (report.failingRequirements.length > 0) {
    lines.push(`## Failing (${report.failingRequirements.length})`);
    lines.push("");
    lines.push("| ID | Title | Failing tests |");
    lines.push("|---|---|---|");
    for (const { req, failingTests } of report.failingRequirements) {
      lines.push(
        `| \`${req.id}\` | ${req.title} | ${failingTests.length} |`,
      );
    }
    lines.push("");
  }

  if (report.categoryMismatches.length > 0) {
    lines.push(`## Category mismatches (${report.categoryMismatches.length})`);
    lines.push("");
    lines.push(
      "The requirement's passing tests run in the wrong layer for its category (e.g. `category: ui` covered only by a Vitest unit test).",
    );
    lines.push("");
    lines.push("| ID | Spec category | Passing test layers |");
    lines.push("|---|---|---|");
    for (const m of report.categoryMismatches) {
      lines.push(
        `| \`${m.req.id}\` | ${m.req.category} | ${[...m.observed].join(", ") || "(none)"} |`,
      );
    }
    lines.push("");
  }

  if (report.unknownIds.length > 0) {
    lines.push(`## Recorded ids not in the spec (${report.unknownIds.length})`);
    lines.push("");
    lines.push(
      "Tests recorded coverage for these ids, but no requirement declares them: likely an id typo or a stale id after a spec rename. They do not fail the gate, but the intended requirement may be reported uncovered above.",
    );
    lines.push("");
    for (const id of report.unknownIds) {
      lines.push(`- \`${id}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}
