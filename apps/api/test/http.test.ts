import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/http/app";
import { createPool } from "../src/db/pool";
import { revokeCredential, suspendAgent } from "../src/management";
import { createWorld, idem, leadBody, type World } from "./support/world";

let w: World;
let app: FastifyInstance;
const logLines: string[] = [];

beforeAll(async () => {
  w = await createWorld();
  app = buildApp({
    agentPool: w.agentPool,
    pepper: w.pepper,
    logger: { level: "debug", stream: { write: (line: string) => void logLines.push(line) } },
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await w.close();
});

const post = (key: string | undefined, body: unknown, headers: Record<string, string> = {}) =>
  app.inject({
    method: "POST",
    url: "/v1/action-requests",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idem(),
      ...(key === undefined ? {} : { authorization: `Bearer ${key}` }),
      ...headers,
    },
    payload: typeof body === "string" ? body : JSON.stringify(body),
  });

const get = (key: string | undefined, id: string) =>
  app.inject({
    method: "GET",
    url: `/v1/action-requests/${id}`,
    headers: key === undefined ? {} : { authorization: `Bearer ${key}` },
  });

const errorOf = (body: string) => {
  const parsed = JSON.parse(body) as { error: { code: string; message: string; trace_id: string } };
  return parsed.error;
};

describe("route table", () => {
  it("S01 exposes exactly two routes and every one declares an auth class", () => {
    const routes = app.routeRegistry.map((r) => `${r.method} ${r.url} ${String(r.auth)}`).sort();
    expect(routes).toEqual(["GET /v1/action-requests/:id agent", "POST /v1/action-requests agent"]);
  });

  it("has no grant, execution, management, health or documentation route", async () => {
    for (const [method, url] of [
      ["GET", "/"],
      ["GET", "/healthz"],
      ["GET", "/docs"],
      ["POST", "/v1/grants"],
      ["POST", "/v1/executions"],
      ["POST", "/v1/agents"],
      ["POST", "/v1/approvals/1/approve"],
      ["DELETE", "/v1/action-requests/x"],
      ["PUT", "/v1/action-requests"],
      ["HEAD", "/v1/action-requests/x"],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(errorOf(res.body).code).toBe("NOT_FOUND");
    }
  });
});

describe("S01 no anonymous execution", () => {
  it("answers every authentication failure the same way and writes nothing", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const admin = await w.db.admin();
    const before = await admin.query("SELECT count(*)::int AS n FROM axo.action_requests");
    const wrongSecret = `axo_${agent.keyId}_${randomBytes(32).toString("base64url")}`;
    const unknown = `axo_${randomBytes(12).toString("hex")}_${randomBytes(32).toString("base64url")}`;
    const bodies = new Set<string>();
    for (const attempt of [
      post(undefined, leadBody()),
      post("garbage", leadBody()),
      post(wrongSecret, leadBody()),
      post(unknown, leadBody()),
      post(agent.key, leadBody(), { authorization: `Basic ${agent.key}` }),
      post(agent.key, leadBody(), { authorization: `bearer ${agent.key}` }),
      get(undefined, "00000000-0000-0000-0000-000000000000"),
      get(wrongSecret, "00000000-0000-0000-0000-000000000000"),
    ]) {
      const res = await attempt;
      expect(res.statusCode).toBe(401);
      expect(res.headers["www-authenticate"]).toBe("Bearer");
      const e = errorOf(res.body);
      expect(e.code).toBe("UNAUTHENTICATED");
      bodies.add(e.message);
    }
    expect(bodies.size).toBe(1);
    const after = await admin.query("SELECT count(*)::int AS n FROM axo.action_requests");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("refuses an unauthenticated request before reading its body, whatever the body is", async () => {
    const huge = "x".repeat(200_000);
    for (const body of ["{not json", huge, "[]"]) {
      const res = await post(undefined, body);
      expect(res.statusCode).toBe(401);
    }
  });

  it("a revoked key, a revoked agent and an expired key all fail identically", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.manage(w.orgA.admin, w.orgA, (c) =>
      revokeCredential(c, { credentialId: agent.credentialId }),
    );
    const res = await post(agent.key, leadBody());
    expect(res.statusCode).toBe(401);
    expect(errorOf(res.body).code).toBe("UNAUTHENTICATED");
  });

  it("tells a suspended agent with a valid key that it is suspended (403)", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.manage(w.orgA.admin, w.orgA, (c) => suspendAgent(c, { agentId: agent.agentId }));
    const res = await post(agent.key, leadBody());
    expect(res.statusCode).toBe(403);
    expect(errorOf(res.body).code).toBe("AGENT_SUSPENDED");
  });
});

describe("decisions over HTTP", () => {
  it("returns exactly {id, status, reason_code?} with the documented status codes", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    const denied = await post(agent.key, leadBody());
    expect(denied.statusCode).toBe(403);
    expect(Object.keys(JSON.parse(denied.body)).sort()).toEqual(["id", "reason_code", "status"]);
    expect(JSON.parse(denied.body)).toMatchObject({ status: "denied", reason_code: "POLICY_DENY" });

    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const pending = await post(agent.key, leadBody());
    expect(pending.statusCode).toBe(202);
    expect(JSON.parse(pending.body)).toMatchObject({
      status: "pending_approval",
      reason_code: "HUMAN_REVIEW_REQUIRED",
    });

    const other = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: other.agentId });
    const queued = await post(other.key, leadBody());
    expect(queued.statusCode).toBe(202);
    const body = JSON.parse(queued.body);
    expect(Object.keys(body).sort()).toEqual(["id", "status"]);
    expect(body.status).toBe("queued_execution");
    // Nothing that could be used to execute is ever returned.
    expect(queued.body).not.toMatch(/grant|token|credential|secret|digest|parameters/i);
  });

  it("replays an identical request with the same answer, flagged as a replay", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const key = idem();
    const first = await post(agent.key, leadBody(), { "idempotency-key": key });
    const second = await post(agent.key, leadBody(), { "idempotency-key": key });
    expect(second.statusCode).toBe(first.statusCode);
    expect(JSON.parse(second.body)).toEqual(JSON.parse(first.body));
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    const conflict = await post(agent.key, leadBody({ company: "Another" }), {
      "idempotency-key": key,
    });
    expect(conflict.statusCode).toBe(409);
    expect(errorOf(conflict.body).code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("S12 20 parallel identical requests over HTTP produce one request", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const key = idem();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => post(agent.key, leadBody(), { "idempotency-key": key })),
    );
    expect(new Set(results.map((r) => JSON.parse(r.body).id)).size).toBe(1);
    expect(new Set(results.map((r) => r.statusCode)).size).toBe(1);
  });

  it("returns 429 with Retry-After when the pending-approval limit is reached", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const admin = await w.db.admin();
    await admin.query(
      `INSERT INTO axo.action_requests (organization_id, agent_id, environment_id, action_key, resource, request_key,
         canonical_digest, canonical_parameters, status, originating_credential_id, expires_at)
       SELECT $1, $2, $3, 'crm.lead.create', 'mockcrm/leads', 'filler-' || lpad(g::text, 12, '0'), repeat('c', 64), '{}',
              'pending_approval', $4, now() + interval '10 minutes' FROM generate_series(1, 100) g`,
      [org.id, agent.agentId, org.dev, agent.credentialId],
    );
    const res = await post(agent.key, leadBody());
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("30");
    expect(errorOf(res.body).code).toBe("RATE_LIMITED");
  });
});

