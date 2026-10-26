import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockCrm, type MockCrm } from "../../mock-crm/src/server";
import { mockCrmConnector } from "../src/executor/connectors";
import { runOnce, type ExecutorDeps } from "../src/executor/executor";
import { buildApp } from "../src/http/app";
import { decideApproval, revokeCredential, suspendAgent } from "../src/management";
import { createWorld, type TestOrg, type World } from "./support/world";

/**
 * BE-03: what an n8n workflow relies on. These tests send requests shaped exactly like n8n's HTTP Request node does
 * (Bearer key from a Header Auth credential, `Idempotency-Key`, JSON with a charset, a status poll with the same key) and
 * follow a request through the real HTTP app, the approval, the trusted executor and the mock CRM. The workflow file
 * shipped for n8n is checked for the properties that keep it safe. A real n8n run is documented separately.
 */

let w: World;
let app: FastifyInstance;
let crm: MockCrm;
let deps: ExecutorDeps;
const TOKEN = randomBytes(24).toString("hex");

beforeAll(async () => {
  w = await createWorld();
  crm = createMockCrm({ token: TOKEN });
  const { url } = await crm.listen();
  deps = {
    pool: w.db.executorPool(),
    dataKeys: w.dataKeys,
    executorId: "n8n-test-executor",
    connector: mockCrmConnector({ baseUrl: url, token: TOKEN, timeoutMs: 2000 }),
  };
  app = buildApp({ agentPool: w.agentPool, pepper: w.pepper, dataKeys: w.dataKeys, logger: false });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await deps.pool.end();
  await crm.close();
  await w.close();
});

const lead = (company = "Sample Co") => ({
  action: "crm.lead.create",
  resource: "mockcrm/leads",
  parameters: { full_name: "Ada Example", email: "ada@example.test", company },
});

/** Headers as n8n's HTTP Request node (axios) sends them. */
const n8nHeaders = (key: string, idempotencyKey?: string) => ({
  authorization: `Bearer ${key}`,
  "content-type": "application/json; charset=utf-8",
  accept:
    "application/json,text/html,application/xhtml+xml,application/xml,text/*;q=0.9, image/*;q=0.8, */*;q=0.7",
  "user-agent": "axios/1.7.9",
  ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
});
const ask = (key: string, body: unknown, idempotencyKey = `agentaxio-lead-wf1-${randomUUID()}`) =>
  app.inject({
    method: "POST",
    url: "/v1/action-requests",
    headers: n8nHeaders(key, idempotencyKey),
    payload: JSON.stringify(body),
  });
const poll = (key: string, id: string) =>
  app.inject({ method: "GET", url: `/v1/action-requests/${id}`, headers: n8nHeaders(key) });

async function drain() {
  const results = [];
  for (let i = 0; i < 20; i++) {
    const r = await runOnce(deps);
    if (r.kind === "idle") return results;
    results.push(r);
  }
  throw new Error("executor never went idle");
}
async function approve(org: TestOrg, requestId: string) {
  const admin = await w.db.admin();
  const row = (
    await admin.query(
      "SELECT a.id, r.canonical_digest AS digest FROM axo.approval_requests a JOIN axo.action_requests r ON r.id = a.action_request_id WHERE r.id = $1",
      [requestId],
    )
  ).rows[0] as { id: string; digest: string };
  return w.manage(org.approver, org, (c) =>
    decideApproval(c, { approvalId: row.id, decision: "approve", reviewedDigest: row.digest }),
  );
}

