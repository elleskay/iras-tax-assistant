#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseSpec, SpecParseError } from "./parser.js";
import { readCoverage } from "./coverage.js";
import { buildReport, renderMarkdown } from "./report.js";

interface Args {
  spec: string;
  coverage: string;
  out: string;
  strict: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    spec: "",
    coverage: ".spec-coverage/results.jsonl",
    out: "spec-coverage.md",
    strict: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--spec") args.spec = argv[++i] ?? "";
    else if (a === "--coverage") args.coverage = argv[++i] ?? args.coverage;
    else if (a === "--out") args.out = argv[++i] ?? args.out;
    else if (a === "--no-strict") args.strict = false;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  if (!args.spec) {
    console.error("error: --spec <path/to/spec.yml> is required");
    printHelp();
    process.exit(2);
  }
  return args;
}

function printHelp(): void {
  console.log(`spec-coverage --spec <path> [--coverage <path>] [--out <path>] [--no-strict]

  --spec      Path to the spec YAML file (required)
  --coverage  Path to JSONL coverage results (default: .spec-coverage/results.jsonl)
  --out       Markdown report output path (default: spec-coverage.md)
  --no-strict Exit 0 even if requirements are uncovered or failing
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  let parsed;
  try {
    parsed = parseSpec(resolve(args.spec));
  } catch (err) {
    if (err instanceof SpecParseError) {
      console.error(`spec-coverage: ${err.message}`);
      if (err.issues) {
        console.error(JSON.stringify(err.issues, null, 2));
      }
      process.exit(2);
    }
    throw err;
  }

  const entries = readCoverage(resolve(args.coverage));
  const report = buildReport(parsed.spec, entries);
  const md = renderMarkdown(parsed.spec, report);

  const outPath = resolve(args.out);
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, md, "utf8");

  console.log("");
  console.log(
    `${parsed.spec.app} v${parsed.spec.version}: ${report.coveragePct}% covered (${report.coveredRequirements}/${report.totalRequirements})`,
  );
  if (report.uncoveredRequirements.length > 0) {
    console.log(`  uncovered: ${report.uncoveredRequirements.length}`);
    for (const r of report.uncoveredRequirements.slice(0, 10)) {
      console.log(`    - ${r.id}: ${r.title}`);
    }
    if (report.uncoveredRequirements.length > 10) {
      console.log(`    ... and ${report.uncoveredRequirements.length - 10} more`);
    }
  }
  if (report.failingRequirements.length > 0) {
    console.log(`  failing: ${report.failingRequirements.length}`);
    for (const f of report.failingRequirements.slice(0, 10)) {
      console.log(`    - ${f.req.id}: ${f.req.title}`);
    }
  }
  if (report.categoryMismatches.length > 0) {
    console.log(`  category-mismatch: ${report.categoryMismatches.length}`);
  }
  console.log(`  report: ${outPath}`);

  if (args.strict && !report.passed) {
    process.exit(1);
  }
}

main();
