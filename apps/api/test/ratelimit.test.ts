import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../src/db/pool";
import { buildApp } from "../src/http/app";
import { RATE_LIMITS, rateLimitExceeded, rateLimitHit, type RateLimit } from "../src/ratelimit";
import { createHumanWorld, newUser, type HumanWorld } from "./support/human";
import { idem, leadBody } from "./support/world";

/**
 * Rate limiting (docs/BE-02-DECISIONS.md D11): shared in PostgreSQL, keyed by hashed subjects, counted even when the
 * request later fails, and failing closed when the limiter itself is unavailable.
 */

let h: HumanWorld;
beforeAll(async () => {
  h = await createHumanWorld();
});
afterAll(async () => {
  await h.close();
});
const w = () => h.world;
const rule = (limit: number, windowSeconds = 60): RateLimit => ({
  scope: `t${randomBytes(3).toString("hex")}`,
  limit,
  windowSeconds,
});

describe("the limiter", () => {
  it("allows up to the limit, then refuses with a sensible wait, without counting refused hits against anyone else", async () => {
    const r = rule(3);
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push(await rateLimitHit(w().agentPool, r, "alice"));
    expect(outcomes.map((o) => o.allowed)).toEqual([true, true, true, false, false]);
    expect(outcomes[3]?.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(outcomes[3]?.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect((await rateLimitHit(w().agentPool, r, "bob")).allowed).toBe(true);
    expect(
      (await rateLimitHit(w().agentPool, { ...r, scope: `${r.scope}x` }, "alice")).allowed,
    ).toBe(true);
  });

  it("starts a new window when the old one has passed", async () => {
    const r = rule(1, 60);
    expect((await rateLimitHit(w().agentPool, r, "carol")).allowed).toBe(true);
    expect((await rateLimitHit(w().agentPool, r, "carol")).allowed).toBe(false);
    const admin = await w().db.admin();
    await admin.query(
      "UPDATE axo.rate_limit_counters SET window_start = now() - interval '2 minutes' WHERE key LIKE $1",
      [`${r.scope}:%`],
    );
    expect((await rateLimitHit(w().agentPool, r, "carol")).allowed).toBe(true);
  });

  it("is exact under concurrency: 60 simultaneous hits against a limit of 10 allow exactly 10", async () => {
    const r = rule(10);
    const results = await Promise.all(
      Array.from({ length: 60 }, () => rateLimitHit(w().agentPool, r, "dave")),
    );
    expect(results.filter((x) => x.allowed)).toHaveLength(10);
  });

  it("peeks without counting", async () => {
    const r = rule(2);
    for (let i = 0; i < 5; i++)
      expect(await rateLimitExceeded(w().agentPool, r, "erin")).toBe(false);
    await rateLimitHit(w().agentPool, r, "erin");
    await rateLimitHit(w().agentPool, r, "erin");
    expect(await rateLimitExceeded(w().agentPool, r, "erin")).toBe(true);
  });

  it("never stores the subject it counts (no addresses, ids or keys in the table)", async () => {
    const r = rule(5);
    const subject = "203.0.113.77-and-a-user@example.test";
    await rateLimitHit(w().agentPool, r, subject);
    const admin = await w().db.admin();
    const rows = await admin.query("SELECT key FROM axo.rate_limit_counters WHERE key LIKE $1", [
      `${r.scope}:%`,
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].key).toMatch(new RegExp(`^${r.scope}:[0-9a-f]{64}$`));
    expect(JSON.stringify(rows.rows)).not.toMatch(/203\.0\.113|example\.test/);
  });

  it("fails closed: when the limiter cannot run, the caller gets an error, never a free pass", async () => {
    const dead = createPool("postgres://nobody:nothing@127.0.0.1:1/none", "dead");
    await expect(rateLimitHit(dead, rule(5), "frank")).rejects.toThrow();
    await dead.end().catch(() => undefined);
  });

  it("is not reachable as a table: the agent and management roles cannot read or reset counters directly", async () => {
    for (const pool of [w().agentPool, w().managementPool]) {
      await expect(pool.query("SELECT * FROM axo.rate_limit_counters")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(pool.query("DELETE FROM axo.rate_limit_counters")).rejects.toMatchObject({
        code: "42501",
      });
    }
  });
});

describe("agent API limits", () => {
  it("limits one agent's requests per minute without affecting another agent", async () => {
    const org = await w().freshOrg();
    const noisy = await w().newAgent(org, org.dev);
    const quiet = await w().newAgent(org, org.dev);
    const limit = RATE_LIMITS.agentRequests.limit;
    const kinds: string[] = [];
    for (let i = 0; i < limit + 3; i++)
      kinds.push((await w().submit(noisy.key, leadBody(), idem())).kind);
    expect(kinds.slice(0, limit).every((k) => k === "decided")).toBe(true);
    expect(kinds.slice(limit)).toEqual(["rate_limited", "rate_limited", "rate_limited"]);
    expect((await w().submit(quiet.key, leadBody(), idem())).kind).toBe("decided");
  });

  it("does not let someone without the secret use up an agent's allowance", async () => {
    const org = await w().freshOrg();
    const agent = await w().newAgent(org, org.dev);
    const wrong = `${agent.key.slice(0, -4)}AAAA`;
    for (let i = 0; i < RATE_LIMITS.agentRequests.limit + 20; i++) {
      expect((await w().submit(wrong, leadBody(), idem())).kind).toBe("unauthenticated");
    }
    expect((await w().submit(agent.key, leadBody(), idem())).kind).toBe("decided");
  });

  it("slows down a source address that keeps failing to authenticate, before doing any work for it", async () => {
    const app = buildApp({
      agentPool: w().agentPool,
      pepper: w().pepper,
      dataKeys: w().dataKeys,
      logger: false,
    });
    await app.ready();
    try {
      const attempt = (address: string, authorization = "Bearer nope") =>
        app.inject({
          method: "POST",
          url: "/v1/action-requests",
          remoteAddress: address,
          headers: { authorization, "idempotency-key": idem(), "content-type": "application/json" },
          payload: "{}",
        });
      const codes: number[] = [];
      for (let i = 0; i < RATE_LIMITS.agentAuthFailures.limit + 5; i++)
        codes.push((await attempt("198.51.100.9")).statusCode);
      expect(codes.slice(0, RATE_LIMITS.agentAuthFailures.limit).every((c) => c === 401)).toBe(
        true,
      );
      expect(new Set(codes.slice(RATE_LIMITS.agentAuthFailures.limit))).toEqual(new Set([429]));
      const refused = await attempt("198.51.100.9");
      expect(refused.headers["retry-after"]).toBe("60");
      expect((await attempt("198.51.100.10")).statusCode).toBe(401); // a different source is unaffected

      // A legitimate agent on its own address is unaffected.
      const org = await w().freshOrg();
      const agent = await w().newAgent(org, org.dev);
      const ok = await app.inject({
        method: "GET",
        url: "/v1/action-requests/11111111-1111-4111-8111-111111111111",
        remoteAddress: "198.51.100.11",
        headers: { authorization: `Bearer ${agent.key}` },
      });
      expect(ok.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe("management API limits", () => {
  it("limits sign-in starts per address", async () => {
    const address = "192.0.2.50";
    const codes: number[] = [];
    for (let i = 0; i < RATE_LIMITS.loginStarts.limit + 3; i++)
      codes.push((await h.browser().get("/auth/login", { remoteAddress: address })).status);
    expect(codes.slice(0, RATE_LIMITS.loginStarts.limit).every((c) => c === 302)).toBe(true);
    expect(new Set(codes.slice(RATE_LIMITS.loginStarts.limit))).toEqual(new Set([429]));
    expect((await h.browser().get("/auth/login", { remoteAddress: "192.0.2.51" })).status).toBe(
      302,
    );
  });

  it("limits writes per session, counts rejected writes, and does not limit other people", async () => {
    const keyA = `limit-a-${randomBytes(3).toString("hex")}`;
    const keyB = `limit-b-${randomBytes(3).toString("hex")}`;
    newUser(h, keyA);
    newUser(h, keyB);
    const a = await h.signIn(keyA);
    const b = await h.signIn(keyB);
    const org = (
      await a.post("/v1/organizations", {
        name: "Limits",
        slug: `lim-${randomBytes(4).toString("hex")}`,
      })
    ).json<{ organizationId: string }>().organizationId;
    const statuses: number[] = [];
    // These requests are invalid on purpose: a refused write still uses up the allowance.
    for (let i = 0; i < RATE_LIMITS.managementWrites.limit + 5; i++)
      statuses.push((await a.post(`/v1/orgs/${org}/agents`, { nonsense: true })).status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(4);
    expect(statuses.filter((s) => s === 422).length).toBeLessThanOrEqual(
      RATE_LIMITS.managementWrites.limit,
    );
    expect(
      (
        await b.post("/v1/organizations", {
          name: "Other",
          slug: `oth-${randomBytes(4).toString("hex")}`,
        })
      ).status,
    ).toBe(201);
  });

  it("limits approval decisions per session more tightly than ordinary writes", () => {
    expect(RATE_LIMITS.approvalDecisions.limit).toBeLessThan(RATE_LIMITS.managementWrites.limit);
  });
});
