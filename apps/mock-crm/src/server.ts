import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/**
 * A MOCK CRM. It exists so the AgentAxio executor has a real, separate network destination to call during
 * development and tests. It is not a real system, stores leads only in memory, and must never be pointed at real data.
 *
 * It is the "protected destination" in the architecture: it accepts requests only with a service token that exactly
 * one process (the executor) is given. An agent or an n8n workflow that holds only an AgentAxio agent key cannot
 * create a lead here (docs/SECURITY-ACCEPTANCE.md S18).
 *
 * Behaviour that matters to the executor:
 *  - `Idempotency-Key` makes creation idempotent: the same key and body returns the same lead (200), a different body
 *    under the same key is refused (409). So even a duplicate call cannot create a second lead.
 *  - Bodies are strict: exactly full_name, email, company as short strings; anything else is 422.
 *  - Faults for tests are set by the code that builds the server (`faults`), never by anything in a request.
 */

export interface Lead {
  id: string;
  full_name: string;
  email: string;
  company: string;
}

/** Test-only switches, controlled by the process that creates the server. */
export interface Faults {
  /** Wait this long before answering (to provoke a client timeout). */
  delayMs?: number;
  /** Do the work, then close the connection without answering (the "unknown outcome" case). */
  dropAfterCreate?: boolean;
  /** Answer with this status without creating anything. */
  failWith?: number;
}

export interface MockCrmOptions {
  token: string;
  faults?: Faults;
}

export interface MockCrm {
  server: Server;
  faults: Faults;
  leads(): Lead[];
  /** Number of requests that reached the lead-creation handler with a valid token. */
  authorizedCalls(): number;
  listen(port?: number): Promise<{ url: string; port: number }>;
  close(): Promise<void>;
}

const MAX_BODY = 4 * 1024;
const TEXT = /^[^\p{Cc}]{1,120}$/u;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{1,63}$/;

/** The body as text, or null when it is larger than allowed (the rest is read and thrown away). */
function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  response.end(text);
}

function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(`Bearer ${expected}`, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createMockCrm(options: MockCrmOptions): MockCrm {
  const faults: Faults = { ...options.faults };
  const byKey = new Map<string, { lead: Lead; fingerprint: string }>();
  let calls = 0;

  const server = createServer((request, response) => {
    void (async () => {
      try {
        if (!tokenMatches(request.headers.authorization, options.token)) {
          send(response, 401, { error: "unauthorized" });
          return;
        }
        const url = new URL(request.url ?? "/", "http://mock.invalid");
        if (request.method === "GET" && url.pathname === "/leads") {
          send(response, 200, { leads: [...byKey.values()].map((v) => v.lead) });
          return;
        }
        if (request.method !== "POST" || url.pathname !== "/leads") {
          send(response, 404, { error: "not found" });
          return;
        }
        calls += 1;
        if (faults.delayMs !== undefined) await new Promise((r) => setTimeout(r, faults.delayMs));
        if (faults.failWith !== undefined) {
          send(response, faults.failWith, { error: "simulated failure" });
          return;
        }
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
          send(response, 400, { error: "Idempotency-Key required" });
          return;
        }
        if (!String(request.headers["content-type"]).startsWith("application/json")) {
          send(response, 415, { error: "json only" });
          return;
        }
        const raw = await readBody(request);
        if (raw === null) {
          send(response, 413, { error: "too large" });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          send(response, 400, { error: "invalid json" });
          return;
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          send(response, 422, { error: "invalid lead" });
          return;
        }
        const body = parsed as Record<string, unknown>;
        const keys = Object.keys(body).sort().join(",");
        const { full_name: name, email, company } = body;
        if (
          keys !== "company,email,full_name" ||
          typeof name !== "string" ||
          !TEXT.test(name) ||
          typeof company !== "string" ||
          !TEXT.test(company) ||
          typeof email !== "string" ||
          !EMAIL.test(email)
        ) {
          send(response, 422, { error: "invalid lead" });
          return;
        }
        const fingerprint = JSON.stringify([name, email, company]);
        const existing = byKey.get(key);
        if (existing !== undefined) {
          if (existing.fingerprint !== fingerprint) {
            send(response, 409, { error: "idempotency key reused with a different lead" });
            return;
          }
          send(response, 200, { id: existing.lead.id });
          return;
        }
        const lead: Lead = {
          id: `lead_${randomBytes(8).toString("hex")}`,
          full_name: name,
          email,
          company,
        };
        byKey.set(key, { lead, fingerprint });
        if (faults.dropAfterCreate === true) {
          request.socket.destroy();
          return;
        }
        send(response, 201, { id: lead.id });
      } catch {
        if (!response.headersSent) send(response, 500, { error: "internal error" });
      }
    })();
  });
  server.requestTimeout = 15_000;

  return {
    server,
    faults,
    leads: () => [...byKey.values()].map((v) => v.lead),
    authorizedCalls: () => calls,
    listen: (port = 0) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          const actual = typeof address === "object" && address !== null ? address.port : port;
          resolve({ url: `http://127.0.0.1:${String(actual)}`, port: actual });
        });
      }),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
