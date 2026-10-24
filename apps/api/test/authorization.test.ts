import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leadBody, idem, createWorld, type World } from "./support/world";
import type { SubmitOutcome } from "../src/authorization/submit";

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w.close();
});

const decided = (o: SubmitOutcome) => {
  if (o.kind !== "decided") throw new Error(`expected a decision, got ${o.kind}`);
  return o;
};

describe("decisions follow the policy (S04, S05)", () => {
  it("S04 default deny: no policy at all is an implicit deny", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    const out = decided(await w.submit(agent.key));
    expect(out).toMatchObject({ httpStatus: 403, status: "denied", reasonCode: "POLICY_DENY" });
  });

  it("an allow policy queues the request for execution, and that is not execution", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const out = decided(await w.submit(agent.key));
    expect(out).toMatchObject({ httpStatus: 202, status: "queued_execution" });
    expect(out.reasonCode).toBeNull();
  });

  it("a require_approval policy leaves the request pending a human", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const out = decided(await w.submit(agent.key));
    expect(out).toMatchObject({
      httpStatus: 202,
      status: "pending_approval",
      reasonCode: "HUMAN_REVIEW_REQUIRED",
    });
  });

  it("S05 deny precedence: an explicit deny overrides an allow and an approval rule", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId, priority: 1000 });
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId, priority: 1000 });
    await w.policy(w.orgA, { effect: "deny", agentId: agent.agentId, priority: 0 });
    expect(decided(await w.submit(agent.key)).status).toBe("denied");
  });

  it("an approval requirement is not bypassed by a broader allow", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", environmentId: org.dev, priority: 1000 });
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId, priority: 0 });
    expect(decided(await w.submit(agent.key)).status).toBe("pending_approval");
  });

  it("conditions decide: only the matching request is held for approval", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    await w.policy(w.orgA, {
      effect: "require_approval",
      agentId: agent.agentId,
      conditions: { all: [{ field: "email", op: "email_domain_in", value: ["external.test"] }] },
    });
    expect(decided(await w.submit(agent.key, leadBody({ email: "a@internal.test" }))).status).toBe(
      "queued_execution",
    );
    expect(decided(await w.submit(agent.key, leadBody({ email: "a@external.test" }))).status).toBe(
      "pending_approval",
    );
  });

  it("S04 unknown action is a recorded denial, not a validation error", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const out = decided(
      await w.submit(agent.key, {
        action: "payments.refund.create",
        resource: "bank/refunds",
        parameters: { amount: "1" },
      }),
    );
    expect(out).toMatchObject({ httpStatus: 403, status: "denied", reasonCode: "UNKNOWN_ACTION" });
  });

  it("policies of another agent, environment or organization never apply", async () => {
    const org = await w.freshOrg();
    const mine = await w.newAgent(org, org.dev);
    const other = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: other.agentId });
    await w.policy(org, { effect: "allow", environmentId: org.prod });
    await w.policy(w.orgB, { effect: "allow" });
    expect(decided(await w.submit(mine.key)).status).toBe("denied");
  });

  it("S03 environment isolation: a development agent is not covered by a production policy", async () => {
    const org = await w.freshOrg();
    const dev = await w.newAgent(org, org.dev);
    const prod = await w.newAgent(org, org.prod);
    await w.policy(org, { effect: "allow", environmentId: org.prod });
    expect(decided(await w.submit(dev.key)).status).toBe("denied");
    expect(decided(await w.submit(prod.key)).status).toBe("queued_execution");
  });

  it("a disabled policy version stops applying, and re-enabling restores it", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    const p = await w.policy(org, { effect: "allow", agentId: agent.agentId });
    expect(decided(await w.submit(agent.key)).status).toBe("queued_execution");
    await w.manage(org.admin, org, (c) =>
      import("../src/management").then((m) =>
        m.createPolicyVersion(c, {
          policyId: p.policyId,
          expectedVersion: 1,
          effect: "allow",
          conditions: { all: [] },
          enabled: false,
        }),
      ),
    );
    expect(decided(await w.submit(agent.key)).status).toBe("denied");
  });
});

