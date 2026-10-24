import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";

/**
 * A local OpenID Connect provider for tests. It speaks the real protocol (discovery, JWKS, authorization endpoint,
 * PKCE-checked token endpoint with client authentication, signed ID tokens) so the relying-party code under test is
 * the REAL code. It can be told to misbehave in the ways an attacker or a broken provider might, so those are tested:
 * wrong audience / issuer / nonce, expired token, bad signature, algorithm confusion, `alg: none`, missing subject,
 * a replayed authorization code.
 *
 * It is a TEST DOUBLE. Interoperability with a live provider is not proven by it.
 */

export interface IdpUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  /** RFC 8176 authentication methods the provider will report. */
  amr: string[];
}

export type Misbehavior =
  | "none"
  | "wrongAudience"
  | "wrongIssuer"
  | "expired"
  | "wrongNonce"
  | "badSignature"
  | "noSubject"
  | "hs256"
  | "algNone"
  | "futureAuthTime"
  | "staleAuthTime"
  | "noAuthTime";

export interface RecordedAuthorization {
  query: Record<string, string>;
}

const b64 = (v: unknown) =>
  Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

export class TestIdp {
  readonly clientId = "agentaxio-test";
  readonly clientSecret = randomBytes(24).toString("hex");
  misbehavior: Misbehavior = "none";
  /** Whether the provider honours `max_age=0` / `prompt=login` (a provider that ignores them must not be trusted). */
  honourMaxAge = true;
  readonly users = new Map<string, IdpUser>();
  readonly authorizations: RecordedAuthorization[] = [];
  /** The last client credentials header the token endpoint saw (for diagnosing test failures). */
  lastTokenAuthorization: string | undefined;
  /** The user the next authorization will sign in as. */
  signInAs = "";
  url = "";

  private server: Server | undefined;
  private signing!: Awaited<ReturnType<typeof generateKeyPair>>;
  private otherSigning!: Awaited<ReturnType<typeof generateKeyPair>>;
  private publicJwk!: JWK;
  private readonly codes = new Map<
    string,
    {
      user: IdpUser;
      nonce: string;
      challenge: string;
      redirectUri: string;
      fresh: boolean;
      used: boolean;
    }
  >();

  constructor(readonly redirectUri: string) {}

  addUser(key: string, user: Partial<IdpUser> & { email: string }): void {
    this.users.set(key, { sub: `sub-${key}`, emailVerified: true, amr: ["pwd", "otp"], ...user });
  }

