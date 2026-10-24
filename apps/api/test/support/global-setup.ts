import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";
import type { TestCluster } from "./cluster";
import { startEmbeddedServer } from "./server";

/**
 * Provides a REAL PostgreSQL cluster to the integration tests; nothing is mocked.
 *
 *  - If AXO_TEST_ADMIN_URL is set (CI uses a postgres:17 service container), that server is used.
 *  - Otherwise a throw-away PostgreSQL 17 server is started from the `embedded-postgres` dev dependency (real
 *    PostgreSQL binaries run as an ordinary user process: nothing is installed system-wide). It runs in a separate
 *    process (see pg-server.mjs) so that its exit hook cannot change this process's exit code.
 *
 * Roles are created once per cluster from sql/bootstrap-roles.sql, exactly as an operator would. Each test file then
 * creates its own database, so files can run in parallel.
 */

const secret = () => randomBytes(18).toString("hex");

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let stop: () => Promise<void> = () => Promise.resolve();
  let adminUrl = process.env.AXO_TEST_ADMIN_URL;

  if (adminUrl === undefined || adminUrl === "") {
    const started = await startEmbeddedServer();
    adminUrl = started.adminUrl;
    stop = started.stop;
  }

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const bootstrap = readFileSync(
      join(import.meta.dirname, "..", "..", "sql", "bootstrap-roles.sql"),
      "utf8",
    );
    await admin.query(bootstrap);
  } finally {
    await admin.end();
  }
  const roles = { migrator: secret(), agentApi: secret(), management: secret() };
  const enable = new pg.Client({ connectionString: adminUrl });
  await enable.connect();
  try {
    await enable.query(`ALTER ROLE axo_migrator LOGIN PASSWORD '${roles.migrator}'`);
    await enable.query(`ALTER ROLE axo_agent_api LOGIN PASSWORD '${roles.agentApi}'`);
    await enable.query(`ALTER ROLE axo_management LOGIN PASSWORD '${roles.management}'`);
  } finally {
    await enable.end();
  }

  const cluster: TestCluster = { adminUrl, roles };
  project.provide("axoCluster", cluster);
  return stop;
}