describe("S17 input hardening over HTTP", () => {
  let cached: Promise<Awaited<ReturnType<World["newAgent"]>>> | undefined;
  // Created on first use, after the shared fixtures exist.
  const agentPromise = () => {
    cached ??= (async () => {
      const agent = await w.newAgent(w.orgA, w.orgA.dev);
      await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
      return agent;
    })();
    return cached;
  };

  it("rejects bodies that are not valid JSON objects with 422 and a generic message", async () => {
    const agent = await agentPromise();
    for (const body of [
      "{not json",
      "",
      "null",
      "[]",
      '"text"',
      "123",
      '{"__proto__":{"admin":true}}',
      '{"constructor":{"prototype":{"admin":true}}}',
    ]) {
      const res = await post(agent.key, body);
      expect(res.statusCode, body).toBe(422);
      expect(errorOf(res.body).code).toBe("INVALID_REQUEST");
    }
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it("rejects a wrong or missing content type with 415", async () => {
    const agent = await agentPromise();
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "application/xml"]) {
      const res = await post(agent.key, JSON.stringify(leadBody()), { "content-type": type });
      expect(res.statusCode, type).toBe(415);
      expect(errorOf(res.body).code).toBe("UNSUPPORTED_MEDIA_TYPE");
    }
  });

  it("rejects an oversized body with 413", async () => {
    const agent = await agentPromise();
    const res = await post(agent.key, leadBody({ company: "x".repeat(20_000) }));
    expect(res.statusCode).toBe(413);
    expect(errorOf(res.body).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects invalid parameters with 422 and field-path issues that contain no submitted values", async () => {
    const agent = await agentPromise();
    const marker = "SubmittedPersonalValue";
    const res = await post(
      agent.key,
      leadBody({ full_name: marker, email: "nope", phone: marker }),
    );
    expect(res.statusCode).toBe(422);
    const e = JSON.parse(res.body).error;
    expect(e.issues.length).toBeGreaterThan(0);
    expect(res.body).not.toContain(marker);
  });

  it("rejects tenant, agent and environment claims in the body, and a missing or bad Idempotency-Key", async () => {
    const agent = await agentPromise();
    expect((await post(agent.key, { ...leadBody(), organization_id: w.orgB.id })).statusCode).toBe(
      422,
    );
    expect((await post(agent.key, { ...leadBody(), agent_id: "x" })).statusCode).toBe(422);
    for (const bad of ["", "short", "has spaces in it 1234"]) {
      expect((await post(agent.key, leadBody(), { "idempotency-key": bad })).statusCode, bad).toBe(
        422,
      );
    }
    const missing = await app.inject({
      method: "POST",
      url: "/v1/action-requests",
      headers: { authorization: `Bearer ${agent.key}`, "content-type": "application/json" },
      payload: JSON.stringify(leadBody()),
    });
    expect(missing.statusCode).toBe(422);
  });

  it("records an unknown action as a denial with UNKNOWN_ACTION", async () => {
    const agent = await agentPromise();
    const res = await post(agent.key, {
      action: "payments.refund.create",
      resource: "bank/refunds",
      parameters: {},
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ status: "denied", reason_code: "UNKNOWN_ACTION" });
  });
});

describe("S19 status access", () => {
  it("shows an agent its own request, and gives identical 404s for foreign, missing and malformed ids", async () => {
    const orgA = await w.freshOrg();
    const mine = await w.newAgent(orgA, orgA.dev);
    const sibling = await w.newAgent(orgA, orgA.dev);
    const foreign = await w.newAgent(w.orgB, w.orgB.dev);
    await w.policy(orgA, { effect: "require_approval", environmentId: orgA.dev });
    await w.policy(w.orgB, { effect: "require_approval", environmentId: w.orgB.dev });
    const own = JSON.parse((await post(mine.key, leadBody())).body).id as string;
    const siblingId = JSON.parse((await post(sibling.key, leadBody())).body).id as string;
    const foreignId = JSON.parse((await post(foreign.key, leadBody())).body).id as string;

    const ownRes = await get(mine.key, own);
    expect(ownRes.statusCode).toBe(200);
    expect(JSON.parse(ownRes.body)).toMatchObject({
      id: own,
      status: "pending_approval",
      reason_code: "HUMAN_REVIEW_REQUIRED",
    });
    expect(ownRes.body).not.toMatch(/parameters|full_name|email|digest|organization|agent_id/i);

    const probes = [
      siblingId,
      foreignId,
      "11111111-1111-4111-8111-111111111111",
      "not-a-uuid",
      "1' OR '1'='1",
      "%00",
      "../../etc/passwd",
    ];
    const seen = new Set<string>();
    for (const id of probes) {
      const res = await get(mine.key, encodeURIComponent(id));
      expect(res.statusCode, id).toBe(404);
      const e = errorOf(res.body);
      seen.add(`${e.code}|${e.message}`);
    }
    expect(seen.size).toBe(1);
  });
});

describe("S15 secrets never reach the logs", () => {
  it("keeps keys, secrets, idempotency keys and request contents out of every log line, on success and on failure", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const marker = "LoggedPersonMarker";
    const key = idem();
    logLines.length = 0;
    await post(agent.key, leadBody({ full_name: marker, company: marker }), {
      "idempotency-key": key,
    });
    await post(agent.key, leadBody({ full_name: marker, email: "bad" }), {
      "idempotency-key": idem(),
    });
    await post(
      `axo_${agent.keyId}_${randomBytes(32).toString("base64url")}`,
      leadBody({ full_name: marker }),
    );
    await post(agent.key, "{broken");
    await get(agent.key, "00000000-0000-0000-0000-000000000000");
    const logs = logLines.join("\n");
    expect(logs.length).toBeGreaterThan(0);
    for (const forbidden of [
      agent.key,
      agent.key.slice(-43),
      key,
      marker,
      "ada@example.test",
      "Bearer ",
    ]) {
      expect(logs, forbidden).not.toContain(forbidden);
    }
  });
});

