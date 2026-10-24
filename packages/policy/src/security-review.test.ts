import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PolicyEffect } from "@agentaxio/contracts";
import { evaluatePolicy, type EvaluationInput } from "./index";

/** Regression and boundary tests from the B1 security review (docs/BE-01-B1-SECURITY-REVIEW.md). */

const NOW = new Date("2026-10-24T12:00:00.000Z");
const principal = { organizationId: "org-a", agentId: "agent-1", environmentId: "env-dev" };
const parameters = { full_name: "Ada Example", email: "ada@example.test", company: "Sample Co" };

let n = 0;
function policy(over: Record<string, unknown> = {}) {
  n += 1;
  return {
    id: `pv-${String(n).padStart(5, "0")}`,
    policyId: `p-${String(n).padStart(5, "0")}`,
    organizationId: "org-a",
    actionKey: "crm.lead.create",
    environmentId: null,
    agentId: null,
    effect: "allow",
    conditions: { all: [] },
    priority: 0,
    enabled: true,
    ...over,
  };
}
const run = (policies: readonly unknown[], over: Partial<EvaluationInput> = {}) =>
  evaluatePolicy({ principal, action: "crm.lead.create", parameters, policies, now: NOW, ...over });

const isErrorDecision = (d: ReturnType<typeof run>) =>
  d.result === "deny" && d.reasonCode === "EVALUATOR_ERROR" && d.basis === "evaluator_error";

describe("review item 1: precedence over every combination of effects", () => {
  const effects: PolicyEffect[] = ["deny", "require_approval", "allow"];
  const subsets = Array.from({ length: 8 }, (_, mask) => effects.filter((_, i) => (mask >> i) & 1));

  it("is deny > require_approval > allow > implicit deny for all 8 combinations, all priorities, all orders", () => {
    for (const present of subsets) {
      const expected: PolicyEffect = present.includes("deny")
        ? "deny"
        : present.includes("require_approval")
          ? "require_approval"
          : present.includes("allow")
            ? "allow"
            : "deny";
      for (const priority of [0, 500, 1000]) {
        // The effect that should lose gets the highest priority.
        const list = present.map((effect) =>
          policy({ effect, priority: effect === expected ? 0 : priority }),
        );
        for (const ordering of [list, [...list].reverse()]) {
          const d = run(ordering);
          expect(d.result, JSON.stringify(present)).toBe(expected);
          if (present.length === 0) expect(d.basis).toBe("implicit_deny");
        }
      }
    }
  });

  it("a deny that matches only through conditions still beats a broader allow", () => {
    const allow = policy({ priority: 1000 });
    const deny = policy({
      effect: "deny",
      priority: 0,
      conditions: { all: [{ field: "email", op: "email_domain_in", value: ["example.test"] }] },
    });
    expect(run([allow, deny]).result).toBe("deny");
  });
});

describe("review item 8: an approval requirement cannot be bypassed by a general allow", () => {
  const approval = (over: Record<string, unknown> = {}) =>
    policy({ effect: "require_approval", ...over });
  const allow = (over: Record<string, unknown> = {}) => policy({ effect: "allow", ...over });

  it("holds whatever the priority, scope, order or number of allow rules", () => {
    const rules = [
      allow({ priority: 1000 }),
      allow({ priority: 1000, agentId: "agent-1" }),
      allow({ priority: 1000, environmentId: "env-dev", agentId: "agent-1" }),
      allow({
        priority: 1000,
        conditions: { all: [{ field: "company", op: "eq", value: "Sample Co" }] },
      }),
    ];
    const required = approval({ priority: 0 });
    expect(run([...rules, required]).result).toBe("require_approval");
    expect(run([required, ...rules]).result).toBe("require_approval");
    expect(run([...rules].reverse().concat(required)).result).toBe("require_approval");
  });

  it("applies to a narrow approval rule hidden among many allows", () => {
    const many = Array.from({ length: 200 }, () => allow({ priority: 1000 }));
    const narrow = approval({ agentId: "agent-1", environmentId: "env-dev" });
    expect(run([...many, narrow]).result).toBe("require_approval");
  });

  it("is lifted only when the approval rule genuinely does not match (not by priority)", () => {
    const other = approval({ agentId: "agent-2" });
    const unmatched = approval({
      conditions: { all: [{ field: "company", op: "eq", value: "Elsewhere" }] },
    });
    expect(run([allow(), other, unmatched]).result).toBe("allow");
  });

  it("is not lifted by a disabled approval rule combined with an allow (disabled means off, by design)", () => {
    expect(run([allow(), approval({ enabled: false })]).result).toBe("allow");
  });
});

