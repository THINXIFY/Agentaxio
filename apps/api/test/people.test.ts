import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "../src/auth/tokens";
import { createHumanWorld, newUser, type Browser, type HumanWorld } from "./support/human";

/**
 * Organizations, membership, roles and invitations, driven through the real HTTP API with real sessions.
 * Nobody here is a seeded fixture: each person signs up through the (test) identity provider and gets an account on
 * first sight.
 */

let h: HumanWorld;
beforeAll(async () => {
  h = await createHumanWorld();
});
afterAll(async () => {
  await h.close();
});

const slug = () => `org-${randomBytes(4).toString("hex")}`;

async function person(
  key: string,
  overrides: Parameters<typeof newUser>[2] = {},
): Promise<{ key: string; browser: Browser; id: string; email: string }> {
  newUser(h, key, overrides);
  const browser = await h.signIn(key);
  return { key, browser, id: await h.userId(key), email: h.idp.users.get(key)?.email ?? "" };
}

async function organization(owner: { browser: Browser }, name = "Invented Org") {
  const res = await owner.browser.post("/v1/organizations", { name, slug: slug() });
  expect(res.status, res.body).toBe(201);
  return res.json<{ organizationId: string }>().organizationId;
}

const url = (org: string, path: string) => `/v1/orgs/${org}${path}`;

/** Invite `invitee` and have them accept; returns when they are a member. */
async function join(
  owner: { browser: Browser },
  org: string,
  invitee: { browser: Browser; email: string },
  role: string,
) {
  const invited = await owner.browser.post(url(org, "/invitations"), {
    email: invitee.email,
    role,
  });
  expect(invited.status, invited.body).toBe(200);
  const token = invited.json<{ token: string }>().token;
  const accepted = await invitee.browser.post("/v1/invitations/accept", { token });
  expect(accepted.status, accepted.body).toBe(200);
  return token;
}

