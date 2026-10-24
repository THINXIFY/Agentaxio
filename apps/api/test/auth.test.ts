import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../src/auth/tokens";
import { isMultiFactor } from "../src/auth/oidc";
import { safeReturnTo } from "../src/auth/login";
import {
  Browser,
  COOKIE,
  WEB_ORIGIN,
  createHumanWorld,
  newUser,
  type HumanWorld,
} from "./support/human";
import type { Misbehavior } from "./support/idp";

/**
 * Human authentication: the OpenID Connect login flow, sessions, CSRF, step-up, and the ways each of them can be
 * attacked. The relying-party code is the real code; the provider is a local test double that can misbehave.
 */

let h: HumanWorld;
beforeAll(async () => {
  h = await createHumanWorld();
  newUser(h, "alice");
  newUser(h, "bob");
  newUser(h, "plain", { amr: ["pwd"] }); // password only: no multi-factor
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  h.idp.misbehavior = "none";
  h.idp.honourMaxAge = true;
  h.idp.authorizations.length = 0;
});

const ip = () =>
  `10.7.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}`;

/** Start a login and return the URL the provider would send the browser back to, without finishing it. */
async function startAndAuthorize(browser: Browser, userKey: string, query = "") {
  h.idp.signInAs = userKey;
  const start = await browser.get(`/auth/login${query}`, { remoteAddress: ip() });
  const toIdp = await fetch(String(start.headers.location), { redirect: "manual" });
  return { start, callback: new URL(toIdp.headers.get("location") ?? "") };
}

