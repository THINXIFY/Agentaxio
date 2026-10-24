import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allTransitions } from "@agentaxio/contracts";
import { MIGRATIONS_DIR, MigrationError, migrate, readMigrations } from "../src/db/migrate";
import { createTestDatabase } from "./support/db";
import { createWorld, leadBody, type World } from "./support/world";

/**
 * Database-level guarantees, checked against a real PostgreSQL 17 server: migrations, the exact privileges of each
 * runtime role, row-level security, composite foreign keys, append-only tables and the request state machine.
 */

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w.close();
});

const sqlState = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unknown";
  }
  return "ok";
};

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

describe("migrations", () => {
  it("apply from an empty database, and running them again changes nothing", async () => {
    const db = await createTestDatabase({ migrate: false });
    try {
      const client = await connect(db.urls.migrator);
      const first = await migrate(client);
      const second = await migrate(client);
      await client.end();
      expect(first.applied).toEqual(readMigrations().map((m) => m.name));
      expect(second.applied).toEqual([]);
      expect(second.alreadyApplied).toEqual(first.applied);
    } finally {
      await db.drop();
    }
  });

  it("refuse to run when an applied migration was edited afterwards", async () => {
    const db = await createTestDatabase();
    try {
      const admin = await db.admin();
      await admin.query(
        "UPDATE axo.schema_migrations SET checksum = repeat('0', 64) WHERE version = '002'",
      );
      const client = await connect(db.urls.migrator);
      await expect(migrate(client)).rejects.toThrow(MigrationError);
      await client.end();
    } finally {
      await db.drop();
    }
  });

  it("refuse a new migration that sorts before one already applied", async () => {
    const db = await createTestDatabase();
    const dir = mkdtempSync(join(tmpdir(), "axo-mig-"));
    try {
      cpSync(MIGRATIONS_DIR, dir, { recursive: true });
      writeFileSync(join(dir, "000_early.sql"), "SELECT 1;");
      const client = await connect(db.urls.migrator);
      await expect(migrate(client, dir)).rejects.toThrow(/older than the newest applied/);
      await client.end();
    } finally {
      await db.drop();
    }
  });

  it("are all-or-nothing: a failing migration leaves no partial schema and no bookkeeping row", async () => {
    const db = await createTestDatabase();
    const dir = mkdtempSync(join(tmpdir(), "axo-mig-"));
    try {
      cpSync(MIGRATIONS_DIR, dir, { recursive: true });
      writeFileSync(
        join(dir, "005_broken.sql"),
        "CREATE TABLE axo.half_done (id int); SELECT 1/0;",
      );
      const client = await connect(db.urls.migrator);
      await expect(migrate(client, dir)).rejects.toThrow();
      await client.end();
      const admin = await db.admin();
      const table = await admin.query("SELECT to_regclass('axo.half_done') AS t");
      expect(table.rows[0].t).toBeNull();
      const rows = await admin.query("SELECT 1 FROM axo.schema_migrations WHERE version = '005'");
      expect(rows.rowCount).toBe(0);
    } finally {
      await db.drop();
    }
  });

  it("serialize when several runners start at once", async () => {
    const db = await createTestDatabase({ migrate: false });
    try {
      const clients = await Promise.all(Array.from({ length: 4 }, () => connect(db.urls.migrator)));
      const results = await Promise.all(clients.map((c) => migrate(c)));
      await Promise.all(clients.map((c) => c.end()));
      const applied = results.flatMap((r) => r.applied);
      expect(applied.sort()).toEqual(
        readMigrations()
          .map((m) => m.name)
          .sort(),
      );
      const admin = await db.admin();
      const rows = await admin.query("SELECT count(*)::int AS n FROM axo.schema_migrations");
      expect(rows.rows[0].n).toBe(readMigrations().length);
    } finally {
      await db.drop();
    }
  });

  it("keep the database state machine identical to the code state machine", async () => {
    const admin = await w.db.admin();
    const rows = await admin.query(
      "SELECT from_status, to_status FROM axo.request_status_transitions",
    );
    const inDb = rows.rows.map((r) => `${r.from_status}>${r.to_status}`).sort();
    const inCode = allTransitions()
      .map(([a, b]) => `${a}>${b}`)
      .sort();
    expect(inDb).toEqual(inCode);
  });
});