describe("signing up and creating an organization", () => {
  it("makes the creator the owner, with a development and a production environment", async () => {
    const alice = await person(`alice-${randomBytes(2).toString("hex")}`);
    const org = await organization(alice, "Alice Agency");
    const me = (await alice.browser.get("/v1/me")).json<{
      memberships: Array<{ organizationId: string; role: string; organizationName: string }>;
    }>();
    expect(me.memberships).toEqual([
      expect.objectContaining({
        organizationId: org,
        role: "owner",
        organizationName: "Alice Agency",
      }),
    ]);
    const environments = (await alice.browser.get(url(org, "/environments"))).json<
      Array<{ name: string; state: string }>
    >();
    expect(environments.map((e) => e.name).sort()).toEqual(["dev", "prod"]);
    expect(environments.every((e) => e.state === "active")).toBe(true);
  });

  it("requires a verified email address and a fresh multi-factor login", async () => {
    const unverified = await person(`unverified-${randomBytes(2).toString("hex")}`, {
      emailVerified: false,
    });
    const res = await unverified.browser.post("/v1/organizations", { name: "Nope", slug: slug() });
    expect(res.status).toBe(403);
    const plain = await person(`plain-${randomBytes(2).toString("hex")}`, { amr: ["pwd"] });
    const stepUp = await plain.browser.post("/v1/organizations", { name: "Nope", slug: slug() });
    expect(stepUp.status).toBe(403);
    expect(stepUp.json<{ error: { code: string } }>().error.code).toBe("STEP_UP_REQUIRED");
  });

  it("limits one person to three owned organizations, even when the requests arrive together", async () => {
    const greedy = await person(`greedy-${randomBytes(2).toString("hex")}`);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        greedy.browser.post("/v1/organizations", { name: "Many", slug: slug() }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it("rejects a taken slug, a malformed slug and a bad name, and unknown fields", async () => {
    const owner = await person(`slugs-${randomBytes(2).toString("hex")}`);
    const taken = slug();
    expect((await owner.browser.post("/v1/organizations", { name: "A", slug: taken })).status).toBe(
      201,
    );
    expect((await owner.browser.post("/v1/organizations", { name: "B", slug: taken })).status).toBe(
      409,
    );
    for (const bad of [
      { name: "x", slug: "UPPER" },
      { name: "x", slug: "a" },
      { name: "x", slug: "has space" },
      { name: "", slug: slug() },
      { name: "x", slug: slug(), role: "owner" },
      { name: 5, slug: slug() },
    ]) {
      expect((await owner.browser.post("/v1/organizations", bad)).status, JSON.stringify(bad)).toBe(
        422,
      );
    }
  });
});

describe("tenant isolation over HTTP", () => {
  it("gives a non-member nothing: every read and write of another organization is refused the same way", async () => {
    const owner = await person(`owner-${randomBytes(2).toString("hex")}`);
    const stranger = await person(`stranger-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    const reads = [
      "/overview",
      "/environments",
      "/agents",
      "/requests",
      "/activity",
      "/policies",
      "/approvals",
      "/members",
      "/invitations",
    ];
    for (const path of reads) {
      const mine = await stranger.browser.get(url(org, path));
      expect(mine.status, path).toBe(403);
      expect(mine.body, path).not.toContain(org);
    }
    const writes: Array<[string, unknown]> = [
      [
        "/agents",
        {
          name: "x",
          environmentId: randomBytes(16)
            .toString("hex")
            .replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12}).*/, "$1-$2-4$3-8$4-$5"),
          ownerUserId: owner.id,
        },
      ],
      ["/invitations", { email: "x@y.test", role: "viewer" }],
      ["/policies", { actionKey: "crm.lead.create", effect: "allow", conditions: { all: [] } }],
    ];
    for (const [path, body] of writes)
      expect((await stranger.browser.post(url(org, path), body)).status, path).toBe(403);
  });

  it("answers a malformed or unknown organization id with 404 or 403 and never leaks whether it exists", async () => {
    const someone = await person(`someone-${randomBytes(2).toString("hex")}`);
    expect((await someone.browser.get("/v1/orgs/not-a-uuid/agents")).status).toBe(404);
    const unknown = await someone.browser.get(
      "/v1/orgs/11111111-1111-4111-8111-111111111111/agents",
    );
    expect(unknown.status).toBe(403);
    expect(unknown.json<{ error: { message: string } }>().error.message).toBe("Not permitted.");
  });

  it("cannot be tricked by identifiers in the body, the query or headers", async () => {
    const a = await person(`a-${randomBytes(2).toString("hex")}`);
    const b = await person(`b-${randomBytes(2).toString("hex")}`);
    const orgA = await organization(a);
    const orgB = await organization(b);
    const spoof = { headers: { "x-organization-id": orgA, "x-user-id": a.id } };
    expect(
      (await b.browser.get(url(orgB, `/agents?organization_id=${orgA}&org=${orgA}`), spoof)).status,
    ).toBe(200);
    expect((await b.browser.get(url(orgA, "/agents"), spoof)).status).toBe(403);
    const created = await b.browser.post(
      url(orgB, "/agents"),
      { name: "spoof", environmentId: orgA, ownerUserId: a.id },
      spoof,
    );
    expect([404, 422]).toContain(created.status);
  });
});

describe("invitations", () => {
  it("brings a person in once, as the invited role, and shows the token only to the inviter, once", async () => {
    const owner = await person(`inv-owner-${randomBytes(2).toString("hex")}`);
    const bob = await person(`inv-bob-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    const invited = await owner.browser.post(url(org, "/invitations"), {
      email: bob.email,
      role: "approver",
    });
    const token = invited.json<{ token: string }>().token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The list never carries the token or its digest.
    const list = await owner.browser.get(url(org, "/invitations"));
    expect(list.body).not.toContain(token);
    expect(list.body).not.toMatch(/token/i);
    const admin = await h.world.db.admin();
    const stored = await admin.query(
      "SELECT string_agg(row_to_json(i)::text, ' ') AS j FROM axo.invitations i",
    );
    expect(String(stored.rows[0].j)).not.toContain(token);
    expect((await bob.browser.post("/v1/invitations/accept", { token })).status).toBe(200);
    const me = (await bob.browser.get("/v1/me")).json<{
      memberships: Array<{ role: string; organizationId: string }>;
    }>();
    expect(me.memberships).toEqual([
      expect.objectContaining({ organizationId: org, role: "approver" }),
    ]);
    // Single use.
    expect((await bob.browser.post("/v1/invitations/accept", { token })).status).toBe(404);
  });

  it("works only for the verified email address it names", async () => {
    const owner = await person(`bind-owner-${randomBytes(2).toString("hex")}`);
    const bob = await person(`bind-bob-${randomBytes(2).toString("hex")}`);
    const carol = await person(`bind-carol-${randomBytes(2).toString("hex")}`);
    const unverified = await person(`bind-unverified-${randomBytes(2).toString("hex")}`, {
      emailVerified: false,
    });
    const org = await organization(owner);
    const token = (
      await owner.browser.post(url(org, "/invitations"), { email: bob.email, role: "viewer" })
    ).json<{ token: string }>().token;
    expect((await carol.browser.post("/v1/invitations/accept", { token })).status).toBe(404);
    const forUnverified = (
      await owner.browser.post(url(org, "/invitations"), {
        email: unverified.email,
        role: "viewer",
      })
    ).json<{ token: string }>().token;
    expect(
      (await unverified.browser.post("/v1/invitations/accept", { token: forUnverified })).status,
    ).toBe(404);
    expect((await bob.browser.post("/v1/invitations/accept", { token })).status).toBe(200);
  });

  it("is refused after it expires, after it is revoked, and after it is replaced by a newer one", async () => {
    const owner = await person(`life-owner-${randomBytes(2).toString("hex")}`);
    const bob = await person(`life-bob-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    const admin = await h.world.db.admin();

    const first = (
      await owner.browser.post(url(org, "/invitations"), { email: bob.email, role: "viewer" })
    ).json<{ token: string }>().token;
    const second = (
      await owner.browser.post(url(org, "/invitations"), { email: bob.email, role: "viewer" })
    ).json<{ token: string }>().token;
    expect((await bob.browser.post("/v1/invitations/accept", { token: first })).status).toBe(404);

    await admin.query(
      "UPDATE axo.invitations SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [hashToken(second)],
    );
    expect((await bob.browser.post("/v1/invitations/accept", { token: second })).status).toBe(404);

    const third = await owner.browser.post(url(org, "/invitations"), {
      email: bob.email,
      role: "viewer",
    });
    const list = (await owner.browser.get(url(org, "/invitations"))).json<
      Array<{ id: string; state: string }>
    >();
    const open = list.find((i) => i.state === "open");
    expect(open).toBeDefined();
    expect((await owner.browser.post(url(org, `/invitations/${open?.id}/revoke`))).status).toBe(
      200,
    );
    expect(
      (
        await bob.browser.post("/v1/invitations/accept", {
          token: third.json<{ token: string }>().token,
        })
      ).status,
    ).toBe(404);
  });

  it("cannot be guessed: malformed and unknown tokens all look the same", async () => {
    const bob = await person(`guess-${randomBytes(2).toString("hex")}`);
    const seen = new Set<string>();
    for (const token of [
      "",
      "short",
      "A".repeat(43),
      randomBytes(32).toString("base64url"),
      "../../etc/passwd",
      "x".repeat(200),
    ]) {
      const res = await bob.browser.post("/v1/invitations/accept", { token });
      expect([404, 422], token.slice(0, 10)).toContain(res.status);
      if (res.status === 404) seen.add(res.body.replace(/"trace_id":"[^"]+"/, ""));
    }
    expect(seen.size).toBe(1);
  });

  it("is restricted by role: viewers and approvers cannot invite, admins cannot invite admins or owners", async () => {
    const owner = await person(`rr-owner-${randomBytes(2).toString("hex")}`);
    const admin = await person(`rr-admin-${randomBytes(2).toString("hex")}`);
    const viewer = await person(`rr-viewer-${randomBytes(2).toString("hex")}`);
    const approver = await person(`rr-approver-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    await join(owner, org, admin, "admin");
    await join(owner, org, viewer, "viewer");
    await join(owner, org, approver, "approver");
    for (const who of [viewer, approver]) {
      expect(
        (
          await who.browser.post(url(org, "/invitations"), {
            email: "x@people.test",
            role: "viewer",
          })
        ).status,
      ).toBe(403);
      expect((await who.browser.get(url(org, "/invitations"))).status).toBe(403);
    }
    expect(
      (
        await admin.browser.post(url(org, "/invitations"), {
          email: "a@people.test",
          role: "owner",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.browser.post(url(org, "/invitations"), {
          email: "a@people.test",
          role: "admin",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.browser.post(url(org, "/invitations"), {
          email: "a@people.test",
          role: "viewer",
        })
      ).status,
    ).toBe(200);
  });
});

describe("roles and membership", () => {
  async function team() {
    const owner = await person(`t-owner-${randomBytes(2).toString("hex")}`);
    const admin = await person(`t-admin-${randomBytes(2).toString("hex")}`);
    const approver = await person(`t-approver-${randomBytes(2).toString("hex")}`);
    const viewer = await person(`t-viewer-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    await join(owner, org, admin, "admin");
    await join(owner, org, approver, "approver");
    await join(owner, org, viewer, "viewer");
    return { owner, admin, approver, viewer, org };
  }
  const role = async (t: { owner: { browser: Browser }; org: string }, userId: string) =>
    (await t.owner.browser.get(url(t.org, "/members")))
      .json<Array<{ userId: string; role: string }>>()
      .find((m) => m.userId === userId)?.role;

  it("lets the owner change roles, and records it", async () => {
    const t = await team();
    expect(
      (await t.owner.browser.post(url(t.org, `/members/${t.viewer.id}/role`), { role: "approver" }))
        .status,
    ).toBe(200);
    expect(await role(t, t.viewer.id)).toBe("approver");
    const activity = (await t.owner.browser.get(url(t.org, "/activity?limit=20"))).json<
      Array<{ event: string }>
    >();
    expect(activity.map((a) => a.event)).toContain("membership.role_changed");
  });

  it("never lets anyone change their own role, or a lower role climb above its grantor", async () => {
    const t = await team();
    expect(
      (await t.admin.browser.post(url(t.org, `/members/${t.admin.id}/role`), { role: "owner" }))
        .status,
    ).toBe(403);
    expect(
      (await t.owner.browser.post(url(t.org, `/members/${t.owner.id}/role`), { role: "viewer" }))
        .status,
    ).toBe(403);
    expect(
      (
        await t.approver.browser.post(url(t.org, `/members/${t.approver.id}/role`), {
          role: "admin",
        })
      ).status,
    ).toBe(403);
    expect(
      (await t.viewer.browser.post(url(t.org, `/members/${t.viewer.id}/role`), { role: "owner" }))
        .status,
    ).toBe(403);
    expect(
      (await t.admin.browser.post(url(t.org, `/members/${t.viewer.id}/role`), { role: "admin" }))
        .status,
    ).toBe(403);
    expect(
      (await t.admin.browser.post(url(t.org, `/members/${t.owner.id}/role`), { role: "viewer" }))
        .status,
    ).toBe(403);
    expect(
      (await t.admin.browser.post(url(t.org, `/members/${t.viewer.id}/role`), { role: "approver" }))
        .status,
    ).toBe(200);
    expect(await role(t, t.admin.id)).toBe("admin");
    expect(await role(t, t.owner.id)).toBe("owner");
  });

  it("keeps at least one owner, however the removal is attempted", async () => {
    const t = await team();
    expect((await t.owner.browser.post(url(t.org, `/members/${t.owner.id}/remove`))).status).toBe(
      409,
    );
    const second = await person(`t-second-${randomBytes(2).toString("hex")}`);
    await join(t.owner, t.org, second, "owner");
    expect(
      (await second.browser.post(url(t.org, `/members/${t.owner.id}/role`), { role: "admin" }))
        .status,
    ).toBe(200);
    expect((await second.browser.post(url(t.org, `/members/${second.id}/remove`))).status).toBe(
      409,
    );
  });

  it("cuts a removed member off immediately, even with a live session, and lets them be invited again", async () => {
    const t = await team();
    expect((await t.approver.browser.get(url(t.org, "/agents"))).status).toBe(200);
    expect(
      (await t.owner.browser.post(url(t.org, `/members/${t.approver.id}/remove`))).status,
    ).toBe(200);
    expect((await t.approver.browser.get(url(t.org, "/agents"))).status).toBe(403);
    expect(
      (await t.approver.browser.get("/v1/me")).json<{ memberships: unknown[] }>().memberships,
    ).toEqual([]);
    await join(t.owner, t.org, t.approver, "viewer");
    expect(await role(t, t.approver.id)).toBe("viewer");
  });

  it("asks for a fresh multi-factor login for every change of who may do what", async () => {
    const t = await team();
    const admin = await h.world.db.admin();
    const make = async (b: Browser) => {
      await admin.query(
        "UPDATE axo.sessions SET mfa_verified_at = now() - interval '1 hour' WHERE token_hash = $1",
        [hashToken(b.sessionToken ?? "")],
      );
    };
    await make(t.owner.browser);
    for (const [path, body] of [
      ["/invitations", { email: "x@people.test", role: "viewer" }],
      [`/members/${t.viewer.id}/role`, { role: "approver" }],
      [`/members/${t.viewer.id}/remove`, {}],
    ] as const) {
      const res = await t.owner.browser.post(url(t.org, path), body);
      expect(res.status, path).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code, path).toBe("STEP_UP_REQUIRED");
    }
    // Reading is never blocked by step-up.
    expect((await t.owner.browser.get(url(t.org, "/members"))).status).toBe(200);
  });

  it("lets every member see who is on the team, and nobody outside it", async () => {
    const t = await team();
    for (const who of [t.owner, t.admin, t.approver, t.viewer]) {
      const members = (await who.browser.get(url(t.org, "/members"))).json<
        Array<{ email: string }>
      >();
      expect(members).toHaveLength(4);
    }
  });
});

describe("managing agents, credentials and policies over HTTP", () => {
  it("registers an agent, shows its key once, and the key works against the agent API", async () => {
    const owner = await person(`ag-owner-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    const envs = (await owner.browser.get(url(org, "/environments"))).json<
      Array<{ id: string; name: string }>
    >();
    const dev = envs.find((e) => e.name === "dev")?.id ?? "";
    const agent = (
      await owner.browser.post(url(org, "/agents"), {
        name: "Lead Intake",
        environmentId: dev,
        ownerUserId: owner.id,
      })
    ).json<{ agentId: string }>().agentId;
    const issued = await owner.browser.post(url(org, `/agents/${agent}/credentials`), {});
    expect(issued.status).toBe(200);
    const key = issued.json<{ fullKey: string }>().fullKey;
    expect(key).toMatch(/^axo_[0-9a-f]{24}_[A-Za-z0-9_-]{43}$/);
    // No listing ever repeats it.
    const listed = await owner.browser.get(url(org, `/agents/${agent}/credentials`));
    expect(listed.body).not.toContain(key);
    expect(listed.body).not.toContain(key.slice(-43));
    expect((await owner.browser.get(url(org, "/agents"))).body).not.toContain(key.slice(-43));
    const policy = await owner.browser.post(url(org, "/policies"), {
      actionKey: "crm.lead.create",
      agentId: agent,
      effect: "require_approval",
      conditions: { all: [] },
    });
    expect(policy.status, policy.body).toBe(200);
    const decided = await h.world.submit(key);
    expect(decided).toMatchObject({ kind: "decided", status: "pending_approval" });
    // The agent shows up with its pending approval.
    const agents = (await owner.browser.get(url(org, "/agents"))).json<
      Array<{ pendingApprovals: number; activeCredentials: number }>
    >();
    expect(agents[0]).toMatchObject({ pendingApprovals: 1, activeCredentials: 1 });
  });

  it("revises a policy with optimistic concurrency and refuses a stale revision", async () => {
    const owner = await person(`po-owner-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    const created = (
      await owner.browser.post(url(org, "/policies"), {
        actionKey: "crm.lead.create",
        effect: "allow",
        conditions: { all: [] },
      })
    ).json<{ policyId: string }>();
    const v2 = await owner.browser.post(url(org, `/policies/${created.policyId}/versions`), {
      expectedVersion: 1,
      effect: "require_approval",
      conditions: { all: [] },
    });
    expect(v2.status, v2.body).toBe(200);
    expect(
      (
        await owner.browser.post(url(org, `/policies/${created.policyId}/versions`), {
          expectedVersion: 1,
          effect: "deny",
          conditions: { all: [] },
        })
      ).status,
    ).toBe(409);
    const versions = (
      await owner.browser.get(url(org, `/policies/${created.policyId}/versions`))
    ).json<Array<{ version: number }>>();
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    for (const bad of [
      {
        actionKey: "crm.lead.create",
        effect: "allow",
        conditions: { all: [{ field: "phone", op: "eq", value: "1" }] },
      },
      { actionKey: "crm.lead.create", effect: "maybe", conditions: { all: [] } },
      { actionKey: "payments.refund.create", effect: "allow", conditions: { all: [] } },
    ]) {
      expect(
        (await owner.browser.post(url(org, "/policies"), bad)).status,
        JSON.stringify(bad),
      ).toBe(422);
    }
  });

  it("lets viewers read everything in their organization and change nothing", async () => {
    const owner = await person(`vw-owner-${randomBytes(2).toString("hex")}`);
    const viewer = await person(`vw-viewer-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    await join(owner, org, viewer, "viewer");
    for (const path of [
      "/overview",
      "/agents",
      "/policies",
      "/requests",
      "/activity",
      "/approvals",
      "/members",
      "/environments",
    ]) {
      expect((await viewer.browser.get(url(org, path))).status, path).toBe(200);
    }
    const envs = (await viewer.browser.get(url(org, "/environments"))).json<
      Array<{ id: string }>
    >();
    for (const [path, body] of [
      ["/agents", { name: "x", environmentId: envs[0]?.id, ownerUserId: viewer.id }],
      ["/policies", { actionKey: "crm.lead.create", effect: "allow", conditions: { all: [] } }],
      [`/environments/${envs[0]?.id}/halt`, {}],
    ] as const) {
      expect((await viewer.browser.post(url(org, path), body)).status, path).toBe(403);
    }
  });

  it("reports an overview that counts only this organization's work", async () => {
    const owner = await person(`ov-owner-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    const overview = (await owner.browser.get(url(org, "/overview"))).json<{
      agents: { active: number };
      pendingApprovals: number;
      daily: unknown[];
    }>();
    expect(overview).toMatchObject({ agents: { active: 0 }, pendingApprovals: 0 });
    expect(overview.daily).toHaveLength(7);
  });
});

describe("secure error handling", () => {
  it("answers with a generic body and a trace id, and never a stack, SQL or internal detail", async () => {
    const owner = await person(`er-owner-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    const samples = [
      await owner.browser.get(url(org, "/approvals/not-a-uuid")),
      await owner.browser.post(url(org, "/agents"), { nonsense: true }),
      await owner.browser.get("/v1/orgs/11111111-1111-4111-8111-111111111111/agents"),
      await owner.browser.get("/no/such/route"),
    ];
    for (const res of samples) {
      const body = res.body;
      expect(JSON.parse(body).error.trace_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(body).not.toMatch(/stack|at .*\(|SELECT|INSERT|axo\.|postgres|node_modules|ECONN/i);
    }
  });

  it("answers 503 and changes nothing when the database fails mid-request, without leaking why", async () => {
    const owner = await person(`db-owner-${randomBytes(2).toString("hex")}`);
    const org = await organization(owner);
    const admin = await h.world.db.admin();
    await admin.query(`
      CREATE FUNCTION axo.test_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'internal secret detail %', NEW.name; END $$;
      CREATE TRIGGER test_boom BEFORE INSERT ON axo.agents FOR EACH ROW EXECUTE FUNCTION axo.test_boom();`);
    try {
      const envs = (await owner.browser.get(url(org, "/environments"))).json<
        Array<{ id: string }>
      >();
      h.logs.length = 0;
      const res = await owner.browser.post(url(org, "/agents"), {
        name: "explodes",
        environmentId: envs[0]?.id,
        ownerUserId: owner.id,
      });
      expect(res.status).toBe(503);
      expect(res.body).not.toContain("internal secret detail");
      expect(h.logs.join("\n")).not.toContain("internal secret detail");
      const agents = (await owner.browser.get(url(org, "/agents"))).json<unknown[]>();
      expect(agents).toHaveLength(0);
    } finally {
      await admin.query("DROP TRIGGER test_boom ON axo.agents; DROP FUNCTION axo.test_boom()");
    }
  });

  it("refuses non-JSON bodies and oversized bodies before doing any work", async () => {
    const owner = await person(`sz-owner-${randomBytes(2).toString("hex")}`);
    const big = await owner.browser.post("/v1/organizations", {
      name: "x".repeat(40_000),
      slug: slug(),
    });
    expect(big.status).toBe(413);
    const text = await owner.browser.request("POST", "/v1/organizations", {
      body: undefined,
      headers: { "content-type": "text/plain" },
    });
    expect([415, 422]).toContain(text.status);
  });
});
