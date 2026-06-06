import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/*
 * Rate limiting for the public API routes. Backed by Upstash Redis when
 * configured; fails open (allows all) when it is not, so local dev and the spec
 * gate are never blocked. Provision Upstash via the Vercel/AWS marketplace and
 * set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN to activate it.
 */

let cachedRedis: Redis | null = null;

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

export interface MakeLimiterOptions {
  tokens: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  prefix?: string;
}

export function makeLimiter(opts: MakeLimiterOptions): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(opts.tokens, opts.window),
    prefix: opts.prefix ?? "ratelimit",
    analytics: true,
  });
}

/** Returns true when allowed (and when no limiter is configured). */
export async function isAllowed(
  identifier: string,
  limiter: Ratelimit | null,
): Promise<boolean> {
  if (!limiter) return true;
  const { success } = await limiter.limit(identifier);
  return success;
}

/** Best-effort client IP from proxy headers, for use as a rate-limit key. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}
