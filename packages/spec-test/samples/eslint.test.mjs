/*
 * Self-test for the require-expect-in-spec-test rule. Lints samples/bad.test.ts
 * (one zero-assert specTest, one asserting specTest) and asserts the rule
 * flags exactly the zero-assert one. Exits 0 on success, 1 on any deviation,
 * so CI can run it directly. Run `npm run build` first (lints against dist/).
 */
import { Linter } from "eslint";
import { readFileSync } from "node:fs";
import { plugin } from "../dist/eslint-rule.js";

const linter = new Linter();
const code = readFileSync(new URL("./bad.test.ts", import.meta.url), "utf8");

const results = linter.verify(
  code,
  {
    files: ["**/*.ts"],
    plugins: { "spec-test": plugin },
    rules: { "spec-test/require-expect-in-spec-test": "error" },
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  },
  { filename: "bad.test.ts" },
);

const missing = results.filter((r) => r.messageId === "missingExpect");
if (missing.length !== 1 || !missing[0].message.includes("EX-AUTH-001")) {
  console.error(
    "FAIL: expected exactly one missingExpect error for EX-AUTH-001, got:",
  );
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log("OK: rule flagged EX-AUTH-001 (zero expect) and passed EX-AUTH-002.");
