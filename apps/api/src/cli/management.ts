import { loadManagementConfig } from "../config";
import { createOidcClient } from "../auth/oidc";
import { createPool } from "../db/pool";
import { buildManagementApp } from "../http/management-app";

/** The signed-in (human) API on loopback. It refuses to start without a complete, safe configuration. */
async function main(): Promise<void> {
  const config = loadManagementConfig();
  const pool = createPool(config.managementDatabaseUrl, "management-api");
  const oidc = await createOidcClient(config.oidc);
  const app = buildManagementApp({
    pool,
    login: { pool, oidc, dataKeys: config.dataKeys, mfaRequired: config.mfaRequired },
    pepper: config.pepper,
    dataKeys: config.dataKeys,
    webOrigin: config.webOrigin,
    cookieSecure: config.cookieSecure,
    logger: { level: config.logLevel },
  });
  const shutdown = () => {
    void app.close().then(() => pool.end());
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `management API could not start: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
