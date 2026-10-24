/** Fixed operating limits. They are constants, not environment settings, so a deployment cannot weaken them by accident. */
export const LIMITS = {
  /** Largest accepted request body. Larger bodies are refused before parsing completes. */
  bodyBytes: 16 * 1024,
  /** Seconds a pending request waits for a human before it counts as expired (docs/PHASE1-DECISIONS.md). */
  approvalTtlSeconds: 15 * 60,
  /** Seconds an allowed request may wait for the executor before it counts as expired (executor arrives in M02). */
  queueTtlSeconds: 5 * 60,
  /** Pending-approval requests one agent may hold; beyond this new approval-bound requests get 429. */
  maxPendingPerAgent: 100,
  /** Most policies one decision will load; more than this fails closed. */
  maxPoliciesPerDecision: 500,
  /** How long a statement may wait for a lock before the operation fails closed, in milliseconds. */
  lockTimeoutMs: 3000,
  statementTimeoutMs: 8000,
} as const;

export interface ApiConfig {
  agentApiDatabaseUrl: string;
  managementDatabaseUrl: string;
  pepper: Buffer;
  host: string;
  port: number;
  logLevel: string;
}

export class ConfigError extends Error {}

/**
 * Decode the credential pepper. It must be at least 32 random bytes (base64url or base64). Anything shorter, missing or
 * obviously a placeholder makes the process refuse to start: a service with a weak pepper is worse than no service.
 */
export function parsePepper(value: string | undefined): Buffer {
  if (value === undefined || value.trim() === "") {
    throw new ConfigError("AXO_CREDENTIAL_PEPPER is not set");
  }
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_+/=-]+$/.test(trimmed))
    throw new ConfigError("AXO_CREDENTIAL_PEPPER is not base64");
  const bytes = Buffer.from(trimmed.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (bytes.length < 32)
    throw new ConfigError("AXO_CREDENTIAL_PEPPER must decode to at least 32 bytes");
  if (new Set(bytes).size < 8) throw new ConfigError("AXO_CREDENTIAL_PEPPER does not look random");
  return bytes;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === "") throw new ConfigError(`${name} is not set`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError("PORT is invalid");
  return {
    agentApiDatabaseUrl: required(env, "AXO_AGENT_API_DATABASE_URL"),
    managementDatabaseUrl: required(env, "AXO_MANAGEMENT_DATABASE_URL"),
    pepper: parsePepper(env.AXO_CREDENTIAL_PEPPER),
    // Loopback by default: exposing the API is a deliberate deployment decision, not a default.
    host: env.HOST ?? "127.0.0.1",
    port,
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
