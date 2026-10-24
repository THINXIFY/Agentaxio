import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMockCrm, type MockCrm } from "../../mock-crm/src/server";
import { maintain, runOnce, type ExecutorDeps } from "../src/executor/executor";
import { mockCrmConnector, type Connector } from "../src/executor/connectors";
import { getActionRequestStatus } from "../src/authorization/status";
import { decideApproval, haltEnvironment, revokeCredential, suspendAgent } from "../src/management";
import { createWorld, leadBody, idem, type TestOrg, type World } from "./support/world";

/**
 * The trusted executor against a real PostgreSQL database and a real (mock) CRM over HTTP. These tests check the
 * promises that matter: it runs only what was authorized and, where required, approved; it re-checks everything at the
 * moment of execution; a grant works once; and "succeeded", "failed" and "unknown" are never confused or retried.
 */

let w: World;
let crm: MockCrm;
let crmUrl: string;
let pool: pg.Pool;
const TOKEN = randomBytes(24).toString("hex");
const EXECUTOR = "test-executor-1";

beforeAll(async () => {
  w = await createWorld();
  crm = createMockCrm({ token: TOKEN });
  crmUrl = (await crm.listen()).url;
  pool = w.db.executorPool();
});
afterAll(async () => {
  await pool.end();
  await crm.close();
  await w.close();
});
afterEach(async () => {
  delete crm.faults.delayMs;
  delete crm.faults.dropAfterCreate;
  delete crm.faults.failWith;
  const admin = await adminClient();
  await admin.query("DROP TRIGGER IF EXISTS inject_failure ON axo.audit_events");
});

const connector = (timeoutMs = 2_000, url = crmUrl, token = TOKEN) =>
  mockCrmConnector({ baseUrl: url, token, timeoutMs });
const deps = (over: Partial<ExecutorDeps> = {}): ExecutorDeps => ({
  pool,
  dataKeys: w.dataKeys,
  executorId: EXECUTOR,
  connector: connector(),
  ...over,
});

/** Run until nothing is left to claim, so one test's leftovers never run inside another. */
async function drain(over: Partial<ExecutorDeps> = {}) {
  const results = [];
  for (let i = 0; i < 50; i++) {
    const r = await runOnce(deps(over));
    if (r.kind === "idle") return results;
    results.push(r);
  }
  throw new Error("the executor never went idle");
}

let cachedAdmin: Promise<pg.Client> | undefined;
const adminClient = () => (cachedAdmin ??= w.db.admin());

async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await (await adminClient()).query(text, values)).rows as T[];
}
const requestStatus = async (id: string) =>
  (await sql<{ status: string }>("SELECT status FROM axo.action_requests WHERE id = $1", [id]))[0]
    ?.status;
const eventTypes = async (id: string) =>
  (
    await sql<{ event_type: string }>(
      "SELECT event_type FROM axo.audit_events WHERE request_id = $1 ORDER BY id",
      [id],
    )
  ).map((r) => r.event_type);

async function submitFor(
  org: TestOrg,
  via: "allow" | "approval",
  params: Record<string, unknown> = {},
) {
  const agent = await w.newAgent(org, org.dev);
  await w.policy(org, {
    effect: via === "allow" ? "allow" : "require_approval",
    agentId: agent.agentId,
  });
  const out = await w.submit(agent.key, leadBody(params));
  if (out.kind !== "decided") throw new Error(out.kind);
  return { agent, requestId: out.id };
}

async function approve(org: TestOrg, requestId: string) {
  const row = (
    await sql<{ id: string; digest: string }>(
      "SELECT a.id, r.canonical_digest AS digest FROM axo.approval_requests a JOIN axo.action_requests r ON r.id = a.action_request_id WHERE r.id = $1",
      [requestId],
    )
  )[0];
  if (row === undefined) throw new Error("no approval");
  return w.manage(org.approver, org, (c) =>
    decideApproval(c, { approvalId: row.id, decision: "approve", reviewedDigest: row.digest }),
  );
}

/** An authorized request, queued for the executor. */
async function queued(
  org: TestOrg,
  via: "allow" | "approval" = "approval",
  params: Record<string, unknown> = {},
) {
  const made = await submitFor(org, via, params);
  if (via === "approval") expect((await approve(org, made.requestId)).outcome).toBe("approved");
  expect(await requestStatus(made.requestId)).toBe("queued_execution");
  return made;
}

