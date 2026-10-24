import { KeyError, parseKeyRing, type KeyRing } from "./crypto/data-keys";

/** Fixed operating limits. They are constants, not environment settings, so a deployment cannot weaken them by accident. */
export const LIMITS = {
  /** Largest accepted request body. Larger bodies are refused before parsing completes. */
  bodyBytes: 16 * 1024,
  /** Seconds a pending request waits for a human before it counts as expired (docs/PHASE1-DECISIONS.md). */
  approvalTtlSeconds: 15 * 60,
  /** Seconds an allowed request may wait for the executor before it counts as expired. */
  queueTtlSeconds: 5 * 60,
  /** Pending-approval requests one agent may hold; beyond this new approval-bound requests get 429. */
  maxPendingPerAgent: 100,
  /** Most policies one decision will load; more than this fails closed. */
  maxPoliciesPerDecision: 500,
  /** How long a statement may wait for a lock before the operation fails closed, in milliseconds. */
  lockTimeoutMs: 3000,
  statementTimeoutMs: 8000,
} as const;

/** Human session rules (docs/BE-02-DECISIONS.md D2, D4). The MFA freshness window is enforced in the database. */
export const SESSION = {
  idleSeconds: 30 * 60,
  absoluteSeconds: 12 * 60 * 60,
  loginTransactionSeconds: 10 * 60,
  invitationSeconds: 7 * 24 * 60 * 60,
  cookieName: "axo_session",
  oidcCookieName: "axo_oidc",
} as const;

/** Data retention (docs/BE-02-DECISIONS.md D10). Placeholder defaults pending the owner's and counsel's decision. */
export const RETENTION = {
  parametersDaysAfterFinal: 30,
  stuckAttemptSeconds: 120,
} as const;

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

function keyRing(env: NodeJS.ProcessEnv): KeyRing {
  try {
    return parseKeyRing(env.AXO_DATA_KEYS, env.AXO_DATA_KEY_ID);
  } catch (error) {
    throw new ConfigError(error instanceof KeyError ? error.message : "invalid data keys");
  }
}

function listen(env: NodeJS.ProcessEnv, fallbackPort: number) {
  const port = Number(env.PORT ?? String(fallbackPort));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError("PORT is invalid");
  return {
    // Loopback by default: exposing a service is a deliberate deployment decision, not a default.
    host: env.HOST ?? "127.0.0.1",
    port,
    logLevel: env.LOG_LEVEL ?? "info",
  };
}

const isProduction = (env: NodeJS.ProcessEnv) => env.NODE_ENV === "production";

/** A development-only convenience that must never be on in production. */
function devSwitch(env: NodeJS.ProcessEnv, name: string, safeDefault: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === "") return safeDefault;
  if (raw !== "true" && raw !== "false") throw new ConfigError(`${name} must be true or false`);
  const value = raw === "true";
  if (value !== safeDefault && isProduction(env)) {
    throw new ConfigError(`${name} cannot be changed from its safe default in production`);
  }
  return value;
}

export interface AgentApiConfig {
  agentApiDatabaseUrl: string;
  pepper: Buffer;
  dataKeys: KeyRing;
  host: string;
  port: number;
  logLevel: string;
}

export function loadAgentApiConfig(env: NodeJS.ProcessEnv = process.env): AgentApiConfig {
  return {
    agentApiDatabaseUrl: required(env, "AXO_AGENT_API_DATABASE_URL"),
    pepper: parsePepper(env.AXO_CREDENTIAL_PEPPER),
    dataKeys: keyRing(env),
    ...listen(env, 8787),
  };
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Development only: allows an http:// issuer. */
  allowInsecure: boolean;
}

export interface ManagementConfig {
  managementDatabaseUrl: string;
  pepper: Buffer;
  dataKeys: KeyRing;
  oidc: OidcConfig;
  /** The one browser origin allowed to make state-changing requests (CSRF defence). */
  webOrigin: string;
  cookieSecure: boolean;
  /** Development only: treat every login as multi-factor. Refused in production. */
  mfaRequired: boolean;
  host: string;
  port: number;
  logLevel: string;
}

export function loadManagementConfig(env: NodeJS.ProcessEnv = process.env): ManagementConfig {
  const webOrigin = required(env, "AXO_WEB_ORIGIN");
  let origin: URL;
  try {
    origin = new URL(webOrigin);
  } catch {
    throw new ConfigError("AXO_WEB_ORIGIN is not a URL");
  }
  if (origin.origin !== webOrigin)
    throw new ConfigError("AXO_WEB_ORIGIN must be an origin (scheme, host, port), without a path");
  const allowInsecure = devSwitch(env, "AXO_OIDC_ALLOW_INSECURE", false);
  const issuer = required(env, "AXO_OIDC_ISSUER");
  if (!allowInsecure && !issuer.startsWith("https://"))
    throw new ConfigError("AXO_OIDC_ISSUER must be https");
  const cookieSecure = devSwitch(env, "AXO_COOKIE_SECURE", true);
  return {
    managementDatabaseUrl: required(env, "AXO_MANAGEMENT_DATABASE_URL"),
    pepper: parsePepper(env.AXO_CREDENTIAL_PEPPER),
    dataKeys: keyRing(env),
    oidc: {
      issuer,
      clientId: required(env, "AXO_OIDC_CLIENT_ID"),
      clientSecret: required(env, "AXO_OIDC_CLIENT_SECRET"),
      redirectUri: required(env, "AXO_OIDC_REDIRECT_URI"),
      allowInsecure,
    },
    webOrigin,
    cookieSecure,
    mfaRequired: devSwitch(env, "AXO_MFA_REQUIRED", true),
    ...listen(env, 8788),
  };
}

export interface ExecutorConfig {
  executorDatabaseUrl: string;
  dataKeys: KeyRing;
  executorId: string;
  /** The ONE destination this executor can reach, fixed by configuration (never by a request, policy or database row). */
  mockCrmBaseUrl: string;
  /** Held only by this process; no other service has it. */
  mockCrmToken: string;
  attemptTimeoutMs: number;
  pollIntervalMs: number;
  logLevel: string;
}

export function loadExecutorConfig(env: NodeJS.ProcessEnv = process.env): ExecutorConfig {
  const baseUrl = required(env, "AXO_MOCK_CRM_URL");
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ConfigError("AXO_MOCK_CRM_URL is not a URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new ConfigError("AXO_MOCK_CRM_URL must be http(s)");
  if (parsed.username !== "" || parsed.password !== "")
    throw new ConfigError("AXO_MOCK_CRM_URL must not contain credentials");
  const token = required(env, "AXO_MOCK_CRM_TOKEN");
  if (token.length < 32) throw new ConfigError("AXO_MOCK_CRM_TOKEN must be at least 32 characters");
  const attemptTimeoutMs = Number(env.AXO_EXECUTOR_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(attemptTimeoutMs) || attemptTimeoutMs < 500 || attemptTimeoutMs > 60_000) {
    throw new ConfigError("AXO_EXECUTOR_TIMEOUT_MS must be between 500 and 60000");
  }
  return {
    executorDatabaseUrl: required(env, "AXO_EXECUTOR_DATABASE_URL"),
    dataKeys: keyRing(env),
    executorId: env.AXO_EXECUTOR_ID ?? `executor-${String(process.pid)}`,
    mockCrmBaseUrl: parsed.origin,
    mockCrmToken: token,
    attemptTimeoutMs,
    pollIntervalMs: 1000,
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
