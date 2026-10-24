import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  loadAgentApiConfig,
  loadExecutorConfig,
  loadManagementConfig,
} from "../src/config";
import {
  KeyError,
  decryptJson,
  encryptJson,
  parametersAad,
  parseKeyRing,
} from "../src/crypto/data-keys";

const key = () => randomBytes(32).toString("base64url");
const keys = () => JSON.stringify({ k1: key() });

const agentBase = () => ({
  AXO_AGENT_API_DATABASE_URL: "postgres://a",
  AXO_CREDENTIAL_PEPPER: key(),
  AXO_DATA_KEYS: keys(),
  AXO_DATA_KEY_ID: "k1",
});
const managementBase = () => ({
  AXO_MANAGEMENT_DATABASE_URL: "postgres://m",
  AXO_CREDENTIAL_PEPPER: key(),
  AXO_DATA_KEYS: keys(),
  AXO_DATA_KEY_ID: "k1",
  AXO_WEB_ORIGIN: "https://app.example.test",
  AXO_OIDC_ISSUER: "https://idp.example.test",
  AXO_OIDC_CLIENT_ID: "client",
  AXO_OIDC_CLIENT_SECRET: "secret",
  AXO_OIDC_REDIRECT_URI: "https://app.example.test/api/auth/callback",
});
const executorBase = () => ({
  AXO_EXECUTOR_DATABASE_URL: "postgres://e",
  AXO_DATA_KEYS: keys(),
  AXO_DATA_KEY_ID: "k1",
  AXO_MOCK_CRM_URL: "http://127.0.0.1:8790",
  AXO_MOCK_CRM_TOKEN: key(),
});

describe("each service refuses to start without a complete, safe configuration", () => {
  it("agent API: database, pepper, data keys, valid port, loopback by default", () => {
    expect(loadAgentApiConfig(agentBase()).host).toBe("127.0.0.1");
    for (const missing of [
      "AXO_AGENT_API_DATABASE_URL",
      "AXO_CREDENTIAL_PEPPER",
      "AXO_DATA_KEYS",
      "AXO_DATA_KEY_ID",
    ]) {
      expect(() => loadAgentApiConfig({ ...agentBase(), [missing]: undefined }), missing).toThrow(
        ConfigError,
      );
    }
    for (const port of ["0", "99999", "abc", "1.5"]) {
      expect(() => loadAgentApiConfig({ ...agentBase(), PORT: port }), port).toThrow(ConfigError);
    }
  });

  it("management API: needs the identity provider, a clean web origin and https unless explicitly relaxed", () => {
    const ok = loadManagementConfig(managementBase());
    expect(ok.cookieSecure).toBe(true);
    expect(ok.mfaRequired).toBe(true);
    for (const missing of [
      "AXO_OIDC_ISSUER",
      "AXO_OIDC_CLIENT_ID",
      "AXO_OIDC_CLIENT_SECRET",
      "AXO_OIDC_REDIRECT_URI",
      "AXO_WEB_ORIGIN",
      "AXO_MANAGEMENT_DATABASE_URL",
    ]) {
      expect(
        () => loadManagementConfig({ ...managementBase(), [missing]: undefined }),
        missing,
      ).toThrow(ConfigError);
    }
    expect(() =>
      loadManagementConfig({ ...managementBase(), AXO_OIDC_ISSUER: "http://idp.example.test" }),
    ).toThrow(/https/);
    expect(() =>
      loadManagementConfig({
        ...managementBase(),
        AXO_WEB_ORIGIN: "https://app.example.test/path",
      }),
    ).toThrow(/origin/);
    expect(() =>
      loadManagementConfig({ ...managementBase(), AXO_WEB_ORIGIN: "not a url" }),
    ).toThrow(ConfigError);
  });

  it("development conveniences work outside production and are refused in production", () => {
    const dev = {
      ...managementBase(),
      AXO_OIDC_ISSUER: "http://127.0.0.1:9000",
      AXO_OIDC_ALLOW_INSECURE: "true",
      AXO_COOKIE_SECURE: "false",
      AXO_MFA_REQUIRED: "false",
    };
    const loaded = loadManagementConfig(dev);
    expect(loaded).toMatchObject({ cookieSecure: false, mfaRequired: false });
    expect(loaded.oidc.allowInsecure).toBe(true);
    for (const name of ["AXO_OIDC_ALLOW_INSECURE", "AXO_COOKIE_SECURE", "AXO_MFA_REQUIRED"]) {
      expect(() => loadManagementConfig({ ...dev, NODE_ENV: "production" }), name).toThrow(
        /production/,
      );
    }
    expect(() => loadManagementConfig({ ...dev, AXO_MFA_REQUIRED: "maybe" })).toThrow(ConfigError);
  });

  it("executor: a fixed destination, a long service token and a bounded timeout", () => {
    expect(loadExecutorConfig(executorBase())).toMatchObject({
      mockCrmBaseUrl: "http://127.0.0.1:8790",
      attemptTimeoutMs: 10_000,
    });
    for (const missing of [
      "AXO_EXECUTOR_DATABASE_URL",
      "AXO_MOCK_CRM_URL",
      "AXO_MOCK_CRM_TOKEN",
      "AXO_DATA_KEYS",
    ]) {
      expect(
        () => loadExecutorConfig({ ...executorBase(), [missing]: undefined }),
        missing,
      ).toThrow(ConfigError);
    }
    expect(() => loadExecutorConfig({ ...executorBase(), AXO_MOCK_CRM_TOKEN: "short" })).toThrow(
      ConfigError,
    );
    expect(() =>
      loadExecutorConfig({ ...executorBase(), AXO_MOCK_CRM_URL: "file:///etc/passwd" }),
    ).toThrow(ConfigError);
    expect(() =>
      loadExecutorConfig({ ...executorBase(), AXO_MOCK_CRM_URL: "http://user:pw@127.0.0.1:1" }),
    ).toThrow(ConfigError);
    expect(() => loadExecutorConfig({ ...executorBase(), AXO_EXECUTOR_TIMEOUT_MS: "100" })).toThrow(
      ConfigError,
    );
    expect(() =>
      loadExecutorConfig({ ...executorBase(), AXO_EXECUTOR_TIMEOUT_MS: "999999" }),
    ).toThrow(ConfigError);
  });

  it("the executor can reach only the origin it is configured with, never a path or credentials from the URL", () => {
    expect(
      loadExecutorConfig({
        ...executorBase(),
        AXO_MOCK_CRM_URL: "http://127.0.0.1:8790/some/path?x=1",
      }).mockCrmBaseUrl,
    ).toBe("http://127.0.0.1:8790");
  });
});

