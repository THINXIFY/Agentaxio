import { createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parsePepper } from "../src/config";
import {
  bearerFromHeader,
  generateCredential,
  hashSecret,
  parseCredential,
  verifySecret,
} from "../src/credentials/keys";
import {
  issueCredential,
  registerAgent,
  revokeAgent,
  revokeCredential,
  rotateCredential,
  suspendAgent,
} from "../src/management";
import { createWorld, idem, leadBody, type World } from "./support/world";

const pepper = randomBytes(32);

describe("credential format and hashing", () => {
  it("generates 256-bit secrets with a public key id, all distinct", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = generateCredential(pepper);
      expect(c.fullKey).toMatch(/^axo_[0-9a-f]{24}_[A-Za-z0-9_-]{43}$/);
      expect(c.secretHash).toHaveLength(32);
      seen.add(c.fullKey);
      seen.add(c.keyId);
    }
    expect(seen.size).toBe(4000);
  });

  it("stores a digest that is neither the secret nor derivable without the pepper", () => {
    const c = generateCredential(pepper);
    const parsed = parseCredential(c.fullKey);
    expect(parsed).not.toBeNull();
    const secret = parsed?.secret ?? "";
    expect(c.secretHash.toString("utf8")).not.toContain(secret);
    expect(c.secretHash.equals(createHmac("sha256", pepper).update(secret).digest())).toBe(true);
    expect(hashSecret(randomBytes(32), secret).equals(c.secretHash)).toBe(false);
  });

  it("verifies the right secret and nothing else", () => {
    const c = generateCredential(pepper);
    const secret = parseCredential(c.fullKey)?.secret ?? "";
    expect(verifySecret(pepper, secret, c.secretHash)).toBe(true);
    expect(
      verifySecret(
        pepper,
        `${secret.slice(0, -1)}${secret.endsWith("A") ? "B" : "A"}`,
        c.secretHash,
      ),
    ).toBe(false);
    expect(verifySecret(randomBytes(32), secret, c.secretHash)).toBe(false);
    expect(verifySecret(pepper, secret, Buffer.alloc(31))).toBe(false);
    expect(verifySecret(pepper, "", c.secretHash)).toBe(false);
  });

  it("rejects every malformed credential before touching the database", () => {
    const good = generateCredential(pepper).fullKey;
    const secret = good.slice(-43);
    const bad = [
      "",
      "axo_",
      good.slice(0, -1),
      `${good}x`,
      good.toUpperCase(),
      good.replace("axo_", "axk_"),
      good.replace(/^axo_[0-9a-f]{24}/, "axo_" + "G".repeat(24)),
      `axo_${"a".repeat(23)}_${secret}`,
      `axo_${"a".repeat(25)}_${secret}`,
      ` ${good}`,
      `${good} `,
      `${good}\n`,
      `${good}\u0000`,
      good.replace("_", "-"),
      `${good}_extra`,
      "x".repeat(10_000),
    ];
    for (const b of bad) expect(parseCredential(b), JSON.stringify(b).slice(0, 60)).toBeNull();
  });

  it("accepts only an exact 'Bearer <key>' header", () => {
    const key = generateCredential(pepper).fullKey;
    expect(bearerFromHeader(`Bearer ${key}`)).toBe(key);
    for (const h of [
      undefined,
      "",
      key,
      `bearer ${key}`,
      `Bearer  ${key}`,
      `Bearer ${key} extra`,
      `Basic ${key}`,
      `Bearer`,
      `Bearer ${"x".repeat(500)}`,
    ]) {
      expect(bearerFromHeader(h), String(h).slice(0, 30)).toBeNull();
    }
  });
});

describe("configuration refuses to start unsafely", () => {
  it("rejects a missing, short, malformed or non-random pepper", () => {
    for (const bad of [
      undefined,
      "",
      "   ",
      "short",
      "not base64 !!",
      Buffer.alloc(16, 1).toString("base64url"),
      Buffer.alloc(32, 7).toString("base64url"),
      "A".repeat(64),
    ]) {
      expect(() => parsePepper(bad), String(bad)).toThrow(ConfigError);
    }
    expect(parsePepper(randomBytes(32).toString("base64url"))).toHaveLength(32);
    expect(parsePepper(randomBytes(48).toString("base64"))).toHaveLength(48);
  });

  it("requires both database URLs and a valid port", () => {
    const base = {
      AXO_AGENT_API_DATABASE_URL: "postgres://a",
      AXO_MANAGEMENT_DATABASE_URL: "postgres://m",
      AXO_CREDENTIAL_PEPPER: randomBytes(32).toString("base64url"),
    };
    expect(loadConfig(base).host).toBe("127.0.0.1");
    expect(() => loadConfig({ ...base, AXO_AGENT_API_DATABASE_URL: undefined })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ ...base, AXO_MANAGEMENT_DATABASE_URL: "" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, AXO_CREDENTIAL_PEPPER: undefined })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, PORT: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, PORT: "99999" })).toThrow(ConfigError);
  });
});

