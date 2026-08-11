import "server-only";

import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimitBuckets } from "@/lib/db/schema";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consumeRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<RateLimitResult> {
  const now = input.now ?? new Date();
  const windowStartMs = Math.floor(now.getTime() / input.windowMs) * input.windowMs;
  const windowStartedAt = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + input.windowMs * 2);
  const secret = process.env.RATE_LIMIT_SECRET ?? process.env.CRON_SECRET ?? "local-development-only";
  const key = createHash("sha256")
    .update(`${secret}:${input.scope}:${input.identifier}:${windowStartMs}`)
    .digest("hex");

  const [bucket] = await getDb()
    .insert(rateLimitBuckets)
    .values({
      key,
      scope: input.scope,
      requestCount: 1,
      windowStartedAt,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        requestCount: sql`${rateLimitBuckets.requestCount} + 1`,
        updatedAt: now,
      },
    })
    .returning({ requestCount: rateLimitBuckets.requestCount });

  const count = bucket?.requestCount ?? input.limit + 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStartMs + input.windowMs - now.getTime()) / 1_000),
  );
  return {
    allowed: count <= input.limit,
    limit: input.limit,
    remaining: Math.max(0, input.limit - count),
    retryAfterSeconds,
  };
}

export function requestIp(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || requestHeaders.get("x-real-ip") || "unknown";
}

export async function cleanupExpiredRateLimitBuckets(now = new Date()): Promise<void> {
  await getDb().delete(rateLimitBuckets).where(lt(rateLimitBuckets.expiresAt, now));
}
