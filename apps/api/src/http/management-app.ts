import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { POLICY_EFFECTS, type ErrorCode } from "@agentaxio/contracts";
import { LIMITS, SESSION } from "../config";
import { cookieNames, expireCookie, parseCookies, serializeCookie } from "../auth/cookies";
import { finishLogin, logout, safeReturnTo, startLogin, type LoginDeps } from "../auth/login";
import { LoginError } from "../auth/oidc";
import { hashToken, isWellFormedToken } from "../auth/tokens";
import type { KeyRing } from "../crypto/data-keys";
import { DomainError, type DomainErrorCode } from "../errors";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  createOrganization,
  createPolicy,
  createPolicyVersion,
  decideApproval,
  haltEnvironment,
  issueCredential,
  listActivity,
  listAgents,
  listApprovals,
  listCredentials,
  listEnvironments,
  listExecutions,
  listInvitations,
  listMembers,
  listPolicies,
  listPolicyVersions,
  listRequests,
  overview,
  registerAgent,
  removeMember,
  resumeAgent,
  resumeEnvironment,
  revokeAgent,
  revokeCredential,
  revokeInvitation,
  reviewApproval,
  rotateCredential,
  suspendAgent,
  whoAmI,
  withManagement,
  withSession,
  type ManagementContext,
} from "../management";
import { RATE_LIMITS, rateLimitHit, type RateLimit } from "../ratelimit";

/**
 * The signed-in (human) HTTP API. It accepts ONLY the session cookie. No user id, role, MFA claim or organization
 * permission is read from a request: identity comes from the session row, membership and role from the database, MFA
 * freshness from the session. A client names an organization in the URL, and the database lets the session's user into
 * it only if they are an active member.
 *
 * Every route declares an auth class. State-changing routes additionally require a matching `Origin` and a CSRF token
 * that belongs to the session; both are checked before any handler runs.
 */

export type HumanAuthClass = "public" | "login" | "session" | "organization";
export interface HumanRoute {
  method: string;
  url: string;
  auth: HumanAuthClass | undefined;
  mutating: boolean;
}

export interface ManagementAppDeps {
  pool: pg.Pool;
  login: LoginDeps;
  pepper: Buffer;
  dataKeys: KeyRing;
  webOrigin: string;
  cookieSecure: boolean;
  logger?: false | { level: string; stream?: { write(message: string): void } };
}

declare module "fastify" {
  interface FastifyContextConfig {
    humanAuth?: HumanAuthClass;
    mutating?: boolean;
  }
  interface FastifyInstance {
    humanRoutes: HumanRoute[];
  }
}

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: "You are not signed in.",
  FORBIDDEN: "Not permitted.",
  NOT_FOUND: "Not found.",
  PAYLOAD_TOO_LARGE: "The request body is too large.",
  UNSUPPORTED_MEDIA_TYPE: "Content-Type must be application/json.",
  INVALID_REQUEST: "The request is invalid.",
  RATE_LIMITED: "Too many requests. Try again shortly.",
  SERVICE_UNAVAILABLE: "The service could not complete the request. Nothing was changed.",
  STEP_UP_REQUIRED: "Please confirm with multi-factor authentication to continue.",
  CONFLICT: "The request conflicts with the current state.",
  EXPIRED: "This has expired.",
};

const STATUS_FOR: Record<DomainErrorCode, [number, ErrorCode]> = {
  UNAUTHENTICATED: [401, "UNAUTHENTICATED"],
  FORBIDDEN: [403, "FORBIDDEN"],
  NOT_FOUND: [404, "NOT_FOUND"],
  CONFLICT: [409, "CONFLICT"],
  INVALID: [422, "INVALID_REQUEST"],
  STEP_UP: [403, "STEP_UP_REQUIRED"],
  EXPIRED: [410, "EXPIRED"],
};

function fail(
  reply: FastifyReply,
  status: number,
  code: ErrorCode,
  extra: Record<string, unknown> = {},
): FastifyReply {
  return reply
    .code(status)
    .type("application/json")
    .send({
      error: { code, message: MESSAGES[code] ?? "Error.", trace_id: reply.request.id, ...extra },
    });
}

const UUID_PARAM = z.uuid();
const emptyBody = z.strictObject({});

const policyBody = z.strictObject({
  effect: z.enum(POLICY_EFFECTS),
  conditions: z.unknown(),
  priority: z.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
});