describe("review item 2 and 7: malformed or non-allowlisted policies fail closed", () => {
  const withCondition = (condition: unknown) => policy({ conditions: { all: [condition] } });

  it("rejects fields outside the action's allowlist even when the request carries that key", () => {
    const extra = { ...parameters, phone: "1", constructor: "x", __proto__x: "y" };
    for (const field of [
      "phone",
      "constructor",
      "toString",
      "hasOwnProperty",
      "__proto__",
      "valueOf",
    ]) {
      const d = run([withCondition({ field, op: "eq", value: "1" })], { parameters: extra });
      expect(isErrorDecision(d), field).toBe(true);
    }
  });

  it("rejects operators outside the allowlist", () => {
    for (const op of [
      "regex",
      "matches",
      "like",
      "contains",
      "startsWith",
      "gt",
      "eval",
      "constructor",
      "__proto__",
      "EQ",
      "",
    ]) {
      expect(isErrorDecision(run([withCondition({ field: "company", op, value: "x" })])), op).toBe(
        true,
      );
    }
  });

  it("rejects an operator that does not suit the field, so a stored policy cannot apply email logic to free text", () => {
    const d = run(
      [
        policy({
          effect: "deny",
          conditions: { all: [{ field: "company", op: "email_domain_in", value: ["evil.test"] }] },
        }),
      ],
      {
        parameters: { ...parameters, company: "x@evil.test" },
      },
    );
    expect(isErrorDecision(d)).toBe(true);
  });

  it("refuses actions that are not in the catalog, even if a policy exists for them", () => {
    const d = run([policy({ actionKey: "payments.refund.create" })], {
      action: "payments.refund.create",
      parameters: {},
    });
    expect(isErrorDecision(d)).toBe(true);
  });

  it("rejects conflicting versions: the same policy twice, or the same version id twice", () => {
    const a = policy({ id: "v1", policyId: "p-same", effect: "allow" });
    const b = policy({ id: "v2", policyId: "p-same", effect: "deny" });
    expect(isErrorDecision(run([a, b]))).toBe(true);
    const c = policy({ id: "v3", policyId: "p-x" });
    const d = policy({ id: "v3", policyId: "p-y" });
    expect(isErrorDecision(run([c, d]))).toBe(true);
    expect(isErrorDecision(run([c, c]))).toBe(true);
  });

  it("does not let a conflict in another action's policies affect this action", () => {
    const x = policy({ id: "v1", policyId: "p-same", actionKey: "crm.contact.create" });
    const y = policy({ id: "v1", policyId: "p-same", actionKey: "crm.contact.create" });
    expect(run([x, y, policy()]).result).toBe("allow");
  });

  it("rejects structurally broken policies of every kind", () => {
    const polluted = JSON.parse(
      '{"id":"v","policyId":"p","organizationId":"org-a","actionKey":"crm.lead.create","environmentId":null,"agentId":null,"effect":"allow","conditions":{"all":[]},"priority":0,"enabled":true,"__proto__":{"effect":"allow"}}',
    ) as unknown;
    const broken: unknown[] = [
      polluted,
      policy({ effect: undefined }),
      policy({ priority: Number.NaN }),
      policy({ priority: Number.POSITIVE_INFINITY }),
      policy({ enabled: 1 }),
      policy({ enabled: undefined }),
      policy({ environmentId: undefined }),
      policy({ agentId: "" }),
      policy({
        conditions: {
          all: [{ field: "company", op: "in", value: Array.from({ length: 101 }, () => "x") }],
        },
      }),
      policy({
        conditions: {
          all: Array.from({ length: 21 }, () => ({ field: "company", op: "eq", value: "x" })),
        },
      }),
      policy({ conditions: { all: [{ field: "company", op: "eq", value: "x".repeat(257) }] } }),
      policy({ conditions: { all: [{ field: "Company", op: "eq", value: "x" }] } }),
      policy({ conditions: { all: [{ field: "company", op: "eq", value: "x", extra: 1 }] } }),
      policy({ conditions: { all: [{ field: "company", op: "in", value: "x" }] } }),
      policy({ conditions: { any: [] } }),
      policy({ conditions: [] }),
      Object.assign(Object.create(null) as object, policy({ effect: "bogus" })),
    ];
    for (const b of broken) {
      expect(isErrorDecision(run([policy(), b])), JSON.stringify(b)).toBe(true);
      expect(isErrorDecision(run([b])), JSON.stringify(b)).toBe(true);
    }
  });

  it("never lets a malformed policy produce an allow, whatever else is in the list", () => {
    fc.assert(
      fc.property(fc.anything(), fc.boolean(), (junk, allowFirst) => {
        const good = policy();
        const list = allowFirst
          ? [good, { actionKey: "crm.lead.create", junk }]
          : [{ actionKey: "crm.lead.create", junk }, good];
        expect(run(list).result).toBe("deny");
      }),
    );
  });
});

