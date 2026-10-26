import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, type World } from "./support/world";

/**
 * The exact privileges of every runtime role, asserted against the live database catalog. If a migration grants
 * anything more (or less), these tests fail and the change has to be argued for explicitly.
 */

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w.close();
});

const roles = ["axo_agent_api", "axo_management", "axo_executor"] as const;

describe("S20 table privileges are exactly these", () => {
  const expected: Record<string, Record<string, string[]>> = {
    axo_agent_api: {
      action_definitions: ["SELECT"],
      action_requests: ["INSERT"], // reading is column-level: the ciphertext is excluded
      approval_requests: ["INSERT"],
      decisions: ["INSERT", "SELECT"],
      audit_events: ["INSERT"],
      policies: ["SELECT"],
      policy_versions: ["SELECT"],
    },
    axo_management: {
      action_definitions: ["SELECT"],
      agent_credentials: ["INSERT"],
      agents: ["INSERT", "SELECT"],
      approval_requests: ["SELECT"],
      audit_events: ["INSERT", "SELECT"],
      decisions: ["SELECT"],
      environments: ["SELECT"],
      execution_attempts: ["SELECT"],
      memberships: ["SELECT"],
      organizations: ["SELECT"],
      policies: ["INSERT", "SELECT"],
      policy_versions: ["INSERT", "SELECT"],
    },
    // The executor has no write privilege anywhere; it reads policies and otherwise only calls functions.
    axo_executor: {
      action_definitions: ["SELECT"],
      policies: ["SELECT"],
      policy_versions: ["SELECT"],
    },
  };

  it("hold for every table, for every role, and nothing else is granted", async () => {
    const admin = await w.db.admin();
    const tables = await admin.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'axo' AND table_type = 'BASE TABLE'",
    );
    expect(tables.rows.length).toBeGreaterThanOrEqual(20);
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

  it("no role can touch sessions, login transactions, invitations' digests, approvals' decisions or grants directly", async () => {
    const admin = await w.db.admin();
    for (const role of roles) {
      for (const [table, privilege] of [
        ["sessions", "SELECT"],
        ["sessions", "UPDATE"],
        ["oidc_transactions", "SELECT"],
        ["rate_limit_counters", "SELECT"],
        ["approval_requests", "UPDATE"],
        ["execution_grants", "UPDATE"],
        ["execution_grants", "INSERT"],
        ["execution_attempts", "INSERT"],
        ["execution_attempts", "UPDATE"],
        ["users", "SELECT"],
        ["users", "UPDATE"],
        ["memberships", "INSERT"],
        ["memberships", "UPDATE"],
        ["organizations", "INSERT"],
      ] as const) {
        const r = await admin.query("SELECT has_table_privilege($1, $2, $3) AS ok", [
          role,
          `axo.${table}`,
          privilege,
        ]);
        expect(r.rows[0].ok, `${role} ${privilege} ${table}`).toBe(false);
      }
    }
  });
});

describe("S20 column privileges are exactly these", () => {
  it("allow updates to nothing but these columns", async () => {
    const admin = await w.db.admin();
    const columns = await admin.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'axo'",
    );
    const updatable: Record<string, string[]> = {
      axo_agent_api: [],
      axo_management: [],
      axo_executor: [],
    };
    for (const role of roles) {
      for (const { table_name: t, column_name: c } of columns.rows) {
        const up = await admin.query("SELECT has_column_privilege($1, $2, $3, 'UPDATE') AS ok", [
          role,
          `axo.${t}`,
          c,
        ]);
        if (up.rows[0].ok) updatable[role]?.push(`${t}.${c}`);
      }
    }
    expect(updatable.axo_agent_api).toEqual(["action_requests.status"]);
    expect(updatable.axo_management?.sort()).toEqual(
      [
        "agent_credentials.revoked_at",
        "agent_credentials.revoked_reason",
        "agents.revoked_at",
        "agents.status",
        "agents.suspended_at",
        "environments.enforcement_state",
        "environments.policy_epoch",
      ].sort(),
    );
    expect(updatable.axo_executor).toEqual([]);
  });

  it("keep secrets and personal data out of every role's reach", async () => {
    const admin = await w.db.admin();
    const cannotRead: Array<[string, string]> = [
      ["agent_credentials", "secret_hash"],
      ["action_requests", "parameters_ciphertext"],
      ["action_requests", "parameters_key_id"],
      ["invitations", "token_hash"],
      ["sessions", "token_hash"],
      ["sessions", "csrf_hash"],
      ["oidc_transactions", "code_verifier_ciphertext"],
      ["users", "email"],
    ];
    for (const role of roles) {
      for (const [table, column] of cannotRead) {
        const r = await admin.query("SELECT has_column_privilege($1, $2, $3, 'SELECT') AS ok", [
          role,
          `axo.${table}`,
          column,
        ]);
        expect(r.rows[0].ok, `${role} reads ${table}.${column}`).toBe(false);
      }
    }
  });

  it("let the agent API read only these request columns, and management the same plus nothing secret", async () => {
    const admin = await w.db.admin();
    const readable = async (role: string) => {
      const cols = await admin.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'axo' AND table_name = 'action_requests'",
      );
      const out: string[] = [];
      for (const { column_name: c } of cols.rows) {
        const r = await admin.query(
          "SELECT has_column_privilege($1, 'axo.action_requests', $2, 'SELECT') AS ok",
          [role, c],
        );
        if (r.rows[0].ok) out.push(c as string);
      }
      return out.sort();
    };
    const expected = [
      "action_key",
      "agent_id",
      "canonical_digest",
      "created_at",
      "environment_id",
      "expires_at",
      "id",
      "organization_id",
      "originating_credential_id",
      "parameters_purged_at",
      "request_key",
      "resource",
      "status",
      "updated_at",
    ].sort();
    expect(await readable("axo_agent_api")).toEqual(expected);
    expect(await readable("axo_management")).toEqual(expected);
    expect(await readable("axo_executor")).toEqual([]);
  });
});

