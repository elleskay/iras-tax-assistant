export {
  Requirement,
  RequirementCategory,
  RequirementSeverity,
  SpecFile,
} from "./schema.js";
export { parseSpec, SpecParseError } from "./parser.js";
export { BARE_SPEC_ID_RE, BRACKETED_SPEC_ID_RE } from "./spec-id.js";
export {
  recordCoverage,
  readCoverage,
  resetCoverage,
  getCoveragePath,
} from "./coverage.js";
export type { CoverageEntry } from "./coverage.js";
export { buildReport, renderMarkdown } from "./report.js";
export type { CoverageReport } from "./report.js";
export { plugin as eslintPlugin, requireExpectInSpecTest } from "./eslint-rule.js";