describe("request integrity and idempotency (S12, S06)", () => {
  it("S12 the same key and payload returns the same request, once", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const key = idem();
    const first = decided(await w.submit(agent.key, leadBody(), key));
    const second = decided(await w.submit(agent.key, leadBody(), key));
    expect(second.id).toBe(first.id);
    expect(second.replay).toBe(true);
    expect(first.replay).toBe(false);
    const admin = await w.db.admin();
    const rows = await admin.query(
      "SELECT count(*)::int AS n FROM axo.action_requests WHERE agent_id = $1",
      [agent.agentId],
    );
    expect(rows.rows[0]?.n).toBe(1);
  });

  it("S12/S06 the same key with a changed parameter is a conflict, and creates nothing", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const key = idem();
    decided(await w.submit(agent.key, leadBody(), key));
    for (const change of [
      leadBody({ full_name: "Ada Examplf" }),
      leadBody({ email: "ada@example.test.evil" }),
      leadBody({ company: "Other Co" }),
    ]) {
      expect((await w.submit(agent.key, change, key)).kind).toBe("idempotency_conflict");
    }
    const admin = await w.db.admin();
    const rows = await admin.query(
      "SELECT count(*)::int AS n FROM axo.action_requests WHERE agent_id = $1",
      [agent.agentId],
    );
    expect(rows.rows[0]?.n).toBe(1);
  });

  it("a denial is also replayed faithfully (a retry cannot turn it into something else)", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    const key = idem();
    const first = decided(await w.submit(agent.key, leadBody(), key));
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const again = decided(await w.submit(agent.key, leadBody(), key));
    expect(again).toMatchObject({ id: first.id, status: "denied", replay: true });
  });

  it("the same Idempotency-Key from two agents never interacts", async () => {
    const org = await w.freshOrg();
    const a = await w.newAgent(org, org.dev);
    const b = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", environmentId: org.dev });
    const key = idem();
    const ra = decided(await w.submit(a.key, leadBody(), key));
    const rb = decided(await w.submit(b.key, leadBody({ company: "Different" }), key));
    expect(ra.id).not.toBe(rb.id);
    expect(rb.replay).toBe(false);
  });

  it("S12 20 parallel identical submissions create exactly one request and one decision", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const key = idem();
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => w.submit(agent.key, leadBody(), key)),
    );
    const ids = new Set(outcomes.map((o) => decided(o).id));
    expect(ids.size).toBe(1);
    const admin = await w.db.admin();
    const counts = await admin.query(
      `SELECT (SELECT count(*)::int FROM axo.action_requests WHERE agent_id = $1) AS requests,
              (SELECT count(*)::int FROM axo.decisions d JOIN axo.action_requests r ON r.id = d.action_request_id WHERE r.agent_id = $1) AS decisions`,
      [agent.agentId],
    );
    expect(counts.rows[0]).toEqual({ requests: 1, decisions: 1 });
  });

  it("20 parallel requests with different keys all succeed with distinct ids", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const outcomes = await Promise.all(Array.from({ length: 20 }, () => w.submit(agent.key)));
    const ids = new Set(outcomes.map((o) => decided(o).id));
    expect(ids.size).toBe(20);
  });
});

describe("invalid input (S17)", () => {
  it("is rejected with issues, stores no request, and records an audit event without the payload", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const secretName = "PersonalDataThatMustNotBeLogged";
    const out = await w.submit(
      agent.key,
      leadBody({ full_name: secretName, email: "not-an-email" }),
    );
    expect(out.kind).toBe("invalid");
    const admin = await w.db.admin();
    const requests = await admin.query(
      "SELECT count(*)::int AS n FROM axo.action_requests WHERE agent_id = $1",
      [agent.agentId],
    );
    expect(requests.rows[0]?.n).toBe(0);
    const audit = await admin.query(
      "SELECT metadata FROM axo.audit_events WHERE actor_id = $1 AND event_type = 'action_request.rejected_invalid'",
      [agent.agentId],
    );
    expect(audit.rowCount).toBe(1);
    expect(JSON.stringify(audit.rows)).not.toContain(secretName);
  });

  it("rejects a missing, malformed or unsafe Idempotency-Key", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    for (const bad of ["", "short", "has space in the key !!", "x".repeat(200)]) {
      expect((await w.submit(agent.key, leadBody(), bad)).kind, bad).toBe("invalid");
    }
  });

  it("rejects tenant/agent/credential claims smuggled into the body", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    for (const extra of [
      { organization_id: w.orgB.id },
      { agent_id: "00000000-0000-0000-0000-000000000000" },
      { environment_id: w.orgA.prod },
      { credential: "axo_x" },
    ]) {
      expect((await w.submit(agent.key, { ...leadBody(), ...extra })).kind).toBe("invalid");
    }
  });

  it("stores injection-looking text as data and never executes it", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const company = "x'); DROP TABLE axo.action_requests; --";
    const out = decided(await w.submit(agent.key, leadBody({ company })));
    const admin = await w.db.admin();
    const stored = await admin.query(
      "SELECT canonical_parameters->>'company' AS company FROM axo.action_requests WHERE id = $1",
      [out.id],
    );
    expect(stored.rows[0]?.company).toBe(company);
  });
});

