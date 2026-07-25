import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 10;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number; // epoch ms
}

// Serverless (Vercel) function instances each get their own memory, so this
// is a best-effort per-instance cap, not a hard shared limit across the
// deployment — set UPSTASH_REDIS_REST_URL/TOKEN below for a real distributed
// limit. Good enough as the zero-infra default.
const memoryStore = new Map<string, number[]>();

function checkMemoryLimit(key: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;
  const timestamps = (memoryStore.get(key) ?? []).filter(
    (t) => t > windowStart,
  );

  if (timestamps.length >= MAX_REQUESTS) {
    memoryStore.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      reset: timestamps[0] + WINDOW_SECONDS * 1000,
    };
  }

  timestamps.push(now);
  memoryStore.set(key, timestamps);
  return {
    allowed: true,
    remaining: MAX_REQUESTS - timestamps.length,
    reset: now + WINDOW_SECONDS * 1000,
  };
}

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const upstashLimiter =
  upstashUrl && upstashToken
    ? new Ratelimit({
        redis: new Redis({ url: upstashUrl, token: upstashToken }),
        limiter: Ratelimit.slidingWindow(MAX_REQUESTS, `${WINDOW_SECONDS} s`),
        prefix: "ai-chassis:ratelimit",
      })
    : null;

// key is caller-supplied (e.g. request IP). Backed by Upstash Redis when
// UPSTASH_REDIS_REST_URL/TOKEN are set, otherwise falls back to the
// in-memory limiter above — same interface either way.
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  if (upstashLimiter) {
    const result = await upstashLimiter.limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  }
  return checkMemoryLimit(key);
}
