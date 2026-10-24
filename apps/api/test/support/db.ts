import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { inject } from "vitest";
import { migrate } from "../../src/db/migrate";
import { createPool } from "../../src/db/pool";

export interface TestDatabase {
  name: string;
  /** Connection strings per role, each pointing at this test's own database. */
  urls: { admin: string; migrator: string; agentApi: string; management: string; executor: string };
  /** A superuser connection for fixtures and for tampering the tests need; never used by the code under test. */
  admin(): Promise<pg.Client>;
  /** Owner-role pool for provisioning. */
  migratorPool(): pg.Pool;
  agentPool(): pg.Pool;
  managementPool(): pg.Pool;
  executorPool(): pg.Pool;
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
export async function createTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const cluster = inject("axoCluster");
  const name = `axo_t_${randomBytes(6).toString("hex")}`;
  const adminUrl = withDatabase(cluster.adminUrl, name);
  const urls = {
    admin: adminUrl,
    migrator: withDatabase(cluster.adminUrl, name, "axo_migrator", cluster.roles.migrator),
    agentApi: withDatabase(cluster.adminUrl, name, "axo_agent_api", cluster.roles.agentApi),
    management: withDatabase(cluster.adminUrl, name, "axo_management", cluster.roles.management),
    executor: withDatabase(cluster.adminUrl, name, "axo_executor", cluster.roles.executor),
  };

  const setup = new pg.Client({ connectionString: cluster.adminUrl });
  await setup.connect();
  try {
    await setup.query(`CREATE DATABASE ${name} OWNER axo_migrator`);
  } finally {
    await setup.end();
  }
  // The same hardening step an operator runs once per database, before the migrations.
  const harden = new pg.Client({ connectionString: adminUrl });
  await harden.connect();
  try {
    await harden.query(
      readFileSync(join(import.meta.dirname, "..", "..", "sql", "harden-database.sql"), "utf8"),
    );
  } finally {
    await harden.end();
  }

  if (options.migrate !== false) {
    const migrator = new pg.Client({ connectionString: urls.migrator });
    await migrator.connect();
    try {
      await migrate(migrator);
    } finally {
      await migrator.end();
    }
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
    executorPool: () => makePool(urls.executor, "test-executor"),
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
