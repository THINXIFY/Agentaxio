import { describe, expect, it } from "vitest";
import { IdempotencyKeySchema, validateActionRequest } from "./index";

const valid = () => ({
  action: "crm.lead.create",
  resource: "mockcrm/leads",
  parameters: { full_name: "Ada Example", email: "ada@example.test", company: "Sample Co" },
});

const invalid = (input: unknown) => {
  const r = validateActionRequest(input);
  expect(r.ok, JSON.stringify(input)).toBe(false);
  if (r.ok) throw new Error("unreachable");
  expect(r.kind).toBe("invalid");
  return r;
};

describe("validateActionRequest: accepts", () => {
  it("the golden-path request", () => {
    const r = validateActionRequest(valid());
    expect(r).toEqual({ ok: true, request: valid() });
  });

  it("normalizes email case/whitespace and trims names", () => {
    const r = validateActionRequest({
      ...valid(),
      parameters: {
        full_name: "  Ada Example ",
        email: " ADA@Example.TEST",
        company: "Sample Co ",
      },
    });
    expect(r.ok && r.request.parameters).toEqual(valid().parameters);
  });

  it("treats injection-looking text as plain data", () => {
    const payloads = [
      "Robert'); DROP TABLE leads;--",
      "<script>alert(1)</script>",
      "{{7*7}} ${process.env.X} $(rm -rf /)",
      "../../etc/passwd",
      "__proto__",
    ];
    for (const p of payloads) {
      const r = validateActionRequest({
        ...valid(),
        parameters: { ...valid().parameters, company: p },
      });
      expect(r.ok && r.request.parameters.company, p).toBe(p);
    }
  });
});

describe("validateActionRequest: rejects as invalid (422, no row)", () => {
  it("non-object bodies", () => {
    for (const body of [null, undefined, "x", 1, true, [], [valid()]]) invalid(body);
  });

  it("tenant, agent, environment and credential claims in the body", () => {
    for (const extra of [
      { organization_id: "org-b" },
      { organizationId: "org-b" },
      { agent_id: "agent-x" },
      { environment: "production" },
      { credential: "axo_x" },
      { connector: "real-crm" },
      { url: "http://evil.test" },
    ]) {
      invalid({ ...valid(), ...extra });
    }
  });

  it("unknown or missing parameter keys", () => {
    invalid({ ...valid(), parameters: { ...valid().parameters, phone: "123" } });
    invalid({ ...valid(), parameters: { full_name: "Ada", email: "a@example.test" } });
    invalid({ ...valid(), parameters: {} });
  });

  it("a __proto__ own key (prototype pollution attempt)", () => {
    const body = JSON.parse(
      '{"action":"crm.lead.create","resource":"mockcrm/leads","parameters":{"full_name":"A","email":"a@example.test","company":"C","__proto__":{"admin":true}}}',
    ) as unknown;
    invalid(body);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it("non-string and nested parameter values", () => {
    for (const v of [1, null, true, ["x"], { a: 1 }]) {
      invalid({ ...valid(), parameters: { ...valid().parameters, company: v } });
    }
  });

  it("bad email addresses", () => {
    for (const email of [
      "",
      "no-at-sign",
      "a@",
      "@b.test",
      "a b@example.test",
      "a@example",
      `ada@ex${String.fromCodePoint(0xe4)}mple.test`, // non-ASCII domain
      `${String.fromCodePoint(0x430)}da@example.test`, // Cyrillic look-alike "a"
      `${"a".repeat(250)}@example.test`,
    ]) {
      invalid({ ...valid(), parameters: { ...valid().parameters, email } });
    }
  });

  it("empty, whitespace-only and over-long text", () => {
    for (const company of ["", "   ", "x".repeat(121), "x".repeat(100_000)]) {
      invalid({ ...valid(), parameters: { ...valid().parameters, company } });
    }
  });

  it("control, zero-width and bidirectional characters", () => {
    const hidden = [0x0, 0xa, 0x9, 0x7f, 0x200b, 0x202e, 0x2066, 0xfeff, 0x2028].map((cp) =>
      String.fromCodePoint(cp),
    );
    for (const c of hidden) {
      invalid({ ...valid(), parameters: { ...valid().parameters, full_name: `Ada${c}Example` } });
    }
  });

  it("a non-canonical or wrong resource", () => {
    for (const resource of [
      "MockCRM/leads",
      "mockcrm/leads/",
      "mockcrm//leads",
      "/mockcrm/leads",
      " mockcrm/leads",
      "mockcrm/leads\u0000",
      "mockcrm/contacts",
      "realcrm/leads",
      "",
    ]) {
      invalid({ ...valid(), resource });
    }
  });

  it("malformed action keys", () => {
    for (const action of [
      "",
      "CRM.lead.create",
      "crm",
      "crm..create",
      "crm.lead.create;",
      "crm lead",
      "a".repeat(65),
      5,
      null,
    ]) {
      invalid({ ...valid(), action });
    }
  });

  it("issue summaries never contain submitted values", () => {
    const secret = "TopSecretPersonName";
    const r = invalid({
      ...valid(),
      parameters: { full_name: secret, email: "bad", company: "C", phone: secret },
    });
    expect(JSON.stringify(r.kind === "invalid" ? r.issues : [])).not.toContain(secret);
  });
});

describe("validateActionRequest: unknown action is a decision, not a validation error", () => {
  it("returns unknown_action for a well-formed key that is not in the catalog", () => {
    for (const action of ["crm.lead.delete", "payments.refund.create", "crm.contact.create"]) {
      expect(validateActionRequest({ ...valid(), action })).toEqual({
        ok: false,
        kind: "unknown_action",
      });
    }
  });

  it("does not look inherited properties up as actions", () => {
    for (const action of ["constructor.name", "to.string", "has.own"]) {
      const r = validateActionRequest({ ...valid(), action });
      expect(r.ok).toBe(false);
    }
  });
});

describe("IdempotencyKeySchema", () => {
  it("accepts UUIDs and similar", () => {
    for (const k of ["123e4567-e89b-12d3-a456-426614174000", "n8n_exec-1234567890:abc.def"]) {
      expect(IdempotencyKeySchema.safeParse(k).success, k).toBe(true);
    }
  });

  it("rejects short, long and unsafe keys", () => {
    for (const k of [
      "",
      "short",
      "x".repeat(129),
      "has space 1234567890",
      "bad/slash/1234567890",
      "new\nline-1234567890",
      5,
      null,
    ]) {
      expect(IdempotencyKeySchema.safeParse(k).success, String(k)).toBe(false);
    }
  });
});
