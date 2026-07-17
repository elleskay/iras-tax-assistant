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
  // These packages are loaded at runtime from node_modules instead of being
  // bundled (docs/DEPLOY.md #15): Turbopack cannot bundle the QuickJS
  // singlefile variant (its inlined WASM string trips the bundler), and shiki
  // (the highlighter behind @streamdown/code on the assistant page) ships a
  // WASM engine that gets externalized either way. Listing them makes OpenNext
  // copy the packages AND their deps into the server function; shiki is also
  // pinned as a direct dependency so it hoists to the node_modules root where
  // the external shim resolves it (nested-only broke /assistant on Lambda).
  serverExternalPackages: [
    "quickjs-emscripten-core",
    "@jitl/quickjs-singlefile-cjs-release-sync",
    "shiki",
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
