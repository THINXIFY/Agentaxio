import pg from "pg";
import { LIMITS } from "../config";

/**
 * One pool per database role. Connections are short-lived by design: nothing here keeps a transaction open across a
 * network call to anything else.
 */
export function createPool(connectionString: string, applicationName: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000,
    application_name: applicationName,
    statement_timeout: LIMITS.statementTimeoutMs,
    idle_in_transaction_session_timeout: 15_000,
  });
  // An idle client failing (server restart, network) must not crash the process; the next checkout reconnects.
  pool.on("error", () => undefined);
  return pool;
}

export type Tx = pg.PoolClient;

/**
 * Run `work` inside one READ COMMITTED transaction. Isolation is READ COMMITTED on purpose: correctness comes from
 * explicit row locks taken in a fixed order (see axo.enter_agent_context), which keep the lock graph acyclic and make
 * waits visible, instead of SERIALIZABLE aborts that would need retry loops. A lock wait longer than
 * LIMITS.lockTimeoutMs aborts the transaction, which the caller treats as a failure (fail closed).
 */
export async function inTransaction<T>(pool: pg.Pool, work: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  // A connection that dies while checked out emits an error event on the client itself. Unhandled, that would crash the
  // whole process; here it marks the connection as unusable, and the in-flight query rejects (which fails closed).
  const onClientError = () => {
    broken = true;
  };
  client.on("error", onClientError);
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = ${String(LIMITS.lockTimeoutMs)}`);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is unusable; destroy it instead of returning it to the pool.
      broken = true;
    }
    throw error;
  } finally {
    client.off("error", onClientError);
    client.release(broken);
  }
}