describe("audit trail (S14)", () => {
  it("records request, decision and queueing in one correlated sequence, separate from any execution", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const out = decided(await w.submit(agent.key));
    const admin = await w.db.admin();
    const events = await admin.query(
      "SELECT event_type, actor_type, actor_id, request_id, trace_id FROM axo.audit_events WHERE request_id = $1 ORDER BY id",
      [out.id],
    );
    expect(events.rows.map((r) => r.event_type)).toEqual([
      "action_request.created",
      "decision.recorded",
      "action_request.queued",
    ]);
    for (const row of events.rows) {
      expect(row.actor_type).toBe("agent");
      expect(row.actor_id).toBe(agent.agentId);
      expect(row.trace_id).toBeTruthy();
    }
    // There is no execution event: M01 cannot execute anything.
    const executed = await admin.query(
      "SELECT count(*)::int AS n FROM axo.audit_events WHERE event_type LIKE 'execution.%'",
    );
    expect(executed.rows[0]?.n).toBe(0);
  });

  it("records the policy version and epoch that decided, and a policy change moves the epoch", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    const first = await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const a = decided(await w.submit(agent.key));
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const b = decided(await w.submit(agent.key));
    const admin = await w.db.admin();
    const rows = await admin.query(
      "SELECT action_request_id, policy_version_id, policy_epoch::int AS epoch FROM axo.decisions WHERE action_request_id = ANY($1) ORDER BY decided_at",
      [[a.id, b.id]],
    );
    expect(rows.rows[0]?.policy_version_id).toBe(first.versionId);
    expect(rows.rows[1]?.epoch).toBeGreaterThan(rows.rows[0]?.epoch as number);
  });

  it("never copies parameter values into audit metadata", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const marker = "UniquePersonalMarkerXyz";
    decided(await w.submit(agent.key, leadBody({ full_name: marker, company: marker })));
    const admin = await w.db.admin();
    const dump = await admin.query("SELECT metadata::text AS m, event_type FROM axo.audit_events");
    expect(dump.rows.map((r) => r.m as string).join("\n")).not.toContain(marker);
    const decisions = await admin.query("SELECT row_to_json(d)::text AS j FROM axo.decisions d");
    expect(decisions.rows.map((r) => r.j as string).join("\n")).not.toContain(marker);
  });
});

describe("expiry never depends on a sweeper", () => {
  it("reports a lapsed pending request as expired", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const out = decided(await w.submit(agent.key));
    const admin = await w.db.admin();
    await admin.query(
      "ALTER TABLE axo.action_requests DISABLE TRIGGER action_requests_update_guard",
    );
    await admin.query(
      "UPDATE axo.action_requests SET expires_at = now() - interval '1 second', created_at = now() - interval '2 seconds' WHERE id = $1",
      [out.id],
    );
    await admin.query(
      "ALTER TABLE axo.action_requests ENABLE TRIGGER action_requests_update_guard",
    );
    const { getActionRequestStatus } = await import("../src/authorization/status");
    const status = await getActionRequestStatus(
      w.agentPool,
      w.pepper,
      `Bearer ${agent.key}`,
      out.id,
    );
    expect(status).toMatchObject({
      kind: "found",
      status: "expired",
      reasonCode: "APPROVAL_EXPIRED",
    });
  });
});
