import { createHash } from "node:crypto";
import type pg from "pg";

/**
 * Shared, PostgreSQL-backed rate limiting (docs/BE-02-DECISIONS.md D11).
 *
 * Counters live in the database, so every instance sees the same numbers. They are written in their OWN statement
 * (autocommit, outside the caller's transaction) so a hit still counts when the request later rolls back. The key is
 * hashed before it leaves the process: the database never sees an address or a user id. If the limiter itself cannot
 * run, the error propagates and the request fails closed.
 */

export interface RateLimit {
  scope: string;
  windowSeconds: number;
  limit: number;
}

/** The limits chosen in D11. Constants, not environment settings. */
export const RATE_LIMITS = {
  agentRequests: { scope: "agent", windowSeconds: 60, limit: 120 },
  agentAuthFailures: { scope: "authfail", windowSeconds: 60, limit: 30 },
  loginStarts: { scope: "login", windowSeconds: 60, limit: 20 },
  managementWrites: { scope: "mgmt", windowSeconds: 60, limit: 60 },
  approvalDecisions: { scope: "approve", windowSeconds: 60, limit: 30 },
} as const satisfies Record<string, RateLimit>;

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const keyFor = (rule: RateLimit, subject: string): string =>
  `${rule.scope}:${createHash("sha256").update(subject, "utf8").digest("hex")}`;

export async function rateLimitHit(
  pool: pg.Pool,
  rule: RateLimit,
  subject: string,
): Promise<RateLimitDecision> {
  const result = await pool.query<{ allowed: boolean; retry_after: number }>(
    "SELECT allowed, retry_after FROM axo.rate_limit_hit($1, $2, $3)",
    [keyFor(rule, subject), rule.windowSeconds, rule.limit],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("rate limiter returned no row");
  return { allowed: row.allowed, retryAfterSeconds: row.retry_after };
}

/** True when the subject is already over the limit; counts nothing. */
export async function rateLimitExceeded(
  pool: pg.Pool,
  rule: RateLimit,
  subject: string,
): Promise<boolean> {
  const result = await pool.query<{ hits: number }>("SELECT axo.rate_limit_peek($1, $2) AS hits", [
    keyFor(rule, subject),
    rule.windowSeconds,
  ]);
  return (result.rows[0]?.hits ?? 0) >= rule.limit;
}
