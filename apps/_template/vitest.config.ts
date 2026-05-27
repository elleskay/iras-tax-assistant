import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.spec.ts"],
    environment: "node",
    globals: false,
    reporters: ["default"],
    setupFiles: ["./tests/unit/setup.ts"],
  },
});
