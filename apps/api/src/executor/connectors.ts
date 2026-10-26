/**
 * Connectors: the only code that talks to a destination. There is exactly one, fixed in code to one action
 * (`crm.lead.create`) and one destination whose base URL and service token come from the executor's own configuration.
 *
 * What a connector is NOT given: a URL, host, header, credential, tool name or command from a request, a policy, a
 * database row or an agent. The parameters it receives have already passed the strict action schema and been verified
 * against the approved digest. There is no way to ask for another destination or to run anything else.
 *
 * Outcomes are three different facts, never merged:
 *   succeeded  the destination confirmed the effect;
 *   failed     the destination cannot have performed it (it refused, or the request never reached it);
 *   unknown    we cannot tell (timeout, connection lost after sending, server error, unreadable answer). The executor
 *              NEVER retries an unknown outcome: the side effect may already have happened.
 */

export type ConnectorOutcome =
  | { outcome: "succeeded"; externalReference: string }
  | { outcome: "failed"; errorClass: string }
  | { outcome: "unknown"; errorClass: string };

export interface Connector {
  readonly name: "mock_crm";
  execute(input: {
    requestId: string;
    parameters: Readonly<Record<string, string>>;
  }): Promise<ConnectorOutcome>;
}

export interface MockCrmConnectorConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

/** Errors that prove the request never reached the destination, so no side effect is possible. */
const NEVER_SENT = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

function causeCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

export function mockCrmConnector(config: MockCrmConnectorConfig): Connector {
  const target = new URL("/leads", config.baseUrl);
  return {
    name: "mock_crm",
    async execute({ requestId, parameters }) {
      let response: Response;
      try {
        response = await fetch(target, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.token}`,
            "content-type": "application/json",
            // The destination de-duplicates on this: even a repeated call cannot create a second lead.
            "idempotency-key": requestId,
          },
          body: JSON.stringify({
            full_name: parameters.full_name,
            email: parameters.email,
            company: parameters.company,
          }),
          signal: AbortSignal.timeout(config.timeoutMs),
          // A redirect could send the credential somewhere else: never follow one.
          redirect: "error",
        });
      } catch (error) {
        const code = causeCode(error);
        if (code !== undefined && NEVER_SENT.has(code))
          return { outcome: "failed", errorClass: "unreachable" };
        const name = error instanceof Error ? error.name : "";
        return {
          outcome: "unknown",
          errorClass:
            name === "TimeoutError" || name === "AbortError" ? "timeout" : "connection_lost",
        };
      }
      // Read a bounded answer; an unreadable one after a 2xx means the effect probably happened.
      let text: string;
      try {
        text = (await response.text()).slice(0, 4096);
      } catch {
        return { outcome: "unknown", errorClass: "unreadable_response" };
      }
      if (response.status === 201 || response.status === 200) {
        try {
          const parsed: unknown = JSON.parse(text);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "id" in parsed &&
            typeof parsed.id === "string" &&
            /^[A-Za-z0-9_-]{1,64}$/.test(parsed.id)
          ) {
            return { outcome: "succeeded", externalReference: parsed.id };
          }
        } catch {
          // fall through
        }
        return { outcome: "unknown", errorClass: "unreadable_response" };
      }
      if ([400, 401, 403, 404, 409, 413, 415, 422].includes(response.status)) {
        return { outcome: "failed", errorClass: `rejected_${String(response.status)}` };
      }
      // 5xx and anything else: the destination may have acted before failing.
      return { outcome: "unknown", errorClass: `status_${String(response.status)}` };
    },
  };
}
