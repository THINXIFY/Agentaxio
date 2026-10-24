import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../src/db/pool";
import { submitActionRequest } from "../src/authorization/submit";
import { createPolicy, createPolicyVersion } from "../src/management";
import { createWorld, idem, leadBody, type World } from "./support/world";

/**
 * S13: when something the decision depends on fails, nothing is authorized and nothing is half-written.
 */

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w.close();
});

const counts = async (agentId: string) => {
  const admin = await w.db.admin();
  const r = await admin.query(
    `SELECT (SELECT count(*)::int FROM axo.action_requests WHERE agent_id = $1) AS requests,
            (SELECT count(*)::int FROM axo.decisions d JOIN axo.action_requests r ON r.id = d.action_request_id WHERE r.agent_id = $1) AS decisions,
            (SELECT count(*)::int FROM axo.audit_events WHERE actor_id = $1) AS events`,
    [agentId],
  );
  return r.rows[0] as { requests: number; decisions: number; events: number };
};

describe("S13 failed audit writes", () => {
  it("authorize nothing: a decision whose audit record cannot be written is rolled back entirely", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const admin = await w.db.admin();
    await admin.query(`
      CREATE FUNCTION axo.test_fail_decision_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'decision.recorded' THEN RAISE EXCEPTION 'simulated audit failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_fail_audit BEFORE INSERT ON axo.audit_events
        FOR EACH ROW EXECUTE FUNCTION axo.test_fail_decision_audit();`);
    try {
      await expect(w.submit(agent.key)).rejects.toThrow(/simulated audit failure/);
      // Not even the request row, the first audit event, or the decision survived.
      expect(await counts(agent.agentId)).toEqual({ requests: 0, decisions: 0, events: 0 });
    } finally {
      await admin.query(
        "DROP TRIGGER test_fail_audit ON axo.audit_events; DROP FUNCTION axo.test_fail_decision_audit()",
      );
    }
    // The service recovers and decides normally afterwards.
    const out = await w.submit(agent.key);
    expect(out).toMatchObject({ kind: "decided", status: "queued_execution" });
  });

  it("applies equally to management changes: a policy edit without its audit record does not happen, and the epoch does not move", async () => {
    const org = await w.freshOrg();
    const admin = await w.db.admin();
    await admin.query(`
      CREATE FUNCTION axo.test_fail_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'policy.version_created' THEN RAISE EXCEPTION 'simulated audit failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_fail_policy_audit BEFORE INSERT ON axo.audit_events
        FOR EACH ROW EXECUTE FUNCTION axo.test_fail_policy_audit();`);
    try {
      await expect(
        w.manage(org.admin, org, (c) =>
          createPolicy(c, {
            actionKey: "crm.lead.create",
            effect: "allow",
            conditions: { all: [] },
          }),
        ),
      ).rejects.toThrow(/simulated audit failure/);
      const policies = await admin.query(
        "SELECT count(*)::int AS n FROM axo.policies WHERE organization_id = $1",
        [org.id],
      );
      expect(policies.rows[0].n).toBe(0);
      const epoch = await admin.query(
        "SELECT max(policy_epoch)::int AS e FROM axo.environments WHERE organization_id = $1",
        [org.id],
      );
      expect(epoch.rows[0].e).toBe(0);
    } finally {
      await admin.query(
        "DROP TRIGGER test_fail_policy_audit ON axo.audit_events; DROP FUNCTION axo.test_fail_policy_audit()",
      );
    }
  });
});

describe("S13 unavailable dependencies", () => {
  it("authorize nothing when the database cannot be reached", async () => {
    const dead = createPool("postgres://axo_agent_api:x@127.0.0.1:1/none", "dead");
    try {
      await expect(
        submitActionRequest(dead, w.pepper, {
          authorization: "Bearer axo_x",
          idempotencyKey: idem(),
          body: leadBody(),
          traceId: "t",
        }),
      ).rejects.toThrow();
    } finally {
      await dead.end();
    }
  });

  it("authorize nothing when the connection is cut mid-decision", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const admin = await w.db.admin();
    // Make the decision slow, then terminate its database session while it is waiting.
    await admin.query(`
      CREATE FUNCTION axo.test_slow_decision() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(1.5); RETURN NEW; END $$;
      CREATE TRIGGER test_slow BEFORE INSERT ON axo.decisions FOR EACH ROW EXECUTE FUNCTION axo.test_slow_decision();`);
    try {
      const pending = w.submit(agent.key);
      await new Promise((r) => setTimeout(r, 600));
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'axo_agent_api' AND datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid()",
      );
      await expect(pending).rejects.toThrow();
      expect(await counts(agent.agentId)).toEqual({ requests: 0, decisions: 0, events: 0 });
    } finally {
      await admin.query(
        "DROP TRIGGER test_slow ON axo.decisions; DROP FUNCTION axo.test_slow_decision()",
      );
    }
    expect((await w.submit(agent.key)).kind).toBe("decided");
  });

  it("fail rather than decide on stale policy when a policy change is in progress for longer than the lock timeout", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const admin = await w.db.admin();
    await admin.query("BEGIN");
    try {
      // A writer holding the environment for a long time (an in-progress policy change).
      await admin.query("SELECT 1 FROM axo.environments WHERE id = $1 FOR UPDATE", [org.dev]);
      const started = Date.now();
      await expect(w.submit(agent.key)).rejects.toMatchObject({ code: "55P03" });
      expect(Date.now() - started).toBeGreaterThan(2500);
      expect(await counts(agent.agentId)).toEqual({ requests: 0, decisions: 0, events: 0 });
    } finally {
      await admin.query("ROLLBACK");
    }
    expect((await w.submit(agent.key)).kind).toBe("decided");
  });
});