async function installAuditFailure(eventType: string) {
  const admin = await adminClient();
  await admin.query(`CREATE OR REPLACE FUNCTION public.inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.event_type = TG_ARGV[0] THEN RAISE EXCEPTION 'audit store unavailable'; END IF; RETURN NEW; END $$`);
  await admin.query("DROP TRIGGER IF EXISTS inject_failure ON axo.audit_events");
  await admin.query(
    `CREATE TRIGGER inject_failure BEFORE INSERT ON axo.audit_events FOR EACH ROW EXECUTE FUNCTION public.inject_failure('${eventType}')`,
  );
}
const removeAuditFailure = async () =>
  sql("DROP TRIGGER IF EXISTS inject_failure ON axo.audit_events");

async function withTriggerOff(table: string, trigger: string, work: () => Promise<void>) {
  const admin = await adminClient();
  await admin.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  try {
    await work();
  } finally {
    await admin.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
  }
}

describe("the golden path", () => {
  it("executes an approved action exactly once and records every step", async () => {
    await drain();
    const org = await w.freshOrg();
    const { agent, requestId } = await queued(org, "approval", {
      full_name: "Grace Hopper",
      company: "Navy Test Co",
    });
    const before = crm.leads().length;
    const results = await drain();
    expect(results).toEqual([{ kind: "executed", requestId, outcome: "succeeded" }]);
    expect(crm.leads()).toHaveLength(before + 1);
    expect(crm.leads().at(-1)).toMatchObject({
      full_name: "Grace Hopper",
      email: "ada@example.test",
      company: "Navy Test Co",
    });

    expect(await requestStatus(requestId)).toBe("succeeded");
    const attempt = (
      await sql<{
        state: string;
        external_reference: string;
        executor_id: string;
        connector: string;
      }>(
        "SELECT state, external_reference, executor_id, connector FROM axo.execution_attempts WHERE action_request_id = $1",
        [requestId],
      )
    )[0];
    expect(attempt).toMatchObject({
      state: "succeeded",
      executor_id: EXECUTOR,
      connector: "mock_crm",
    });
    expect(attempt?.external_reference).toBe(crm.leads().at(-1)?.id);
    const grant = (
      await sql<{ consumed_at: Date | null }>(
        "SELECT consumed_at FROM axo.execution_grants WHERE action_request_id = $1",
        [requestId],
      )
    )[0];
    expect(grant?.consumed_at).not.toBeNull();
    expect(await eventTypes(requestId)).toEqual([
      "approval.requested",
      "action_request.created",
      "decision.recorded",
      "approval.approved",
      "action_request.queued",
      "grant.claimed",
      "execution.started",
      "execution.succeeded",
    ]);
    // The agent can see the result, and nothing but the status.
    const status = await getActionRequestStatus(
      w.agentPool,
      w.pepper,
      `Bearer ${agent.key}`,
      requestId,
    );
    expect(status).toMatchObject({ kind: "found", status: "succeeded" });
    expect(JSON.stringify(status)).not.toContain("grant");
  });

  it("executes a directly allowed action too, and a replayed submission does not execute twice", async () => {
    await drain();
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const key = idem();
    const first = await w.submit(agent.key, leadBody(), key);
    const second = await w.submit(agent.key, leadBody(), key);
    if (first.kind !== "decided" || second.kind !== "decided") throw new Error("not decided");
    expect(second.id).toBe(first.id);
    const before = crm.leads().length;
    expect(await drain()).toHaveLength(1);
    await w.submit(agent.key, leadBody(), key);
    expect(await drain()).toHaveLength(0);
    expect(crm.leads()).toHaveLength(before + 1);
    expect(await requestStatus(first.id)).toBe("succeeded");
  });

  it("is idle when there is nothing authorized, and does not run requests that are only pending or denied", async () => {
    await drain();
    const org = await w.freshOrg();
    await submitFor(org, "approval"); // pending a human
    const denied = await w.newAgent(org, org.dev);
    await w.submit(denied.key); // default deny
    const before = crm.authorizedCalls();
    expect(await runOnce(deps())).toEqual({ kind: "idle" });
    expect(crm.authorizedCalls()).toBe(before);
  });
});

