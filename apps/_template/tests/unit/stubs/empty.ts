// Empty stand-in for side-effect-only imports (e.g. "server-only") under Vitest.
// Next's "server-only" package throws when loaded outside the RSC bundler, so we
// alias it to this no-op module in vitest.config.ts to unit-test server helpers.
export {};
