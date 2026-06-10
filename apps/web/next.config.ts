import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  // No `output: "standalone"`. OpenNext bundles the server function itself, and
  // standalone makes `next start` refuse to serve on Next 16 (which the
  // Playwright e2e webServer relies on).
  poweredByHeader: false,
  // The QuickJS sandbox packages are loaded at runtime from node_modules
  // instead of being bundled: Turbopack cannot bundle the singlefile variant
  // (its inlined WASM string trips the bundler), and the sandbox only runs
  // server-side anyway.
  serverExternalPackages: [
    "quickjs-emscripten-core",
    "@jitl/quickjs-singlefile-cjs-release-sync",
  ],
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