describe("S02 a general permission never bypasses a required approval", () => {
  it("keeps the request pending when an allow policy exists beside a require_approval policy", async () => {
    await drain();
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    await w.policy(org, { effect: "allow" }); // and a broad organization-wide allow
    const out = await w.submit(agent.key);
    if (out.kind !== "decided") throw new Error(out.kind);
    expect(out.status).toBe("pending_approval");
    const before = crm.authorizedCalls();
    expect(await drain()).toEqual([]);
    expect(crm.authorizedCalls()).toBe(before);
  });

  it("will not run a request whose approval is forged: status and grant set directly, no human decision", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await submitFor(org, "approval");
    const admin = await adminClient();
    // Even with full database privileges an attacker cannot make this look approved without the approval row agreeing:
    // the claim re-reads the approval under lock.
    await withTriggerOff("axo.action_requests", "action_requests_update_guard", async () => {
      await admin.query(
        "UPDATE axo.action_requests SET status = 'queued_execution' WHERE id = $1",
        [requestId],
      );
    });
    await sql(
      "INSERT INTO axo.execution_grants (organization_id, action_request_id, digest, expires_at) SELECT organization_id, id, canonical_digest, now() + interval '5 minutes' FROM axo.action_requests WHERE id = $1",
      [requestId],
    );
    const before = crm.authorizedCalls();
    const results = await drain();
    expect(results).toEqual([{ kind: "blocked", requestId, reasonCode: "APPROVAL_DENIED" }]);
    expect(crm.authorizedCalls()).toBe(before);
    expect(await requestStatus(requestId)).toBe("denied");
  });

  it("will not run a request queued as 'allowed' whose policy has since started requiring approval", async () => {
    await drain();
    const org = await w.freshOrg();
    const { agent, requestId } = await queued(org, "allow");
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const before = crm.authorizedCalls();
    expect(await drain()).toEqual([{ kind: "blocked", requestId, reasonCode: "POLICY_CHANGED" }]);
    expect(crm.authorizedCalls()).toBe(before);
    expect(await requestStatus(requestId)).toBe("denied");
  });
});

