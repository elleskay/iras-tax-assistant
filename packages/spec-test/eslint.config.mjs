import tseslint from "typescript-eslint";

// Minimal flat config so `npm run lint` (eslint src) runs. The package ships
// type definitions and an AST-walking ESLint rule, so a few escape hatches are
// expected; keep linting light rather than churn the existing source.
export default tseslint.config(
  { ignores: ["dist/**", "samples/**"] },
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