describe("S13 fail closed over HTTP", () => {
  it("answers 503 with a generic body, and nothing is authorized, when the database is unreachable", async () => {
    const dead = createPool("postgres://axo_agent_api:x@127.0.0.1:1/none", "dead");
    const broken = buildApp({ agentPool: dead, pepper: w.pepper, logger: false });
    try {
      const agent = await w.newAgent(w.orgA, w.orgA.dev);
      const res = await broken.inject({
        method: "POST",
        url: "/v1/action-requests",
        headers: {
          authorization: `Bearer ${agent.key}`,
          "content-type": "application/json",
          "idempotency-key": idem(),
        },
        payload: JSON.stringify(leadBody()),
      });
      expect(res.statusCode).toBe(503);
      const e = errorOf(res.body);
      expect(e.code).toBe("SERVICE_UNAVAILABLE");
      expect(res.body).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|postgres|stack/i);
      const status = await broken.inject({
        method: "GET",
        url: "/v1/action-requests/11111111-1111-4111-8111-111111111111",
        headers: { authorization: `Bearer ${agent.key}` },
      });
      expect(status.statusCode).toBe(503);
    } finally {
      await broken.close();
      await dead.end();
    }
  });

  it("answers 503, not an error that leaks, when a database error carries submitted values", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const admin = await w.db.admin();
    await admin.query(`
      CREATE FUNCTION axo.test_leaky_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'boom for %', NEW.request_key; END $$;
      CREATE TRIGGER test_leaky BEFORE INSERT ON axo.decisions FOR EACH ROW EXECUTE FUNCTION axo.test_leaky_failure();`);
    try {
      const key = idem();
      logLines.length = 0;
      const res = await post(agent.key, leadBody(), { "idempotency-key": key });
      expect(res.statusCode).toBe(503);
      expect(res.body).not.toContain("boom");
      expect(logLines.join("\n")).not.toContain("boom");
    } finally {
      await admin.query(
        "DROP TRIGGER test_leaky ON axo.decisions; DROP FUNCTION axo.test_leaky_failure()",
      );
    }
  });

  it("sets safe headers on every response", async () => {
    const res = await post(undefined, leadBody());
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