export function buildManagementApp(deps: ManagementAppDeps): FastifyInstance {
  const names = cookieNames(deps.cookieSecure);
  const logger = deps.logger ?? false;
  const app = Fastify({
    logger:
      logger === false
        ? false
        : {
            level: logger.level,
            ...(logger.stream === undefined ? {} : { stream: logger.stream }),
            redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
            serializers: {
              req: (req: FastifyRequest) => ({
                method: req.method,
                // Query strings carry authorization codes and state during login; paths only.
                path: req.url.split("?")[0]?.slice(0, 160),
                id: req.id,
              }),
            },
          },
    bodyLimit: LIMITS.bodyBytes,
    requestTimeout: 15_000,
    connectionTimeout: 30_000,
    genReqId: () => randomUUID(),
    exposeHeadRoutes: false,
    trustProxy: false,
  });
  app.removeContentTypeParser("text/plain");

  const routes: HumanRoute[] = [];
  app.decorate("humanRoutes", routes);
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      routes.push({
        method,
        url: route.url,
        auth: route.config?.humanAuth,
        mutating: route.config?.mutating === true,
      });
    }
  });

  app.addHook("onSend", (_request, reply, payload, done) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    done(null, payload);
  });

  // State-changing requests must come from our own web origin and carry a CSRF token; checked before any handler.
  app.addHook("onRequest", (request, reply, done) => {
    const config = request.routeOptions.config;
    if (config.mutating === true) {
      const origin = request.headers.origin;
      if (origin !== deps.webOrigin) {
        fail(reply, 403, "FORBIDDEN", { reason: "ORIGIN" });
        return;
      }
    }
    done();
  });

  app.setNotFoundHandler((_request, reply) => fail(reply, 404, "NOT_FOUND"));
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof DomainError) {
      const [status, code] = STATUS_FOR[error.code];
      // Messages of domain errors are written for people and carry no stored data.
      return fail(
        reply,
        status,
        code,
        error.code === "FORBIDDEN" || error.code === "CONFLICT" ? { detail: error.message } : {},
      );
    }
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
    if (statusCode === 413) return fail(reply, 413, "PAYLOAD_TOO_LARGE");
    if (statusCode === 415) return fail(reply, 415, "UNSUPPORTED_MEDIA_TYPE");
    if (statusCode === 400) return fail(reply, 422, "INVALID_REQUEST");
    request.log.error(
      {
        errorName: error instanceof Error ? error.name : "Error",
        errorCode:
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : undefined,
      },
      "request failed closed",
    );
    return fail(reply, 503, "SERVICE_UNAVAILABLE");
  });

  // ---- helpers ---------------------------------------------------------------------------------------------------
  const cookiesOf = (request: FastifyRequest) => parseCookies(request.headers.cookie);
  const sessionTokenOf = (request: FastifyRequest): string | undefined => {
    const value = cookiesOf(request).get(names.session);
    return isWellFormedToken(value) ? value : undefined;
  };
  const csrfHeader = (request: FastifyRequest): string | undefined => {
    const value = request.headers["x-csrf-token"];
    return typeof value === "string" ? value : undefined;
  };

  /** Refuse before doing any work when the caller is over a limit; never throws a 500 for a limiter hiccup. */
  async function limited(reply: FastifyReply, rule: RateLimit, subject: string): Promise<boolean> {
    const decision = await rateLimitHit(deps.pool, rule, subject);
    if (decision.allowed) return false;
    reply.header("retry-after", String(decision.retryAfterSeconds));
    fail(reply, 429, "RATE_LIMITED");
    return true;
  }

  function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new DomainError(
        parsed.error.issues
          .map((i) => `${i.path.join(".") || "(body)"}: ${i.code}`)
          .slice(0, 10)
          .join("; "),
        "INVALID",
      );
    }
    return parsed.data;
  }

  const clientAddress = (request: FastifyRequest) => request.ip;

  // ---- authentication --------------------------------------------------------------------------------------------
  app.get("/auth/login", { config: { humanAuth: "login" } }, async (request, reply) => {
    if (await limited(reply, RATE_LIMITS.loginStarts, clientAddress(request))) return reply;
    const query = request.query as { return_to?: string; step_up?: string };
    const started = await startLogin(deps.login, {
      returnTo: query.return_to,
      stepUp: query.step_up === "1",
    });
    reply.header(
      "set-cookie",
      serializeCookie(names.oidc, started.browserBinding, {
        secure: deps.cookieSecure,
        httpOnly: true,
        sameSite: "Lax",
        maxAgeSeconds: SESSION.loginTransactionSeconds,
      }),
    );
    return reply.redirect(started.authorizationUrl.toString(), 302);
  });

  app.get("/auth/callback", { config: { humanAuth: "login" } }, async (request, reply) => {
    const back = (code: string) =>
      reply.redirect(`${deps.webOrigin}/dashboard?auth_error=${code}`, 302);
    const clearBinding = expireCookie(names.oidc, {
      secure: deps.cookieSecure,
      httpOnly: true,
      sameSite: "Lax",
    });
    if (await limited(reply, RATE_LIMITS.loginStarts, clientAddress(request))) return reply;
    const incoming = new URL(request.url, "http://placeholder.invalid");
    if (incoming.searchParams.has("error")) {
      reply.header("set-cookie", clearBinding);
      return back("denied");
    }
    // The provider redirected the browser to the registered redirect URI; rebuild exactly that URL with its parameters.
    const callbackUrl = new URL(deps.login.oidc.settings.redirectUri);
    callbackUrl.search = incoming.search;
    try {
      const done = await finishLogin(deps.login, {
        callbackUrl,
        browserBinding: cookiesOf(request).get(names.oidc),
      });
      const previous = sessionTokenOf(request);
      if (previous !== undefined) await logout(deps.pool, previous);
      const secure = deps.cookieSecure;
      reply.header("set-cookie", [
        serializeCookie(names.session, done.sessionToken, {
          secure,
          httpOnly: true,
          sameSite: "Lax",
          maxAgeSeconds: SESSION.absoluteSeconds,
        }),
        serializeCookie(names.csrf, done.csrfToken, {
          secure,
          httpOnly: false,
          sameSite: "Strict",
          maxAgeSeconds: SESSION.absoluteSeconds,
        }),
        clearBinding,
      ]);
      return await reply.redirect(`${deps.webOrigin}${safeReturnTo(done.returnTo)}`, 302);
    } catch (error) {
      reply.header("set-cookie", clearBinding);
      if (error instanceof LoginError) {
        request.log.warn({ kind: error.code }, "login refused");
        return back(error.code === "stale_authentication" ? "reauth" : "failed");
      }
      throw error;
    }
  });

  app.post(
    "/auth/logout",
    { config: { humanAuth: "session", mutating: true } },
    async (request, reply) => {
      const token = sessionTokenOf(request);
      const clear = [
        expireCookie(names.session, { secure: deps.cookieSecure, httpOnly: true, sameSite: "Lax" }),
        expireCookie(names.csrf, {
          secure: deps.cookieSecure,
          httpOnly: false,
          sameSite: "Strict",
        }),
      ];
      if (token !== undefined) {
        // Verifies the CSRF token as well, so a third-party page cannot sign a user out.
        await withSession(
          deps.pool,
          { sessionToken: token, csrfToken: csrfHeader(request), mutating: true },
          () => Promise.resolve(),
        );
        await logout(deps.pool, token);
      }
      reply.header("set-cookie", clear);
      return reply.code(204).send();
    },
  );

  app.get("/v1/me", { config: { humanAuth: "session" } }, async (request) => {
    const me = await withSession(deps.pool, { sessionToken: sessionTokenOf(request) }, (session) =>
      whoAmI(session),
    );
    return { ...me, stepUpWindowMinutes: 15 };
  });

  app.post(
    "/v1/organizations",
    { config: { humanAuth: "session", mutating: true } },
    async (request, reply) => {
      const token = sessionTokenOf(request);
      if (
        token !== undefined &&
        (await limited(reply, RATE_LIMITS.managementWrites, hashToken(token).toString("hex")))
      )
        return reply;
      const body = parseBody(
        z.strictObject({ name: z.string().max(200), slug: z.string().max(60) }),
        request.body,
      );
      const created = await withSession(
        deps.pool,
        { sessionToken: token, csrfToken: csrfHeader(request), mutating: true },
        (session) => createOrganization(session, body),
      );
      return reply.code(201).send(created);
    },
  );

  app.post(
    "/v1/invitations/accept",
    { config: { humanAuth: "session", mutating: true } },
    async (request, reply) => {
      const token = sessionTokenOf(request);
      if (
        token !== undefined &&
        (await limited(reply, RATE_LIMITS.managementWrites, hashToken(token).toString("hex")))
      )
        return reply;
      const body = parseBody(z.strictObject({ token: z.string().max(100) }), request.body);
      const accepted = await withSession(
        deps.pool,
        { sessionToken: token, csrfToken: csrfHeader(request), mutating: true },
        (session) => acceptInvitation(session, body),
      );
      return accepted;
    },
  );

  // ---- organization routes ---------------------------------------------------------------------------------------
  type Handled = { status?: number; body?: unknown } | undefined;
  interface RouteSpec<T> {
    method: "GET" | "POST";
    path: string;
    mutating: boolean;
    schema?: z.ZodType<T>;
    rule?: RateLimit;
    handler: (context: ManagementContext, request: FastifyRequest, body: T) => Promise<unknown>;
    /** For routes that must answer with a status other than 200/201. */
    respond?: (result: never, reply: FastifyReply) => Handled;
  }

  function orgRoute<T = Record<string, never>>(spec: RouteSpec<T>): void {
    const full = `/v1/orgs/:orgId${spec.path}`;
    const run = async (request: FastifyRequest, reply: FastifyReply) => {
      const { orgId } = request.params as { orgId: string };
      if (!UUID_PARAM.safeParse(orgId).success) throw new DomainError("not found", "NOT_FOUND");
      const token = sessionTokenOf(request);
      if (spec.mutating && token !== undefined) {
        const subject = hashToken(token).toString("hex");
        if (await limited(reply, spec.rule ?? RATE_LIMITS.managementWrites, subject)) return reply;
      }
      const body = spec.schema ? parseBody(spec.schema, request.body) : (undefined as T);
      const result = await withManagement(
        deps.pool,
        {
          sessionToken: token,
          csrfToken: csrfHeader(request),
          mutating: spec.mutating,
          organizationId: orgId,
        },
        (context) => spec.handler(context, request, body),
      );
      if (spec.mutating && spec.method === "POST") return reply.code(200).send(result ?? {});
      return result;
    };
    app.route({
      method: spec.method,
      url: full,
      config: { humanAuth: "organization", mutating: spec.mutating },
      handler: run,
    });
  }

  const idParam = (request: FastifyRequest, name: string): string => {
    const value = (request.params as Record<string, string>)[name];
    if (value === undefined || !UUID_PARAM.safeParse(value).success)
      throw new DomainError("not found", "NOT_FOUND");
    return value;
  };
  const queryNumber = (request: FastifyRequest, name: string): number | undefined => {
    const raw = (request.query as Record<string, string | undefined>)[name];
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new DomainError(`${name} must be a non-negative integer`, "INVALID");
    return n;
  };

  // reads
  orgRoute({ method: "GET", path: "/overview", mutating: false, handler: (c) => overview(c) });
  orgRoute({
    method: "GET",
    path: "/environments",
    mutating: false,
    handler: (c) => listEnvironments(c),
  });
  orgRoute({ method: "GET", path: "/agents", mutating: false, handler: (c) => listAgents(c) });
  orgRoute({
    method: "GET",
    path: "/agents/:agentId/credentials",
    mutating: false,
    handler: (c, r) => listCredentials(c, { agentId: idParam(r, "agentId") }),
  });
  orgRoute({
    method: "GET",
    path: "/requests",
    mutating: false,
    handler: (c, r) => {
      const agent = (r.query as { agent_id?: string }).agent_id;
      return listRequests(c, {
        limit: queryNumber(r, "limit") ?? 50,
        ...(agent === undefined ? {} : { agentId: agent }),
      });
    },
  });
  orgRoute({
    method: "GET",
    path: "/requests/:requestId/executions",
    mutating: false,
    handler: (c, r) => listExecutions(c, { requestId: idParam(r, "requestId") }),
  });
  orgRoute({
    method: "GET",
    path: "/activity",
    mutating: false,
    handler: (c, r) => {
      const before = queryNumber(r, "before");
      const request = (r.query as { request_id?: string }).request_id;
      return listActivity(c, {
        limit: queryNumber(r, "limit") ?? 50,
        ...(before === undefined ? {} : { beforeId: before }),
        ...(request === undefined ? {} : { requestId: request }),
      });
    },
  });
  orgRoute({ method: "GET", path: "/policies", mutating: false, handler: (c) => listPolicies(c) });
  orgRoute({
    method: "GET",
    path: "/policies/:policyId/versions",
    mutating: false,
    handler: (c, r) => listPolicyVersions(c, { policyId: idParam(r, "policyId") }),
  });
  orgRoute({
    method: "GET",
    path: "/approvals",
    mutating: false,
    handler: (c, r) => {
      const state = (r.query as { state?: string }).state;
      const allowed = ["pending", "approved", "rejected", "expired", "canceled", "all"] as const;
      if (state !== undefined && !(allowed as readonly string[]).includes(state))
        throw new DomainError("unknown state", "INVALID");
      return listApprovals(c, {
        limit: queryNumber(r, "limit") ?? 50,
        ...(state === undefined ? {} : { state: state as (typeof allowed)[number] }),
      });
    },
  });
  orgRoute({
    method: "GET",
    path: "/approvals/:approvalId",
    mutating: false,
    handler: (c, r) => reviewApproval(c, deps.dataKeys, { approvalId: idParam(r, "approvalId") }),
  });
  orgRoute({ method: "GET", path: "/members", mutating: false, handler: (c) => listMembers(c) });
  orgRoute({
    method: "GET",
    path: "/invitations",
    mutating: false,
    handler: (c) => listInvitations(c),
  });

  // agents and credentials
  orgRoute({
    method: "POST",
    path: "/agents",
    mutating: true,
    schema: z.strictObject({
      name: z.string().max(200),
      description: z.string().max(1000).optional(),
      environmentId: z.uuid(),
      ownerUserId: z.uuid(),
    }),
    handler: (c, _r, b) =>
      registerAgent(c, {
        environmentId: b.environmentId,
        ownerUserId: b.ownerUserId,
        name: b.name,
        ...(b.description === undefined ? {} : { description: b.description }),
      }),
  });
  orgRoute({
    method: "POST",
    path: "/agents/:agentId/suspend",
    mutating: true,
    schema: emptyBody,
    handler: (c, r) => suspendAgent(c, { agentId: idParam(r, "agentId") }),
  });
  orgRoute({
    method: "POST",
    path: "/agents/:agentId/resume",
    mutating: true,
    schema: emptyBody,
    handler: async (c, r) => {
      await resumeAgent(c, { agentId: idParam(r, "agentId") });
    },
  });
  orgRoute({
    method: "POST",
    path: "/agents/:agentId/revoke",
    mutating: true,
    schema: emptyBody,
    handler: (c, r) => revokeAgent(c, { agentId: idParam(r, "agentId") }),
  });
  orgRoute({
    method: "POST",
    path: "/agents/:agentId/credentials",
    mutating: true,
    schema: emptyBody,
    // The full key appears in this one response and nowhere else, ever.
    handler: (c, r) => issueCredential(c, deps.pepper, { agentId: idParam(r, "agentId") }),
  });
  orgRoute({
    method: "POST",
    path: "/agents/:agentId/credentials/:credentialId/rotate",
    mutating: true,
    schema: emptyBody,
    handler: (c, r) =>
      rotateCredential(c, deps.pepper, {
        agentId: idParam(r, "agentId"),
        credentialId: idParam(r, "credentialId"),
      }),
  });
  orgRoute({
    method: "POST",
    path: "/credentials/:credentialId/revoke",
    mutating: true,
    schema: emptyBody,
    handler: (c, r) => revokeCredential(c, { credentialId: idParam(r, "credentialId") }),
  });

  // policies and environments
  orgRoute({
    method: "POST",
    path: "/policies",
    mutating: true,
    schema: policyBody.extend({
      actionKey: z.string().max(64),
      environmentId: z.uuid().optional(),
      agentId: z.uuid().optional(),
    }),
    handler: (c, _r, b) =>
      createPolicy(c, {
        actionKey: b.actionKey,
        effect: b.effect,
        conditions: b.conditions,
        ...(b.priority === undefined ? {} : { priority: b.priority }),
        ...(b.enabled === undefined ? {} : { enabled: b.enabled }),
        ...(b.environmentId === undefined ? {} : { environmentId: b.environmentId }),
        ...(b.agentId === undefined ? {} : { agentId: b.agentId }),
      }),
  });
  orgRoute({
    method: "POST",
    path: "/policies/:policyId/versions",
    mutating: true,
    schema: policyBody.extend({ expectedVersion: z.number().int().min(1) }),
    handler: (c, r, b) =>
      createPolicyVersion(c, {
        policyId: idParam(r, "policyId"),
        expectedVersion: b.expectedVersion,
        effect: b.effect,
        conditions: b.conditions,
        ...(b.priority === undefined ? {} : { priority: b.priority }),
        ...(b.enabled === undefined ? {} : { enabled: b.enabled }),
      }),
  });
  orgRoute({
    method: "POST",
    path: "/environments/:environmentId/halt",
    mutating: true,
    schema: emptyBody,
    handler: async (c, r) => {
      await haltEnvironment(c, { environmentId: idParam(r, "environmentId") });
    },
  });
  orgRoute({
    method: "POST",
    path: "/environments/:environmentId/resume",
    mutating: true,
    schema: emptyBody,
    handler: async (c, r) => {
      await resumeEnvironment(c, { environmentId: idParam(r, "environmentId") });
    },
  });

  // approvals
  app.route({
    method: "POST",
    url: "/v1/orgs/:orgId/approvals/:approvalId/decision",
    config: { humanAuth: "organization", mutating: true },
    handler: async (request, reply) => {
      const { orgId } = request.params as { orgId: string };
      const approvalId = idParam(request, "approvalId");
      if (!UUID_PARAM.safeParse(orgId).success) throw new DomainError("not found", "NOT_FOUND");
      const token = sessionTokenOf(request);
      if (
        token !== undefined &&
        (await limited(reply, RATE_LIMITS.approvalDecisions, hashToken(token).toString("hex")))
      )
        return reply;
      const body = parseBody(
        z.strictObject({
          decision: z.enum(["approve", "reject"]),
          reviewedDigest: z.string().regex(/^[0-9a-f]{64}$/),
          comment: z.string().max(500).optional(),
        }),
        request.body,
      );
      // The decision is committed (with its audit record) BEFORE the answer is chosen, so a blocked attempt is on record.
      const result = await withManagement(
        deps.pool,
        {
          sessionToken: token,
          csrfToken: csrfHeader(request),
          mutating: true,
          organizationId: orgId,
        },
        (context) =>
          decideApproval(context, {
            approvalId,
            decision: body.decision,
            reviewedDigest: body.reviewedDigest,
            ...(body.comment === undefined ? {} : { comment: body.comment }),
          }),
      );
      switch (result.outcome) {
        case "approved":
        case "rejected":
          return { outcome: result.outcome, requestStatus: result.requestStatus };
        case "expired":
          return fail(reply, 410, "EXPIRED", { reason: "APPROVAL_EXPIRED" });
        case "self_approval":
          return fail(reply, 403, "FORBIDDEN", {
            reason: "SELF_APPROVAL",
            detail:
              "You cannot decide a request from an agent you own, registered, or issued the key for.",
          });
        case "digest_mismatch":
          return fail(reply, 409, "CONFLICT", {
            reason: "DIGEST_MISMATCH",
            detail: "What you reviewed is not what is stored. Reload and review again.",
          });
        case "already_decided":
          return fail(reply, 409, "CONFLICT", {
            reason: "ALREADY_DECIDED",
            detail: "This approval was already decided.",
          });
        case "not_pending":
          return fail(reply, 409, "CONFLICT", {
            reason: "NOT_PENDING",
            detail: "This request is no longer waiting for approval.",
          });
      }
    },
  });

  // members and invitations
  orgRoute({
    method: "POST",
    path: "/invitations",
    mutating: true,
    schema: z.strictObject({
      email: z.string().max(254),
      role: z.enum(["owner", "admin", "approver", "viewer"]),
    }),
    // The token appears in this response once; there is no outbound email yet.
    handler: (c, _r, b) => createInvitation(c, b),
  });
  orgRoute({
    method: "POST",
    path: "/invitations/:invitationId/revoke",
    mutating: true,
    schema: emptyBody,
    handler: async (c, r) => {
      await revokeInvitation(c, { invitationId: idParam(r, "invitationId") });
    },
  });
  orgRoute({
    method: "POST",
    path: "/members/:userId/role",
    mutating: true,
    schema: z.strictObject({ role: z.enum(["owner", "admin", "approver", "viewer"]) }),
    handler: async (c, r, b) => {
      await changeMemberRole(c, { userId: idParam(r, "userId"), role: b.role });
    },
  });
  orgRoute({
    method: "POST",
    path: "/members/:userId/remove",
    mutating: true,
    schema: emptyBody,
    handler: async (c, r) => {
      await removeMember(c, { userId: idParam(r, "userId") });
    },
  });

  return app;
}
