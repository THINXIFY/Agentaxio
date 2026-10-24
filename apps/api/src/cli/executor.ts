import { loadExecutorConfig } from "../config";
import { createPool } from "../db/pool";
import { mockCrmConnector } from "../executor/connectors";
import { maintain, runOnce } from "../executor/executor";

/**
 * The trusted executor process. It has its own database role (no table privileges) and is the only process that holds
 * the mock CRM's service token. It polls for authorized, approved work, runs each action once, and records the result.
 * If the database is unavailable it does nothing: nothing executes without a successful claim.
 */
async function main(): Promise<void> {
  const config = loadExecutorConfig();
  const pool = createPool(config.executorDatabaseUrl, "executor");
  const deps = {
    pool,
    dataKeys: config.dataKeys,
    executorId: config.executorId,
    connector: mockCrmConnector({
      baseUrl: config.mockCrmBaseUrl,
      token: config.mockCrmToken,
      timeoutMs: config.attemptTimeoutMs,
    }),
  };
  const state = { stopping: false };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      state.stopping = true;
    });
  }
  const log = (event: Record<string, unknown>) =>
    process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  log({ event: "executor.started", executor: config.executorId });
  let lastMaintenance = 0;
  while (!state.stopping) {
    try {
      if (Date.now() - lastMaintenance > 30_000) {
        log({ event: "executor.maintenance", ...(await maintain(pool)) });
        lastMaintenance = Date.now();
      }
      const result = await runOnce(deps);
      if (result.kind === "idle") await sleep(config.pollIntervalMs);
      else log({ event: `executor.${result.kind}`, ...result });
    } catch (error) {
      // Only kinds are logged: database error text can echo submitted values.
      log({ event: "executor.error", kind: error instanceof Error ? error.name : "Error" });
      await sleep(2000);
    }
  }
  await pool.end();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `executor could not start: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
