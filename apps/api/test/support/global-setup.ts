import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import type { TestProject } from "vitest/node";
import type { TestCluster } from "./cluster";

/**
 * Provides a REAL PostgreSQL cluster to the integration tests; nothing is mocked.
 *
 *  - If AXO_TEST_ADMIN_URL is set (CI uses a postgres:17 service container), that server is used.
 *  - Otherwise a throw-away PostgreSQL 17 server is started from the `embedded-postgres` dev dependency (real
 *    PostgreSQL binaries run as an ordinary user process: nothing is installed system-wide).
 *
 * Roles are created once per cluster from sql/bootstrap-roles.sql, exactly as an operator would. Each test file then
 * creates its own database, so files can run in parallel.
 */

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

const secret = () => randomBytes(18).toString("hex");

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let stop: () => Promise<void> = () => Promise.resolve();
  let adminUrl = process.env.AXO_TEST_ADMIN_URL;

  if (adminUrl === undefined || adminUrl === "") {
    const dir = mkdtempSync(join(tmpdir(), "axo-pg-"));
    const port = await freePort();
    const password = secret();
    const server = new EmbeddedPostgres({
      databaseDir: dir,
      user: "postgres",
      password,
      port,
      persistent: true,
      onLog: () => undefined,
      onError: () => undefined,
    });
    await server.initialise();
    await server.start();
    adminUrl = `postgres://postgres:${password}@127.0.0.1:${String(port)}/postgres`;
    stop = async () => {
      await server.stop();
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        /* Windows may hold a handle briefly; the directory lives in the OS temp folder. */
      }
    };
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
