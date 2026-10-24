import pg from "pg";
import { migrate } from "../db/migrate";

/** Apply pending migrations as the schema owner. Reads AXO_MIGRATOR_DATABASE_URL. */
async function main(): Promise<void> {
  const url = process.env.AXO_MIGRATOR_DATABASE_URL;
  if (url === undefined || url === "") throw new Error("AXO_MIGRATOR_DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { applied, alreadyApplied } = await migrate(client);
    process.stdout.write(
      applied.length === 0
        ? `Up to date (${String(alreadyApplied.length)} migrations already applied).\n`
        : `Applied: ${applied.join(", ")}\n`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `db:migrate failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
