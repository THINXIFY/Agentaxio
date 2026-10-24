import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./support/db";

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe("smoke", () => {
  it("runs on a real PostgreSQL 17 server with all migrations applied", async () => {
    const admin = await db.admin();
    const version = await admin.query<{ server_version: string }>("SHOW server_version");
    expect(version.rows[0]?.server_version).toMatch(/^17\./);
    const tables = await admin.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'axo' ORDER BY 1",
    );
    expect(tables.rows.map((r) => r.table_name)).toContain("action_requests");
  });
});
