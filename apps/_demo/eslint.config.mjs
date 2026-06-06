import { eslintPlugin as specTest } from "@platform/spec-test";

export default [
  {
    ignores: [".next/**", ".open-next/**", "node_modules/**", ".spec-coverage/**"],
  },
  {
    // Every specTest() body must contain at least one expect(), so a test can't
    // pass as a no-op and silently satisfy the coverage gate.
    files: ["tests/**/*.spec.ts"],
    plugins: { "spec-test": specTest },
    rules: { "spec-test/require-expect-in-spec-test": "error" },
  },
];
