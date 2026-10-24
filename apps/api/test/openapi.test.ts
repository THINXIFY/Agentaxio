import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_REQUEST_STATUSES, ERROR_CODES, REASON_CODES } from "@agentaxio/contracts";
import { buildApp } from "../src/http/app";
import { createPool } from "../src/db/pool";

interface OpenApi {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }> };
}

const spec = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "openapi.json"), "utf8"),
) as OpenApi;

describe("the OpenAPI document matches the running service", () => {
  it("documents exactly the routes that exist", async () => {
    const pool = createPool("postgres://unused@127.0.0.1:1/none", "openapi");
    const app = buildApp({ agentPool: pool, pepper: Buffer.alloc(32, 1), logger: false });
    await app.ready();
    const actual = app.routeRegistry
      .map((r) => `${r.method} ${r.url.replace(/:(\w+)/g, "{$1}")}`)
      .sort();
    const documented = Object.entries(spec.paths)
      .flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`))
      .sort();
    expect(documented).toEqual(actual);
    await app.close();
    await pool.end();
  });

  it("uses the same vocabularies as the code", () => {
    const status = spec.components.schemas.ActionRequestStatus?.properties;
    expect(status?.status?.enum).toEqual([...ACTION_REQUEST_STATUSES]);
    expect(status?.reason_code?.enum).toEqual([...REASON_CODES]);
    const error = spec.components.schemas.Error?.properties as unknown as {
      error: { properties: { code: { enum: string[] } } };
    };
    expect(error.error.properties.code.enum).toEqual([...ERROR_CODES]);
  });

  it("documents every status code the service can return on each route", () => {
    expect(Object.keys(spec.paths["/v1/action-requests"]?.post?.responses ?? {}).sort()).toEqual(
      ["202", "401", "403", "409", "413", "415", "422", "429", "503"].sort(),
    );
    expect(
      Object.keys(spec.paths["/v1/action-requests/{id}"]?.get?.responses ?? {}).sort(),
    ).toEqual(["200", "401", "403", "404", "503"].sort());
  });
});