  async start(): Promise<void> {
    this.signing = await generateKeyPair("RS256", { extractable: true });
    this.otherSigning = await generateKeyPair("RS256", { extractable: true });
    this.publicJwk = {
      ...(await exportJWK(this.signing.publicKey)),
      kid: "test-key",
      alg: "RS256",
      use: "sig",
    };
    this.server = createServer((request, response) => {
      void this.handle(
        request.url ?? "/",
        request.method ?? "GET",
        request.headers.authorization,
        request,
        response,
      );
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    this.url = `http://127.0.0.1:${typeof address === "object" && address !== null ? String(address.port) : "0"}`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  /** RFC 6749 2.3.1: HTTP Basic credentials are form-urlencoded before base64, so they must be decoded again here. */
  private clientAuthenticates(authorization: string | undefined): boolean {
    if (authorization === undefined || !authorization.startsWith("Basic ")) return false;
    const [id, secret] = Buffer.from(authorization.slice(6), "base64").toString("utf8").split(":");
    try {
      return (
        decodeURIComponent(id ?? "") === this.clientId &&
        decodeURIComponent(secret ?? "") === this.clientSecret
      );
    } catch {
      return false;
    }
  }

  private async readForm(request: import("node:http").IncomingMessage): Promise<URLSearchParams> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  }

  private json(response: import("node:http").ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  }

  private async handle(
    rawUrl: string,
    method: string,
    authorization: string | undefined,
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ): Promise<void> {
    const url = new URL(rawUrl, this.url);
    if (url.pathname === "/.well-known/openid-configuration") {
      this.json(response, 200, {
        issuer: this.url,
        authorization_endpoint: `${this.url}/authorize`,
        token_endpoint: `${this.url}/token`,
        jwks_uri: `${this.url}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "email", "profile"],
      });
      return;
    }
    if (url.pathname === "/jwks") {
      this.json(response, 200, { keys: [this.publicJwk] });
      return;
    }
    if (url.pathname === "/authorize" && method === "GET") {
      const q = Object.fromEntries(url.searchParams.entries());
      this.authorizations.push({ query: q });
      const user = this.users.get(this.signInAs);
      if (
        user === undefined ||
        q.response_type !== "code" ||
        q.client_id !== this.clientId ||
        q.redirect_uri !== this.redirectUri ||
        q.code_challenge_method !== "S256" ||
        !q.code_challenge ||
        !q.state ||
        !q.nonce
      ) {
        response.writeHead(400);
        response.end("bad authorization request");
        return;
      }
      const code = randomBytes(24).toString("base64url");
      const stepUp = q.max_age === "0" || q.prompt === "login";
      this.codes.set(code, {
        user,
        nonce: q.nonce,
        challenge: q.code_challenge,
        redirectUri: q.redirect_uri,
        // A provider that ignores max_age answers from an old single-sign-on session; otherwise the person just signed in.
        fresh: !(stepUp && !this.honourMaxAge),
        used: false,
      });
      const back = new URL(q.redirect_uri);
      back.searchParams.set("code", code);
      back.searchParams.set("state", q.state);
      back.searchParams.set("iss", this.url);
      response.writeHead(302, { location: back.toString() });
      response.end();
      return;
    }
    if (url.pathname === "/token" && method === "POST") {
      this.lastTokenAuthorization = authorization;
      if (!this.clientAuthenticates(authorization)) {
        this.json(response, 401, { error: "invalid_client" });
        return;
      }
      const form = await this.readForm(request);
      const entry = this.codes.get(form.get("code") ?? "");
      const verifier = form.get("code_verifier") ?? "";
      if (
        entry === undefined ||
        entry.used ||
        form.get("grant_type") !== "authorization_code" ||
        form.get("redirect_uri") !== entry.redirectUri ||
        createHash("sha256").update(verifier).digest("base64url") !== entry.challenge
      ) {
        if (entry !== undefined) entry.used = true;
        this.json(response, 400, { error: "invalid_grant" });
        return;
      }
      entry.used = true;
      this.json(response, 200, {
        access_token: randomBytes(16).toString("hex"),
        token_type: "Bearer",
        expires_in: 300,
        id_token: await this.idToken(entry.user, entry.nonce, entry.fresh),
      });
      return;
    }
    response.writeHead(404);
    response.end();
  }

  private async idToken(user: IdpUser, nonce: string, fresh: boolean): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      sub: user.sub,
      email: user.email,
      email_verified: user.emailVerified,
      amr: user.amr,
      nonce,
      auth_time: fresh ? now : now - 3600,
    };
    switch (this.misbehavior) {
      case "wrongNonce":
        claims.nonce = "an-attackers-nonce-0123456789";
        break;
      case "noSubject":
        delete claims.sub;
        break;
      case "futureAuthTime":
        claims.auth_time = now + 3600;
        break;
      case "staleAuthTime":
        claims.auth_time = now - 7200;
        break;
      case "noAuthTime":
        delete claims.auth_time;
        break;
      default:
    }
    const issuer = this.misbehavior === "wrongIssuer" ? "https://evil.example.test" : this.url;
    const audience = this.misbehavior === "wrongAudience" ? "someone-else" : this.clientId;
    const exp = this.misbehavior === "expired" ? now - 600 : now + 300;
    if (this.misbehavior === "algNone") {
      return `${b64({ alg: "none", typ: "JWT" })}.${b64({ ...claims, iss: issuer, aud: audience, iat: now, exp })}.`;
    }
    if (this.misbehavior === "hs256") {
      // Algorithm confusion: signed with a symmetric key the attacker can compute (the public key text).
      return new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256", kid: "test-key" })
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt(now)
        .setExpirationTime(exp)
        .sign(new TextEncoder().encode(JSON.stringify(this.publicJwk)));
    }
    const key =
      this.misbehavior === "badSignature" ? this.otherSigning.privateKey : this.signing.privateKey;
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(key);
  }
}
