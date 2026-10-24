import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

/**
 * Forward-only, transactional, checksummed migrations.
 *
 *  - Each file runs in ONE transaction together with its bookkeeping row: it is applied completely or not at all.
 *  - A file that was applied is never re-run, and editing it afterwards is an error (checksum), so history cannot be
 *    rewritten silently.
 *  - A pg advisory lock serializes concurrent runners.
 *  - Files must be applied in order; a new file that sorts before one already applied is refused.
 *  - There are deliberately no "down" migrations: reversing a security-relevant schema change by script is how
 *    constraints get dropped by accident. Recovery is a new forward migration, or restoring a backup taken before
 *    the change (docs/BE-01-BACKEND.md, "Migration and rollback").
 *
 * Run as the schema owner (axo_migrator), never as a runtime role.
 */

export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

const LOCK_KEY = 7_274_721; // arbitrary, fixed

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export function readMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(dir, file), "utf8");
      return {
        version: file.slice(0, 3),
        name: file,
        sql,
        checksum: createHash("sha256").update(sql, "utf8").digest("hex"),
      };
    });
}

export class MigrationError extends Error {}

export async function migrate(
  client: pg.Client,
  dir = MIGRATIONS_DIR,
): Promise<{ applied: string[]; alreadyApplied: string[] }> {
  const files = readMigrations(dir);
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS axo");
    await client.query(`
      CREATE TABLE IF NOT EXISTS axo.schema_migrations (
        version    text PRIMARY KEY,
        name       text NOT NULL,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const done = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM axo.schema_migrations ORDER BY version",
    );
    const doneByVersion = new Map(done.rows.map((r) => [r.version, r.checksum]));
    const lastApplied = done.rows.at(-1)?.version ?? "";

    const applied: string[] = [];
    const alreadyApplied: string[] = [];
    for (const file of files) {
      const recorded = doneByVersion.get(file.version);
      if (recorded !== undefined) {
        if (recorded !== file.checksum) {
          throw new MigrationError(
            `migration ${file.name} was changed after it was applied; add a new migration instead`,
          );
        }
        alreadyApplied.push(file.name);
        continue;
      }
      if (file.version < lastApplied) {
        throw new MigrationError(
          `migration ${file.name} is older than the newest applied migration`,
        );
      }
      try {
        await client.query("BEGIN");
        await client.query(file.sql);
        await client.query(
          "INSERT INTO axo.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [file.version, file.name, file.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      applied.push(file.name);
    }
    const missing = [...doneByVersion.keys()].filter((v) => !files.some((f) => f.version === v));
    if (missing.length > 0) {
      throw new MigrationError(
        `database has migrations this build does not know: ${missing.join(", ")}`,
      );
    }
    return { applied, alreadyApplied };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}