describe("S20 runtime roles are least-privilege", () => {
  const roles = ["axo_agent_api", "axo_management"] as const;

  it("are not superusers, cannot create roles or databases, cannot replicate and cannot bypass row-level security", async () => {
    const admin = await w.db.admin();
    const rows = await admin.query(
      `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolinherit
         FROM pg_roles WHERE rolname = ANY($1)`,
      [["axo_agent_api", "axo_management", "axo_migrator"]],
    );
    expect(rows.rowCount).toBe(3);
    for (const r of rows.rows) {
      expect(r, r.rolname).toMatchObject({
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolbypassrls: false,
        rolinherit: false,
      });
    }
  });

  it("own nothing and belong to no other role", async () => {
    const admin = await w.db.admin();
    const owned = await admin.query(
      `SELECT c.relname FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
        WHERE c.relnamespace = 'axo'::regnamespace AND r.rolname = ANY($1)`,
      [roles],
    );
    expect(owned.rowCount).toBe(0);
    const member = await admin.query(
      `SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = ANY($1)`,
      [roles],
    );
    expect(member.rowCount).toBe(0);
    const tables = await admin.query(
      `SELECT DISTINCT r.rolname FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
        WHERE c.relnamespace = 'axo'::regnamespace`,
    );
    expect(tables.rows.map((r) => r.rolname)).toEqual(["axo_migrator"]);
  });

  it("cannot create objects in any schema or temporary tables", async () => {
    for (const url of [w.db.urls.agentApi, w.db.urls.management]) {
      const client = await connect(url);
      try {
        expect(await sqlState(() => client.query("CREATE TABLE axo.evil (id int)"))).toBe("42501");
        expect(await sqlState(() => client.query("CREATE TABLE public.evil (id int)"))).toBe(
          "42501",
        );
        expect(await sqlState(() => client.query("CREATE TEMP TABLE evil (id int)"))).toBe("42501");
        expect(await sqlState(() => client.query("CREATE SCHEMA evil"))).toBe("42501");
      } finally {
        await client.end();
      }
    }
  });

  it("have exactly the table privileges listed here, and nothing else", async () => {
    const admin = await w.db.admin();
    const expected: Record<string, Record<string, string[]>> = {
      axo_agent_api: {
        action_definitions: ["SELECT"],
        action_requests: ["INSERT", "SELECT"],
        decisions: ["INSERT", "SELECT"],
        audit_events: ["INSERT"],
        policies: ["SELECT"],
        policy_versions: ["SELECT"],
      },
      axo_management: {
        action_definitions: ["SELECT"],
        action_requests: ["SELECT"],
        agent_credentials: ["INSERT"],
        agents: ["INSERT", "SELECT"],
        audit_events: ["INSERT", "SELECT"],
        decisions: ["INSERT", "SELECT"],
        environments: ["SELECT"],
        memberships: ["SELECT"],
        organizations: ["SELECT"],
        policies: ["INSERT", "SELECT"],
        policy_versions: ["INSERT", "SELECT"],
      },
    };
    const tables = await admin.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'axo' AND table_type = 'BASE TABLE'",
    );
    const privileges = [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ];
    for (const role of roles) {
      for (const t of tables.rows.map((r) => r.table_name as string)) {
        const held: string[] = [];
        for (const p of privileges) {
          const r = await admin.query("SELECT has_table_privilege($1, $2, $3) AS ok", [
            role,
            `axo.${t}`,
            p,
          ]);
          if (r.rows[0].ok) held.push(p);
        }
        expect(held.sort(), `${role} on ${t}`).toEqual((expected[role]?.[t] ?? []).sort());
      }
    }
  });

  it("can update only the columns listed here, and management cannot read credential digests", async () => {
    const admin = await w.db.admin();
    const columns = await admin.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'axo'",
    );
    const updatable: Record<string, string[]> = { axo_agent_api: [], axo_management: [] };
    const selectable: Record<string, string[]> = { axo_agent_api: [], axo_management: [] };
    for (const role of roles) {
      for (const { table_name: t, column_name: c } of columns.rows) {
        const up = await admin.query("SELECT has_column_privilege($1, $2, $3, 'UPDATE') AS ok", [
          role,
          `axo.${t}`,
          c,
        ]);
        if (up.rows[0].ok) updatable[role]?.push(`${t}.${c}`);
        const sel = await admin.query("SELECT has_column_privilege($1, $2, $3, 'SELECT') AS ok", [
          role,
          `axo.${t}`,
          c,
        ]);
        if (sel.rows[0].ok && t === "agent_credentials") selectable[role]?.push(c);
      }
    }
    expect(updatable.axo_agent_api?.sort()).toEqual(["action_requests.status"]);
    expect(updatable.axo_management?.sort()).toEqual(
      [
        "action_requests.status",
        "agent_credentials.revoked_at",
        "agent_credentials.revoked_reason",
        "agents.revoked_at",
        "agents.status",
        "agents.suspended_at",
        "environments.enforcement_state",
        "environments.policy_epoch",
      ].sort(),
    );
    expect(selectable.axo_agent_api).toEqual([]);
    expect(selectable.axo_management).not.toContain("secret_hash");
    expect(selectable.axo_management).toContain("key_id");
  });

  it("can execute exactly the functions listed here; PUBLIC can execute none", async () => {
    const admin = await w.db.admin();
    const fns = await admin.query(
      `SELECT p.proname, p.oid, p.prosecdef FROM pg_proc p WHERE p.pronamespace = 'axo'::regnamespace ORDER BY 1`,
    );
    const expected: Record<string, string[]> = {
      current_agent: ["axo_agent_api", "axo_management"],
      current_env: ["axo_agent_api", "axo_management"],
      current_org: ["axo_agent_api", "axo_management"],
      current_user_id: ["axo_agent_api", "axo_management"],
      has_role: ["axo_agent_api", "axo_management"],
      enter_management_context: ["axo_management"],
      enter_agent_context: ["axo_agent_api"],
      lookup_credential: ["axo_agent_api"],
    };
    for (const f of fns.rows) {
      const holders: string[] = [];
      for (const role of [...roles, "axo_migrator"]) {
        const r = await admin.query("SELECT has_function_privilege($1, $2::oid, 'EXECUTE') AS ok", [
          role,
          f.oid,
        ]);
        if (r.rows[0].ok && role !== "axo_migrator") holders.push(role);
      }
      const publicExec = await admin.query(
        "SELECT count(*)::int AS n FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = $1 AND a.grantee = 0",
        [f.oid],
      );
      expect(publicExec.rows[0].n, `PUBLIC execute on ${f.proname}`).toBe(0);
      // Trigger functions are invoked by the database, never by a caller; they need no EXECUTE for anyone.
      expect(holders.sort(), f.proname as string).toEqual(
        (expected[f.proname as string] ?? []).sort(),
      );
    }
  });

  it("every SECURITY DEFINER function pins its search_path", async () => {
    const admin = await w.db.admin();
    const rows = await admin.query(
      `SELECT proname, proconfig FROM pg_proc WHERE pronamespace = 'axo'::regnamespace AND prosecdef`,
    );
    expect(rows.rowCount).toBeGreaterThan(0);
    for (const r of rows.rows) {
      expect(
        (r.proconfig as string[] | null)?.some((c) => c.startsWith("search_path=")),
        r.proname,
      ).toBe(true);
    }
  });

  it("every table that holds tenant data has row-level security enabled", async () => {
    const admin = await w.db.admin();
    const rows = await admin.query(
      `SELECT c.relname, c.relrowsecurity,
              EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'axo'
                       AND k.table_name = c.relname AND k.column_name = 'organization_id') AS tenant
         FROM pg_class c WHERE c.relnamespace = 'axo'::regnamespace AND c.relkind = 'r'`,
    );
    const noTenantColumn = rows.rows
      .filter((r) => !r.tenant)
      .map((r) => r.relname as string)
      .sort();
    // The only tables without organization_id are global or structural; each is listed on purpose.
    expect(noTenantColumn).toEqual(
      [
        "action_definitions",
        "organizations",
        "request_status_transitions",
        "schema_migrations",
        "users",
      ].sort(),
    );
    for (const r of rows.rows.filter(
      (x) => x.tenant || ["organizations", "users"].includes(x.relname),
    )) {
      expect(r.relrowsecurity, r.relname as string).toBe(true);
    }
  });
});

