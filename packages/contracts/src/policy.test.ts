import { describe, expect, it } from "vitest";
import { PolicyConditionsSchema, PolicyVersionSchema, validatePolicyForAction } from "./index";

const ok = (actionKey: string, conditions: unknown) =>
  validatePolicyForAction(actionKey, conditions);

describe("policy condition grammar", () => {
  it("accepts an unconditional policy and each operator", () => {
    expect(ok("crm.lead.create", { all: [] }).ok).toBe(true);
    expect(
      ok("crm.lead.create", { all: [{ field: "company", op: "eq", value: "Sample Co" }] }).ok,
    ).toBe(true);
    expect(
      ok("crm.lead.create", { all: [{ field: "company", op: "neq", value: "Sample Co" }] }).ok,
    ).toBe(true);
    expect(
      ok("crm.lead.create", { all: [{ field: "company", op: "in", value: ["A", "B"] }] }).ok,
    ).toBe(true);
    expect(
      ok("crm.lead.create", { all: [{ field: "company", op: "not_in", value: ["A"] }] }).ok,
    ).toBe(true);
    expect(
      ok("crm.lead.create", {
        all: [{ field: "email", op: "email_domain_in", value: ["example.test"] }],
      }).ok,
    ).toBe(true);
  });

  it("rejects prototype-named fields as unknown", () => {
    for (const field of ["constructor", "toString", "hasOwnProperty", "valueOf"]) {
      expect(ok("crm.lead.create", { all: [{ field, op: "eq", value: "x" }] }).ok, field).toBe(
        false,
      );
    }
  });

  it("rejects an unknown action", () => {
    expect(ok("crm.nothing.create", { all: [] })).toEqual({
      ok: false,
      issues: ["actionKey: unknown_action"],
    });
  });

  it("rejects fields the action does not have", () => {
    const r = ok("crm.lead.create", { all: [{ field: "phone", op: "eq", value: "1" }] });
    expect(r.ok).toBe(false);
  });

  it("rejects email_domain_in on a non-email field", () => {
    const r = ok("crm.lead.create", {
      all: [{ field: "company", op: "email_domain_in", value: ["example.test"] }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects anything that is not the fixed grammar (no regex, eval or scripting)", () => {
    for (const conditions of [
      { all: [{ field: "company", op: "matches", value: ".*" }] },
      { all: [{ field: "company", op: "regex", value: "(a+)+$" }] },
      { all: [{ field: "company", op: "eval", value: "1==1" }] },
      { all: [{ field: "company", op: "eq", value: "x", extra: true }] },
      { all: [{ field: "company", op: "eq", value: 5 }] },
      { all: [{ field: "company", op: "in", value: [] }] },
      { all: [{ field: "company", op: "in", value: "x" }] },
      { any: [] },
      { all: [], extra: 1 },
      { all: "x" },
      { all: Array.from({ length: 21 }, () => ({ field: "company", op: "eq", value: "x" })) },
      { all: [{ field: "company", op: "email_domain_in", value: ["Not A Domain"] }] },
      [],
      null,
    ]) {
      expect(ok("crm.lead.create", conditions).ok, JSON.stringify(conditions)).toBe(false);
    }
  });

  it("schema parsing is strict about extra keys", () => {
    expect(PolicyConditionsSchema.safeParse({ all: [], x: 1 }).success).toBe(false);
  });
});

describe("PolicyVersionSchema", () => {
  const valid = {
    id: "pv-1",
    policyId: "p-1",
    organizationId: "org-1",
    actionKey: "crm.lead.create",
    environmentId: null,
    agentId: null,
    effect: "allow",
    conditions: { all: [] },
    priority: 0,
    enabled: true,
  };

  it("accepts a well-formed version", () => {
    expect(PolicyVersionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown effects, bad priority and extra fields", () => {
    for (const patch of [
      { effect: "permit" },
      { effect: "ALLOW" },
      { priority: -1 },
      { priority: 1.5 },
      { priority: 1001 },
      { enabled: "yes" },
      { organizationId: "" },
      { surprise: true },
    ]) {
      expect(
        PolicyVersionSchema.safeParse({ ...valid, ...patch }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
  });
});
