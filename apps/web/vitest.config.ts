import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.spec.ts"],
    environment: "node",
    globals: false,
    reporters: ["default"],
    setupFiles: ["./tests/unit/setup.ts"],
  },
  resolve: {
    alias: {
      // "server-only" throws outside the RSC bundler; no-op it under Vitest so
      // lib/rate-limit can be unit-tested.
      "server-only": fileURLToPath(
        new URL("./tests/unit/stubs/empty.ts", import.meta.url),
      ),
      // Mirror the tsconfig "@/*" path so route handlers can be unit-tested.
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
