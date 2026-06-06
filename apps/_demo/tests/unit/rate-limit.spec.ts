import { specTest, expect } from "@platform/spec-test/vitest";
import { makeLimiter, isAllowed } from "../../lib/rate-limit";

// DEMO-RATELIMIT-001: the prebuilt Upstash helper must fail open when no Redis
// is configured, so local dev and smoke tests are never blocked by rate limits.
specTest(
  "DEMO-RATELIMIT-001",
  "Rate limiting fails open when Upstash is not configured",
  async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const limiter = makeLimiter({ tokens: 5, window: "10 s", prefix: "test" });
    expect(limiter).toBeNull();
    expect(await isAllowed("1.2.3.4", limiter)).toBe(true);
  },
  { category: "data" },
);
