import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionMembership, provisionUser } from "../src/db/provision";
import { maintain } from "../src/executor/executor";
import {
  createPolicy,
  createPolicyVersion,
  decideApproval,
  issueCredential,
  listApprovals,
  registerAgent,
  reviewApproval,
  suspendAgent,
} from "../src/management";
import { getActionRequestStatus } from "../src/authorization/status";
import { createHumanWorld, newUser, type Browser, type HumanWorld } from "./support/human";
import { leadBody, type TestOrg } from "./support/world";

/**
 * The human approval workflow. Approval is permission, not execution: these tests check who may decide, what they must
 * have seen, what is blocked, and that a decision is atomic however many people press the button at once.
 */

let h: HumanWorld;
beforeAll(async () => {
  h = await createHumanWorld();
});
afterAll(async () => {
  await h.close();
});
const w = () => h.world;

async function member(
  org: TestOrg,
  role: "owner" | "admin" | "approver" | "viewer",
): Promise<string> {
  const userId = await provisionUser(w().migratorPool, {
    issuer: "https://idp.invalid",
    subject: `m-${randomBytes(5).toString("hex")}`,
  });
  await provisionMembership(w().migratorPool, { organizationId: org.id, userId, role });
  return userId;
}

/** An agent owned by the org owner, registered by the admin, whose key the admin issued: the people related to it are owner and admin. */
async function pendingRequest(org: TestOrg, params: Record<string, unknown> = {}) {
  const agent = await w().newAgent(org, org.dev);
  await w().policy(org, { effect: "require_approval", agentId: agent.agentId });
  const out = await w().submit(agent.key, leadBody(params));
  if (out.kind !== "decided") throw new Error(out.kind);
  const admin = await w().db.admin();
  const row = await admin.query(
    "SELECT a.id, r.canonical_digest AS digest FROM axo.approval_requests a JOIN axo.action_requests r ON r.id = a.action_request_id WHERE r.id = $1",
    [out.id],
  );
  return {
    agent,
    requestId: out.id,
    approvalId: row.rows[0].id as string,
    digest: row.rows[0].digest as string,
  };
}

const decide = (
  org: TestOrg,
  user: string,
  approvalId: string,
  decision: "approve" | "reject",
  digest: string,
  comment?: string,
  options?: { mfa?: boolean },
) =>
  w().manage(
    user,
    org,
    (c) =>
      decideApproval(c, {
        approvalId,
        decision,
        reviewedDigest: digest,
        ...(comment === undefined ? {} : { comment }),
      }),
    options,
  );

const flip = (digest: string) => `${digest.slice(0, -1)}${digest.endsWith("0") ? "1" : "0"}`;

