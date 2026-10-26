import { pathToFileURL } from "node:url";
import pg from "pg";
import { createPool } from "../db/pool";
import {
  provisionEnvironment,
  provisionMembership,
  provisionOrganization,
  provisionSession,
  provisionUser,
} from "../db/provision";
import { createPolicy, issueCredential, registerAgent, withManagement } from "../management";
import { parsePepper } from "../config";

/**
 * Local demo data: ONE invented organization, four invented people, one mock agent and one policy. Nothing real.
 *
 *   organization  "Demo Organization (invented)"   slug demo-org
 *   people        owner / admin / approver / viewer @demo-org.test
 *   agent         "Lead Intake Agent (mock)" in the dev environment
 *   policy        crm.lead.create REQUIRES APPROVAL for that agent
 *
 * The agent's credential is printed ONCE and cannot be shown again. Running the seed again changes nothing.
 * Refuses to run against anything but a development database.
 */

export interface SeedResult {
  alreadySeeded: boolean;
  organizationId: string;
  /** Present only on the run that created it. */
  agentKey?: string;
  adminUserId?: string;
}

export async function seedDemo(
  migratorUrl: string,
  managementUrl: string,
  pepper: Buffer,
  options: { databaseName?: RegExp } = {},
): Promise<SeedResult> {
  const owner = new pg.Client({ connectionString: migratorUrl });
  await owner.connect();
  let organizationId: string;
  let userIds: Record<string, string>;
  let devEnvironment: string;
  let adminSession: string;
  try {
    const database =
      (await owner.query<{ db: string }>("SELECT current_database() AS db")).rows[0]?.db ?? "";
    if (!(options.databaseName ?? /_dev$/).test(database)) {
      throw new Error("the seed only runs against a development database (name ending in _dev)");
    }
    const existing = await owner.query<{ id: string }>(
      "SELECT id FROM axo.organizations WHERE slug = 'demo-org'",
    );
    if (existing.rows[0] !== undefined)
      return { alreadySeeded: true, organizationId: existing.rows[0].id };

    await owner.query("BEGIN");
    organizationId = await provisionOrganization(owner, {
      name: "Demo Organization (invented)",
      slug: "demo-org",
    });
    devEnvironment = await provisionEnvironment(owner, { organizationId, name: "dev" });
    await provisionEnvironment(owner, { organizationId, name: "prod" });
    userIds = {};
    for (const role of ["owner", "admin", "approver", "viewer"] as const) {
      const userId = await provisionUser(owner, {
        issuer: "https://seed.invalid",
        subject: `demo-${role}`,
        email: `${role}@demo-org.test`,
      });
      await provisionMembership(owner, { organizationId, userId, role });
      userIds[role] = userId;
    }
    // A short-lived local session for the demo administrator, opened directly by the schema owner (there is no identity
    // provider in this script). It exists only so the management operations below run exactly as a signed-in person's would.
    adminSession = (await provisionSession(owner, { userId: userIds.admin ?? "" })).sessionToken;
    await owner.query("COMMIT");
  } catch (error) {
    await owner.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await owner.end();
  }

  const adminId = userIds.admin ?? "";
  const pool = createPool(managementUrl, "seed");
  try {
    const key = await withManagement(
      pool,
      { sessionToken: adminSession, organizationId },
      async (context) => {
        const { agentId } = await registerAgent(context, {
          environmentId: devEnvironment,
          ownerUserId: userIds.owner ?? "",
          name: "Lead Intake Agent (mock)",
          description:
            "Invented agent for local demonstrations. It does not exist outside this database.",
        });
        await createPolicy(context, {
          actionKey: "crm.lead.create",
          agentId,
          effect: "require_approval",
          conditions: { all: [] },
        });
        return (await issueCredential(context, pepper, { agentId })).fullKey;
      },
    );
    return { alreadySeeded: false, organizationId, agentKey: key, adminUserId: adminId };
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const migrator = process.env.AXO_MIGRATOR_DATABASE_URL;
  const management = process.env.AXO_MANAGEMENT_DATABASE_URL;
  if (migrator === undefined || management === undefined) {
    throw new Error(
      "AXO_MIGRATOR_DATABASE_URL and AXO_MANAGEMENT_DATABASE_URL must be set (run db:setup first)",
    );
  }
  const result = await seedDemo(
    migrator,
    management,
    parsePepper(process.env.AXO_CREDENTIAL_PEPPER),
  );
  if (result.alreadySeeded || result.agentKey === undefined) {
    process.stdout.write(
      "Demo data already exists; nothing changed. (An agent key cannot be shown a second time.)\n",
    );
    return;
  }
  process.stdout.write(
    [
      "Demo data created (invented organization, people and agent).",
      "",
      "Agent key for 'Lead Intake Agent (mock)': shown ONCE, copy it now:",
      `  ${result.agentKey}`,
      "",
      "Try it (policy for this agent: crm.lead.create requires approval):",
      "  curl -s -X POST http://127.0.0.1:8787/v1/action-requests \\",
      "    -H 'Authorization: Bearer <the key above>' -H 'Content-Type: application/json' \\",
      "    -H \"Idempotency-Key: $(node -e 'console.log(crypto.randomUUID())')\" \\",
      '    -d \'{"action":"crm.lead.create","resource":"mockcrm/leads","parameters":{"full_name":"Ada Example","email":"ada@example.test","company":"Sample Co"}}\'',
      "",
    ].join("\n"),
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `db:seed failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}
