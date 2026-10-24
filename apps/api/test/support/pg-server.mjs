// Runs a throw-away PostgreSQL 17 server for the integration tests, in its OWN process.
//
// It must not run inside the test runner's process: the `embedded-postgres` package registers a process-exit hook
// (async-exit-hook) that calls process.exit(0) and so replaces the exit code of the whole run. Tests could fail and the
// command would still report success. Keeping it here means a failing test suite always exits non-zero.
//
// Protocol: prints one JSON line {"port", "password"} when the server accepts connections; stops (and deletes its data
// directory) when it receives a line containing "stop" on stdin, or when stdin closes.
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const dir = mkdtempSync(join(tmpdir(), "axo-pg-"));
const port = await freePort();
const password = randomBytes(18).toString("hex");
const server = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password,
  port,
  persistent: true,
  onLog: () => undefined,
  onError: () => undefined,
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await server.stop();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // Windows can hold a handle briefly; the directory is in the OS temp folder.
    }
    process.exit(0);
  }
}

await server.initialise();
await server.start();
process.stdout.write(`${JSON.stringify({ port, password })}\n`);
process.stdin.on("data", (chunk) => {
  if (String(chunk).includes("stop")) void stop();
});
process.stdin.on("end", () => void stop());