describe("a request that needs approval gets one pending approval", () => {
  it("creates exactly one, tied to the request digest, and none for allowed or denied requests", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    const admin = await w().db.admin();
    const row = await admin.query(
      "SELECT state, requested_digest, expires_at > now() AS live, expires_at <= now() + interval '15 minutes' AS bounded FROM axo.approval_requests WHERE id = $1",
      [p.approvalId],
    );
    expect(row.rows[0]).toEqual({
      state: "pending",
      requested_digest: p.digest,
      live: true,
      bounded: true,
    });

    const allowed = await w().newAgent(org, org.dev);
    await w().policy(org, { effect: "allow", agentId: allowed.agentId });
    await w().submit(allowed.key);
    const denied = await w().newAgent(org, org.dev);
    await w().submit(denied.key);
    const count = await admin.query(
      "SELECT count(*)::int AS n FROM axo.approval_requests WHERE organization_id = $1",
      [org.id],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("is visible to every member as metadata only, and pending first", async () => {
    const org = await w().freshOrg();
    const first = await pendingRequest(org);
    await decide(org, org.approver, first.approvalId, "reject", first.digest);
    const second = await pendingRequest(org);
    for (const user of [org.owner, org.admin, org.approver, org.viewer]) {
      const list = await w().manage(user, org, (c) => listApprovals(c));
      expect(list.map((a) => a.id)).toEqual([second.approvalId, first.approvalId]);
      expect(JSON.stringify(list)).not.toMatch(
        /Ada Example|ada@example\.test|Sample Co|parameters/,
      );
    }
    const onlyPending = await w().manage(org.viewer, org, (c) =>
      listApprovals(c, { state: "pending" }),
    );
    expect(onlyPending.map((a) => a.id)).toEqual([second.approvalId]);
  });
});

describe("reviewing an approval", () => {
  it("shows owners, admins and approvers the exact values that were submitted, and viewers nothing", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org, { full_name: "Grace Hopper", company: "Navy Test Co" });
    for (const user of [org.owner, org.admin, org.approver]) {
      const review = await w().manage(user, org, (c) =>
        reviewApproval(c, w().dataKeys, { approvalId: p.approvalId }),
      );
      expect(review.parameters).toEqual({
        full_name: "Grace Hopper",
        email: "ada@example.test",
        company: "Navy Test Co",
      });
      expect(review.digest).toBe(p.digest);
      expect(review).toMatchObject({
        state: "pending",
        action: "crm.lead.create",
        resource: "mockcrm/leads",
        policyChangedSinceRequest: false,
      });
    }
    await expect(
      w().manage(org.viewer, org, (c) =>
        reviewApproval(c, w().dataKeys, { approvalId: p.approvalId }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("flags that the organization's policies changed since the request was evaluated", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    await w().policy(org, { effect: "deny", agentId: p.agent.agentId });
    const review = await w().manage(org.approver, org, (c) =>
      reviewApproval(c, w().dataKeys, { approvalId: p.approvalId }),
    );
    expect(review.policyChangedSinceRequest).toBe(true);
  });

  it("refuses to show values it cannot verify (tampered or wrong-row ciphertext)", async () => {
    const org = await w().freshOrg();
    const a = await pendingRequest(org);
    const b = await pendingRequest(org, { company: "Other Co" });
    const admin = await w().db.admin();
    await admin.query(
      "ALTER TABLE axo.action_requests DISABLE TRIGGER action_requests_update_guard",
    );
    // Move B's ciphertext onto A's row: it decrypts only for the row it was made for.
    await admin.query(
      "UPDATE axo.action_requests SET parameters_ciphertext = (SELECT parameters_ciphertext FROM axo.action_requests WHERE id = $2) WHERE id = $1",
      [a.requestId, b.requestId],
    );
    await admin.query(
      "ALTER TABLE axo.action_requests ENABLE TRIGGER action_requests_update_guard",
    );
    await expect(
      w().manage(org.approver, org, (c) =>
        reviewApproval(c, w().dataKeys, { approvalId: a.approvalId }),
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("an unknown or foreign approval id looks the same: not found", async () => {
    const org = await w().freshOrg();
    const other = await w().freshOrg();
    const foreign = await pendingRequest(other);
    for (const id of [foreign.approvalId, "11111111-1111-4111-8111-111111111111"]) {
      await expect(
        w().manage(org.approver, org, (c) => reviewApproval(c, w().dataKeys, { approvalId: id })),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });
});

describe("approving and rejecting", () => {
  it("approve: queues exactly one single-use grant, tells the agent, and records who and what they reviewed", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    const result = await decide(
      org,
      org.approver,
      p.approvalId,
      "approve",
      p.digest,
      "Looks right",
    );
    expect(result).toEqual({ outcome: "approved", requestStatus: "queued_execution" });
    const admin = await w().db.admin();
    const grants = await admin.query(
      "SELECT digest, consumed_at, invalidated_at, expires_at > now() + interval '4 minutes' AS ttl_ok, expires_at <= now() + interval '5 minutes' AS ttl_bounded FROM axo.execution_grants WHERE action_request_id = $1",
      [p.requestId],
    );
    expect(grants.rows).toEqual([
      {
        digest: p.digest,
        consumed_at: null,
        invalidated_at: null,
        ttl_ok: true,
        ttl_bounded: true,
      },
    ]);
    const approval = await admin.query(
      "SELECT state, decided_by_user_id, reviewed_digest, decision_comment FROM axo.approval_requests WHERE id = $1",
      [p.approvalId],
    );
    expect(approval.rows[0]).toEqual({
      state: "approved",
      decided_by_user_id: org.approver,
      reviewed_digest: p.digest,
      decision_comment: "Looks right",
    });
    const events = await admin.query(
      "SELECT event_type FROM axo.audit_events WHERE request_id = $1 ORDER BY id",
      [p.requestId],
    );
    expect(events.rows.map((r) => r.event_type)).toEqual([
      "approval.requested",
      "action_request.created",
      "decision.recorded",
      "approval.approved",
      "action_request.queued",
    ]);
    const status = await getActionRequestStatus(
      w().agentPool,
      w().pepper,
      `Bearer ${p.agent.key}`,
      p.requestId,
    );
    expect(status).toMatchObject({ kind: "found", status: "queued_execution", reasonCode: null });
  });

  it("reject: denies the request, creates no grant, and tells the agent why", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    const result = await decide(
      org,
      org.approver,
      p.approvalId,
      "reject",
      p.digest,
      "Not this one",
    );
    expect(result).toEqual({ outcome: "rejected", requestStatus: "denied" });
    const admin = await w().db.admin();
    const grants = await admin.query(
      "SELECT count(*)::int AS n FROM axo.execution_grants WHERE action_request_id = $1",
      [p.requestId],
    );
    expect(grants.rows[0].n).toBe(0);
    const status = await getActionRequestStatus(
      w().agentPool,
      w().pepper,
      `Bearer ${p.agent.key}`,
      p.requestId,
    );
    expect(status).toMatchObject({
      kind: "found",
      status: "denied",
      reasonCode: "APPROVAL_DENIED",
    });
  });

  it("keeps a complete history: who decided, when, with what comment", async () => {
    const org = await w().freshOrg();
    const a = await pendingRequest(org);
    const b = await pendingRequest(org);
    await decide(org, org.approver, a.approvalId, "approve", a.digest, "ok");
    await decide(org, org.approver, b.approvalId, "reject", b.digest, "no");
    const history = await w().manage(org.viewer, org, (c) => listApprovals(c, { state: "all" }));
    const byId = new Map(history.map((x) => [x.id, x]));
    expect(byId.get(a.approvalId)).toMatchObject({ state: "approved", decidedBy: org.approver });
    expect(byId.get(b.approvalId)).toMatchObject({ state: "rejected", decidedBy: org.approver });
    const review = await w().manage(org.owner, org, (c) =>
      reviewApproval(c, w().dataKeys, { approvalId: b.approvalId }),
    );
    expect(review).toMatchObject({ state: "rejected", decisionComment: "no" });
  });

  it("works only once: a decided approval cannot be decided again, by anyone", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    expect((await decide(org, org.approver, p.approvalId, "approve", p.digest)).outcome).toBe(
      "approved",
    );
    for (const decision of ["approve", "reject"] as const) {
      expect((await decide(org, org.approver, p.approvalId, decision, p.digest)).outcome).toBe(
        "already_decided",
      );
    }
    const admin = await w().db.admin();
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.execution_grants WHERE action_request_id = $1",
          [p.requestId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
});

describe("S07 nobody approves their own agent's request", () => {
  it("blocks the agent's owner, whoever registered it, and whoever issued its key, and records the attempt", async () => {
    const org = await w().freshOrg();
    const owner = await member(org, "approver"); // owns the agent
    const registrar = await member(org, "admin"); // registers it
    const issuer = await member(org, "owner"); // issues its key
    const unrelated = await member(org, "approver");
    const agent = await w().manage(registrar, org, async (c) => {
      const { agentId } = await registerAgent(c, {
        environmentId: org.dev,
        ownerUserId: owner,
        name: "guarded",
      });
      return agentId;
    });
    const key = await w().manage(
      issuer,
      org,
      async (c) => (await issueCredential(c, w().pepper, { agentId: agent })).fullKey,
    );
    await w().policy(org, { effect: "require_approval", agentId: agent });
    const out = await w().submit(key);
    if (out.kind !== "decided") throw new Error(out.kind);
    const admin = await w().db.admin();
    const row = await admin.query(
      "SELECT a.id, r.canonical_digest AS digest FROM axo.approval_requests a JOIN axo.action_requests r ON r.id = a.action_request_id WHERE r.id = $1",
      [out.id],
    );
    const approvalId = row.rows[0].id as string;
    const digest = row.rows[0].digest as string;

    for (const related of [owner, registrar, issuer]) {
      for (const decision of ["approve", "reject"] as const) {
        expect(
          (await decide(org, related, approvalId, decision, digest)).outcome,
          `${decision} by a related person`,
        ).toBe("self_approval");
      }
    }
    const untouched = await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [
      approvalId,
    ]);
    expect(untouched.rows[0].state).toBe("pending");
    const blocked = await admin.query(
      "SELECT count(*)::int AS n FROM axo.audit_events WHERE request_id = $1 AND event_type = 'approval.self_approval_blocked'",
      [out.id],
    );
    expect(blocked.rows[0].n).toBe(6);
    expect((await decide(org, unrelated, approvalId, "approve", digest)).outcome).toBe("approved");
  });

  it("holds for the default test team too: the owner and the admin that set the agent up cannot approve it", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    expect((await decide(org, org.owner, p.approvalId, "approve", p.digest)).outcome).toBe(
      "self_approval",
    );
    expect((await decide(org, org.admin, p.approvalId, "approve", p.digest)).outcome).toBe(
      "self_approval",
    );
    expect((await decide(org, org.approver, p.approvalId, "approve", p.digest)).outcome).toBe(
      "approved",
    );
  });
});

describe("S16 who may decide", () => {
  it("refuses viewers and non-members in the database itself", async () => {
    const org = await w().freshOrg();
    const other = await w().freshOrg();
    const p = await pendingRequest(org);
    await expect(decide(org, org.viewer, p.approvalId, "approve", p.digest)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      decide(org, other.approver, p.approvalId, "approve", p.digest),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = await w().db.admin();
    expect(
      (await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [p.approvalId]))
        .rows[0].state,
    ).toBe("pending");
  });

  it("demands a fresh multi-factor login to decide", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    await expect(
      decide(org, org.approver, p.approvalId, "approve", p.digest, undefined, { mfa: false }),
    ).rejects.toMatchObject({ code: "STEP_UP" });
    // And the database enforces it independently of the application check.
    await expect(
      w().manage(
        org.approver,
        org,
        async ({ tx }) => {
          await tx.query("SELECT * FROM axo.decide_approval($1::uuid, 'approve', $2, NULL)", [
            p.approvalId,
            p.digest,
          ]);
        },
        { mfa: false },
      ),
    ).rejects.toMatchObject({ code: "STEP_UP" });
  });

  it("does not let another organization's approver decide, review or even see this approval", async () => {
    const org = await w().freshOrg();
    const other = await w().freshOrg();
    const p = await pendingRequest(org);
    await expect(
      decide(other, other.approver, p.approvalId, "approve", p.digest),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const theirList = await w().manage(other.approver, other, (c) =>
      listApprovals(c, { state: "all" }),
    );
    expect(theirList).toEqual([]);
  });
});

describe("S06 the reviewer must have seen what is stored", () => {
  it("refuses a decision made on a different digest, changes nothing, and records the attempt", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    expect((await decide(org, org.approver, p.approvalId, "approve", flip(p.digest))).outcome).toBe(
      "digest_mismatch",
    );
    const admin = await w().db.admin();
    expect(
      (await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [p.approvalId]))
        .rows[0].state,
    ).toBe("pending");
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.execution_grants WHERE action_request_id = $1",
          [p.requestId],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.audit_events WHERE request_id = $1 AND event_type = 'approval.digest_mismatch'",
          [p.requestId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect((await decide(org, org.approver, p.approvalId, "approve", p.digest)).outcome).toBe(
      "approved",
    );
  });

  it("rejects a malformed digest outright", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    for (const bad of ["", "abc", "Z".repeat(64), p.digest.toUpperCase(), `${p.digest}0`]) {
      await expect(
        decide(org, org.approver, p.approvalId, "approve", bad),
        bad.slice(0, 10),
      ).rejects.toMatchObject({ code: "INVALID" });
    }
  });

  it("changed parameters mean a different request: the same idempotency key conflicts, a new key needs its own approval", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    const again = await w().submit(p.agent.key, leadBody({ company: "Changed Co" }));
    expect(again.kind).toBe("decided");
    if (again.kind === "decided") expect(again.id).not.toBe(p.requestId);
    const admin = await w().db.admin();
    const approvals = await admin.query(
      "SELECT count(*)::int AS n FROM axo.approval_requests WHERE organization_id = $1",
      [org.id],
    );
    expect(approvals.rows[0].n).toBe(2);
  });
});

describe("S08 approvals expire", () => {
  async function age(approvalId: string, requestId: string) {
    const admin = await w().db.admin();
    await admin.query("ALTER TABLE axo.approval_requests DISABLE TRIGGER approval_requests_guard");
    await admin.query(
      "ALTER TABLE axo.action_requests DISABLE TRIGGER action_requests_update_guard",
    );
    await admin.query(
      "UPDATE axo.approval_requests SET created_at = now() - interval '20 minutes', expires_at = now() - interval '5 minutes' WHERE id = $1",
      [approvalId],
    );
    await admin.query(
      "UPDATE axo.action_requests SET created_at = now() - interval '20 minutes', expires_at = now() - interval '5 minutes' WHERE id = $1",
      [requestId],
    );
    await admin.query("ALTER TABLE axo.approval_requests ENABLE TRIGGER approval_requests_guard");
    await admin.query(
      "ALTER TABLE axo.action_requests ENABLE TRIGGER action_requests_update_guard",
    );
  }

  it("reads as expired without any background job, and the agent is told", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    await age(p.approvalId, p.requestId);
    const list = await w().manage(org.viewer, org, (c) => listApprovals(c, { state: "all" }));
    expect(list[0]?.state).toBe("expired");
    const status = await getActionRequestStatus(
      w().agentPool,
      w().pepper,
      `Bearer ${p.agent.key}`,
      p.requestId,
    );
    expect(status).toMatchObject({
      kind: "found",
      status: "expired",
      reasonCode: "APPROVAL_EXPIRED",
    });
  });

  it("cannot be approved after the deadline: the attempt only marks it expired, and no grant exists", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    await age(p.approvalId, p.requestId);
    expect(await decide(org, org.approver, p.approvalId, "approve", p.digest)).toEqual({
      outcome: "expired",
      requestStatus: "expired",
    });
    const admin = await w().db.admin();
    expect(
      (await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [p.approvalId]))
        .rows[0].state,
    ).toBe("expired");
    expect(
      (await admin.query("SELECT status FROM axo.action_requests WHERE id = $1", [p.requestId]))
        .rows[0].status,
    ).toBe("expired");
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.execution_grants WHERE action_request_id = $1",
          [p.requestId],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it("is also recorded by maintenance, which leaves a fresh approval alone", async () => {
    const org = await w().freshOrg();
    const stale = await pendingRequest(org);
    const fresh = await pendingRequest(org);
    await age(stale.approvalId, stale.requestId);
    const result = await maintain(w().db.executorPool());
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const admin = await w().db.admin();
    expect(
      (
        await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [
          stale.approvalId,
        ])
      ).rows[0].state,
    ).toBe("expired");
    expect(
      (
        await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [
          fresh.approvalId,
        ])
      ).rows[0].state,
    ).toBe("pending");
  });
});

describe("withdrawn requests cannot be approved", () => {
  it("cancels the approval when the agent is suspended, so a later click does nothing", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    await w().manage(org.admin, org, (c) => suspendAgent(c, { agentId: p.agent.agentId }));
    expect((await decide(org, org.approver, p.approvalId, "approve", p.digest)).outcome).toBe(
      "already_decided",
    );
    const admin = await w().db.admin();
    expect(
      (await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [p.approvalId]))
        .rows[0].state,
    ).toBe("canceled");
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.execution_grants WHERE action_request_id = $1",
          [p.requestId],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});

describe("races", () => {
  it("many approvers approving at once: exactly one decision wins, one grant exists, the rest are told it is decided", async () => {
    const org = await w().freshOrg();
    const approvers = await Promise.all(Array.from({ length: 8 }, () => member(org, "approver")));
    const p = await pendingRequest(org);
    const results = await Promise.all(
      approvers.map((user) => decide(org, user, p.approvalId, "approve", p.digest)),
    );
    expect(results.filter((r) => r.outcome === "approved")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "already_decided")).toHaveLength(7);
    const admin = await w().db.admin();
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.execution_grants WHERE action_request_id = $1",
          [p.requestId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.audit_events WHERE request_id = $1 AND event_type = 'approval.approved'",
          [p.requestId],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("approvals racing rejections: one outcome wins and the request ends consistent with it", async () => {
    for (let round = 0; round < 3; round++) {
      const org = await w().freshOrg();
      const approvers = await Promise.all(Array.from({ length: 8 }, () => member(org, "approver")));
      const p = await pendingRequest(org);
      const results = await Promise.all(
        approvers.map((user, i) =>
          decide(org, user, p.approvalId, i % 2 === 0 ? "approve" : "reject", p.digest),
        ),
      );
      const winners = results.filter((r) => r.outcome === "approved" || r.outcome === "rejected");
      expect(winners).toHaveLength(1);
      const admin = await w().db.admin();
      const request = await admin.query("SELECT status FROM axo.action_requests WHERE id = $1", [
        p.requestId,
      ]);
      const grants = await admin.query(
        "SELECT count(*)::int AS n FROM axo.execution_grants WHERE action_request_id = $1",
        [p.requestId],
      );
      if (winners[0]?.outcome === "approved") {
        expect(request.rows[0].status).toBe("queued_execution");
        expect(grants.rows[0].n).toBe(1);
      } else {
        expect(request.rows[0].status).toBe("denied");
        expect(grants.rows[0].n).toBe(0);
      }
    }
  });

  it("an approval racing an agent suspension never leaves anything runnable behind", async () => {
    for (let round = 0; round < 6; round++) {
      const org = await w().freshOrg();
      const p = await pendingRequest(org);
      const [decision, suspension] = await Promise.allSettled([
        decide(org, org.approver, p.approvalId, "approve", p.digest),
        w().manage(org.admin, org, (c) => suspendAgent(c, { agentId: p.agent.agentId })),
      ]);
      expect(suspension.status).toBe("fulfilled");
      expect(decision.status).toBe("fulfilled");
      const admin = await w().db.admin();
      const live = await admin.query(
        "SELECT count(*)::int AS n FROM axo.action_requests WHERE agent_id = $1 AND status IN ('pending_approval','approved','queued_execution')",
        [p.agent.agentId],
      );
      expect(live.rows[0].n, `round ${String(round)}`).toBe(0);
      const open = await admin.query(
        "SELECT count(*)::int AS n FROM axo.execution_grants WHERE action_request_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL",
        [p.requestId],
      );
      expect(open.rows[0].n, `round ${String(round)}`).toBe(0);
    }
  });
});

describe("the database refuses every shortcut around the workflow", () => {
  it("does not let a person with the management role approve, queue, grant or run anything directly", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    const attempts = [
      `UPDATE axo.approval_requests SET state = 'approved' WHERE id = '${p.approvalId}'`,
      `UPDATE axo.action_requests SET status = 'approved' WHERE id = '${p.requestId}'`,
      `UPDATE axo.action_requests SET status = 'queued_execution' WHERE id = '${p.requestId}'`,
      `INSERT INTO axo.execution_grants (organization_id, action_request_id, digest, expires_at) VALUES ('${org.id}', '${p.requestId}', repeat('a', 64), now() + interval '5 minutes')`,
      `INSERT INTO axo.execution_attempts (organization_id, grant_id, action_request_id, executor_id, connector) VALUES ('${org.id}', gen_random_uuid(), '${p.requestId}', 'x', 'mock_crm')`,
      `DELETE FROM axo.approval_requests WHERE id = '${p.approvalId}'`,
      "SELECT * FROM axo.claim_lock_next('attacker')",
      "SELECT axo.record_execution_result(gen_random_uuid(), 'x', 'succeeded', NULL, NULL)",
    ];
    for (const sql of attempts) {
      const code = await w().manage(org.owner, org, async ({ tx }) => {
        await tx.query("SAVEPOINT s");
        try {
          await tx.query(sql);
          return "ok";
        } catch (error) {
          return (error as { code?: string }).code ?? "error";
        } finally {
          await tx.query("ROLLBACK TO SAVEPOINT s");
        }
      });
      expect(code, sql).toBe("42501");
    }
  });
});

describe("the decision over HTTP", () => {
  async function setup() {
    const people = ["owner", "approver", "viewer"].map(
      (role) => `${role}-${randomBytes(3).toString("hex")}`,
    );
    const [ownerKey, approverKey, viewerKey] = people as [string, string, string];
    for (const key of people) newUser(h, key);
    const owner = await h.signIn(ownerKey);
    const approver = await h.signIn(approverKey);
    const viewer = await h.signIn(viewerKey);
    const org = (
      await owner.post("/v1/organizations", {
        name: "Approvals Org",
        slug: `ap-${randomBytes(4).toString("hex")}`,
      })
    ).json<{ organizationId: string }>().organizationId;
    for (const [browser, key, role] of [
      [approver, approverKey, "approver"],
      [viewer, viewerKey, "viewer"],
    ] as Array<[Browser, string, string]>) {
      const invite = await owner.post(`/v1/orgs/${org}/invitations`, {
        email: h.idp.users.get(key)?.email,
        role,
      });
      expect(
        (
          await browser.post("/v1/invitations/accept", {
            token: invite.json<{ token: string }>().token,
          })
        ).status,
      ).toBe(200);
    }
    const ownerId = await h.userId(ownerKey);
    const envs = (await owner.get(`/v1/orgs/${org}/environments`)).json<
      Array<{ id: string; name: string }>
    >();
    const agentId = (
      await owner.post(`/v1/orgs/${org}/agents`, {
        name: "Http Agent",
        environmentId: envs.find((e) => e.name === "dev")?.id,
        ownerUserId: ownerId,
      })
    ).json<{ agentId: string }>().agentId;
    const key = (await owner.post(`/v1/orgs/${org}/agents/${agentId}/credentials`, {})).json<{
      fullKey: string;
    }>().fullKey;
    await owner.post(`/v1/orgs/${org}/policies`, {
      actionKey: "crm.lead.create",
      agentId,
      effect: "require_approval",
      conditions: { all: [] },
    });
    const submit = async () => {
      const out = await w().submit(
        key,
        leadBody({ company: `Http ${randomBytes(3).toString("hex")}` }),
      );
      if (out.kind !== "decided") throw new Error(out.kind);
      const pending = (await approver.get(`/v1/orgs/${org}/approvals?state=pending`)).json<
        Array<{ id: string; requestId: string }>
      >();
      const approval = pending.find((a) => a.requestId === out.id);
      const review = (await approver.get(`/v1/orgs/${org}/approvals/${approval?.id}`)).json<{
        digest: string;
        parameters: Record<string, string>;
      }>();
      return { approvalId: approval?.id ?? "", digest: review.digest, requestId: out.id, review };
    };
    return { owner, approver, viewer, org, submit, key };
  }

  it("approves with the reviewed digest, and shows the reviewer exactly what will be done", async () => {
    const s = await setup();
    const r = await s.submit();
    expect(r.review.parameters).toMatchObject({
      full_name: "Ada Example",
      email: "ada@example.test",
    });
    const res = await s.approver.post(`/v1/orgs/${s.org}/approvals/${r.approvalId}/decision`, {
      decision: "approve",
      reviewedDigest: r.digest,
      comment: "fine",
    });
    expect(res.status, res.body).toBe(200);
    expect(res.json()).toEqual({ outcome: "approved", requestStatus: "queued_execution" });
  });

  it("answers each blocked outcome precisely: self-approval, digest, repeat, viewer, step-up", async () => {
    const s = await setup();
    const r = await s.submit();
    const decision = (browser: Browser, body: unknown) =>
      browser.post(`/v1/orgs/${s.org}/approvals/${r.approvalId}/decision`, body);
    const self = await decision(s.owner, { decision: "approve", reviewedDigest: r.digest });
    expect(self.status).toBe(403);
    expect(self.json<{ error: { reason: string } }>().error.reason).toBe("SELF_APPROVAL");
    const mismatch = await decision(s.approver, {
      decision: "approve",
      reviewedDigest: flip(r.digest),
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.json<{ error: { reason: string } }>().error.reason).toBe("DIGEST_MISMATCH");
    expect(
      (await decision(s.viewer, { decision: "approve", reviewedDigest: r.digest })).status,
    ).toBe(403);
    for (const bad of [
      { decision: "maybe", reviewedDigest: r.digest },
      { decision: "approve" },
      { decision: "approve", reviewedDigest: "nope" },
      { decision: "approve", reviewedDigest: r.digest, extra: 1 },
    ]) {
      expect((await decision(s.approver, bad)).status, JSON.stringify(bad)).toBe(422);
    }
    expect(
      (await decision(s.approver, { decision: "approve", reviewedDigest: r.digest })).status,
    ).toBe(200);
    const repeat = await decision(s.approver, { decision: "approve", reviewedDigest: r.digest });
    expect(repeat.status).toBe(409);
    expect(repeat.json<{ error: { reason: string } }>().error.reason).toBe("ALREADY_DECIDED");
  });

  it("asks for step-up when the login is not recent, and needs the origin and the CSRF token", async () => {
    const s = await setup();
    const r = await s.submit();
    const path = `/v1/orgs/${s.org}/approvals/${r.approvalId}/decision`;
    const body = { decision: "approve", reviewedDigest: r.digest };
    expect((await s.approver.post(path, body, { origin: "https://evil.test" })).status).toBe(403);
    expect((await s.approver.post(path, body, { csrf: false })).status).toBe(403);
    expect((await s.approver.post(path, body, { csrf: "C".repeat(43) })).status).toBe(403);
    const admin = await w().db.admin();
    await admin.query(
      "UPDATE axo.sessions SET mfa_verified_at = now() - interval '1 hour' WHERE token_hash = decode($1, 'hex')",
      [
        (await import("../src/auth/tokens"))
          .hashToken(s.approver.sessionToken ?? "")
          .toString("hex"),
      ],
    );
    const stale = await s.approver.post(path, body);
    expect(stale.status).toBe(403);
    expect(stale.json<{ error: { code: string } }>().error.code).toBe("STEP_UP_REQUIRED");
    expect(
      (await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [r.approvalId]))
        .rows[0].state,
    ).toBe("pending");
  });

  it("answers an expired approval with 410", async () => {
    const s = await setup();
    const r = await s.submit();
    const admin = await w().db.admin();
    await admin.query("ALTER TABLE axo.approval_requests DISABLE TRIGGER approval_requests_guard");
    await admin.query(
      "UPDATE axo.approval_requests SET created_at = now() - interval '20 minutes', expires_at = now() - interval '1 minute' WHERE id = $1",
      [r.approvalId],
    );
    await admin.query("ALTER TABLE axo.approval_requests ENABLE TRIGGER approval_requests_guard");
    const res = await s.approver.post(`/v1/orgs/${s.org}/approvals/${r.approvalId}/decision`, {
      decision: "approve",
      reviewedDigest: r.digest,
    });
    expect(res.status).toBe(410);
  });

  it("limits how fast one person can decide approvals", async () => {
    const s = await setup();
    const r = await s.submit();
    const path = `/v1/orgs/${s.org}/approvals/${r.approvalId}/decision`;
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++)
      statuses.push(
        (await s.approver.post(path, { decision: "approve", reviewedDigest: flip(r.digest) }))
          .status,
      );
    expect(statuses.filter((x) => x === 429).length).toBeGreaterThanOrEqual(2);
    expect(statuses.slice(0, 30).every((x) => x !== 429)).toBe(true);
  });
});

describe("separation of duties between rule writers and approvers", () => {
  const rule = { actionKey: "crm.lead.create", conditions: { all: [] } } as const;

  it("refuses a person who wrote a rule that applies to the request, and records the attempt", async () => {
    const org = await w().freshOrg();
    const author = await member(org, "admin"); // can write rules AND is allowed to approve
    const p = await pendingRequest(org); // the rule that sent it to review was written by org.admin
    await w().manage(author, org, (c) =>
      createPolicy(c, { ...rule, effect: "allow", agentId: p.agent.agentId, enabled: false }),
    );
    for (const decision of ["approve", "reject"] as const) {
      expect((await decide(org, author, p.approvalId, decision, p.digest)).outcome, decision).toBe(
        "policy_author",
      );
    }
    const admin = await w().db.admin();
    expect(
      (await admin.query("SELECT state FROM axo.approval_requests WHERE id = $1", [p.approvalId]))
        .rows[0].state,
    ).toBe("pending");
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM axo.audit_events WHERE request_id = $1 AND event_type = 'approval.policy_author_blocked'",
          [p.requestId],
        )
      ).rows[0].n,
    ).toBe(2);
    expect((await decide(org, org.approver, p.approvalId, "approve", p.digest)).outcome).toBe(
      "approved",
    );
  });

  it("also counts later revisions: whoever last touched an applicable rule cannot approve", async () => {
    const org = await w().freshOrg();
    const reviser = await member(org, "admin");
    const p = await pendingRequest(org);
    const rules = await (
      await w().db.admin()
    ).query(
      "SELECT pol.id, v.version FROM axo.policies pol JOIN axo.policy_versions v ON v.policy_id = pol.id WHERE pol.agent_id = $1",
      [p.agent.agentId],
    );
    const first = rules.rows[0] as { id: string; version: number };
    await w().manage(reviser, org, (c) =>
      createPolicyVersion(c, {
        policyId: first.id,
        expectedVersion: first.version,
        effect: "require_approval",
        conditions: { all: [] },
      }),
    );
    expect((await decide(org, reviser, p.approvalId, "approve", p.digest)).outcome).toBe(
      "policy_author",
    );
  });

  it("does not over-reach: rules for another agent or another environment do not block", async () => {
    const org = await w().freshOrg();
    const p = await pendingRequest(org);
    const writer = await member(org, "admin");
    const otherAgent = await w().newAgent(org, org.dev);
    await w().manage(writer, org, (c) =>
      createPolicy(c, { ...rule, effect: "allow", agentId: otherAgent.agentId }),
    );
    await w().manage(writer, org, (c) =>
      createPolicy(c, { ...rule, effect: "allow", environmentId: org.prod }),
    );
    expect((await decide(org, writer, p.approvalId, "approve", p.digest)).outcome).toBe("approved");
  });

  it("blocks a writer of an organization-wide rule for every agent in the organization", async () => {
    const org = await w().freshOrg();
    const writer = await member(org, "owner");
    await w().manage(writer, org, (c) => createPolicy(c, { ...rule, effect: "require_approval" }));
    const p = await pendingRequest(org);
    expect((await decide(org, writer, p.approvalId, "approve", p.digest)).outcome).toBe(
      "policy_author",
    );
  });
});
