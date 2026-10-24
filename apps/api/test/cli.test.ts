import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemo } from "../src/cli/seed";
import { setupLocalDatabase } from "../src/cli/setup";
import { loadConfig } from "../src/config";
import { migrate } from "../src/db/migrate";
import { createPool } from "../src/db/pool";
import { buildApp } from "../src/http/app";
import { startEmbeddedServer } from "./support/server";

/**
 * The fresh-clone path end to end, on its OWN throw-away PostgreSQL server (setup rotates the passwords of the
 * cluster-level roles, which must not happen on the cluster the other test files share):
 * db:setup -> db:migrate -> db:seed -> live HTTP server -> a real request over a real socket.
 */

let server: Awaited<ReturnType<typeof startEmbeddedServer>>;
beforeAll(async () => {
  // CI points this at a second, separate PostgreSQL service container; locally an embedded server is started.
  const isolated = process.env.AXO_TEST_ISOLATED_ADMIN_URL;
  server =
    isolated !== undefined && isolated !== ""
      ? { adminUrl: isolated, stop: () => Promise.resolve() }
      : await startEmbeddedServer();
});
afterAll(async () => {
  await server.stop();
});

describe("db:setup", () => {
  it("refuses any database name that is not an obvious development name, and never injects SQL", async () => {
    for (const name of [
      "production",
      "agentaxio",
      "x_dev; DROP DATABASE postgres",
      "Agent_dev",
      "a_dev",
      "../dev",
    ]) {
      await expect(setupLocalDatabase(server.adminUrl, name), name).rejects.toThrow(
        /ending in _dev/,
      );
    }
  });

  it("creates roles, a hardened database and connection settings, and is safe to repeat", async () => {
    const database = `cli_${randomUUID().slice(0, 8)}_dev`;
    const first = await setupLocalDatabase(server.adminUrl, database);
    expect(Object.keys(first.env).sort()).toEqual([
      "AXO_AGENT_API_DATABASE_URL",
      "AXO_CREDENTIAL_PEPPER",
      "AXO_MANAGEMENT_DATABASE_URL",
      "AXO_MIGRATOR_DATABASE_URL",
    ]);
    // The generated settings are accepted by the service's own configuration loader (pepper strength included).
    expect(() => loadConfig({ ...first.env })).not.toThrow();
    const second = await setupLocalDatabase(server.adminUrl, database);
    expect(second.env.AXO_AGENT_API_DATABASE_URL).not.toBe(first.env.AXO_AGENT_API_DATABASE_URL);
    // The previous passwords no longer work: running it again rotated them.
    const stale = new pg.Client({ connectionString: first.env.AXO_AGENT_API_DATABASE_URL });
    await expect(stale.connect()).rejects.toThrow();
    // And the PUBLIC pseudo-role has no access to the new database.
    const admin = new pg.Client({ connectionString: server.adminUrl });
    await admin.connect();
    const acl = await admin.query(
      "SELECT count(*)::int AS n FROM pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a WHERE d.datname = $1 AND a.grantee = 0",
      [database],
    );
    expect(acl.rows[0].n).toBe(0);
    await admin.end();
  });
});

describe("fresh clone: setup, migrate, seed, serve, request", () => {
  it("works end to end over a real socket, shows the key once, and the seeded policy requires approval", async () => {
    const database = `cli_${randomUUID().slice(0, 8)}_dev`;
    const { env } = await setupLocalDatabase(server.adminUrl, database);
    const config = loadConfig({ ...env });

    const owner = new pg.Client({ connectionString: env.AXO_MIGRATOR_DATABASE_URL });
    await owner.connect();
    await migrate(owner);
    await owner.end();

    const seeded = await seedDemo(
      env.AXO_MIGRATOR_DATABASE_URL ?? "",
      env.AXO_MANAGEMENT_DATABASE_URL ?? "",
      config.pepper,
    );
    expect(seeded.alreadySeeded).toBe(false);
    expect(seeded.agentKey).toMatch(/^axo_[0-9a-f]{24}_[A-Za-z0-9_-]{43}$/);
    const again = await seedDemo(
      env.AXO_MIGRATOR_DATABASE_URL ?? "",
      env.AXO_MANAGEMENT_DATABASE_URL ?? "",
      config.pepper,
    );
    expect(again).toMatchObject({ alreadySeeded: true });
    expect(again.agentKey).toBeUndefined();

    const pool = createPool(config.agentApiDatabaseUrl, "cli-test");
    const app = buildApp({ agentPool: pool, pepper: config.pepper, logger: false });
    try {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const post = (key: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${address}/v1/action-requests`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
            "idempotency-key": randomUUID(),
            ...headers,
          },
          body: JSON.stringify(body),
        });
      const lead = {
        action: "crm.lead.create",
        resource: "mockcrm/leads",
        parameters: { full_name: "Ada Example", email: "ada@example.test", company: "Sample Co" },
      };
      const res = await post(seeded.agentKey ?? "", lead);
      expect(res.status).toBe(202);
      const body = (await res.json()) as { id: string; status: string; reason_code: string };
      expect(body).toMatchObject({
        status: "pending_approval",
        reason_code: "HUMAN_REVIEW_REQUIRED",
      });
      const status = await fetch(`${address}/v1/action-requests/${body.id}`, {
        headers: { authorization: `Bearer ${seeded.agentKey ?? ""}` },
      });
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({ id: body.id, status: "pending_approval" });
      // A wrong key over the same socket is refused, and nothing is created.
      const bad = await post(`axo_${"0".repeat(24)}_${"A".repeat(43)}`, lead);
      expect(bad.status).toBe(401);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("the seed refuses to run against a database that is not a development database", async () => {
    const database = `cli_${randomUUID().slice(0, 8)}_dev`;
    const { env } = await setupLocalDatabase(server.adminUrl, database);
    const owner = new pg.Client({ connectionString: env.AXO_MIGRATOR_DATABASE_URL });
    await owner.connect();
    await migrate(owner);
    await owner.end();
    await expect(
      seedDemo(
        env.AXO_MIGRATOR_DATABASE_URL ?? "",
        env.AXO_MANAGEMENT_DATABASE_URL ?? "",
        loadConfig({ ...env }).pepper,
        {
          databaseName: /_production$/,
        },
      ),
    ).rejects.toThrow(/only runs against a development database/);
  });
});
