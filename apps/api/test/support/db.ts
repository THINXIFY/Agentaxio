import { randomBytes } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";
import { migrate } from "../../src/db/migrate";
import { createPool } from "../../src/db/pool";

export interface TestDatabase {
  name: string;
  /** Connection strings per role, each pointing at this test's own database. */
  urls: { admin: string; migrator: string; agentApi: string; management: string };
  /** A superuser connection for fixtures and for tampering the tests need; never used by the code under test. */
  admin(): Promise<pg.Client>;
  /** Owner-role pool for provisioning. */
  migratorPool(): pg.Pool;
  agentPool(): pg.Pool;
  managementPool(): pg.Pool;
  drop(): Promise<void>;
}

function withDatabase(
  connectionString: string,
  database: string,
  user?: string,
  password?: string,
): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  if (user !== undefined) url.username = user;
  if (password !== undefined) url.password = password;
  return url.toString();
}

/**
 * A fresh database on the shared real-PostgreSQL cluster, owned by axo_migrator and migrated from scratch exactly
 * the way an operator would do it. Each test file gets its own, so files run in parallel without interference.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const cluster = inject("axoCluster");
  const name = `axo_t_${randomBytes(6).toString("hex")}`;
  const adminUrl = withDatabase(cluster.adminUrl, name);
  const urls = {
    admin: adminUrl,
    migrator: withDatabase(cluster.adminUrl, name, "axo_migrator", cluster.roles.migrator),
    agentApi: withDatabase(cluster.adminUrl, name, "axo_agent_api", cluster.roles.agentApi),
    management: withDatabase(cluster.adminUrl, name, "axo_management", cluster.roles.management),
  };

  const setup = new pg.Client({ connectionString: cluster.adminUrl });
  await setup.connect();
  try {
    await setup.query(`CREATE DATABASE ${name} OWNER axo_migrator`);
    await setup.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    await setup.query(
      `GRANT CONNECT ON DATABASE ${name} TO axo_agent_api, axo_management, axo_migrator`,
    );
  } finally {
    await setup.end();
  }

  const migrator = new pg.Client({ connectionString: urls.migrator });
  await migrator.connect();
  try {
    await migrate(migrator);
  } finally {
    await migrator.end();
  }

  const pools: pg.Pool[] = [];
  const clients: pg.Client[] = [];
  const makePool = (url: string, app: string) => {
    const pool = createPool(url, app);
    pools.push(pool);
    return pool;
  };

  return {
    name,
    urls,
    async admin() {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      clients.push(client);
      return client;
    },
    migratorPool: () => makePool(urls.migrator, "test-migrator"),
    agentPool: () => makePool(urls.agentApi, "test-agent-api"),
    managementPool: () => makePool(urls.management, "test-management"),
    async drop() {
      for (const pool of pools) await pool.end().catch(() => undefined);
      for (const client of clients) await client.end().catch(() => undefined);
      const cleanup = new pg.Client({ connectionString: cluster.adminUrl });
      await cleanup.connect();
      try {
        await cleanup.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [name],
        );
        await cleanup.query(`DROP DATABASE IF EXISTS ${name}`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
