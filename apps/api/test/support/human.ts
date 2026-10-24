import { randomBytes } from "node:crypto";
import type { FastifyInstance, InjectOptions } from "fastify";
import { createOidcClient } from "../../src/auth/oidc";
import { buildManagementApp } from "../../src/http/management-app";
import { createWorld, type World } from "./world";
import { TestIdp, type IdpUser } from "./idp";

/** Cookie names without the __Host- prefix: the test server speaks plain http. */
export const COOKIE = { session: "axo_session", csrf: "axo_csrf", oidc: "axo_oidc" } as const;
export const WEB_ORIGIN = "http://localhost:3000";
export const REDIRECT_URI = `${WEB_ORIGIN}/api/auth/callback`;

export interface HumanWorld {
  world: World;
  idp: TestIdp;
  app: FastifyInstance;
  logs: string[];
  /** A browser with its own cookie jar. */
  browser(): Browser;
  /** Sign a person in through the real login flow, creating their account on first sight. */
  signIn(
    userKey: string,
    options?: { stepUp?: boolean; returnTo?: string; browser?: Browser },
  ): Promise<Browser>;
  userId(userKey: string): Promise<string>;
  close(): Promise<void>;
}

export interface Response {
  status: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: string;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  json<T = Record<string, unknown>>(): T;
}

/** A tiny browser: keeps cookies, sends the Origin header and the CSRF token the way the dashboard does. */
export class Browser {
  readonly jar = new Map<string, string>();
  constructor(private readonly app: FastifyInstance) {}

  get csrf(): string | undefined {
    return this.jar.get(COOKIE.csrf);
  }
  get sessionToken(): string | undefined {
    return this.jar.get(COOKIE.session);
  }

  private absorb(setCookie: string | string[] | number | undefined): void {
    const list = Array.isArray(setCookie)
      ? setCookie
      : typeof setCookie === "string"
        ? [setCookie]
        : [];
    for (const line of list) {
      const [pair = "", ...attributes] = line.split(";").map((p) => p.trim());
      const index = pair.indexOf("=");
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      const expired = attributes.some((a) => a.toLowerCase() === "max-age=0");
      if (expired || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  async request(
    method: "GET" | "POST",
    url: string,
    options: {
      body?: unknown;
      /** Send the CSRF header (default true for POST). Pass a string to send a specific value. */
      csrf?: boolean | string;
      /** Send an Origin header (default: the web origin for POST). Pass a string to send another, `false` to omit it. */
      origin?: string | false;
      headers?: Record<string, string>;
      rawCookie?: string;
      remoteAddress?: string;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { ...options.headers };
    const cookie =
      options.rawCookie ?? [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie !== "") headers.cookie = cookie;
    if (method === "POST") {
      headers["content-type"] ??= "application/json";
      const origin = options.origin === undefined ? WEB_ORIGIN : options.origin;
      if (origin !== false) headers.origin = origin;
      const csrf =
        options.csrf === undefined || options.csrf === true
          ? this.csrf
          : options.csrf === false
            ? undefined
            : options.csrf;
      if (csrf !== undefined) headers["x-csrf-token"] = csrf;
    }
    const inject: InjectOptions = {
      method,
      url,
      headers,
      ...(options.remoteAddress === undefined ? {} : { remoteAddress: options.remoteAddress }),
      ...(method === "POST"
        ? { payload: options.body === undefined ? "{}" : JSON.stringify(options.body) }
        : {}),
    };
    const res = await this.app.inject(inject);
    this.absorb(res.headers["set-cookie"]);
    return {
      status: res.statusCode,
      headers: res.headers,
      body: res.body,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
      json: <T = Record<string, unknown>>() => JSON.parse(res.body) as T,
    };
  }

  get(url: string, options: Parameters<Browser["request"]>[2] = {}) {
    return this.request("GET", url, options);
  }
  post(url: string, body?: unknown, options: Parameters<Browser["request"]>[2] = {}) {
    return this.request("POST", url, { ...options, body });
  }
}

export async function createHumanWorld(): Promise<HumanWorld> {
  const world = await createWorld();
  const idp = new TestIdp(REDIRECT_URI);
  await idp.start();
  const oidc = await createOidcClient({
    issuer: idp.url,
    clientId: idp.clientId,
    clientSecret: idp.clientSecret,
    redirectUri: REDIRECT_URI,
    allowInsecure: true,
  });
  const logs: string[] = [];
  const app = buildManagementApp({
    pool: world.managementPool,
    login: { pool: world.managementPool, oidc, dataKeys: world.dataKeys, mfaRequired: true },
    pepper: world.pepper,
    dataKeys: world.dataKeys,
    webOrigin: WEB_ORIGIN,
    cookieSecure: false,
    logger: { level: "debug", stream: { write: (line: string) => void logs.push(line) } },
  });
  await app.ready();

  const human: HumanWorld = {
    world,
    idp,
    app,
    logs,
    browser: () => new Browser(app),
    async signIn(userKey, options = {}) {
      idp.signInAs = userKey;
      const browser = options.browser ?? new Browser(app);
      const start = await browser.get(
        `/auth/login?return_to=${encodeURIComponent(options.returnTo ?? "/dashboard")}${options.stepUp === true ? "&step_up=1" : ""}`,
        {
          remoteAddress: `10.9.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}`,
        },
      );
      if (start.status !== 302)
        throw new Error(`login did not redirect (${String(start.status)}): ${start.body}`);
      const toIdp = await fetch(String(start.headers.location), { redirect: "manual" });
      const back = toIdp.headers.get("location");
      if (toIdp.status !== 302 || back === null)
        throw new Error(`the provider did not redirect back (${String(toIdp.status)})`);
      const finished = await browser.get(`/auth/callback${new URL(back).search}`, {
        remoteAddress: `10.8.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}`,
      });
      if (finished.status !== 302)
        throw new Error(`callback did not redirect (${String(finished.status)})`);
      return browser;
    },
    async userId(userKey) {
      const admin = await world.db.admin();
      const user = idp.users.get(userKey);
      const row = await admin.query(
        "SELECT id FROM axo.users WHERE auth_issuer = $1 AND auth_subject = $2",
        [idp.url, user?.sub],
      );
      const id = row.rows[0]?.id as string | undefined;
      if (id === undefined) throw new Error(`no account yet for ${userKey}`);
      return id;
    },
    async close() {
      await app.close();
      await idp.stop();
      await world.close();
    },
  };
  return human;
}

export const newUser = (human: HumanWorld, key: string, overrides: Partial<IdpUser> = {}): void => {
  human.idp.addUser(key, {
    email: `${key}-${randomBytes(2).toString("hex")}@people.test`,
    ...overrides,
  });
};
