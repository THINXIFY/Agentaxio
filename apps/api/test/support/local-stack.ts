import { createMockCrm } from "../../../mock-crm/src/server";
import pg from "pg";
import { createOidcClient } from "../../src/auth/oidc";
import { setupLocalDatabase } from "../../src/cli/setup";
import { parseKeyRing } from "../../src/crypto/data-keys";
import { migrate } from "../../src/db/migrate";
import { createPool } from "../../src/db/pool";
import { maintain, runOnce } from "../../src/executor/executor";
import { mockCrmConnector } from "../../src/executor/connectors";
import { buildApp } from "../../src/http/app";
import { buildManagementApp } from "../../src/http/management-app";
import { parsePepper } from "../../src/config";
import { TestIdp } from "./idp";
import { startEmbeddedServer } from "./server";

/**
 * A complete LOCAL DEMONSTRATION of the backend, for looking at the live dashboard on your own machine. Nothing here is
 * deployed or durable:
 *
 *   - a throw-away PostgreSQL 17 server (deleted when you stop this);
 *   - the agent API (8787), the management API (8788), the trusted executor, and the mock CRM (8790);
 *   - a stand-in "identity provider" that lets you pick an invented person to sign in as. It is NOT a real login and is
 *     here only so the real OpenID Connect flow can run without a vendor account.
 *
 * Start the website with AXO_API_URL=http://127.0.0.1:8788 to see it. Run with:
 *   pnpm --filter @agentaxio/api dev:stack
 */

const WEB_ORIGIN = process.env.AXO_WEB_ORIGIN ?? "http://localhost:3000";
const IDP_PORT = 8789;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production")
    throw new Error("the local stack never runs in production");

  // CI passes a PostgreSQL service container; otherwise a throw-away server is started from the embedded binaries.
  const external = process.env.AXO_STACK_ADMIN_URL;
  process.stdout.write(
    external === undefined
      ? "Starting a throw-away PostgreSQL 17 server…\n"
      : "Using the PostgreSQL server in AXO_STACK_ADMIN_URL…\n",
  );
  const server =
    external === undefined
      ? await startEmbeddedServer()
      : { adminUrl: external, stop: () => Promise.resolve() };
  const { env } = await setupLocalDatabase(server.adminUrl, "agentaxio_local_dev");
  const migrator = new pg.Client({ connectionString: env.AXO_MIGRATOR_DATABASE_URL });
  await migrator.connect();
  await migrate(migrator);
  await migrator.end();

  const idp = new TestIdp(`${WEB_ORIGIN}/api/auth/callback`);
  idp.chooser = true;
  for (const [key, email] of [
    ["ada", "ada.owner@example.test"],
    ["grace", "grace.approver@example.test"],
    ["alan", "alan.viewer@example.test"],
  ] as const) {
    idp.addUser(key, { email, amr: ["pwd", "otp"] });
  }
  await idp.start(IDP_PORT);

  const pepper = parsePepper(env.AXO_CREDENTIAL_PEPPER);
  const dataKeys = parseKeyRing(env.AXO_DATA_KEYS ?? "", env.AXO_DATA_KEY_ID ?? "k1");
  const crmToken = env.AXO_MOCK_CRM_TOKEN ?? "";

  const crm = createMockCrm({ token: crmToken });
  const crmAddress = await crm.listen(8790);

  const agentPool = createPool(env.AXO_AGENT_API_DATABASE_URL ?? "", "agent-api");
  const agentApp = buildApp({ agentPool, pepper, dataKeys, logger: { level: "warn" } });
  await agentApp.listen({ host: "127.0.0.1", port: 8787 });

  const managementPool = createPool(env.AXO_MANAGEMENT_DATABASE_URL ?? "", "management-api");
  const oidc = await createOidcClient({
    issuer: idp.url,
    clientId: idp.clientId,
    clientSecret: idp.clientSecret,
    redirectUri: `${WEB_ORIGIN}/api/auth/callback`,
    allowInsecure: true,
  });
  const managementApp = buildManagementApp({
    pool: managementPool,
    login: { pool: managementPool, oidc, dataKeys, mfaRequired: true },
    pepper,
    dataKeys,
    webOrigin: WEB_ORIGIN,
    cookieSecure: false,
    logger: { level: "warn" },
  });
  await managementApp.listen({ host: "127.0.0.1", port: 8788 });

  const executorPool = createPool(env.AXO_EXECUTOR_DATABASE_URL ?? "", "executor");
  const deps = {
    pool: executorPool,
    dataKeys,
    executorId: "local-executor",
    connector: mockCrmConnector({ baseUrl: crmAddress.url, token: crmToken, timeoutMs: 5000 }),
  };
  let stopping = false;
  const loop = (async () => {
    let lastMaintenance = 0;
    while (!stopping) {
      try {
        if (Date.now() - lastMaintenance > 15_000) {
          await maintain(executorPool);
          lastMaintenance = Date.now();
        }
        const result = await runOnce(deps);
        if (result.kind === "idle") await new Promise((r) => setTimeout(r, 700));
        else process.stdout.write(`executor: ${JSON.stringify(result)}\n`);
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();

  process.stdout.write(`
Local stack is running (nothing is saved when you stop it).

  Agent API        http://127.0.0.1:8787     (agents call this with their access key)
  Management API   http://127.0.0.1:8788     (the website talks to this)
  Mock CRM         ${crmAddress.url}     (a mock; the executor is the only caller it accepts)
  Test sign-in     ${idp.url}     (pick an invented person: ada = first to create the organization)

Now start the website in another terminal:
  cd apps/web
  AXO_API_URL=http://127.0.0.1:8788 pnpm dev        (PowerShell: $env:AXO_API_URL="http://127.0.0.1:8788"; pnpm dev)
Then open ${WEB_ORIGIN}/dashboard. Press Ctrl+C here to stop everything.
`);

  const shutdown = async () => {
    stopping = true;
    await loop;
    await managementApp.close();
    await agentApp.close();
    await crm.close();
    await idp.stop();
    await Promise.all([agentPool.end(), managementPool.end(), executorPool.end()]);
    await server.stop();
    process.exit(0);
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void shutdown());
}

main().catch((error: unknown) => {
  process.stderr.write(
    `local stack failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