describe("S11 everything is re-checked at the moment of execution", () => {
  it("blocks when the policy was changed to deny after approval", async () => {
    await drain();
    const org = await w.freshOrg();
    const { agent, requestId } = await queued(org);
    await w.policy(org, { effect: "deny", agentId: agent.agentId });
    const before = crm.authorizedCalls();
    expect(await drain()).toEqual([{ kind: "blocked", requestId, reasonCode: "POLICY_CHANGED" }]);
    expect(crm.authorizedCalls()).toBe(before);
    const grant = (
      await sql<{ invalidated_reason: string }>(
        "SELECT invalidated_reason FROM axo.execution_grants WHERE action_request_id = $1",
        [requestId],
      )
    )[0];
    expect(grant?.invalidated_reason).toBe("policy_changed");
    expect(await eventTypes(requestId)).toContain("execution.blocked");
    expect(await eventTypes(requestId)).not.toContain("grant.claimed");
  });

  it("re-evaluates the rules for THIS request: an unrelated rule change does not stop it, a relevant one does", async () => {
    await drain();
    const org = await w.freshOrg();
    const unaffected = await queued(org, "allow");
    const affected = await queued(org, "allow");
    const other = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "deny", agentId: other.agentId }); // concerns a different agent
    await w.policy(org, { effect: "deny", agentId: affected.agent.agentId });
    const results = await drain();
    const byId = new Map(results.map((r) => [r.requestId, r]));
    expect(byId.get(unaffected.requestId)).toMatchObject({
      kind: "executed",
      outcome: "succeeded",
    });
    expect(byId.get(affected.requestId)).toMatchObject({
      kind: "blocked",
      reasonCode: "POLICY_CHANGED",
    });
  });

  it("withdraws a queued request when the agent is suspended, its key revoked, or its environment halted", async () => {
    await drain();
    const org = await w.freshOrg();
    const a = await queued(org);
    const b = await queued(org);
    const c = await queued(org);
    await w.manage(org.admin, org, (ctx) => suspendAgent(ctx, { agentId: a.agent.agentId }));
    await w.manage(org.admin, org, (ctx) =>
      revokeCredential(ctx, { credentialId: b.agent.credentialId }),
    );
    const before = crm.authorizedCalls();
    for (const made of [a, b]) expect(await requestStatus(made.requestId)).toBe("denied");
    // A halt does not rewrite requests; it stops them at the moment they would run.
    await w.manage(org.admin, org, (ctx) => haltEnvironment(ctx, { environmentId: org.dev }));
    expect(await drain()).toEqual([
      { kind: "blocked", requestId: c.requestId, reasonCode: "ENVIRONMENT_HALTED" },
    ]);
    expect(crm.authorizedCalls()).toBe(before);
    expect(await requestStatus(c.requestId)).toBe("denied");
  });

  it("blocks at claim time even when the withdrawal was bypassed (defence in depth)", async () => {
    await drain();
    const cases: Array<{
      name: string;
      reason: string;
      tamper(made: Awaited<ReturnType<typeof queued>>, org: TestOrg): Promise<unknown>;
    }> = [
      {
        name: "agent suspended",
        reason: "AGENT_SUSPENDED",
        tamper: (m) =>
          sql("UPDATE axo.agents SET status = 'suspended', suspended_at = now() WHERE id = $1", [
            m.agent.agentId,
          ]),
      },
      {
        name: "credential revoked",
        reason: "CREDENTIAL_REVOKED",
        tamper: (m) =>
          sql(
            "UPDATE axo.agent_credentials SET revoked_at = now(), revoked_reason = 'manual' WHERE id = $1",
            [m.agent.credentialId],
          ),
      },
      {
        name: "environment halted",
        reason: "ENVIRONMENT_HALTED",
        tamper: (_m, org) =>
          sql("UPDATE axo.environments SET enforcement_state = 'halted' WHERE id = $1", [org.dev]),
      },
    ];
    for (const c of cases) {
      const org = await w.freshOrg();
      const made = await queued(org);
      await c.tamper(made, org);
      const before = crm.authorizedCalls();
      expect(await drain(), c.name).toEqual([
        { kind: "blocked", requestId: made.requestId, reasonCode: c.reason },
      ]);
      expect(crm.authorizedCalls(), c.name).toBe(before);
    }
  });

  it("blocks an expired grant and marks the request expired", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    await withTriggerOff("axo.execution_grants", "execution_grants_guard", async () => {
      await sql(
        "UPDATE axo.execution_grants SET created_at = now() - interval '20 minutes', expires_at = now() - interval '1 minute' WHERE action_request_id = $1",
        [requestId],
      );
    });
    const before = crm.authorizedCalls();
    expect(await drain()).toEqual([{ kind: "blocked", requestId, reasonCode: "GRANT_EXPIRED" }]);
    expect(crm.authorizedCalls()).toBe(before);
    expect(await requestStatus(requestId)).toBe("expired");
  });

  it("blocks when the stored parameters no longer match the approved digest (tampered, swapped or erased)", async () => {
    await drain();
    const org = await w.freshOrg();
    const victim = await queued(org, "approval", { company: "Approved Co" });
    const donor = await queued(org, "approval", { company: "Different Co" });
    const erased = await queued(org);
    await withTriggerOff("axo.action_requests", "action_requests_update_guard", async () => {
      await sql(
        "UPDATE axo.action_requests SET parameters_ciphertext = (SELECT parameters_ciphertext FROM axo.action_requests WHERE id = $2) WHERE id = $1",
        [victim.requestId, donor.requestId],
      );
      await sql(
        "UPDATE axo.action_requests SET parameters_ciphertext = NULL, parameters_purged_at = now() WHERE id = $1",
        [erased.requestId],
      );
    });
    // The donor itself is untouched and runs normally; the other two are refused.
    const before = crm.leads().length;
    const results = await drain();
    const byId = new Map(results.map((r) => [r.requestId, r]));
    expect(byId.get(victim.requestId)).toMatchObject({
      kind: "blocked",
      reasonCode: "DIGEST_MISMATCH",
    });
    expect(byId.get(erased.requestId)).toMatchObject({
      kind: "blocked",
      reasonCode: "DIGEST_MISMATCH",
    });
    expect(byId.get(donor.requestId)).toMatchObject({ kind: "executed", outcome: "succeeded" });
    expect(crm.leads()).toHaveLength(before + 1);
    expect(crm.leads().at(-1)?.company).toBe("Different Co");
  });
});

