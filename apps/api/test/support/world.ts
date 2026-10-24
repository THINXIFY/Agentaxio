import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  provisionEnvironment,
  provisionMembership,
  provisionOrganization,
  provisionUser,
} from "../../src/db/provision";
import {
  issueCredential,
  registerAgent,
  withManagement,
  createPolicy,
  type ManagementActor,
  type PolicyBody,
} from "../../src/management";
import { submitActionRequest, type SubmitOutcome } from "../../src/authorization/submit";
import { createTestDatabase, type TestDatabase } from "./db";

/** Only invented organizations, people and addresses (.test is a reserved TLD). */
export interface TestOrg {
  id: string;
  slug: string;
  dev: string;
  prod: string;
  owner: string;
  admin: string;
  approver: string;
  viewer: string;
}

export interface World {
  db: TestDatabase;
  pepper: Buffer;
  agentPool: pg.Pool;
  managementPool: pg.Pool;
  migratorPool: pg.Pool;
  orgA: TestOrg;
  orgB: TestOrg;
  /** A real user with no membership anywhere. */
  outsider: string;
  actor(user: string, org: TestOrg): ManagementActor;
  /** Run management work as `user` in `org`. */
  manage<T>(user: string, org: TestOrg, work: Parameters<typeof withManagement<T>>[2]): Promise<T>;
  /** Register an agent in `env` (owned by the org's approver-free owner) and issue it one credential. */
  newAgent(
    org: TestOrg,
    env: string,
    name?: string,
  ): Promise<{ agentId: string; credentialId: string; key: string; keyId: string }>;
  policy(
    org: TestOrg,
    body: Omit<PolicyBody, "conditions"> & {
      conditions?: unknown;
      actionKey?: string;
      environmentId?: string;
      agentId?: string;
    },
  ): Promise<{ policyId: string; versionId: string }>;
  submit(key: string, body?: unknown, idempotencyKey?: string): Promise<SubmitOutcome>;
  /** A brand-new organization (with its own people), so org-wide policies in one test cannot leak into another. */
  freshOrg(): Promise<TestOrg>;
  close(): Promise<void>;
}

export const leadBody = (over: Record<string, unknown> = {}) => ({
  action: "crm.lead.create",
  resource: "mockcrm/leads",
  parameters: {
    full_name: "Ada Example",
    email: "ada@example.test",
    company: "Sample Co",
    ...over,
  },
});

export const idem = () => `test-${randomUUID()}`;

async function makeOrg(migrator: pg.Pool, slug: string): Promise<TestOrg> {
  const id = await provisionOrganization(migrator, { name: `Invented ${slug}`, slug });
  const dev = await provisionEnvironment(migrator, { organizationId: id, name: "dev" });
  const prod = await provisionEnvironment(migrator, { organizationId: id, name: "prod" });
  const roles = ["owner", "admin", "approver", "viewer"] as const;
  const users: Record<string, string> = {};
  for (const role of roles) {
    const userId = await provisionUser(migrator, {
      issuer: "https://idp.invalid",
      subject: `${slug}-${role}`,
      email: `${role}@${slug}.test`,
    });
    await provisionMembership(migrator, { organizationId: id, userId, role });
    users[role] = userId;
  }
  return {
    id,
    slug,
    dev,
    prod,
    owner: users.owner ?? "",
    admin: users.admin ?? "",
    approver: users.approver ?? "",
    viewer: users.viewer ?? "",
  };
}

export async function createWorld(): Promise<World> {
  const db = await createTestDatabase();
  const pepper = randomBytes(32);
  const agentPool = db.agentPool();
  const managementPool = db.managementPool();
  const migratorPool = db.migratorPool();
  const suffix = randomBytes(3).toString("hex");
  const orgA = await makeOrg(migratorPool, `acme-${suffix}`);
  const orgB = await makeOrg(migratorPool, `birch-${suffix}`);
  const outsider = await provisionUser(migratorPool, {
    issuer: "https://idp.invalid",
    subject: `outsider-${suffix}`,
  });

  const actor = (user: string, org: TestOrg): ManagementActor => ({
    userId: user,
    organizationId: org.id,
  });
  const manage: World["manage"] = (user, org, work) =>
    withManagement(managementPool, actor(user, org), work);

  return {
    db,
    pepper,
    agentPool,
    managementPool,
    migratorPool,
    orgA,
    orgB,
    outsider,
    actor,
    manage,
    async newAgent(org, env, name = `agent-${randomBytes(3).toString("hex")}`) {
      return manage(org.admin, org, async (context) => {
        const { agentId } = await registerAgent(context, {
          environmentId: env,
          ownerUserId: org.owner,
          name,
        });
        const issued = await issueCredential(context, pepper, { agentId });
        return {
          agentId,
          credentialId: issued.credentialId,
          key: issued.fullKey,
          keyId: issued.keyId,
        };
      });
    },
    async policy(org, body) {
      return manage(org.admin, org, (context) =>
        createPolicy(context, { actionKey: "crm.lead.create", conditions: { all: [] }, ...body }),
      );
    },
    submit(key, body = leadBody(), idempotencyKey = idem()) {
      return submitActionRequest(agentPool, pepper, {
        authorization: `Bearer ${key}`,
        idempotencyKey,
        body,
        traceId: randomUUID(),
      });
    },
    freshOrg: () => makeOrg(migratorPool, `fresh-${randomBytes(4).toString("hex")}`),
    async close() {
      await db.drop();
    },
  };
}
