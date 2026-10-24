import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPolicy,
  createPolicyVersion,
  haltEnvironment,
  issueCredential,
  registerAgent,
  resumeAgent,
  resumeEnvironment,
  revokeAgent,
  revokeCredential,
  suspendAgent,
  withManagement,
  type ManagementContext,
} from "../src/management";
import { createWorld, idem, leadBody, type TestOrg, type World } from "./support/world";

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w.close();
});

const allow = { effect: "allow" as const, conditions: { all: [] } };

describe("S16 role permissions are enforced by the database and surfaced as FORBIDDEN", () => {
  type Operation = [
    name: string,
    run: (
      c: ManagementContext,
      org: TestOrg,
      agentId: string,
      credentialId: string,
      policyId: string,
    ) => Promise<unknown>,
  ];
  const operations: Operation[] = [
    [
      "register an agent",
      (c, org) =>
        registerAgent(c, { environmentId: org.dev, ownerUserId: org.owner, name: "new-agent" }),
    ],
    ["issue a credential", (c, _o, agentId) => issueCredential(c, w.pepper, { agentId })],
    ["revoke a credential", (c, _o, _a, credentialId) => revokeCredential(c, { credentialId })],
    ["suspend an agent", (c, _o, agentId) => suspendAgent(c, { agentId })],
    ["resume an agent", (c, _o, agentId) => resumeAgent(c, { agentId })],
    ["revoke an agent", (c, _o, agentId) => revokeAgent(c, { agentId })],
    ["create a policy", (c) => createPolicy(c, { actionKey: "crm.lead.create", ...allow })],
    [
      "revise a policy",
      (c, _o, _a, _c, policyId) =>
        createPolicyVersion(c, { policyId, expectedVersion: 1, ...allow }),
    ],
    ["halt an environment", (c, org) => haltEnvironment(c, { environmentId: org.dev })],
    ["resume an environment", (c, org) => resumeEnvironment(c, { environmentId: org.dev })],
  ];

  for (const role of ["approver", "viewer"] as const) {
    it(`a ${role} cannot do any of them`, async () => {
      const org = await w.freshOrg();
      const agent = await w.newAgent(org, org.dev);
      const policy = await w.policy(org, { effect: "allow", agentId: agent.agentId });
      for (const [name, run] of operations) {
        await expect(
          w.manage(org[role], org, (c) =>
            run(c, org, agent.agentId, agent.credentialId, policy.policyId),
          ),
          name,
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
    });
  }

  it("a user with no membership, or with membership only in another organization, cannot enter at all", async () => {
    const org = await w.freshOrg();
    await expect(w.manage(w.outsider, org, async () => 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(w.manage(w.orgB.owner, org, async () => 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // No session, a malformed one, or a well-formed one the database never issued: not signed in.
    for (const sessionToken of [undefined, "bogus", randomBytes(32).toString("base64url")]) {
      await expect(
        withManagement(w.managementPool, { sessionToken, organizationId: org.id }, async () => 1),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    await expect(
      withManagement(
        w.managementPool,
        {
          sessionToken: (await w.session(w.orgA.owner)).sessionToken,
          organizationId: "not-a-uuid",
        },
        async () => 1,
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("the database refuses the same writes even when the application guard is bypassed", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    for (const role of ["approver", "viewer"] as const) {
      await w.manage(org[role], org, async ({ tx }) => {
        const attempt = async (sql: string, values: unknown[] = []) => {
          await tx.query("SAVEPOINT s");
          try {
            const r = await tx.query(sql, values);
            await tx.query("ROLLBACK TO SAVEPOINT s");
            return r.rowCount ?? 0;
          } catch (error) {
            await tx.query("ROLLBACK TO SAVEPOINT s");
            return (error as { code?: string }).code ?? "error";
          }
        };
        // Inserts fail row-level security outright; updates and deletes see zero rows.
        expect(
          await attempt(
            "INSERT INTO axo.policies (organization_id, action_key, created_by_user_id) VALUES ($1, 'crm.lead.create', $2)",
            [org.id, org[role]],
          ),
        ).toBe("42501");
        expect(
          await attempt(
            "INSERT INTO axo.agents (organization_id, environment_id, owner_user_id, name, created_by_user_id) VALUES ($1, $2, $3, 'x', $4)",
            [org.id, org.dev, org.owner, org[role]],
          ),
        ).toBe("42501");
        expect(
          await attempt(
            "UPDATE axo.agents SET status = 'revoked', revoked_at = now() WHERE id = $1",
            [agent.agentId],
          ),
        ).toBe(0);
        expect(
          await attempt(
            "UPDATE axo.environments SET enforcement_state = 'halted' WHERE organization_id = $1",
            [org.id],
          ),
        ).toBe(0);
        expect(
          await attempt(
            "UPDATE axo.agent_credentials SET revoked_at = now(), revoked_reason = 'manual' WHERE id = $1",
            [agent.credentialId],
          ),
        ).toBe(0);
        expect(
          await attempt(
            "INSERT INTO axo.audit_events (organization_id, actor_type, actor_id, event_type, object_type) VALUES ($1, 'user', gen_random_uuid(), 'a.b', 'agent')",
            [org.id],
          ),
        ).toBe("42501");
      });
    }
  });

  it("owners and admins can do all of them", async () => {
    for (const role of ["owner", "admin"] as const) {
      const org = await w.freshOrg();
      const agent = await w.newAgent(org, org.dev);
      const policy = await w.policy(org, { effect: "allow", agentId: agent.agentId });
      await w.manage(org[role], org, async (c) => {
        await createPolicyVersion(c, { policyId: policy.policyId, expectedVersion: 1, ...allow });
        await createPolicy(c, { actionKey: "crm.lead.create", ...allow });
        await haltEnvironment(c, { environmentId: org.dev });
        await resumeEnvironment(c, { environmentId: org.dev });
        await suspendAgent(c, { agentId: agent.agentId });
        await resumeAgent(c, { agentId: agent.agentId });
        const extra = await issueCredential(c, w.pepper, { agentId: agent.agentId });
        await revokeCredential(c, { credentialId: extra.credentialId });
        const reg = await registerAgent(c, {
          environmentId: org.prod,
          ownerUserId: org.owner,
          name: "second",
        });
        await revokeAgent(c, { agentId: reg.agentId });
      });
    }
  });

  it("every successful management change leaves an audit event naming the acting user", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.manage(org.admin, org, (c) => suspendAgent(c, { agentId: agent.agentId }));
    const admin = await w.db.admin();
    const rows = await admin.query(
      "SELECT event_type, actor_type, actor_id FROM axo.audit_events WHERE organization_id = $1 ORDER BY id",
      [org.id],
    );
    const types = rows.rows.map((r) => r.event_type);
    expect(types).toEqual(["agent.registered", "credential.issued", "agent.suspended"]);
    for (const r of rows.rows) expect(r).toMatchObject({ actor_type: "user", actor_id: org.admin });
  });
});

describe("S02 management cannot reach another organization's objects", () => {
  it("treats another organization's ids as nonexistent, for every operation", async () => {
    const orgA = await w.freshOrg();
    const orgB = await w.freshOrg();
    const victim = await w.newAgent(orgB, orgB.dev);
    const victimPolicy = await w.policy(orgB, { effect: "allow", agentId: victim.agentId });
    const attempts: Array<[string, (c: ManagementContext) => Promise<unknown>]> = [
      ["suspend", (c) => suspendAgent(c, { agentId: victim.agentId })],
      ["resume", (c) => resumeAgent(c, { agentId: victim.agentId })],
      ["revoke agent", (c) => revokeAgent(c, { agentId: victim.agentId })],
      ["issue credential", (c) => issueCredential(c, w.pepper, { agentId: victim.agentId })],
      ["revoke credential", (c) => revokeCredential(c, { credentialId: victim.credentialId })],
      [
        "revise policy",
        (c) =>
          createPolicyVersion(c, { policyId: victimPolicy.policyId, expectedVersion: 1, ...allow }),
      ],
      ["halt environment", (c) => haltEnvironment(c, { environmentId: orgB.dev })],
      [
        "register agent in their environment",
        (c) => registerAgent(c, { environmentId: orgB.dev, ownerUserId: orgA.owner, name: "x" }),
      ],
      [
        "policy for their agent",
        (c) => createPolicy(c, { actionKey: "crm.lead.create", agentId: victim.agentId, ...allow }),
      ],
      [
        "policy for their environment",
        (c) => createPolicy(c, { actionKey: "crm.lead.create", environmentId: orgB.dev, ...allow }),
      ],
    ];
    for (const [name, run] of attempts) {
      await expect(w.manage(orgA.owner, orgA, run), name).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
    // Nothing about the victim changed.
    const admin = await w.db.admin();
    const state = await admin.query("SELECT status FROM axo.agents WHERE id = $1", [
      victim.agentId,
    ]);
    expect(state.rows[0].status).toBe("active");
    const creds = await admin.query("SELECT revoked_at FROM axo.agent_credentials WHERE id = $1", [
      victim.credentialId,
    ]);
    expect(creds.rows[0].revoked_at).toBeNull();
    // And reading is just as blind.
    await w.manage(orgA.owner, orgA, async ({ tx }) => {
      for (const table of [
        "agents",
        "agent_credentials",
        "policies",
        "policy_versions",
        "action_requests",
        "decisions",
        "audit_events",
        "environments",
      ]) {
        const column = table === "agent_credentials" ? "id" : "id";
        const rows = await tx.query(
          `SELECT ${column} FROM axo.${table} WHERE organization_id = $1 OR true`,
          [orgB.id],
        );
        for (const r of rows.rows) expect(JSON.stringify(r)).not.toContain(orgB.id);
        const other = await tx.query(
          `SELECT count(*)::int AS n FROM axo.${table} WHERE organization_id = $1`,
          [orgB.id],
        );
        expect(other.rows[0].n, table).toBe(0);
      }
    });
  });
});

describe("policy revisions (B4)", () => {
  it("numbers versions 1, 2, 3 and refuses stale or skipped revisions", async () => {
    const org = await w.freshOrg();
    const p = await w.manage(org.admin, org, (c) =>
      createPolicy(c, { actionKey: "crm.lead.create", ...allow }),
    );
    expect(p.version).toBe(1);
    const v2 = await w.manage(org.admin, org, (c) =>
      createPolicyVersion(c, {
        policyId: p.policyId,
        expectedVersion: 1,
        ...allow,
        effect: "require_approval",
      }),
    );
    expect(v2.version).toBe(2);
    await expect(
      w.manage(org.admin, org, (c) =>
        createPolicyVersion(c, { policyId: p.policyId, expectedVersion: 1, ...allow }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      w.manage(org.admin, org, (c) =>
        createPolicyVersion(c, { policyId: p.policyId, expectedVersion: 5, ...allow }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      w.manage(org.admin, org, (c) =>
        createPolicyVersion(c, { policyId: p.policyId, expectedVersion: 0, ...allow }),
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
    const admin = await w.db.admin();
    const versions = await admin.query(
      "SELECT version, effect FROM axo.policy_versions WHERE policy_id = $1 ORDER BY version",
      [p.policyId],
    );
    expect(versions.rows).toEqual([
      { version: 1, effect: "allow" },
      { version: 2, effect: "require_approval" },
    ]);
  });

  it("with 8 simultaneous revisions from the same base, exactly one wins and the rest are told to retry", async () => {
    const org = await w.freshOrg();
    const p = await w.manage(org.admin, org, (c) =>
      createPolicy(c, { actionKey: "crm.lead.create", ...allow }),
    );
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        w.manage(org.admin, org, (c) =>
          createPolicyVersion(c, {
            policyId: p.policyId,
            expectedVersion: 1,
            effect: i % 2 === 0 ? "deny" : "allow",
            conditions: { all: [] },
            priority: i,
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect(r.reason).toMatchObject({ code: "CONFLICT" });
    }
    const admin = await w.db.admin();
    const versions = await admin.query(
      "SELECT version FROM axo.policy_versions WHERE policy_id = $1 ORDER BY version",
      [p.policyId],
    );
    expect(versions.rows.map((r) => r.version)).toEqual([1, 2]);
  });

  it("rejects a policy that could not be evaluated, and stores nothing", async () => {
    const org = await w.freshOrg();
    const bad: unknown[] = [
      { all: [{ field: "phone", op: "eq", value: "1" }] },
      { all: [{ field: "company", op: "regex", value: ".*" }] },
      { all: [{ field: "company", op: "email_domain_in", value: ["a.test"] }] },
      { any: [] },
      null,
      "all",
    ];
    for (const conditions of bad) {
      await expect(
        w.manage(org.admin, org, (c) =>
          createPolicy(c, { actionKey: "crm.lead.create", effect: "allow", conditions }),
        ),
        JSON.stringify(conditions),
      ).rejects.toMatchObject({ code: "INVALID" });
    }
    await expect(
      w.manage(org.admin, org, (c) =>
        createPolicy(c, { actionKey: "payments.refund.create", ...allow }),
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      w.manage(org.admin, org, (c) =>
        createPolicy(c, {
          actionKey: "crm.lead.create",
          effect: "permit" as never,
          conditions: { all: [] },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      w.manage(org.admin, org, (c) =>
        createPolicy(c, { actionKey: "crm.lead.create", ...allow, priority: 1001 }),
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
    const admin = await w.db.admin();
    const n = await admin.query(
      "SELECT count(*)::int AS n FROM axo.policies WHERE organization_id = $1",
      [org.id],
    );
    expect(n.rows[0].n).toBe(0);
  });

  it("bumps the policy epoch of exactly the environments a policy can affect", async () => {
    const org = await w.freshOrg();
    const epochs = async () => {
      const admin = await w.db.admin();
      const r = await admin.query(
        "SELECT name, policy_epoch::int AS e FROM axo.environments WHERE organization_id = $1",
        [org.id],
      );
      return Object.fromEntries(r.rows.map((x) => [x.name, x.e as number]));
    };
    expect(await epochs()).toEqual({ dev: 0, prod: 0 });
    await w.manage(org.admin, org, (c) =>
      createPolicy(c, { actionKey: "crm.lead.create", environmentId: org.dev, ...allow }),
    );
    expect(await epochs()).toEqual({ dev: 1, prod: 0 });
    await w.manage(org.admin, org, (c) =>
      createPolicy(c, { actionKey: "crm.lead.create", ...allow }),
    );
    expect(await epochs()).toEqual({ dev: 2, prod: 1 });
  });

  it("caps the number of policies per action, so a decision always loads a bounded set", async () => {
    const org = await w.freshOrg();
    const migrator = await w.db.admin();
    await migrator.query(
      "INSERT INTO axo.policies (organization_id, action_key, created_by_user_id) SELECT $1, 'crm.lead.create', $2 FROM generate_series(1, 200)",
      [org.id, org.owner],
    );
    await expect(
      w.manage(org.admin, org, (c) => createPolicy(c, { actionKey: "crm.lead.create", ...allow })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("S09 withdrawing access takes effect at the gate", () => {
  it("suspending withdraws waiting requests with decisions and audit, blocks new ones, and resuming revives nothing", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const waiting = await Promise.all([w.submit(agent.key), w.submit(agent.key)]);
    const result = await w.manage(org.admin, org, (c) =>
      suspendAgent(c, { agentId: agent.agentId }),
    );
    expect(result.cancelledRequests).toBe(2);
    expect(await w.submit(agent.key)).toEqual({ kind: "agent_suspended" });
    await w.manage(org.admin, org, (c) => resumeAgent(c, { agentId: agent.agentId }));
    const fresh = await w.submit(agent.key);
    expect(fresh.kind === "decided" && fresh.status).toBe("pending_approval");
    const admin = await w.db.admin();
    for (const o of waiting) {
      const id = o.kind === "decided" ? o.id : "";
      const r = await admin.query("SELECT status FROM axo.action_requests WHERE id = $1", [id]);
      expect(r.rows[0].status).toBe("denied");
      const d = await admin.query(
        "SELECT result, reason_code, basis FROM axo.decisions WHERE action_request_id = $1 ORDER BY decided_at",
        [id],
      );
      expect(d.rows.map((x) => x.reason_code)).toEqual([
        "HUMAN_REVIEW_REQUIRED",
        "AGENT_SUSPENDED",
      ]);
      const a = await admin.query(
        "SELECT event_type FROM axo.audit_events WHERE request_id = $1 ORDER BY id",
        [id],
      );
      expect(a.rows.map((x) => x.event_type)).toEqual([
        "approval.requested",
        "action_request.created",
        "decision.recorded",
        "action_request.cancelled",
      ]);
    }
  });

  it("a request already queued before the suspension is withdrawn too", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const queued = await w.submit(agent.key);
    expect(queued.kind === "decided" && queued.status).toBe("queued_execution");
    await w.manage(org.admin, org, (c) => suspendAgent(c, { agentId: agent.agentId }));
    const admin = await w.db.admin();
    const r = await admin.query("SELECT status FROM axo.action_requests WHERE id = $1", [
      queued.kind === "decided" ? queued.id : "",
    ]);
    expect(r.rows[0].status).toBe("denied");
  });

  it("a halted environment denies new requests even with an allow policy, until it is resumed", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    await w.manage(org.admin, org, (c) => haltEnvironment(c, { environmentId: org.dev }));
    const halted = await w.submit(agent.key);
    expect(halted).toMatchObject({
      kind: "decided",
      status: "denied",
      reasonCode: "ENVIRONMENT_HALTED",
      httpStatus: 403,
    });
    await expect(
      w.manage(org.admin, org, (c) => haltEnvironment(c, { environmentId: org.dev })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await w.manage(org.admin, org, (c) => resumeEnvironment(c, { environmentId: org.dev }));
    expect((await w.submit(agent.key)).kind === "decided").toBe(true);
    const ok = await w.submit(agent.key);
    expect(ok).toMatchObject({ status: "queued_execution" });
    // The other environment was never affected.
    const prodAgent = await w.newAgent(org, org.prod);
    await w.policy(org, { effect: "allow", agentId: prodAgent.agentId });
    await w.manage(org.admin, org, (c) => haltEnvironment(c, { environmentId: org.dev }));
    expect(await w.submit(prodAgent.key)).toMatchObject({ status: "queued_execution" });
  });

  it("lifecycle operations on the wrong state are conflicts, not silent no-ops", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await expect(
      w.manage(org.admin, org, (c) => resumeAgent(c, { agentId: agent.agentId })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await w.manage(org.admin, org, (c) => suspendAgent(c, { agentId: agent.agentId }));
    await expect(
      w.manage(org.admin, org, (c) => suspendAgent(c, { agentId: agent.agentId })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await w.manage(org.admin, org, (c) => revokeAgent(c, { agentId: agent.agentId }));
    await expect(
      w.manage(org.admin, org, (c) => revokeAgent(c, { agentId: agent.agentId })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      w.manage(org.admin, org, (c) => resumeAgent(c, { agentId: agent.agentId })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      w.manage(org.admin, org, (c) => revokeCredential(c, { credentialId: agent.credentialId })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("concurrency: decisions never race with changes that should win", () => {
  it("after a suspension commits, no request of that agent is left waiting, however the race fell", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "require_approval", agentId: agent.agentId });
    const inFlight = Array.from({ length: 24 }, () => w.submit(agent.key, leadBody(), idem()));
    const suspension = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        w.manage(org.admin, org, (c) => suspendAgent(c, { agentId: agent.agentId })).then(
          () => resolve(),
          reject,
        );
      }, 30);
    });
    const outcomes = await Promise.all(inFlight);
    await suspension;
    for (const o of outcomes) expect(["decided", "agent_suspended"]).toContain(o.kind);
    const admin = await w.db.admin();
    const live = await admin.query(
      "SELECT count(*)::int AS n FROM axo.action_requests WHERE agent_id = $1 AND status IN ('pending_approval','approved','queued_execution')",
      [agent.agentId],
    );
    expect(live.rows[0].n).toBe(0);
    const after = await admin.query(
      `SELECT count(*)::int AS n FROM axo.action_requests r JOIN axo.agents a ON a.id = r.agent_id
        WHERE r.agent_id = $1 AND r.created_at > a.suspended_at`,
      [agent.agentId],
    );
    expect(after.rows[0].n).toBe(0);
  });

  it("after a credential is revoked, nothing it originated is left waiting", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.policy(org, { effect: "allow", agentId: agent.agentId });
    const inFlight = Array.from({ length: 24 }, () => w.submit(agent.key));
    const revocation = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        w.manage(org.admin, org, (c) =>
          revokeCredential(c, { credentialId: agent.credentialId }),
        ).then(() => resolve(), reject);
      }, 30);
    });
    const outcomes = await Promise.all(inFlight);
    await revocation;
    for (const o of outcomes) expect(["decided", "unauthenticated"]).toContain(o.kind);
    const admin = await w.db.admin();
    const live = await admin.query(
      "SELECT count(*)::int AS n FROM axo.action_requests WHERE originating_credential_id = $1 AND status IN ('pending_approval','approved','queued_execution')",
      [agent.credentialId],
    );
    expect(live.rows[0].n).toBe(0);
  });

  it("every decision's policy version and epoch are a matching pair while the policy is being edited", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    // One organization-wide policy flipped between allow (odd versions) and deny (even versions). The epoch of the
    // environment equals the number of versions committed, so the epoch recorded with a decision says which version
    // that decision must have used.
    const p = await w.manage(org.admin, org, (c) =>
      createPolicy(c, { actionKey: "crm.lead.create", environmentId: org.dev, ...allow }),
    );
    let stop = false;
    const editor = (async () => {
      for (let version = 1; version < 14 && !stop; version++) {
        await w.manage(org.admin, org, (c) =>
          createPolicyVersion(c, {
            policyId: p.policyId,
            expectedVersion: version,
            effect: version % 2 === 1 ? "deny" : "allow",
            conditions: { all: [] },
          }),
        );
      }
    })();
    const decisions: string[] = [];
    while (decisions.length < 60) {
      const out = await w.submit(agent.key);
      if (out.kind === "decided") decisions.push(out.id);
      if (decisions.length % 10 === 0) await new Promise((r) => setTimeout(r, 5));
      if (out.kind !== "decided") throw new Error(out.kind);
    }
    stop = true;
    await editor;
    const admin = await w.db.admin();
    const rows = await admin.query(
      "SELECT result, policy_epoch::int AS epoch FROM axo.decisions WHERE action_request_id = ANY($1)",
      [decisions],
    );
    expect(rows.rowCount).toBe(60);
    for (const r of rows.rows) {
      expect(r.result, `epoch ${r.epoch}`).toBe(r.epoch % 2 === 1 ? "allow" : "deny");
    }
    expect(new Set(rows.rows.map((r) => r.epoch)).size).toBeGreaterThan(1);
  });
});

describe("stopping is always possible; switching back on needs a fresh multi-factor sign-in", () => {
  it("lets an admin without recent MFA suspend an agent and halt an environment, but not resume either", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    const stale = { mfa: false } as const;

    await w.manage(org.admin, org, (c) => suspendAgent(c, { agentId: agent.agentId }), stale);
    await w.manage(org.admin, org, (c) => haltEnvironment(c, { environmentId: org.dev }), stale);

    await expect(
      w.manage(org.admin, org, (c) => resumeAgent(c, { agentId: agent.agentId }), stale),
    ).rejects.toMatchObject({ code: "STEP_UP" });
    await expect(
      w.manage(org.admin, org, (c) => resumeEnvironment(c, { environmentId: org.dev }), stale),
    ).rejects.toMatchObject({ code: "STEP_UP" });

    const admin = await w.db.admin();
    expect(
      (await admin.query("SELECT status FROM axo.agents WHERE id = $1", [agent.agentId])).rows[0]
        .status,
    ).toBe("suspended");
    expect(
      (await admin.query("SELECT enforcement_state FROM axo.environments WHERE id = $1", [org.dev]))
        .rows[0].enforcement_state,
    ).toBe("halted");

    // With a fresh multi-factor sign-in, both work again.
    await w.manage(org.admin, org, (c) => resumeAgent(c, { agentId: agent.agentId }));
    await w.manage(org.admin, org, (c) => resumeEnvironment(c, { environmentId: org.dev }));
  });

  it("still refuses a viewer outright, before any multi-factor question", async () => {
    const org = await w.freshOrg();
    const agent = await w.newAgent(org, org.dev);
    await w.manage(org.admin, org, (c) => suspendAgent(c, { agentId: agent.agentId }));
    await expect(
      w.manage(org.viewer, org, (c) => resumeAgent(c, { agentId: agent.agentId })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
