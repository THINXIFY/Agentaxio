import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";
import type { TestCluster } from "./cluster";

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

function startEmbeddedServer(): Promise<{ adminUrl: string; stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(
      process.execPath,
      [join(import.meta.dirname, "pg-server.mjs")],
      { cwd: join(import.meta.dirname, "..", ".."), stdio: ["pipe", "pipe", "pipe"] },
    );
    let buffered = "";
    const failure = (reason: string) => {
      child.kill();
      reject(new Error(`embedded PostgreSQL did not start: ${reason}`));
    };
    const timer = setTimeout(() => {
      failure("timed out");
    }, 90_000);
    child.stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      const line = buffered.split("\n")[0];
      if (line === undefined || !buffered.includes("\n")) return;
      clearTimeout(timer);
      const info = JSON.parse(line) as { port: number; password: string };
      resolve({
        adminUrl: `postgres://postgres:${info.password}@127.0.0.1:${String(info.port)}/postgres`,
        stop: () =>
          new Promise<void>((done) => {
            child.once("exit", () => {
              done();
            });
            child.stdin.write("stop\n");
            setTimeout(() => {
              child.kill();
              done();
            }, 20_000).unref();
          }),
      });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`embedded PostgreSQL exited early (${String(code)})`));
    });
  });
}

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
