import "server-only";

/**
 * A small in-memory throttle in front of the login endpoints. This is the
 * per-IP layer; the durable per-account lockout lives in the database.
 *
 * Being in-memory, it resets when the serverless instance recycles. That is
 * acceptable because it is defence in depth, not the primary control. If the
 * shop ever outgrows it, swap the Map for Redis behind the same interface.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1_000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1_000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Opportunistic cleanup so the Map cannot grow without bound. */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