describe("S02 row-level security isolates tenants", () => {
  it("shows an agent nothing at all until its tenant context is entered", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    await w.submit(agent.key);
    const client = await connect(w.db.urls.agentApi);
    try {
      for (const table of ["action_requests", "decisions", "policies", "policy_versions"]) {
        const r = await client.query(`SELECT count(*)::int AS n FROM axo.${table}`);
        expect(r.rows[0].n, table).toBe(0);
      }
    } finally {
      await client.end();
    }
  });

  async function asAgent<T>(
    credentialId: string,
    work: (client: pg.Client) => Promise<T>,
  ): Promise<T> {
    const client = await connect(w.db.urls.agentApi);
    try {
      await client.query("BEGIN");
      await client.query("SELECT * FROM axo.enter_agent_context($1::uuid, true)", [credentialId]);
      return await work(client);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  }

  it("shows an agent only its own requests, not another agent's or another organization's", async () => {
    const orgA = await w.freshOrg();
    const a1 = await w.newAgent(orgA, orgA.dev);
    const a2 = await w.newAgent(orgA, orgA.dev);
    const b1 = await w.newAgent(w.orgB, w.orgB.dev);
    await w.policy(orgA, { effect: "allow", environmentId: orgA.dev });
    await w.policy(w.orgB, { effect: "allow", environmentId: w.orgB.dev });
    const r1 = await w.submit(a1.key);
    const r2 = await w.submit(a2.key);
    const rb = await w.submit(b1.key);
    const ids = [r1, r2, rb].map((o) => (o.kind === "decided" ? o.id : ""));
    const seen = await asAgent(a1.credentialId, async (c) =>
      (await c.query("SELECT id FROM axo.action_requests")).rows.map((r) => r.id as string),
    );
    expect(seen).toEqual([ids[0]]);
    const decisions = await asAgent(a1.credentialId, async (c) =>
      (await c.query("SELECT action_request_id FROM axo.decisions")).rows.map(
        (r) => r.action_request_id as string,
      ),
    );
    expect(decisions).toEqual([ids[0]]);
    // The agent also only sees policies that can apply to it (its scope), never another agent's.
    await w.policy(orgA, { effect: "deny", agentId: a2.agentId });
    const policies = await asAgent(a1.credentialId, async (c) =>
      (await c.query("SELECT agent_id FROM axo.policies")).rows.map(
        (r) => r.agent_id as string | null,
      ),
    );
    expect(policies).not.toContain(a2.agentId);
  });

  it("refuses to let an agent write a request or decision for another agent or organization", async () => {
    const orgA = await w.freshOrg();
    const a1 = await w.newAgent(orgA, orgA.dev);
    const a2 = await w.newAgent(orgA, orgA.dev);
    const b1 = await w.newAgent(w.orgB, w.orgB.dev);
    const insert = (agentId: string, orgId: string, envId: string) => (c: pg.Client) =>
      c.query(
        `INSERT INTO axo.action_requests (organization_id, agent_id, environment_id, action_key, resource, request_key,
           canonical_digest, canonical_parameters, status, originating_credential_id, expires_at)
         VALUES ($1, $2, $3, 'crm.lead.create', 'mockcrm/leads', 'forged-key-0123456789', repeat('a', 64), '{}',
                 'approved', $4, now() + interval '1 minute')`,
        [orgId, agentId, envId, a1.credentialId],
      );
    expect(
      await sqlState(() => asAgent(a1.credentialId, insert(a2.agentId, orgA.id, orgA.dev))),
    ).toBe("42501");
    expect(
      await sqlState(() => asAgent(a1.credentialId, insert(b1.agentId, w.orgB.id, w.orgB.dev))),
    ).toBe("42501");
    expect(
      await sqlState(() => asAgent(a1.credentialId, insert(a1.agentId, w.orgB.id, orgA.dev))),
    ).toBe("42501");
    expect(
      await sqlState(() => asAgent(a1.credentialId, insert(a1.agentId, orgA.id, orgA.dev))),
    ).toBe("ok");
  });

  it("allows an agent to move only its own request from approved to queued_execution, nothing else", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const out = await w.submit(agent.key);
    const id = out.kind === "decided" ? out.id : "";
    // pending_approval -> anything: the row is not visible to the UPDATE policy (status <> approved): zero rows.
    const stuck = await asAgent(
      agent.credentialId,
      async (c) =>
        (
          await c.query(
            "UPDATE axo.action_requests SET status = 'queued_execution' WHERE id = $1",
            [id],
          )
        ).rowCount,
    );
    expect(stuck).toBe(0);
    // Other columns are not updatable at all.
    expect(
      await sqlState(() =>
        asAgent(agent.credentialId, (c) =>
          c.query("UPDATE axo.action_requests SET canonical_parameters = '{}' WHERE id = $1", [id]),
        ),
      ),
    ).toBe("42501");
    // Forcing a status the policy does not allow fails the WITH CHECK, even for an approved row.
    const admin = await w.db.admin();
    await admin.query(
      "ALTER TABLE axo.action_requests DISABLE TRIGGER action_requests_update_guard",
    );
    await admin.query("UPDATE axo.action_requests SET status = 'approved' WHERE id = $1", [id]);
    await admin.query(
      "ALTER TABLE axo.action_requests ENABLE TRIGGER action_requests_update_guard",
    );
    const attempt = (status: string) =>
      sqlState(() =>
        asAgent(agent.credentialId, (c) =>
          c.query("UPDATE axo.action_requests SET status = $2 WHERE id = $1", [id, status]),
        ),
      );
    // Not on the state machine at all: the transition guard refuses them (a check violation).
    expect(await attempt("running")).toBe("23514");
    expect(await attempt("succeeded")).toBe("23514");
    // Legal on the state machine, but not something an agent may do: row-level security refuses them.
    expect(await attempt("denied")).toBe("42501");
    expect(await attempt("expired")).toBe("42501");
    // The one thing it may do.
    expect(await attempt("queued_execution")).toBe("ok");
  });

  it("denies an agent the audit log, the credentials, every delete and every management function", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    const attempts = [
      "SELECT * FROM axo.audit_events",
      "SELECT * FROM axo.agent_credentials",
      "SELECT * FROM axo.agents",
      "SELECT * FROM axo.memberships",
      "SELECT * FROM axo.users",
      "DELETE FROM axo.action_requests",
      "TRUNCATE axo.decisions",
      "UPDATE axo.policies SET action_key = action_key",
      `SELECT axo.enter_management_context('${w.orgA.owner}', '${w.orgA.id}')`,
      "SELECT * FROM axo.request_status_transitions",
    ];
    for (const sql of attempts) {
      expect(await sqlState(() => asAgent(agent.credentialId, (c) => c.query(sql))), sql).toBe(
        "42501",
      );
    }
  });

  it("gives management nothing until a context is entered, and only an active member can enter one", async () => {
    const client = await connect(w.db.urls.management);
    try {
      expect((await client.query("SELECT count(*)::int AS n FROM axo.agents")).rows[0].n).toBe(0);
      const enter = (user: string, org: string) =>
        sqlState(async () => {
          await client.query("BEGIN");
          try {
            await client.query("SELECT axo.enter_management_context($1::uuid, $2::uuid)", [
              user,
              org,
            ]);
          } finally {
            await client.query("ROLLBACK");
          }
        });
      expect(await enter(w.orgA.viewer, w.orgA.id)).toBe("ok");
      expect(await enter(w.orgA.owner, w.orgB.id)).toBe("42501");
      expect(await enter(w.outsider, w.orgA.id)).toBe("42501");
      expect(await enter("00000000-0000-0000-0000-000000000000", w.orgA.id)).toBe("42501");
      const admin = await w.db.admin();
      await admin.query(
        "UPDATE axo.memberships SET status = 'removed' WHERE organization_id = $1 AND user_id = $2",
        [w.orgA.id, w.orgA.viewer],
      );
      expect(await enter(w.orgA.viewer, w.orgA.id)).toBe("42501");
      await admin.query(
        "UPDATE axo.memberships SET status = 'active' WHERE organization_id = $1 AND user_id = $2",
        [w.orgA.id, w.orgA.viewer],
      );
    } finally {
      await client.end();
    }
  });

  it("hides credential digests from management, even from owners", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.manage(w.orgA.owner, w.orgA, async ({ tx }) => {
      const ok = await tx.query(
        "SELECT id, key_id, revoked_at FROM axo.agent_credentials WHERE id = $1",
        [agent.credentialId],
      );
      expect(ok.rowCount).toBe(1);
      await tx.query("SAVEPOINT s");
      expect(await sqlState(() => tx.query("SELECT secret_hash FROM axo.agent_credentials"))).toBe(
        "42501",
      );
      await tx.query("ROLLBACK TO SAVEPOINT s");
      expect(await sqlState(() => tx.query("SELECT * FROM axo.agent_credentials"))).toBe("42501");
    });
  });

  it("leaks no tenant context to the next user of a pooled connection", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    // One physical connection, reused: the second transaction must start with no tenant at all.
    const single = new pg.Pool({ connectionString: w.db.urls.agentApi, max: 1 });
    try {
      const { inTransaction } = await import("../src/db/pool");
      await inTransaction(single, async (tx) => {
        await tx.query("SELECT * FROM axo.enter_agent_context($1::uuid, true)", [
          agent.credentialId,
        ]);
        const inside = await tx.query(
          "SELECT axo.current_org() AS org, axo.current_agent() AS agent",
        );
        expect(inside.rows[0].org).toBe(w.orgA.id);
      });
      await inTransaction(single, async (tx) => {
        const after = await tx.query(
          "SELECT axo.current_org() AS org, axo.current_agent() AS agent, axo.current_env() AS env, axo.current_user_id() AS usr",
        );
        expect(after.rows[0]).toEqual({ org: null, agent: null, env: null, usr: null });
        const seen = await tx.query("SELECT count(*)::int AS n FROM axo.action_requests");
        expect(seen.rows[0].n).toBe(0);
      });
    } finally {
      await single.end();
    }
  });

  it("KNOWN LIMITATION: a compromised agent-api process could choose its own tenant context", async () => {
    // Row-level security reads transaction settings. The service sets them only through axo.enter_agent_context,
    // but a role cannot be stopped from calling set_config itself. RLS therefore protects against application BUGS
    // (a missing WHERE clause, a mistaken id), not against an attacker who runs arbitrary SQL as axo_agent_api.
    // Limiting the blast radius there is a deployment concern (network isolation, credential custody).
    const orgA = await w.freshOrg();
    const a = await w.newAgent(orgA, orgA.dev);
    const b = await w.newAgent(w.orgB, w.orgB.dev);
    await w.policy(w.orgB, { effect: "allow", agentId: b.agentId });
    await w.submit(b.key);
    const client = await connect(w.db.urls.agentApi);
    try {
      await client.query("BEGIN");
      await client.query("SELECT * FROM axo.enter_agent_context($1::uuid, false)", [
        a.credentialId,
      ]);
      await client.query(
        "SELECT set_config('app.organization_id', $1, true), set_config('app.agent_id', $2, true)",
        [w.orgB.id, b.agentId],
      );
      const stolen = await client.query("SELECT count(*)::int AS n FROM axo.action_requests");
      expect(stolen.rows[0].n).toBeGreaterThan(0);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});

describe("composite foreign keys keep tenants apart even for the table owner", () => {
  it("rejects a cross-organization reference of every kind", async () => {
    const orgA = await w.freshOrg();
    const admin = await w.db.admin();
    const agentA = await w.newAgent(orgA, orgA.dev);
    const agentB = await w.newAgent(w.orgB, w.orgB.dev);
    const insertAgent = (org: string, env: string, owner: string) =>
      admin.query(
        "INSERT INTO axo.agents (organization_id, environment_id, owner_user_id, name, created_by_user_id) VALUES ($1, $2, $3, 'x', $3)",
        [org, env, owner],
      );
    // An agent in A pointing at B's environment, or owned by a member of B.
    expect(await sqlState(() => insertAgent(orgA.id, w.orgB.dev, orgA.owner))).toBe("23503");
    expect(await sqlState(() => insertAgent(orgA.id, orgA.dev, w.orgB.owner))).toBe("23503");
    // A credential in A pointing at B's agent.
    expect(
      await sqlState(() =>
        admin.query(
          "INSERT INTO axo.agent_credentials (organization_id, agent_id, key_id, secret_hash, created_by_user_id) VALUES ($1, $2, repeat('a', 24), decode(repeat('00', 32), 'hex'), $3)",
          [orgA.id, agentB.agentId, orgA.owner],
        ),
      ),
    ).toBe("23503");
    // A policy in A scoped to B's agent or B's environment, or to an agent in a different environment of A.
    const policyInsert = (env: string | null, agent: string | null) =>
      admin.query(
        "INSERT INTO axo.policies (organization_id, action_key, environment_id, agent_id, created_by_user_id) VALUES ($1, 'crm.lead.create', $2, $3, $4)",
        [orgA.id, env, agent, orgA.owner],
      );
    expect(await sqlState(() => policyInsert(null, agentB.agentId))).toBe("23503");
    expect(await sqlState(() => policyInsert(w.orgB.dev, null))).toBe("23503");
    expect(await sqlState(() => policyInsert(orgA.prod, agentA.agentId))).toBe("23503");
    expect(await sqlState(() => policyInsert(orgA.dev, agentA.agentId))).toBe("ok");
    // A request whose agent and environment disagree.
    expect(
      await sqlState(() =>
        admin.query(
          `INSERT INTO axo.action_requests (organization_id, agent_id, environment_id, action_key, resource, request_key,
             canonical_digest, canonical_parameters, status, originating_credential_id, expires_at)
           VALUES ($1, $2, $3, 'crm.lead.create', 'mockcrm/leads', 'mismatch-key-0123456789', repeat('a', 64), '{}',
                   'denied', $4, now() + interval '1 minute')`,
          [orgA.id, agentA.agentId, orgA.prod, agentA.credentialId],
        ),
      ),
    ).toBe("23503");
  });
});

describe("append-only and state-machine guards hold even for the owner", () => {
  async function owned<T>(work: (c: pg.Client) => Promise<T>): Promise<T> {
    const client = await connect(w.db.urls.migrator);
    try {
      return await work(client);
    } finally {
      await client.end();
    }
  }

  it("refuses UPDATE, DELETE and TRUNCATE on decisions, policy versions, policies and the audit log", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    await w.submit(agent.key);
    for (const sql of [
      "UPDATE axo.decisions SET reason_code = NULL",
      "DELETE FROM axo.decisions",
      "TRUNCATE axo.decisions",
      "UPDATE axo.policy_versions SET enabled = false",
      "DELETE FROM axo.policy_versions",
      "TRUNCATE axo.policy_versions CASCADE",
      "UPDATE axo.policies SET action_key = action_key",
      "DELETE FROM axo.policies",
      "UPDATE axo.audit_events SET event_type = 'x.y'",
      "DELETE FROM axo.audit_events",
      "TRUNCATE axo.audit_events",
      "DELETE FROM axo.action_requests",
      "TRUNCATE axo.action_requests CASCADE",
    ]) {
      expect(await sqlState(() => owned((c) => c.query(sql))), sql).toBe("42501");
    }
  });

  it("allows an action request to change status only along the state machine, and nothing else about it to change", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    const out = await w.submit(agent.key, leadBody());
    const id = out.kind === "decided" ? out.id : "";
    expect(out.kind === "decided" && out.status).toBe("denied");
    // denied is terminal.
    for (const next of [
      "queued_execution",
      "approved",
      "pending_approval",
      "running",
      "succeeded",
    ]) {
      expect(
        await sqlState(() =>
          owned((c) =>
            c.query("UPDATE axo.action_requests SET status = $2 WHERE id = $1", [id, next]),
          ),
        ),
        next,
      ).toBe("23514");
    }
    for (const sql of [
      "UPDATE axo.action_requests SET canonical_digest = repeat('b', 64) WHERE id = $1",
      'UPDATE axo.action_requests SET canonical_parameters = \'{"x":"y"}\' WHERE id = $1',
      "UPDATE axo.action_requests SET agent_id = gen_random_uuid() WHERE id = $1",
      "UPDATE axo.action_requests SET resource = 'other' WHERE id = $1",
      "UPDATE axo.action_requests SET expires_at = now() + interval '1 year' WHERE id = $1",
    ]) {
      expect(await sqlState(() => owned((c) => c.query(sql, [id]))), sql).toBe("42501");
    }
  });

  it("does not let a request be created straight into an executing or finished state", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    const admin = await w.db.admin();
    for (const status of [
      "queued_execution",
      "running",
      "succeeded",
      "failed",
      "unknown",
      "expired",
    ]) {
      const state = await sqlState(() =>
        admin.query(
          `INSERT INTO axo.action_requests (organization_id, agent_id, environment_id, action_key, resource, request_key,
             canonical_digest, canonical_parameters, status, originating_credential_id, expires_at)
           VALUES ($1, $2, $3, 'crm.lead.create', 'mockcrm/leads', $4, repeat('a', 64), '{}', $5, $6, now() + interval '1 minute')`,
          [
            w.orgA.id,
            agent.agentId,
            w.orgA.dev,
            `direct-${status}-0123456789`,
            status,
            agent.credentialId,
          ],
        ),
      );
      expect(state, status).toBe("23514");
    }
  });

  it("makes agent revocation final and credential revocation permanent", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.manage(w.orgA.admin, w.orgA, async (context) => {
      const { revokeAgent } = await import("../src/management");
      await revokeAgent(context, { agentId: agent.agentId });
    });
    expect(
      await sqlState(() =>
        owned((c) =>
          c.query("UPDATE axo.agents SET status = 'active', revoked_at = NULL WHERE id = $1", [
            agent.agentId,
          ]),
        ),
      ),
    ).toBe("23514");
    expect(
      await sqlState(() =>
        owned((c) =>
          c.query(
            "UPDATE axo.agent_credentials SET revoked_at = NULL, revoked_reason = NULL WHERE id = $1",
            [agent.credentialId],
          ),
        ),
      ),
    ).toBe("23514");
    expect(
      await sqlState(() =>
        owned((c) =>
          c.query(
            "UPDATE axo.agent_credentials SET secret_hash = decode(repeat('11', 32), 'hex') WHERE id = $1",
            [agent.credentialId],
          ),
        ),
      ),
    ).toBe("42501");
  });

  it("never lowers an environment's policy epoch", async () => {
    expect(
      await sqlState(() =>
        owned((c) =>
          c.query(
            "UPDATE axo.environments SET policy_epoch = policy_epoch - 1 WHERE organization_id = $1",
            [w.orgA.id],
          ),
        ),
      ),
    ).toBe("23514");
  });
});
