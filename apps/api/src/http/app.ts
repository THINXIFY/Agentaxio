import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type pg from "pg";
import type { ErrorCode } from "@agentaxio/contracts";
import { LIMITS } from "../config";
import { bearerFromHeader, parseCredential } from "../credentials/keys";
import { getActionRequestStatus } from "../authorization/status";
import { submitActionRequest } from "../authorization/submit";

/**
 * The agent-facing HTTP API: exactly two routes (docs/BE-01A-ARCHITECTURE-REVIEW.md section 8.1).
 *
 *   POST /v1/action-requests        propose an action; the tenant, agent and environment come from the credential
 *   GET  /v1/action-requests/:id    status of the same agent's request
 *
 * Properties this file is responsible for:
 *   - every route declares an auth class and the registry is exposed so a test can prove none is missing;
 *   - every failure path is fail-closed: anything that is not a clean, committed decision is a 4xx or a 503, never a
 *     permissive answer;
 *   - errors are generic to the caller and traceable by trace_id; logs never contain bodies, headers, keys or
 *     database error text (which can echo submitted values).
 */

export type AuthClass = "agent";
export interface RegisteredRoute {
  method: string;
  url: string;
  auth: AuthClass | undefined;
}

export interface AppDeps {
  agentPool: pg.Pool;
  pepper: Buffer;
  /** Fastify logger options; `false` disables logging. */
  logger?: false | { level: string; stream?: { write(message: string): void } };
}

declare module "fastify" {
  interface FastifyContextConfig {
    auth?: AuthClass;
  }
  interface FastifyInstance {
    routeRegistry: RegisteredRoute[];
  }
}

const MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Authentication failed.",
  FORBIDDEN: "Not permitted.",
  AGENT_SUSPENDED: "This agent is suspended.",
  NOT_FOUND: "Not found.",
  IDEMPOTENCY_CONFLICT: "The Idempotency-Key was already used with a different request.",
  PAYLOAD_TOO_LARGE: "The request body is too large.",
  UNSUPPORTED_MEDIA_TYPE: "Content-Type must be application/json.",
  INVALID_REQUEST: "The request is invalid.",
  RATE_LIMITED: "Too many pending requests. Try again later.",
  SERVICE_UNAVAILABLE: "The service could not complete the request. Nothing was authorized.",
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
    .send({ error: { code, message: MESSAGES[code], trace_id: reply.request.id, ...extra } });
}

const header = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value.join(", ") : value;

export function buildApp(deps: AppDeps): FastifyInstance {
  const logger = deps.logger ?? false;
  const app = Fastify({
    logger:
      logger === false
        ? false
        : {
            level: logger.level,
            ...(logger.stream === undefined ? {} : { stream: logger.stream }),
            // Authorization is never logged, and requests are logged as method and path only: no headers, no body.
            redact: ["req.headers.authorization", "req.headers.cookie"],
            serializers: {
              req: (req: FastifyRequest) => ({
                method: req.method,
                path: req.url.split("?")[0]?.slice(0, 120),
                id: req.id,
              }),
            },
          },
    bodyLimit: LIMITS.bodyBytes,
    genReqId: () => randomUUID(),
    exposeHeadRoutes: false,
    trustProxy: false,
  });

  const registry: RegisteredRoute[] = [];
  app.decorate("routeRegistry", registry);
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods)
      registry.push({ method, url: route.url, auth: route.config?.auth });
  });

  app.addHook("onSend", (_request, reply, payload, done) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    done(null, payload);
  });

  // Authentication comes first: a request without a well-formed credential is refused before its body is read.
  app.addHook("onRequest", (request, reply, done) => {
    if (request.routeOptions.config.auth === "agent") {
      const presented = bearerFromHeader(header(request.headers.authorization));
      if (presented === null || parseCredential(presented) === null) {
        reply.header("www-authenticate", "Bearer");
        fail(reply, 401, "UNAUTHENTICATED");
        return;
      }
    }
    done();
  });

  app.setNotFoundHandler((_request, reply) => fail(reply, 404, "NOT_FOUND"));

  app.setErrorHandler((error: unknown, request, reply) => {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
    if (statusCode === 413) return fail(reply, 413, "PAYLOAD_TOO_LARGE");
    if (statusCode === 415) return fail(reply, 415, "UNSUPPORTED_MEDIA_TYPE");
    if (statusCode === 400) return fail(reply, 422, "INVALID_REQUEST");
    // Anything else is an infrastructure or programming failure. Log the kind only: database error text can contain
    // the values that were submitted.
    const name = error instanceof Error ? error.name : "Error";
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;
    request.log.error({ errorName: name, errorCode: code }, "request failed closed");
    return fail(reply, 503, "SERVICE_UNAVAILABLE");
  });

  app.post("/v1/action-requests", { config: { auth: "agent" } }, async (request, reply) => {
    const outcome = await submitActionRequest(deps.agentPool, deps.pepper, {
      authorization: header(request.headers.authorization),
      idempotencyKey: header(request.headers["idempotency-key"]),
      body: request.body,
      traceId: request.id,
    });
    switch (outcome.kind) {
      case "unauthenticated":
        reply.header("www-authenticate", "Bearer");
        return fail(reply, 401, "UNAUTHENTICATED");
      case "agent_suspended":
        return fail(reply, 403, "AGENT_SUSPENDED");
      case "invalid":
        return fail(reply, 422, "INVALID_REQUEST", { issues: outcome.issues });
      case "idempotency_conflict":
        return fail(reply, 409, "IDEMPOTENCY_CONFLICT");
      case "rate_limited":
        reply.header("retry-after", "30");
        return fail(reply, 429, "RATE_LIMITED");
      case "decided":
        if (outcome.replay) reply.header("idempotent-replayed", "true");
        return reply
          .code(outcome.httpStatus)
          .type("application/json")
          .send({
            id: outcome.id,
            status: outcome.status,
            ...(outcome.reasonCode === null ? {} : { reason_code: outcome.reasonCode }),
          });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/v1/action-requests/:id",
    { config: { auth: "agent" } },
    async (request, reply) => {
      const outcome = await getActionRequestStatus(
        deps.agentPool,
        deps.pepper,
        header(request.headers.authorization),
        request.params.id,
      );
      switch (outcome.kind) {
        case "unauthenticated":
          reply.header("www-authenticate", "Bearer");
          return fail(reply, 401, "UNAUTHENTICATED");
        case "agent_suspended":
          return fail(reply, 403, "AGENT_SUSPENDED");
        case "not_found":
          return fail(reply, 404, "NOT_FOUND");
        case "found":
          return reply
            .code(200)
            .type("application/json")
            .send({
              id: outcome.id,
              status: outcome.status,
              ...(outcome.reasonCode === null ? {} : { reason_code: outcome.reasonCode }),
            });
      }
    },
  );

  return app;
}