describe("S20 function privileges are exactly these", () => {
  const all = ["axo_agent_api", "axo_management", "axo_executor"];
  const expected: Record<string, string[]> = {
    current_agent: all,
    current_env: all,
    current_org: all,
    current_user_id: all,
    has_role: ["axo_agent_api", "axo_management"],
    step_up_ok: ["axo_agent_api", "axo_management"],
    rate_limit_hit: ["axo_agent_api", "axo_management"],
    rate_limit_peek: ["axo_agent_api", "axo_management"],
    lookup_credential: ["axo_agent_api"],
    enter_agent_context: ["axo_agent_api"],
    // The human-facing role.
    login_user: ["axo_management"],
    create_session: ["axo_management"],
    revoke_session: ["axo_management"],
    enter_session: ["axo_management"],
    enter_org: ["axo_management"],
    start_login: ["axo_management"],
    finish_login: ["axo_management"],
    whoami: ["axo_management"],
    create_organization: ["axo_management"],
    change_member_role: ["axo_management"],
    remove_member: ["axo_management"],
    list_members: ["axo_management"],
    create_invitation: ["axo_management"],
    revoke_invitation: ["axo_management"],
    accept_invitation: ["axo_management"],
    decide_approval: ["axo_management"],
    review_approval: ["axo_management"],
    withdraw_requests: ["axo_management"],
    // The trusted executor.
    claim_lock_next: ["axo_executor"],
    claim_finish: ["axo_executor"],
    record_execution_result: ["axo_executor"],
    sweep_stuck_attempts: ["axo_executor"],
    expire_stale: ["axo_executor"],
    purge_parameters: ["axo_executor"],
    cleanup_expired: ["axo_executor"],
  };

  it("hold for every function; PUBLIC can execute none; internal helpers and triggers are callable by nobody", async () => {
    const admin = await w.db.admin();
    const fns = await admin.query(
      `SELECT p.proname, p.oid FROM pg_proc p WHERE p.pronamespace = 'axo'::regnamespace`,
    );
    expect(fns.rows.length).toBeGreaterThan(40);
    for (const f of fns.rows) {
      const holders: string[] = [];
      for (const role of roles) {
        const r = await admin.query("SELECT has_function_privilege($1, $2::oid, 'EXECUTE') AS ok", [
          role,
          f.oid,
        ]);
        if (r.rows[0].ok) holders.push(role);
      }
      const publicExec = await admin.query(
        "SELECT count(*)::int AS n FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = $1 AND a.grantee = 0",
        [f.oid],
      );
      expect(publicExec.rows[0].n, `PUBLIC execute on ${f.proname}`).toBe(0);
      expect(holders.sort(), f.proname as string).toEqual(
        (expected[f.proname as string] ?? []).sort(),
      );
    }
  });

  it("every function that is granted to a role exists (no stale entries in this list)", async () => {
    const admin = await w.db.admin();
    const names = await admin.query(
      "SELECT DISTINCT proname FROM pg_proc WHERE pronamespace = 'axo'::regnamespace",
    );
    const present = new Set(names.rows.map((r) => r.proname as string));
    for (const name of Object.keys(expected)) expect(present.has(name), name).toBe(true);
  });

  it("the M01 entry point that trusted a caller-supplied user id no longer exists", async () => {
    const admin = await w.db.admin();
    const gone = await admin.query(
      "SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'enter_management_context'",
    );
    expect(gone.rows[0].n).toBe(0);
  });
});

describe("S02 row-level security covers every table", () => {
  it("is enabled on every table that holds tenant, identity or session data", async () => {
    const admin = await w.db.admin();
    const rows = await admin.query(
      `SELECT c.relname, c.relrowsecurity,
              EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'axo'
                       AND k.table_name = c.relname AND k.column_name = 'organization_id') AS tenant
         FROM pg_class c WHERE c.relnamespace = 'axo'::regnamespace AND c.relkind = 'r'`,
    );
    const withoutOrg = rows.rows
      .filter((r) => !r.tenant)
      .map((r) => r.relname as string)
      .sort();
    // Each table without an organization_id is listed on purpose: global, structural, or identity/session data.
    expect(withoutOrg).toEqual(
      [
        "action_definitions",
        "oidc_transactions",
        "organizations",
        "rate_limit_counters",
        "request_status_transitions",
        "schema_migrations",
        "sessions",
        "users",
      ].sort(),
    );
    const exempt = new Set([
      "action_definitions",
      "request_status_transitions",
      "schema_migrations",
    ]);
    for (const r of rows.rows) {
      if (!exempt.has(r.relname as string))
        expect(r.relrowsecurity, r.relname as string).toBe(true);
    }
  });
});