describe("review item 3: policy data cannot grant access across organizations", () => {
  it("fails closed when any policy for the action belongs to another organization, in either position", () => {
    const foreign = policy({ organizationId: "org-b", effect: "allow" });
    expect(isErrorDecision(run([foreign]))).toBe(true);
    expect(isErrorDecision(run([policy(), foreign]))).toBe(true);
    expect(isErrorDecision(run([foreign, policy()]))).toBe(true);
    expect(isErrorDecision(run([policy({ organizationId: "org-b", enabled: false })]))).toBe(true);
  });

  it("an organization with no policies of its own is denied even if other organizations allow everything", () => {
    const d = run([policy({ organizationId: "org-b" })], {
      principal: { ...principal, organizationId: "org-c" },
    });
    expect(d.result).toBe("deny");
    expect(d.policyVersionId).toBeNull();
  });

  it("scope by agent or environment id cannot cross organizations: only the organization check decides", () => {
    const foreign = policy({
      organizationId: "org-b",
      agentId: "agent-1",
      environmentId: "env-dev",
    });
    expect(run([foreign]).result).toBe("deny");
  });

  it("property: no policy set containing a policy of another organization can ever produce an allow", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<PolicyEffect>("allow", "require_approval", "deny"), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.constantFrom("org-b", "org-c", "ORG-A", "org-a ", ""),
        fc.nat(5),
        (effects, otherOrg, position) => {
          const list: unknown[] = effects.map((effect) => policy({ effect }));
          list.splice(
            Math.min(position, list.length),
            0,
            policy({ organizationId: otherOrg, effect: "allow" }),
          );
          expect(run(list).result).toBe("deny");
        },
      ),
    );
  });

  it("property: with matching organizations only, ids of other tenants in the principal never match", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (org) => {
        fc.pre(org !== "org-a");
        const d = run([policy()], { principal: { ...principal, organizationId: org } });
        expect(d.result).toBe("deny");
      }),
    );
  });
});

describe("review item 9: disabled policies", () => {
  it("are ignored by the evaluator as a second line of defence (the trusted loader should not supply them)", () => {
    expect(run([policy({ enabled: false })]).basis).toBe("implicit_deny");
    expect(run([policy({ enabled: false, effect: "deny" }), policy()]).result).toBe("allow");
  });

  it("are still validated, so a corrupt disabled policy blocks the action instead of hiding", () => {
    expect(isErrorDecision(run([policy({ enabled: false, effect: "bogus" })]))).toBe(true);
  });

  it("never appear in the list of matched versions", () => {
    const off = policy({ enabled: false });
    const on = policy();
    expect(run([off, on]).matchedPolicyVersionIds).toEqual([on.id]);
  });
});
