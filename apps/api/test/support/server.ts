import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";

/**
 * Start a throw-away PostgreSQL 17 server (real binaries from the embedded-postgres dev dependency) in its own process.
 * It must not run inside the test runner: see pg-server.mjs.
 */
export function startEmbeddedServer(): Promise<{ adminUrl: string; stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(
      process.execPath,
      [join(import.meta.dirname, "pg-server.mjs")],
      { cwd: join(import.meta.dirname, "..", ".."), stdio: ["pipe", "pipe", "pipe"] },
    );
    let buffered = "";
    const failure = (reason: string) => {
      child.kill();
      reject(new Error(`embedded PostgreSQL did not start: ${reason}`));
    };
    const timer = setTimeout(() => {
      failure("timed out");
    }, 90_000);
    child.stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      const line = buffered.split("\n")[0];
      if (line === undefined || !buffered.includes("\n")) return;
      clearTimeout(timer);
      const info = JSON.parse(line) as { port: number; password: string };
      resolve({
        adminUrl: `postgres://postgres:${info.password}@127.0.0.1:${String(info.port)}/postgres`,
        stop: () =>
          new Promise<void>((done) => {
            child.once("exit", () => {
              done();
            });
            child.stdin.write("stop\n");
            setTimeout(() => {
              child.kill();
              done();
            }, 20_000).unref();
          }),
      });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`embedded PostgreSQL exited early (${String(code)})`));
    });
  });
}