describe("n8n → AgentAxio → approval → executor → mock CRM", () => {
  it("runs the whole golden path, with n8n holding only its agent key", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev, "n8n lead agent");
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const before = crm.leads().length;

    const asked = await ask(agent.key, lead("Navy Test Co"));
    expect(asked.statusCode).toBe(202);
    const { id, status, reason_code } = asked.json<{
      id: string;
      status: string;
      reason_code: string;
    }>();
    expect([status, reason_code]).toEqual(["pending_approval", "HUMAN_REVIEW_REQUIRED"]);
    // Nothing an executor could use is ever returned to the workflow.
    expect(Object.keys(asked.json()).sort()).toEqual(["id", "reason_code", "status"]);

    // n8n polls: still waiting for a person; nothing has been created anywhere.
    expect((await poll(agent.key, id)).json()).toMatchObject({ id, status: "pending_approval" });
    expect(await drain()).toEqual([]);
    expect(crm.leads()).toHaveLength(before);

    expect((await approve(org, id)).outcome).toBe("approved");
    // Approved is permission, not execution: the poll says "waiting to run" until the executor has acted.
    expect((await poll(agent.key, id)).json()).toMatchObject({ status: "queued_execution" });
    expect(crm.leads()).toHaveLength(before);

    expect(await drain()).toEqual([{ kind: "executed", requestId: id, outcome: "succeeded" }]);
    expect((await poll(agent.key, id)).json()).toEqual({ id, status: "succeeded" });
    expect(crm.leads()).toHaveLength(before + 1);
    expect(crm.leads().at(-1)).toMatchObject({
      company: "Navy Test Co",
      email: "ada@example.test",
    });

    // The key n8n holds is useless at the destination.
    const direct = await fetch(
      new URL(
        "/leads",
        `http://127.0.0.1:${String((crm.server.address() as { port: number }).port)}`,
      ),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${agent.key}`,
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        body: JSON.stringify(lead().parameters),
      },
    );
    expect(direct.status).toBe(401);
    expect(crm.leads()).toHaveLength(before + 1);
  });

  it("a directly allowed action is queued and executed once, never by n8n itself", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const asked = await ask(agent.key, lead());
    expect(asked.statusCode).toBe(202);
    expect(asked.json()).toMatchObject({ status: "queued_execution" });
    const before = crm.leads().length;
    expect(await drain()).toHaveLength(1);
    expect((await poll(agent.key, asked.json<{ id: string }>().id)).json()).toMatchObject({
      status: "succeeded",
    });
    expect(crm.leads()).toHaveLength(before + 1);
  });

  it("a blocked action comes back as 403 with a body n8n can branch on, and nothing runs", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "deny", agentId: agent.agentId });
    const before = crm.leads().length;
    const asked = await ask(agent.key, lead());
    expect(asked.statusCode).toBe(403);
    expect(asked.json()).toMatchObject({ status: "denied", reason_code: "POLICY_DENY" });
    expect(await drain()).toEqual([]);
    expect(crm.leads()).toHaveLength(before);
  });

  it("with no rule at all the answer is blocked (default deny)", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    const asked = await ask(agent.key, lead());
    expect(asked.statusCode).toBe(403);
    expect(asked.json()).toMatchObject({ status: "denied" });
  });
});

describe("retries and replays from n8n are safe", () => {
  it("n8n's automatic retries with the same Idempotency-Key create one request, one approval and one lead", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const key = `agentaxio-lead-wf1-${randomUUID()}`;
    const answers = await Promise.all(Array.from({ length: 6 }, () => ask(agent.key, lead(), key)));
    expect(new Set(answers.map((a) => a.json<{ id: string }>().id)).size).toBe(1);
    expect(answers.every((a) => a.statusCode === 202)).toBe(true);
    expect(
      answers.filter((a) => a.headers["idempotent-replayed"] === "true").length,
    ).toBeGreaterThanOrEqual(5);
    const id = answers[0]?.json<{ id: string }>().id ?? "";
    const admin = await w.db.admin();
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.approval_requests WHERE action_request_id = $1",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);

    await approve(org, id);
    const before = crm.leads().length;
    await Promise.all([drain(), drain(), drain()]);
    expect(crm.leads()).toHaveLength(before + 1);
    // A late retry after completion still just returns the same answer and runs nothing.
    const late = await ask(agent.key, lead(), key);
    expect(late.json<{ id: string }>().id).toBe(id);
    expect(await drain()).toEqual([]);
    expect(crm.leads()).toHaveLength(before + 1);
  });

  it("reusing a key for different values is a conflict, so a bug in a workflow cannot swap the payload", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const key = `agentaxio-lead-wf1-${randomUUID()}`;
    expect((await ask(agent.key, lead("First Co"), key)).statusCode).toBe(202);
    const clash = await ask(agent.key, lead("Second Co"), key);
    expect(clash.statusCode).toBe(409);
    expect(clash.json()).toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  it("an n8n execution that runs again (new Idempotency-Key) is a new request needing its own approval", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const a = await ask(agent.key, lead());
    const b = await ask(agent.key, lead());
    expect(a.json<{ id: string }>().id).not.toBe(b.json<{ id: string }>().id);
    await approve(org, a.json<{ id: string }>().id);
    expect((await poll(agent.key, b.json<{ id: string }>().id)).json()).toMatchObject({
      status: "pending_approval",
    });
  });
});

describe("what n8n sees when access is withdrawn or wrong", () => {
  it("a revoked key stops the poll with 401 and the waiting request never runs", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    await drain();
    const id = (await ask(agent.key, lead())).json<{ id: string }>().id;
    await w.manage(org.admin, org, (c) =>
      revokeCredential(c, { credentialId: agent.credentialId }),
    );
    expect((await poll(agent.key, id)).statusCode).toBe(401);
    expect((await ask(agent.key, lead())).statusCode).toBe(401);
    const before = crm.leads().length;
    expect(await drain()).toEqual([]);
    expect(crm.leads()).toHaveLength(before);
  });

  it("a suspended agent is told 403 AGENT_SUSPENDED on both calls, and its waiting request is withdrawn", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    await drain();
    const id = (await ask(agent.key, lead())).json<{ id: string }>().id;
    await w.manage(org.admin, org, (c) => suspendAgent(c, { agentId: agent.agentId }));
    for (const res of [await poll(agent.key, id), await ask(agent.key, lead())]) {
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: { code: "AGENT_SUSPENDED" } });
    }
    const before = crm.leads().length;
    expect(await drain()).toEqual([]);
    expect(crm.leads()).toHaveLength(before);
  });

  it("another workflow's key cannot read this request (404, identical to a missing one)", async () => {
    const org = await w.freshOrg();
    const mine = await w.newAgent(org, org.dev);
    const theirs = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "require_approval" });
    const id = (await ask(mine.key, lead())).json<{ id: string }>().id;
    const foreign = await poll(theirs.key, id);
    const missing = await poll(theirs.key, randomUUID());
    expect(foreign.statusCode).toBe(404);
    const strip = (body: string) => body.replace(/"trace_id":"[^"]*"/, "");
    expect(strip(foreign.body)).toBe(strip(missing.body));
  });

  it("a missing, malformed or wrong key is 401 and creates nothing", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const wrong = `${agent.key.slice(0, -3)}abc`;
    for (const key of [wrong, "not-a-key", ""]) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/action-requests",
        headers: {
          ...n8nHeaders(key, `agentaxio-lead-wf1-${randomUUID()}`),
          ...(key === "" ? { authorization: "" } : {}),
        },
        payload: JSON.stringify(lead()),
      });
      expect(res.statusCode, key).toBe(401);
    }
    const admin = await w.db.admin();
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.action_requests WHERE agent_id = $1",
          [agent.agentId],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it("extra or identity-bearing fields in the body are refused (n8n cannot name an organization or agent)", async () => {
    const org = await w.freshOrg();
    const other = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    for (const body of [
      { ...lead(), organization_id: other.id },
      { ...lead(), agent_id: randomUUID() },
      { ...lead(), parameters: { ...lead().parameters, crm_token: "x" } },
      { ...lead(), resource: "https://evil.example/leads" },
    ]) {
      const res = await ask(agent.key, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(422);
    }
  });
});

describe("the example workflow shipped for n8n", () => {
  const path = join(
    import.meta.dirname,
    "..",
    "..",
    "web",
    "public",
    "n8n",
    "agentaxio-crm-lead-create.workflow.json",
  );
  const raw = readFileSync(path, "utf8");
  const workflow = JSON.parse(raw) as {
    nodes: Array<{
      name: string;
      type: string;
      parameters: Record<string, unknown>;
      credentials?: Record<string, { id: string; name: string }>;
      retryOnFail?: boolean;
    }>;
    connections: Record<string, { main: Array<Array<{ node: string }>> }>;
  };
  const byName = (name: string) => workflow.nodes.find((n) => n.name === name);
  const http = workflow.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");

  it("holds no secret and talks only to AgentAxio", () => {
    expect(raw).not.toMatch(/axo_[0-9a-f]{24}/i);
    expect(raw).not.toMatch(/Bearer [A-Za-z0-9_-]{10,}/);
    expect(raw).not.toMatch(/password|secret|token/i);
    for (const n of http) {
      expect(String(n.parameters.url)).toMatch(/\{\{ .*agentaxio_url.* \}\}\/v1\/action-requests/);
      // The key comes from an n8n credential, never from a header written into the workflow.
      expect(n.parameters.authentication).toBe("genericCredentialType");
      expect(n.parameters.genericAuthType).toBe("httpHeaderAuth");
      expect(n.credentials?.httpHeaderAuth?.name).toBe("AgentAxio agent key");
      const names = (
        (n.parameters.headerParameters as { parameters?: Array<{ name: string }> } | undefined)
          ?.parameters ?? []
      ).map((p) => p.name.toLowerCase());
      expect(names).not.toContain("authorization");
    }
    expect(workflow.nodes.some((n) => /crm|salesforce|hubspot|pipedrive/i.test(n.type))).toBe(
      false,
    );
  });

  it("creates no lead by itself: the only calls are the request and the status check", () => {
    expect(http.map((n) => n.name)).toEqual(["Ask AgentAxio", "Check status"]);
    expect(byName("Ask AgentAxio")?.parameters.method).toBe("POST");
    expect(byName("Check status")?.parameters.method).toBe("GET");
  });

  it("sends a stable Idempotency-Key, and only that call may be retried", () => {
    const ask = byName("Ask AgentAxio");
    const headers = (
      ask?.parameters.headerParameters as { parameters: Array<{ name: string; value: string }> }
    ).parameters;
    expect(headers).toEqual([{ name: "Idempotency-Key", value: "={{ $json.idempotency_key }}" }]);
    // The key is computed once, in the step before the request, so every retry sends the same value and every new run a new one.
    const proposed = JSON.stringify(byName("Proposed lead")?.parameters);
    expect(proposed).toMatch(/idempotency_key/);
    expect(proposed).toContain("$now.toMillis()");
    expect(proposed).toContain("Math.random()");
    expect(JSON.stringify(ask?.parameters)).not.toMatch(/random|\$now/);
    expect(ask?.retryOnFail).toBe(true);
    expect(byName("Check status")?.retryOnFail).toBeUndefined();
  });

  it("builds an Idempotency-Key the API accepts, that differs on every run, even in the same millisecond", () => {
    const assignments = (
      byName("Proposed lead")?.parameters.assignments as {
        assignments: Array<{ name: string; value: string }>;
      }
    ).assignments;
    const expr = assignments.find((a) => a.name === "idempotency_key")?.value ?? "";
    // Evaluate the shipped expression the way n8n would: only these two known pieces may appear inside the braces.
    const randomPart = "Math.random().toString(36).slice(2, 10)";
    const make = (ms: number) =>
      expr
        .replace(/^=/, "")
        .replace("{{ $now.toMillis() }}", String(ms))
        .replace(`{{ ${randomPart} }}`, () => Math.random().toString(36).slice(2, 10));
    expect(make(1)).not.toContain("{{");
    const keys = Array.from({ length: 5000 }, () => make(1_800_000_000_000));
    for (const k of keys) {
      expect(k).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    }
    expect(new Set(keys).size).toBe(keys.length);
    // A run a millisecond later can never collide with an earlier one either.
    expect(make(1_800_000_000_001)).not.toBe(make(1_800_000_000_000));
    // Even if the random part came out empty, the key stays valid and still carries the timestamp.
    const zero = Math.random;
    Math.random = () => 0;
    try {
      expect(make(1_800_000_000_000)).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    } finally {
      Math.random = zero;
    }
  });

  it("fails closed: anything but an accepted answer stops, and a refused status check stops", () => {
    const next = (from: string, branch: number) =>
      workflow.connections[from]?.main[branch]?.[0]?.node;
    expect(next("Accepted?", 0)).toBe("Remember request");
    expect(next("Accepted?", 1)).toBe("Blocked?");
    expect(next("Blocked?", 1)).toBe("AgentAxio refused or unreachable");
    expect(byName("AgentAxio refused or unreachable")?.type).toBe("n8n-nodes-base.stopAndError");
    expect(next("Status readable?", 1)).toBe("Status check refused");
    expect(byName("Status check refused")?.type).toBe("n8n-nodes-base.stopAndError");
  });

  it("polls a bounded number of times and treats giving up as 'still waiting', never as success or failure", () => {
    expect(JSON.stringify(byName("Waited long enough?")?.parameters)).toMatch(/\$runIndex >= 179/);
    const waiting = JSON.stringify(byName("Report: still waiting")?.parameters);
    expect(waiting).toMatch(/NOT a failure/);
    expect(waiting).not.toMatch(/succeeded/);
    const finished = JSON.stringify(byName("Finished?")?.parameters);
    for (const status of ["denied", "succeeded", "failed", "expired", "unknown"])
      expect(finished).toContain(status);
    expect(finished).not.toMatch(/pending_approval|queued_execution|approved|running/);
  });

  it("only reports success for the status 'succeeded', and tells people not to retry an unknown outcome", () => {
    const message = JSON.stringify(byName("Report: finished")?.parameters);
    expect(message).toMatch(/status === 'succeeded' \?/);
    expect(message).toMatch(/Do not retry blindly/);
  });
});
