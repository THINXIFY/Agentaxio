import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockCrm, type MockCrm } from "./server";

/** The mock CRM is the protected destination: only the executor's token opens it, and it never creates a lead twice. */

const TOKEN = "t".repeat(40);
let crm: MockCrm;
let url: string;

beforeAll(async () => {
  crm = createMockCrm({ token: TOKEN });
  url = (await crm.listen()).url;
});
afterAll(async () => {
  await crm.close();
});

const lead = { full_name: "Ada Example", email: "ada@example.test", company: "Sample Co" };
const key = () => `key-${crypto.randomUUID()}`;
const post = (body: unknown, headers: Record<string, string> = {}, raw?: string) =>
  fetch(`${url}/leads`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      "idempotency-key": key(),
      ...headers,
    },
    body: raw ?? JSON.stringify(body),
  });

describe("access", () => {
  it("refuses requests without the service token, with a wrong one, or with another scheme", async () => {
    const before = crm.leads().length;
    for (const authorization of [
      undefined,
      "Bearer nope",
      `Bearer ${TOKEN}x`,
      `Basic ${TOKEN}`,
      TOKEN,
    ]) {
      const res = await fetch(`${url}/leads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key(),
          ...(authorization === undefined ? {} : { authorization }),
        },
        body: JSON.stringify(lead),
      });
      expect(res.status).toBe(401);
    }
    expect((await fetch(`${url}/leads`)).status).toBe(401);
    expect(crm.leads()).toHaveLength(before);
  });

  it("answers unknown paths and methods with 404, only to an authorized caller", async () => {
    const auth = { authorization: `Bearer ${TOKEN}` };
    expect((await fetch(`${url}/elsewhere`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${url}/leads`, { method: "DELETE", headers: auth })).status).toBe(404);
    expect((await fetch(`${url}/elsewhere`)).status).toBe(401);
  });
});

describe("creating a lead", () => {
  it("creates a lead and returns its id", async () => {
    const res = await post(lead);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toMatch(/^lead_[0-9a-f]{16}$/);
    expect(crm.leads().find((l) => l.id === body.id)).toMatchObject(lead);
  });

  it("is idempotent: the same key and lead returns the same id once; a different lead under that key conflicts", async () => {
    const k = key();
    const before = crm.leads().length;
    const first = await post(lead, { "idempotency-key": k });
    const again = await post(lead, { "idempotency-key": k });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { id: string }).id).toBe(
      ((await first.json()) as { id: string }).id,
    );
    expect((await post({ ...lead, company: "Other" }, { "idempotency-key": k })).status).toBe(409);
    expect(crm.leads()).toHaveLength(before + 1);
  });

  it("requires a well-formed Idempotency-Key", async () => {
    for (const bad of ["", "short", "has spaces in it which is not ok!!", "x".repeat(200)]) {
      expect((await post(lead, { "idempotency-key": bad })).status, bad).toBe(400);
    }
  });

  it("is strict about the body: exact fields, short printable strings, a plausible email, JSON only", async () => {
    const before = crm.leads().length;
    const bad: unknown[] = [
      { ...lead, extra: "field" },
      { full_name: lead.full_name, email: lead.email },
      { ...lead, email: "not-an-email" },
      { ...lead, full_name: "" },
      { ...lead, company: "x".repeat(121) },
      { ...lead, full_name: "line\nbreak" },
      { ...lead, company: 5 },
      [lead],
      null,
    ];
    for (const body of bad) expect((await post(body)).status, JSON.stringify(body)).toBe(422);
    expect((await post(undefined, {}, "{not json")).status).toBe(400);
    expect((await post(lead, { "content-type": "text/plain" })).status).toBe(415);
    expect(
      (await post(undefined, {}, JSON.stringify({ ...lead, company: "x".repeat(5000) }))).status,
    ).toBe(413);
    expect(crm.leads()).toHaveLength(before);
  });
});

describe("faults are set by the code that builds the server, never by a request", () => {
  it("simulates an unreachable-after-create, a refusal and a slow answer", async () => {
    const faulty = createMockCrm({ token: TOKEN });
    const address = (await faulty.listen()).url;
    const send = (extra: Record<string, string> = {}, signal?: AbortSignal) =>
      fetch(`${address}/leads`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
          "idempotency-key": key(),
          ...extra,
        },
        body: JSON.stringify(lead),
        ...(signal === undefined ? {} : { signal }),
      });
    try {
      // A request cannot switch a fault on, whatever it sends.
      const sneaky = await send({ "x-fault": "dropAfterCreate", "x-fail-with": "500" });
      expect(sneaky.status).toBe(201);

      faulty.faults.failWith = 503;
      expect((await send()).status).toBe(503);
      delete faulty.faults.failWith;

      faulty.faults.dropAfterCreate = true;
      const before = faulty.leads().length;
      await expect(send()).rejects.toThrow();
      expect(faulty.leads()).toHaveLength(before + 1); // created, but the caller never heard
      delete faulty.faults.dropAfterCreate;

      faulty.faults.delayMs = 400;
      await expect(send({}, AbortSignal.timeout(100))).rejects.toThrow();
    } finally {
      await faulty.close();
    }
  });
});