describe("S10 a grant is used once", () => {
  it("lets exactly one of many racing executors run a single grant", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    const before = crm.leads().length;
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => runOnce(deps({ executorId: `racer-${String(i)}` }))),
    );
    expect(results.filter((r) => r.kind === "executed")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "idle")).toHaveLength(9);
    expect(crm.leads()).toHaveLength(before + 1);
    const attempts = await sql(
      "SELECT 1 FROM axo.execution_attempts WHERE action_request_id = $1",
      [requestId],
    );
    expect(attempts).toHaveLength(1);
    expect(
      await eventTypes(requestId).then((e) => e.filter((x) => x === "grant.claimed")),
    ).toHaveLength(1);
  });

  it("runs many grants across tenants, each once, with each tenant's own values", async () => {
    await drain();
    const orgs = [await w.freshOrg(), await w.freshOrg()];
    const made = [];
    for (const [i, org] of orgs.entries()) {
      for (let n = 0; n < 4; n++)
        made.push(
          await queued(org, n % 2 === 0 ? "approval" : "allow", {
            company: `Tenant${String(i)}-Lead${String(n)}`,
          }),
        );
    }
    const before = crm.leads().length;
    const results = (
      await Promise.all(
        Array.from({ length: 12 }, (_, i) => drain({ executorId: `pool-${String(i)}` })),
      )
    ).flat();
    expect(results).toHaveLength(8);
    expect(results.every((r) => r.kind === "executed" && r.outcome === "succeeded")).toBe(true);
    expect(new Set(results.map((r) => (r.kind === "executed" ? r.requestId : ""))).size).toBe(8);
    const created = crm
      .leads()
      .slice(before)
      .map((l) => l.company)
      .sort();
    expect(created).toEqual(
      Array.from({ length: 2 }, (_, i) =>
        Array.from({ length: 4 }, (_, n) => `Tenant${String(i)}-Lead${String(n)}`),
      )
        .flat()
        .sort(),
    );
    for (const m of made) expect(await requestStatus(m.requestId)).toBe("succeeded");
  });

  it("cannot be replayed: a consumed or invalidated grant is never claimed again", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    await drain();
    const before = crm.authorizedCalls();
    for (let i = 0; i < 3; i++) expect(await runOnce(deps())).toEqual({ kind: "idle" });
    await expect(
      sql("UPDATE axo.execution_grants SET consumed_at = NULL WHERE action_request_id = $1", [
        requestId,
      ]),
    ).rejects.toMatchObject({ message: expect.stringContaining("used grant") });
    expect(crm.authorizedCalls()).toBe(before);
  });
});

