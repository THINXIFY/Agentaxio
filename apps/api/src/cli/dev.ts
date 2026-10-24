import { loadAgentApiConfig } from "../config";
import { createPool } from "../db/pool";
import { buildApp } from "../http/app";

/** Start the agent-facing API on loopback. Refuses to start without a valid configuration (pepper and data keys). */
async function main(): Promise<void> {
  const config = loadAgentApiConfig();
  const agentPool = createPool(config.agentApiDatabaseUrl, "agent-api");
  const app = buildApp({
    agentPool,
    pepper: config.pepper,
    dataKeys: config.dataKeys,
    logger: { level: config.logLevel },
  });
  const shutdown = () => {
    void app.close().then(() => agentPool.end());
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `could not start: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