describe("S04 evaluator errors and corrupt policy", () => {
  it("record a denial (EVALUATOR_ERROR) instead of guessing, when a stored policy cannot be understood", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    // A policy that bypassed write-time validation (a bug or a direct database edit): it names a field that does not exist.
    const admin = await w.db.admin();
    const header = await admin.query(
      "INSERT INTO axo.policies (organization_id, action_key, agent_id, created_by_user_id) VALUES ($1, 'crm.lead.create', $2, $3) RETURNING id",
      [org.id, agent.agentId, org.owner],
    );
    await admin.query(
      "INSERT INTO axo.policy_versions (organization_id, policy_id, version, effect, conditions, priority, enabled, created_by_user_id) VALUES ($1, $2, 1, 'allow', $3::jsonb, 0, true, $4)",
      [
        org.id,
        header.rows[0].id,
        JSON.stringify({ all: [{ field: "phone", op: "eq", value: "1" }] }),
        org.owner,
      ],
    );
    const out = await w.submit(agent.key);
    expect(out).toMatchObject({
      kind: "decided",
      httpStatus: 403,
      status: "denied",
      reasonCode: "EVALUATOR_ERROR",
    });
    const decision = await admin.query(
      "SELECT basis FROM axo.decisions WHERE action_request_id = $1",
      [out.kind === "decided" ? out.id : ""],
    );
    expect(decision.rows[0].basis).toBe("evaluator_error");
  });

  it("ignore nothing silently: a stored policy that is structurally corrupt is also a denial", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    const admin = await w.db.admin();
    const header = await admin.query(
      "INSERT INTO axo.policies (organization_id, action_key, agent_id, created_by_user_id) VALUES ($1, 'crm.lead.create', $2, $3) RETURNING id",
      [org.id, agent.agentId, org.owner],
    );
    await admin.query(
      "INSERT INTO axo.policy_versions (organization_id, policy_id, version, effect, conditions, priority, enabled, created_by_user_id) VALUES ($1, $2, 1, 'allow', $3::jsonb, 0, true, $4)",
      [
        org.id,
        header.rows[0].id,
        JSON.stringify({ all: [{ field: "company", op: "regex", value: "(a+)+$" }] }),
        org.owner,
      ],
    );
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const out = await w.submit(agent.key);
    expect(out).toMatchObject({ status: "denied", reasonCode: "EVALUATOR_ERROR" });
  });
});

describe("bounds on abuse", () => {
  it("returns rate_limited once an agent already holds the maximum number of pending approvals, but still decides other requests", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, {
      effect: "require_approval",
      agentId: agent.agentId,
      conditions: { all: [{ field: "company", op: "eq", value: "Needs Review" }] },
    });
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const admin = await w.db.admin();
    await admin.query(
      `INSERT INTO axo.action_requests (organization_id, agent_id, environment_id, action_key, resource, request_key,
         canonical_digest, canonical_parameters, status, originating_credential_id, expires_at)
       SELECT $1, $2, $3, 'crm.lead.create', 'mockcrm/leads', 'filler-' || lpad(g::text, 12, '0'), repeat('c', 64), '{}',
              'pending_approval', $4, now() + interval '10 minutes'
         FROM generate_series(1, 100) g`,
      [org.id, agent.agentId, org.dev, agent.credentialId],
    );
    expect(await w.submit(agent.key, leadBody({ company: "Needs Review" }))).toEqual({
      kind: "rate_limited",
    });
    expect(await w.submit(agent.key, leadBody({ company: "Fine Ltd" }))).toMatchObject({
      status: "queued_execution",
    });
  });

  it("revision with a stale base cannot silently overwrite a concurrent change", async () => {
    const org = await w.freshOrg();
    const p = await w.manage(org.admin, org, (c) =>
      createPolicy(c, { actionKey: "crm.lead.create", effect: "allow", conditions: { all: [] } }),
    );
    await w.manage(org.owner, org, (c) =>
      createPolicyVersion(c, {
        policyId: p.policyId,
        expectedVersion: 1,
        effect: "deny",
        conditions: { all: [] },
      }),
    );
    await expect(
      w.manage(org.admin, org, (c) =>
        createPolicyVersion(c, {
          policyId: p.policyId,
          expectedVersion: 1,
          effect: "allow",
          conditions: { all: [] },
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