describe("S12 authorized is not executed, and what happened is recorded honestly", () => {
  it("records a refusal by the destination as failed (it cannot have acted)", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    crm.faults.failWith = 422;
    expect(await drain()).toEqual([
      { kind: "executed", requestId, outcome: "failed", errorClass: "rejected_422" },
    ]);
    expect(await requestStatus(requestId)).toBe("failed");
    expect(crm.leads().some((l) => l.id === "x")).toBe(false);
  });

  it("records a wrong service token as failed, not as success", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    expect(await drain({ connector: connector(2_000, crmUrl, "not-the-token") })).toEqual([
      { kind: "executed", requestId, outcome: "failed", errorClass: "rejected_401" },
    ]);
  });

  it("records an unreachable destination as failed", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    const free = await new Promise<number>((resolve) => {
      const s = createServer();
      s.listen(0, "127.0.0.1", () => {
        const port = (s.address() as { port: number }).port;
        s.close(() => resolve(port));
      });
    });
    expect(
      await drain({ connector: connector(2_000, `http://127.0.0.1:${String(free)}`) }),
    ).toEqual([{ kind: "executed", requestId, outcome: "failed", errorClass: "unreachable" }]);
  });

  it("records a lost answer after the lead was created as UNKNOWN, and never retries it", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    const before = crm.leads().length;
    crm.faults.dropAfterCreate = true;
    const results = await drain();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: "executed", requestId, outcome: "unknown" });
    expect(crm.leads()).toHaveLength(before + 1); // the effect DID happen, which is exactly why "failed" would be a lie
    expect(await requestStatus(requestId)).toBe("unknown");
    // No retry, by this executor or any other, and not by maintenance.
    delete crm.faults.dropAfterCreate;
    expect(await drain()).toEqual([]);
    await maintain(pool);
    expect(await drain()).toEqual([]);
    expect(crm.leads()).toHaveLength(before + 1);
    expect(await requestStatus(requestId)).toBe("unknown");
  });

  it("records a timeout as UNKNOWN", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    crm.faults.delayMs = 1_500;
    expect(await drain({ connector: connector(250) })).toEqual([
      { kind: "executed", requestId, outcome: "unknown", errorClass: "timeout" },
    ]);
    expect(await requestStatus(requestId)).toBe("unknown");
  });

  it("records a server error as UNKNOWN (the destination may have acted before failing)", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    crm.faults.failWith = 503;
    expect(await drain()).toEqual([
      { kind: "executed", requestId, outcome: "unknown", errorClass: "status_503" },
    ]);
  });

  it("records a connector that crashes as UNKNOWN, not failed", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org);
    const broken: Connector = {
      name: "mock_crm",
      execute: () => Promise.reject(new Error("boom")),
    };
    expect(await drain({ connector: broken })).toEqual([
      { kind: "executed", requestId, outcome: "unknown", errorClass: "connector_fault" },
    ]);
  });

  it("closes an attempt lost to an executor crash as UNKNOWN, once, and a late result cannot overwrite it", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org, "allow");
    // Simulate a process that claimed the grant and then died before reporting.
    const client = await pool.connect();
    let attemptId: string;
    try {
      await client.query("BEGIN");
      const row = (
        await client.query<{ grant_id: string; policy_epoch: string }>(
          "SELECT * FROM axo.claim_lock_next($1)",
          ["doomed-executor"],
        )
      ).rows[0];
      if (row === undefined) throw new Error("nothing to claim");
      const finished = (
        await client.query<{ outcome: string; attempt_id: string }>(
          "SELECT * FROM axo.claim_finish($1::uuid, $2, 'allow', $3::bigint, true)",
          [row.grant_id, "doomed-executor", row.policy_epoch],
        )
      ).rows[0];
      attemptId = finished?.attempt_id ?? "";
      expect(finished?.outcome).toBe("claimed");
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect(await requestStatus(requestId)).toBe("running");
    const before = crm.authorizedCalls();
    expect(await drain()).toEqual([]); // not re-run
    expect((await maintain(pool)).lost).toBe(0); // too recent to call lost

    await withTriggerOff("axo.execution_attempts", "execution_attempts_guard", async () => {
      await sql(
        "UPDATE axo.execution_attempts SET started_at = now() - interval '10 minutes' WHERE id = $1",
        [attemptId],
      );
    });
    expect((await maintain(pool)).lost).toBe(1);
    expect((await maintain(pool)).lost).toBe(0);
    expect(await requestStatus(requestId)).toBe("unknown");
    expect(
      (
        await sql<{ error_class: string }>(
          "SELECT error_class FROM axo.execution_attempts WHERE id = $1",
          [attemptId],
        )
      )[0]?.error_class,
    ).toBe("executor_lost");
    expect(crm.authorizedCalls()).toBe(before);

    // The zombie executor wakes up and reports success: refused, nothing changes.
    const late = await pool.query<{ r: string }>(
      "SELECT axo.record_execution_result($1::uuid, 'doomed-executor', 'succeeded', 'lead_x', NULL) AS r",
      [attemptId],
    );
    expect(late.rows[0]?.r).toBe("not_started");
    expect(await requestStatus(requestId)).toBe("unknown");
  });

  it("accepts a result once, and only from the executor that started the attempt", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org, "allow");
    await drain();
    const attempt = (
      await sql<{ id: string }>(
        "SELECT id FROM axo.execution_attempts WHERE action_request_id = $1",
        [requestId],
      )
    )[0];
    for (const executor of [EXECUTOR, "someone-else"]) {
      for (const outcome of ["failed", "succeeded"]) {
        const r = await pool.query<{ r: string }>(
          "SELECT axo.record_execution_result($1::uuid, $2, $3, NULL, NULL) AS r",
          [attempt?.id, executor, outcome],
        );
        expect(r.rows[0]?.r).toBe("not_started");
      }
    }
    expect(await requestStatus(requestId)).toBe("succeeded");
  });
});