describe("the login flow", () => {
  it("sends the browser to the provider with PKCE (S256), state and nonce, and binds the attempt to that browser", async () => {
    const browser = h.browser();
    h.idp.signInAs = "alice";
    const start = await browser.get("/auth/login?return_to=/dashboard/approvals", {
      remoteAddress: ip(),
    });
    expect(start.status).toBe(302);
    const location = new URL(String(start.headers.location));
    expect(location.origin).toBe(h.idp.url);
    for (const name of ["state", "nonce", "code_challenge"])
      expect(location.searchParams.get(name), name).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("redirect_uri")).toBe(h.idp.redirectUri);
    expect(location.searchParams.get("scope")).toContain("openid");
    // The browser-binding cookie is HttpOnly and short-lived; the verifier never appears in the URL.
    const binding = String(
      ([] as string[])
        .concat(start.headers["set-cookie"] as string[])
        .find((c) => c.startsWith(`${COOKIE.oidc}=`)),
    );
    expect(binding).toMatch(/HttpOnly/);
    expect(binding).toMatch(/SameSite=Lax/);
    expect(location.toString()).not.toMatch(/code_verifier/);
  });

  it("signs a new person in, creating their account at first sight, and opens a session with safe cookies", async () => {
    const browser = await h.signIn("alice", { returnTo: "/dashboard/approvals" });
    expect(browser.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(browser.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(browser.jar.has(COOKIE.oidc)).toBe(false);
    const me = await browser.get("/v1/me");
    expect(me.status).toBe(200);
    const body = me.json<{
      email: string;
      emailVerified: boolean;
      mfaFresh: boolean;
      memberships: unknown[];
    }>();
    expect(body).toMatchObject({ emailVerified: true, mfaFresh: true, memberships: [] });
    expect(body.email).toBe(h.idp.users.get("alice")?.email);
    expect(JSON.stringify(body)).not.toMatch(/token|session|csrf|secret/i);
  });

  it("sets the session cookie HttpOnly, SameSite=Lax and path-wide, and the CSRF cookie readable but SameSite=Strict", async () => {
    h.idp.signInAs = "alice";
    const browser = h.browser();
    const start = await browser.get("/auth/login", { remoteAddress: ip() });
    const callback = new URL(
      String(
        (await fetch(String(start.headers.location), { redirect: "manual" })).headers.get(
          "location",
        ),
      ),
    );
    const finished = await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
    const cookies = ([] as string[]).concat(finished.headers["set-cookie"] as string[]);
    const session = String(cookies.find((c) => c.startsWith(`${COOKIE.session}=`)));
    const csrf = String(cookies.find((c) => c.startsWith(`${COOKIE.csrf}=`)));
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).toMatch(/Path=\//);
    expect(session).toMatch(/Max-Age=43200/);
    expect(csrf).not.toMatch(/HttpOnly/);
    expect(csrf).toMatch(/SameSite=Strict/);
    expect(finished.headers.location).toBe(`${WEB_ORIGIN}/dashboard`);
  });

  it("stores only a hash of the session token and never the token itself", async () => {
    const browser = await h.signIn("alice");
    const admin = await h.world.db.admin();
    const rows = await admin.query("SELECT token_hash, csrf_hash FROM axo.sessions");
    const hashes = rows.rows.map((r) => (r.token_hash as Buffer).toString("hex"));
    expect(hashes).toContain(hashToken(browser.sessionToken ?? "").toString("hex"));
    const dump = await admin.query(
      "SELECT string_agg(row_to_json(s)::text, ' ') AS j FROM axo.sessions s",
    );
    expect(String(dump.rows[0].j)).not.toContain(browser.sessionToken);
    expect(String(dump.rows[0].j)).not.toContain(browser.csrf);
  });

  it("only ever redirects to a dashboard path (no open redirect)", async () => {
    for (const bad of [
      "//evil.test/x",
      "https://evil.test",
      "/\\evil.test",
      "/dashboard//x",
      "javascript:alert(1)",
      "/admin",
      "",
      "/dashboard/../etc",
      "/dashboard?next=//evil.test",
    ]) {
      expect(safeReturnTo(bad), bad).toBe("/dashboard");
    }
    expect(safeReturnTo("/dashboard/approvals")).toBe("/dashboard/approvals");
    const browser = h.browser();
    h.idp.signInAs = "alice";
    const start = await browser.get(`/auth/login?return_to=${encodeURIComponent("//evil.test")}`, {
      remoteAddress: ip(),
    });
    const callback = new URL(
      String(
        (await fetch(String(start.headers.location), { redirect: "manual" })).headers.get(
          "location",
        ),
      ),
    );
    const finished = await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
    expect(finished.headers.location).toBe(`${WEB_ORIGIN}/dashboard`);
  });
});

describe("attacks on the callback", () => {
  const failed = (res: { status: number; headers: Record<string, unknown> }) => {
    expect(res.status).toBe(302);
    expect(String(res.headers.location)).toMatch(/\/dashboard\?auth_error=(failed|denied|reauth)$/);
  };

  it("refuses an unknown or forged state, and sets no session", async () => {
    const browser = h.browser();
    await browser.get("/auth/login", { remoteAddress: ip() }); // gets a binding cookie, ignored below
    const res = await browser.get(
      "/auth/callback?code=whatever&state=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      { remoteAddress: ip() },
    );
    failed(res);
    expect(browser.sessionToken).toBeUndefined();
  });

  it("refuses a callback replayed after it already succeeded (the state is single use)", async () => {
    const browser = h.browser();
    const { callback } = await startAndAuthorize(browser, "alice");
    const first = await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
    expect(String(first.headers.location)).toBe(`${WEB_ORIGIN}/dashboard`);
    const again = await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
    failed(again);
  });

  it("refuses a callback completed in a different browser than the one that started it (login CSRF)", async () => {
    const victim = h.browser();
    const { callback } = await startAndAuthorize(victim, "alice");
    // The attacker lures the victim into opening a link that finishes the ATTACKER's flow in the victim's browser: the
    // victim's browser has no matching binding cookie for it.
    const attackerFlow = h.browser();
    const attacker = await startAndAuthorize(attackerFlow, "bob");
    const stranger = h.browser();
    const res = await stranger.get(`/auth/callback${attacker.callback.search}`, {
      remoteAddress: ip(),
    });
    failed(res);
    expect(stranger.sessionToken).toBeUndefined();
    // The same link in the right browser still works once; the victim's own flow is unaffected.
    const ok = await victim.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
    expect(String(ok.headers.location)).toBe(`${WEB_ORIGIN}/dashboard`);
  });

  it("refuses a callback with a wrong binding cookie value", async () => {
    const browser = h.browser();
    const { callback } = await startAndAuthorize(browser, "alice");
    browser.jar.set(COOKIE.oidc, "A".repeat(43));
    failed(await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() }));
    expect(browser.sessionToken).toBeUndefined();
  });

  it("refuses an expired login attempt", async () => {
    const browser = h.browser();
    const { callback } = await startAndAuthorize(browser, "alice");
    const admin = await h.world.db.admin();
    await admin.query(
      "UPDATE axo.oidc_transactions SET expires_at = now() - interval '1 second' WHERE consumed_at IS NULL",
    );
    failed(await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() }));
  });

  it("reports a provider-side denial without creating anything", async () => {
    const res = await h
      .browser()
      .get("/auth/callback?error=access_denied&state=x", { remoteAddress: ip() });
    expect(String(res.headers.location)).toMatch(/auth_error=denied$/);
  });

  const forged: Misbehavior[] = [
    "wrongAudience",
    "wrongIssuer",
    "expired",
    "wrongNonce",
    "badSignature",
    "noSubject",
    "hs256",
    "algNone",
  ];
  for (const misbehavior of forged) {
    it(`refuses an ID token that is ${misbehavior}, and creates neither a user nor a session`, async () => {
      newUser(h, `victim-${misbehavior}`);
      h.idp.misbehavior = misbehavior;
      const browser = h.browser();
      const { callback } = await startAndAuthorize(browser, `victim-${misbehavior}`);
      const res = await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
      failed(res);
      expect(browser.sessionToken).toBeUndefined();
      const admin = await h.world.db.admin();
      const created = await admin.query("SELECT 1 FROM axo.users WHERE auth_subject = $1", [
        h.idp.users.get(`victim-${misbehavior}`)?.sub,
      ]);
      expect(created.rowCount).toBe(0);
    });
  }

  it("refuses an authorization code that was already redeemed", async () => {
    const browser = h.browser();
    const { callback } = await startAndAuthorize(browser, "alice");
    const code = callback.searchParams.get("code") ?? "";
    await fetch(`${h.idp.url}/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${h.idp.clientId}:${h.idp.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: h.idp.redirectUri,
        code_verifier: "x".repeat(50),
      }),
    });
    failed(await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() }));
  });

  it("never puts the authorization code, state or any token in the logs", async () => {
    h.logs.length = 0;
    const browser = h.browser();
    const { callback } = await startAndAuthorize(browser, "alice");
    await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
    const logs = h.logs.join("\n");
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of [
      callback.searchParams.get("code"),
      callback.searchParams.get("state"),
      browser.sessionToken,
      browser.csrf,
    ]) {
      expect(logs).not.toContain(secret);
    }
  });
});

describe("multi-factor authentication and step-up", () => {
  it("recognizes multi-factor only when the provider says so or reports two kinds of factor", () => {
    expect(isMultiFactor(["mfa"])).toBe(true);
    expect(isMultiFactor(["pwd", "otp"])).toBe(true);
    expect(isMultiFactor(["pwd", "hwk"])).toBe(true);
    expect(isMultiFactor(["otp", "fpt"])).toBe(true);
    expect(isMultiFactor(["pwd"])).toBe(false);
    expect(isMultiFactor(["pwd", "pin"])).toBe(false); // two things known is still one kind
    expect(isMultiFactor(["otp", "hwk"])).toBe(false); // two things held is still one kind
    expect(isMultiFactor([])).toBe(false);
    expect(isMultiFactor(["nonsense"])).toBe(false);
  });

  it("records a password-only login as not multi-factor, and the API then asks for step-up", async () => {
    const browser = await h.signIn("plain");
    const me = (await browser.get("/v1/me")).json<{ mfaFresh: boolean }>();
    expect(me.mfaFresh).toBe(false);
    const create = await browser.post("/v1/organizations", {
      name: "Plain Org",
      slug: "plain-org",
    });
    expect(create.status).toBe(403);
    expect(create.json<{ error: { code: string } }>().error.code).toBe("STEP_UP_REQUIRED");
  });

  it("step-up asks the provider to authenticate again now (prompt=login, max_age=0)", async () => {
    await h.signIn("alice", { stepUp: true });
    const last = h.idp.authorizations.at(-1)?.query;
    expect(last).toMatchObject({ prompt: "login", max_age: "0" });
  });

  it("does not trust a provider that ignores a step-up request and returns an old authentication", async () => {
    h.idp.honourMaxAge = false;
    const browser = h.browser();
    const { callback } = await startAndAuthorize(browser, "alice", "?step_up=1");
    const res = await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
    expect(String(res.headers.location)).toMatch(/auth_error=reauth$/);
    expect(browser.sessionToken).toBeUndefined();
  });

  it("treats a login that is not recent as not multi-factor-fresh once 15 minutes have passed", async () => {
    const browser = await h.signIn("alice");
    expect((await browser.get("/v1/me")).json<{ mfaFresh: boolean }>().mfaFresh).toBe(true);
    const admin = await h.world.db.admin();
    await admin.query(
      "UPDATE axo.sessions SET mfa_verified_at = now() - interval '16 minutes' WHERE token_hash = $1",
      [hashToken(browser.sessionToken ?? "")],
    );
    expect((await browser.get("/v1/me")).json<{ mfaFresh: boolean }>().mfaFresh).toBe(false);
  });

  it("rejects an authentication time in the future", async () => {
    h.idp.misbehavior = "futureAuthTime";
    const browser = h.browser();
    const { callback } = await startAndAuthorize(browser, "alice");
    failed2(await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() }));
  });
});

function failed2(res: { status: number; headers: Record<string, unknown> }) {
  expect(res.status).toBe(302);
  expect(String(res.headers.location)).toMatch(/auth_error=/);
}

describe("sessions", () => {
  it("issues a brand-new session at every login, so a planted cookie value is never adopted (no fixation)", async () => {
    const browser = h.browser();
    const planted = "P".repeat(43);
    browser.jar.set(COOKIE.session, planted);
    const { callback } = await startAndAuthorize(browser, "alice");
    await browser.get(`/auth/callback${callback.search}`, { remoteAddress: ip() });
    expect(browser.sessionToken).not.toBe(planted);
    const fixated = h.browser();
    fixated.jar.set(COOKIE.session, planted);
    expect((await fixated.get("/v1/me")).status).toBe(401);
  });

  it("revokes the previous session when the same browser logs in again", async () => {
    const browser = await h.signIn("alice");
    const first = browser.sessionToken;
    await h.signIn("alice", { browser });
    expect(browser.sessionToken).not.toBe(first);
    const old = h.browser();
    old.jar.set(COOKIE.session, first ?? "");
    expect((await old.get("/v1/me")).status).toBe(401);
  });

  it("logs out on the server: the cookie is cleared and the old token stops working", async () => {
    const browser = await h.signIn("alice");
    const token = browser.sessionToken ?? "";
    const csrf = browser.csrf ?? "";
    const res = await browser.post("/auth/logout");
    expect(res.status).toBe(204);
    expect(browser.sessionToken).toBeUndefined();
    const replay = h.browser();
    replay.jar.set(COOKIE.session, token);
    replay.jar.set(COOKIE.csrf, csrf);
    expect((await replay.get("/v1/me")).status).toBe(401);
    expect((await replay.post("/v1/organizations", { name: "x", slug: "xxx" })).status).toBe(401);
  });

  it("cannot be logged out by another site (logout needs the origin and the CSRF token)", async () => {
    const browser = await h.signIn("alice");
    expect(
      (await browser.post("/auth/logout", undefined, { origin: "https://evil.test" })).status,
    ).toBe(403);
    expect((await browser.post("/auth/logout", undefined, { csrf: false })).status).toBe(403);
    expect((await browser.post("/auth/logout", undefined, { csrf: "A".repeat(43) })).status).toBe(
      403,
    );
    expect((await browser.get("/v1/me")).status).toBe(200);
  });

  it("expires after 30 idle minutes and after 12 hours, and a revoked session stops working at once", async () => {
    const admin = await h.world.db.admin();
    const idle = await h.signIn("alice");
    await admin.query(
      "UPDATE axo.sessions SET idle_expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [hashToken(idle.sessionToken ?? "")],
    );
    expect((await idle.get("/v1/me")).status).toBe(401);
    const old = await h.signIn("alice");
    await admin.query(
      "UPDATE axo.sessions SET created_at = now() - interval '13 hours', absolute_expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [hashToken(old.sessionToken ?? "")],
    );
    expect((await old.get("/v1/me")).status).toBe(401);
    const revoked = await h.signIn("alice");
    await admin.query("UPDATE axo.sessions SET revoked_at = now() WHERE token_hash = $1", [
      hashToken(revoked.sessionToken ?? ""),
    ]);
    expect((await revoked.get("/v1/me")).status).toBe(401);
  });

  it("stops a disabled account immediately, even with a valid session", async () => {
    const browser = await h.signIn("bob");
    const admin = await h.world.db.admin();
    await admin.query("UPDATE axo.users SET disabled_at = now() WHERE auth_subject = $1", [
      h.idp.users.get("bob")?.sub,
    ]);
    expect((await browser.get("/v1/me")).status).toBe(401);
    // And they cannot log in again.
    const again = h.browser();
    const { callback } = await startAndAuthorize(again, "bob");
    failed2(await again.get(`/auth/callback${callback.search}`, { remoteAddress: ip() }));
    await admin.query("UPDATE axo.users SET disabled_at = NULL WHERE auth_subject = $1", [
      h.idp.users.get("bob")?.sub,
    ]);
  });

  it("keeps at most ten live sessions per person", async () => {
    newUser(h, "busy");
    for (let i = 0; i < 12; i++) await h.signIn("busy");
    const admin = await h.world.db.admin();
    const live = await admin.query(
      "SELECT count(*)::int AS n FROM axo.sessions s JOIN axo.users u ON u.id = s.user_id WHERE u.auth_subject = $1 AND s.revoked_at IS NULL",
      [h.idp.users.get("busy")?.sub],
    );
    expect(live.rows[0].n).toBe(10);
  });

  it("slides the idle timer but never beyond the absolute lifetime", async () => {
    const browser = await h.signIn("alice");
    const admin = await h.world.db.admin();
    const hash = hashToken(browser.sessionToken ?? "");
    await admin.query(
      "UPDATE axo.sessions SET last_seen_at = now() - interval '2 minutes', idle_expires_at = now() + interval '1 minute' WHERE token_hash = $1",
      [hash],
    );
    await browser.get("/v1/me");
    const row = await admin.query(
      "SELECT idle_expires_at <= absolute_expires_at AS ok, idle_expires_at > now() + interval '20 minutes' AS slid FROM axo.sessions WHERE token_hash = $1",
      [hash],
    );
    expect(row.rows[0]).toEqual({ ok: true, slid: true });
  });

  it("rejects cookies that are malformed, oversized or tampered with", async () => {
    const browser = await h.signIn("alice");
    const good = browser.sessionToken ?? "";
    for (const raw of [
      `${COOKIE.session}=`,
      `${COOKIE.session}=short`,
      `${COOKIE.session}=${good.slice(0, -1)}`,
      `${COOKIE.session}=${good}x`,
      `${COOKIE.session}=${"A".repeat(5000)}`,
      `${COOKIE.session}=${good.replace(/.$/, good.endsWith("A") ? "B" : "A")}`,
      `;;;${COOKIE.session}`,
    ]) {
      expect((await h.browser().get("/v1/me", { rawCookie: raw })).status, raw.slice(0, 40)).toBe(
        401,
      );
    }
  });

  it("uses the FIRST of duplicate session cookies, so a sibling site cannot override a real one", async () => {
    const browser = await h.signIn("alice");
    const good = browser.sessionToken ?? "";
    const res = await h.browser().get("/v1/me", {
      rawCookie: `${COOKIE.session}=${good}; ${COOKIE.session}=${"Z".repeat(43)}`,
    });
    expect(res.status).toBe(200);
  });

  it("never trusts an identity supplied by the client", async () => {
    const alice = await h.signIn("alice");
    const bobId = await h.userId("bob");
    const aliceMe = (await alice.get("/v1/me")).json<{ userId: string }>();
    const forged = await alice.get(`/v1/me?user_id=${bobId}&userId=${bobId}`, {
      headers: { "x-user-id": bobId, "x-forwarded-user": bobId, authorization: `Bearer ${bobId}` },
    });
    expect(forged.json<{ userId: string }>().userId).toBe(aliceMe.userId);
    expect(aliceMe.userId).not.toBe(bobId);
  });
});

describe("CSRF and request origin", () => {
  it("rejects every state-changing request without the right Origin, or without the session's CSRF token", async () => {
    const browser = await h.signIn("alice");
    const targets = [
      "/v1/organizations",
      "/v1/invitations/accept",
      `/v1/orgs/${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}/agents`,
    ];
    for (const url of targets) {
      expect((await browser.post(url, {}, { origin: false })).status, `${url} no origin`).toBe(403);
      expect(
        (await browser.post(url, {}, { origin: "https://evil.test" })).status,
        `${url} foreign origin`,
      ).toBe(403);
      expect(
        (await browser.post(url, {}, { origin: `${WEB_ORIGIN}.evil.test` })).status,
        `${url} lookalike origin`,
      ).toBe(403);
      expect((await browser.post(url, {}, { csrf: false })).status, `${url} no csrf`).toBe(403);
      expect(
        (await browser.post(url, {}, { csrf: "B".repeat(43) })).status,
        `${url} wrong csrf`,
      ).toBe(403);
    }
  });

  it("does not accept another session's CSRF token", async () => {
    const a = await h.signIn("alice");
    const b = await h.signIn("alice");
    expect(
      (await a.post("/v1/organizations", { name: "x", slug: "xxx" }, { csrf: b.csrf ?? "" }))
        .status,
    ).toBe(403);
  });

  it("never lets a GET change state: every mutating route is a POST, and no GET route is mutating", () => {
    const routes = h.app.humanRoutes;
    expect(routes.length).toBeGreaterThan(30);
    for (const r of routes) {
      if (r.method === "GET") expect(r.mutating, `${r.method} ${r.url}`).toBe(false);
      else expect(r.mutating, `${r.method} ${r.url}`).toBe(true);
    }
  });

  it("every route declares an auth class", () => {
    for (const r of h.app.humanRoutes) expect(r.auth, `${r.method} ${r.url}`).toBeDefined();
    const byClass = (c: string) => h.app.humanRoutes.filter((r) => r.auth === c).length;
    expect(byClass("login")).toBe(2);
    expect(byClass("organization")).toBeGreaterThan(25);
  });

  it("answers JSON-only, with no-store and a locked-down content security policy", async () => {
    const res = await h.browser().get("/v1/me");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    const wrongType = await h.signIn("alice").then((b) =>
      b.request("POST", "/v1/organizations", {
        origin: WEB_ORIGIN,
        headers: { "content-type": "text/plain" },
      }),
    );
    expect([403, 415, 422]).toContain(wrongType.status);
  });
});