describe("credential lifecycle against the database", () => {
  let w: World;
  beforeAll(async () => {
    w = await createWorld();
  });
  afterAll(async () => {
    await w.close();
  });

  const pending = (agentId: string) =>
    `SELECT status FROM axo.action_requests WHERE agent_id = '${agentId}'`;

  it("S15 reveals a new key once: it is stored nowhere, in any table, in any form", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    await w.submit(agent.key);
    const secret = agent.key.slice(-43);
    const admin = await w.db.admin();
    const tables = await admin.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'axo' AND table_type = 'BASE TABLE'",
    );
    for (const { table_name: t } of tables.rows) {
      const dump = await admin.query(
        `SELECT string_agg(row_to_json(x)::text, E'\\n') AS j FROM axo.${t} x`,
      );
      const text: string = dump.rows[0].j ?? "";
      expect(text, `table ${t}`).not.toContain(secret);
      expect(text, `table ${t}`).not.toContain(agent.key);
    }
    const stored = await admin.query(
      "SELECT secret_hash FROM axo.agent_credentials WHERE id = $1",
      [agent.credentialId],
    );
    expect((stored.rows[0].secret_hash as Buffer).equals(hashSecret(w.pepper, secret))).toBe(true);
    // The audit trail records the public key id, which is a handle and not a secret.
    const audit = await admin.query(
      "SELECT metadata FROM axo.audit_events WHERE event_type = 'credential.issued' AND object_id = $1",
      [agent.credentialId],
    );
    expect(audit.rows[0].metadata.key_id).toBe(agent.keyId);
  });

  it("S01 treats every kind of bad credential identically, and writes nothing", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const admin = await w.db.admin();
    const before = await admin.query(
      "SELECT (SELECT count(*) FROM axo.audit_events) AS a, (SELECT count(*) FROM axo.action_requests) AS r",
    );
    const wrongSecret = `axo_${agent.keyId}_${randomBytes(32).toString("base64url")}`;
    const unknownKeyId = `axo_${randomBytes(12).toString("hex")}_${randomBytes(32).toString("base64url")}`;
    const attempts = [
      await w.submit(wrongSecret),
      await w.submit(unknownKeyId),
      await w.submit("garbage"),
      await w.submit(""),
    ];
    for (const a of attempts) expect(a).toEqual({ kind: "unauthenticated" });
    const after = await admin.query(
      "SELECT (SELECT count(*) FROM axo.audit_events) AS a, (SELECT count(*) FROM axo.action_requests) AS r",
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("S09 revocation is immediate at the gate, and a replay with a revoked key reveals nothing", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const key = idem();
    expect((await w.submit(agent.key, leadBody(), key)).kind).toBe("decided");
    await w.manage(w.orgA.admin, w.orgA, (c) =>
      revokeCredential(c, { credentialId: agent.credentialId }),
    );
    expect(await w.submit(agent.key, leadBody(), key)).toEqual({ kind: "unauthenticated" });
    expect(await w.submit(agent.key)).toEqual({ kind: "unauthenticated" });
  });

  it("rotation: the old key stops working, the new one works, and the old key's waiting requests are withdrawn", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "require_approval", agentId: agent.agentId });
    const waiting = await w.submit(agent.key);
    expect(waiting.kind === "decided" && waiting.status).toBe("pending_approval");
    const rotated = await w.manage(w.orgA.admin, w.orgA, (c) =>
      rotateCredential(c, w.pepper, { agentId: agent.agentId, credentialId: agent.credentialId }),
    );
    expect(rotated.cancelledRequests).toBe(1);
    expect(rotated.fullKey).not.toBe(agent.key);
    expect(await w.submit(agent.key)).toEqual({ kind: "unauthenticated" });
    const next = await w.submit(rotated.fullKey);
    expect(next.kind === "decided" && next.status).toBe("pending_approval");
    const admin = await w.db.admin();
    const old = await admin.query(
      "SELECT revoked_reason FROM axo.agent_credentials WHERE id = $1",
      [agent.credentialId],
    );
    expect(old.rows[0].revoked_reason).toBe("rotated");
    const statuses = await admin.query(pending(agent.agentId));
    expect(statuses.rows.map((r) => r.status).sort()).toEqual(["denied", "pending_approval"]);
    const decision = await admin.query(
      "SELECT reason_code, basis FROM axo.decisions d JOIN axo.action_requests r ON r.id = d.action_request_id WHERE r.id = $1 ORDER BY d.decided_at DESC LIMIT 1",
      [waiting.kind === "decided" ? waiting.id : ""],
    );
    expect(decision.rows[0]).toEqual({
      reason_code: "CREDENTIAL_REVOKED",
      basis: "credential_revoked",
    });
  });

  it("allows an overlap of two credentials during a manual rotation, but never three", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    const second = await w.manage(w.orgA.admin, w.orgA, (c) =>
      issueCredential(c, w.pepper, { agentId: agent.agentId }),
    );
    await expect(
      w.manage(w.orgA.admin, w.orgA, (c) =>
        issueCredential(c, w.pepper, { agentId: agent.agentId }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    expect((await w.submit(agent.key)).kind).toBe("decided");
    expect((await w.submit(second.fullKey)).kind).toBe("decided");
  });

  it("expires a credential at its expiry time", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.policy(w.orgA, { effect: "allow", agentId: agent.agentId });
    const short = await w.manage(w.orgA.admin, w.orgA, (c) =>
      issueCredential(c, w.pepper, {
        agentId: agent.agentId,
        expiresAt: new Date(Date.now() + 1500),
      }),
    );
    expect((await w.submit(short.fullKey)).kind).toBe("decided");
    await new Promise((r) => setTimeout(r, 1700));
    expect(await w.submit(short.fullKey)).toEqual({ kind: "unauthenticated" });
    await expect(
      w.manage(w.orgA.admin, w.orgA, (c) =>
        issueCredential(c, w.pepper, {
          agentId: agent.agentId,
          expiresAt: new Date(Date.now() - 1000),
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("tells a suspended agent it is suspended only after it proved it holds a valid key", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    await w.manage(w.orgA.admin, w.orgA, (c) => suspendAgent(c, { agentId: agent.agentId }));
    expect(await w.submit(agent.key)).toEqual({ kind: "agent_suspended" });
    const guess = `axo_${agent.keyId}_${randomBytes(32).toString("base64url")}`;
    expect(await w.submit(guess)).toEqual({ kind: "unauthenticated" });
  });

  it("a revoked agent's keys are all revoked at once", async () => {
    const agent = await w.newAgent(w.orgA, w.orgA.dev);
    const second = await w.manage(w.orgA.admin, w.orgA, (c) =>
      issueCredential(c, w.pepper, { agentId: agent.agentId }),
    );
    const result = await w.manage(w.orgA.admin, w.orgA, (c) =>
      revokeAgent(c, { agentId: agent.agentId }),
    );
    expect(result.revokedCredentials).toBe(2);
    expect(await w.submit(agent.key)).toEqual({ kind: "unauthenticated" });
    expect(await w.submit(second.fullKey)).toEqual({ kind: "unauthenticated" });
    await expect(
      w.manage(w.orgA.admin, w.orgA, (c) =>
        issueCredential(c, w.pepper, { agentId: agent.agentId }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("registers no agent for an owner who is not a member, or in an environment of another organization", async () => {
    await expect(
      w.manage(w.orgA.admin, w.orgA, (c) =>
        registerAgent(c, { environmentId: w.orgA.dev, ownerUserId: w.outsider, name: "ghost" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      w.manage(w.orgA.admin, w.orgA, (c) =>
        registerAgent(c, { environmentId: w.orgB.dev, ownerUserId: w.orgA.owner, name: "stray" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a key issued in one organization never acts in another", async () => {
    const orgA = await w.freshOrg();
    const a = await w.newAgent(orgA, orgA.dev);
    await w.policy(orgA, { effect: "allow", agentId: a.agentId });
    await w.policy(w.orgB, { effect: "deny" });
    const out = await w.submit(a.key);
    expect(out.kind === "decided" && out.status).toBe("queued_execution");
    const admin = await w.db.admin();
    const rows = await admin.query(
      "SELECT DISTINCT organization_id FROM axo.action_requests WHERE agent_id = $1",
      [a.agentId],
    );
    expect(rows.rows.map((r) => r.organization_id)).toEqual([orgA.id]);
  });
});