describe("S13 a failed audit write is never ignored", () => {
  it("does not start executing when the claim cannot be recorded, and recovers cleanly afterwards", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org, "allow");
    await installAuditFailure("grant.claimed");
    const before = crm.authorizedCalls();
    await expect(runOnce(deps())).rejects.toThrow(/audit store unavailable/);
    expect(crm.authorizedCalls()).toBe(before); // the destination was never called
    expect(await requestStatus(requestId)).toBe("queued_execution");
    expect(
      await sql(
        "SELECT 1 FROM axo.execution_grants WHERE action_request_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL",
        [requestId],
      ),
    ).toHaveLength(1);
    expect(
      await sql("SELECT 1 FROM axo.execution_attempts WHERE action_request_id = $1", [requestId]),
    ).toHaveLength(0);
    await removeAuditFailure();
    expect(await drain()).toEqual([{ kind: "executed", requestId, outcome: "succeeded" }]);
  });

  it("leaves the attempt honestly open (then unknown) when the result cannot be recorded, and does not run it again", async () => {
    await drain();
    const org = await w.freshOrg();
    const { requestId } = await queued(org, "allow");
    await installAuditFailure("execution.succeeded");
    const before = crm.leads().length;
    await expect(runOnce(deps())).rejects.toThrow(/audit store unavailable/);
    expect(crm.leads()).toHaveLength(before + 1);
    expect(await requestStatus(requestId)).toBe("running");
    await removeAuditFailure();
    expect(await drain()).toEqual([]);
    await withTriggerOff("axo.execution_attempts", "execution_attempts_guard", async () => {
      await sql(
        "UPDATE axo.execution_attempts SET started_at = now() - interval '10 minutes' WHERE action_request_id = $1",
        [requestId],
      );
    });
    await maintain(pool);
    expect(await requestStatus(requestId)).toBe("unknown");
    expect(crm.leads()).toHaveLength(before + 1);
  });
});

describe("S18 the destination cannot be reached with an agent's credential", () => {
  it("refuses an agent key, a missing token and a wrong token directly at the destination", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    const before = crm.leads().length;
    const body = JSON.stringify({
      full_name: "Mallory",
      email: "m@example.test",
      company: "Evil Co",
    });
    for (const authorization of [
      `Bearer ${agent.key}`,
      undefined,
      "Bearer wrong",
      `Basic ${Buffer.from(`x:${TOKEN}`).toString("base64")}`,
    ]) {
      const res = await fetch(new URL("/leads", crmUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idem(),
          ...(authorization === undefined ? {} : { authorization }),
        },
        body,
      });
      expect(res.status).toBe(401);
    }
    expect(crm.leads()).toHaveLength(before);
  });

  it("is protected by the executor's own role: it has no table access and cannot change requests itself", async () => {
    for (const statement of [
      "SELECT * FROM axo.action_requests",
      "SELECT * FROM axo.execution_grants",
      "SELECT * FROM axo.agent_credentials",
      "UPDATE axo.action_requests SET status = 'succeeded'",
      "INSERT INTO axo.execution_grants (organization_id, action_request_id, digest, expires_at) VALUES (gen_random_uuid(), gen_random_uuid(), repeat('a', 64), now())",
    ]) {
      await expect(pool.query(statement), statement).rejects.toMatchObject({ code: "42501" });
    }
  });
});

describe("retention (docs/BE-02-DECISIONS.md D10)", () => {
  it("erases the encrypted parameters of long-finished requests but keeps the digest, decision and audit trail", async () => {
    await drain();
    const org = await w.freshOrg();
    const finished = await queued(org, "allow");
    const recent = await queued(org, "allow");
    const pending = await submitFor(org, "approval");
    await drain();
    await withTriggerOff("axo.action_requests", "action_requests_update_guard", async () => {
      await sql(
        "UPDATE axo.action_requests SET updated_at = now() - interval '31 days' WHERE id = ANY($1::uuid[])",
        [[finished.requestId, pending.requestId]],
      );
    });
    const result = await maintain(pool);
    expect(result.purged).toBe(1);
    const rows = await sql<{ id: string; has_params: boolean; purged: boolean; digest: string }>(
      "SELECT id, parameters_ciphertext IS NOT NULL AS has_params, parameters_purged_at IS NOT NULL AS purged, canonical_digest AS digest FROM axo.action_requests WHERE id = ANY($1::uuid[])",
      [[finished.requestId, recent.requestId, pending.requestId]],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(finished.requestId)).toMatchObject({ has_params: false, purged: true });
    expect(byId.get(finished.requestId)?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(byId.get(recent.requestId)).toMatchObject({ has_params: true, purged: false }); // finished too recently
    expect(byId.get(pending.requestId)).toMatchObject({ has_params: true, purged: false }); // still waiting for a person
    expect(await eventTypes(finished.requestId)).toContain("action_request.parameters_purged");
    expect((await maintain(pool)).purged).toBe(0);
  });
});