describe("envelope encryption of sensitive data", () => {
  const ring = parseKeyRing(JSON.stringify({ k1: key(), k2: key() }), "k1");
  const aad = parametersAad("org-1", "req-1", "a".repeat(64));

  it("round-trips, with a fresh nonce each time", () => {
    const value = { full_name: "Ada Example", email: "ada@example.test" };
    const a = encryptJson(ring, value, aad);
    const b = encryptJson(ring, value, aad);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(decryptJson(ring, a.ciphertext, a.keyId, aad)).toEqual(value);
    expect(a.ciphertext.toString("utf8")).not.toContain("Ada");
  });

  it("refuses a ciphertext moved to another row, tenant or digest", () => {
    const sealed = encryptJson(ring, { a: "b" }, aad);
    for (const other of [
      parametersAad("org-2", "req-1", "a".repeat(64)),
      parametersAad("org-1", "req-2", "a".repeat(64)),
      parametersAad("org-1", "req-1", "b".repeat(64)),
    ]) {
      expect(() => decryptJson(ring, sealed.ciphertext, sealed.keyId, other)).toThrow(KeyError);
    }
  });

  it("detects any tampering, truncation, wrong key or wrong version, and never returns partial data", () => {
    const sealed = encryptJson(ring, { a: "b" }, aad);
    for (let i = 0; i < sealed.ciphertext.length; i++) {
      const copy = Buffer.from(sealed.ciphertext);
      copy[i] = (copy[i] ?? 0) ^ 0x01;
      expect(() => decryptJson(ring, copy, sealed.keyId, aad), `byte ${String(i)}`).toThrow(
        KeyError,
      );
    }
    expect(() => decryptJson(ring, sealed.ciphertext.subarray(0, 20), sealed.keyId, aad)).toThrow(
      KeyError,
    );
    expect(() => decryptJson(ring, sealed.ciphertext, "k2", aad)).toThrow(KeyError);
    expect(() => decryptJson(ring, sealed.ciphertext, "nope", aad)).toThrow(KeyError);
    expect(() => decryptJson(ring, Buffer.alloc(0), "k1", aad)).toThrow(KeyError);
  });

  it("supports rotation: old keys decrypt, only the current key encrypts", () => {
    const oldRing = parseKeyRing(JSON.stringify({ k1: key() }), "k1");
    const sealed = encryptJson(oldRing, { n: 1 }, aad);
    const rotated = parseKeyRing(
      JSON.stringify({
        k1: Buffer.from(oldRing.keys.get("k1") ?? []).toString("base64url"),
        k2: key(),
      }),
      "k2",
    );
    expect(decryptJson(rotated, sealed.ciphertext, "k1", aad)).toEqual({ n: 1 });
    expect(encryptJson(rotated, { n: 2 }, aad).keyId).toBe("k2");
  });

  it("rejects a malformed or weak key ring", () => {
    for (const [keysJson, id] of [
      [undefined, "k1"],
      ["", "k1"],
      ["not json", "k1"],
      ["[]", "k1"],
      [JSON.stringify({ k1: "short" }), "k1"],
      [JSON.stringify({ k1: Buffer.alloc(32, 9).toString("base64url") }), "k1"],
      [JSON.stringify({ k1: key() }), "k2"],
      [JSON.stringify({ k1: key() }), undefined],
      [JSON.stringify({ "BAD ID": key() }), "BAD ID"],
      [JSON.stringify({ k1: 5 }), "k1"],
    ] as const) {
      expect(() => parseKeyRing(keysJson, id), String(keysJson)).toThrow(KeyError);
    }
  });
});
