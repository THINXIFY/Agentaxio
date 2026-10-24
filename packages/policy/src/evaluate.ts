import {
  PolicyVersionSchema,
  type PolicyEffect,
  type PolicyCondition,
  type PolicyVersion,
  type ReasonCode,
} from "@agentaxio/contracts";

/**
 * The deterministic policy evaluator (docs/BE-01A-ARCHITECTURE-REVIEW.md 5.3).
 *
 * Pure: no network, no database, no clock, no randomness, no model. Given the same input it returns the same output.
 * Precedence: deny > require_approval > allow > implicit deny. It never throws. Anything unexpected (malformed
 * policy, unknown operator, a condition naming a field the request does not have, a policy belonging to another
 * organization, bad input) produces a `deny` with reason EVALUATOR_ERROR, because a failure to decide is not a
 * permission.
 */

export interface Principal {
  organizationId: string;
  agentId: string;
  environmentId: string;
}

export interface EvaluationInput {
  principal: Principal;
  /** A catalog action key, already validated by the contracts package. */
  action: string;
  /** The normalized parameters that will be digested, reviewed and executed. */
  parameters: Readonly<Record<string, unknown>>;
  /** Candidate policy versions for the principal's organization. Anything else in the list is an error. */
  policies: readonly unknown[];
  /** Recorded in the result so a decision is reproducible; V1 rules have no time-dependent conditions. */
  now: Date;
}

export type DecisionBasis =
  "explicit_deny" | "approval_rule" | "allow_rule" | "implicit_deny" | "evaluator_error";

export interface PolicyDecision {
  result: PolicyEffect;
  /** `null` for a plain allow. */
  reasonCode: ReasonCode | null;
  basis: DecisionBasis;
  /** The policy version that decided the outcome; `null` for an implicit deny or an error. */
  policyVersionId: string | null;
  /** Every applicable policy version whose conditions matched, sorted, for the audit record. */
  matchedPolicyVersionIds: readonly string[];
  /** ISO time of the evaluation, `null` only when `now` itself was unusable. */
  evaluatedAt: string | null;
}

const EFFECT_ORDER: readonly PolicyEffect[] = ["deny", "require_approval", "allow"];

const failClosed = (now: unknown): PolicyDecision => ({
  result: "deny",
  reasonCode: "EVALUATOR_ERROR",
  basis: "evaluator_error",
  policyVersionId: null,
  matchedPolicyVersionIds: [],
  evaluatedAt: now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : null,
});

export function evaluatePolicy(input: EvaluationInput): PolicyDecision {
  try {
    return evaluate(input);
  } catch {
    return failClosed((input as { now?: unknown } | null | undefined)?.now);
  }
}

function requireText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError("expected text");
  return value;
}

function evaluate(input: EvaluationInput): PolicyDecision {
  const organizationId = requireText(input.principal.organizationId);
  const agentId = requireText(input.principal.agentId);
  const environmentId = requireText(input.principal.environmentId);
  const action = requireText(input.action);
  if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
    throw new TypeError("invalid time");
  }
  const parameters: unknown = input.parameters;
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new TypeError("invalid parameters");
  }
  if (!Array.isArray(input.policies)) throw new TypeError("invalid policy list");

  const matched: PolicyVersion[] = [];
  for (const raw of input.policies as unknown[]) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new TypeError("malformed policy");
    }
    // Only policies for this action are examined; a malformed policy for another action cannot affect this one.
    const policyAction = (raw as { actionKey?: unknown }).actionKey;
    if (typeof policyAction !== "string") throw new TypeError("policy without an action");
    if (policyAction !== action) continue;

    const policy = PolicyVersionSchema.parse(raw);
    if (policy.organizationId !== organizationId)
      throw new Error("policy from another organization");
    if (!policy.enabled) continue;
    if (policy.environmentId !== null && policy.environmentId !== environmentId) continue;
    if (policy.agentId !== null && policy.agentId !== agentId) continue;
    if (policy.conditions.all.every((c) => conditionHolds(c, input.parameters)))
      matched.push(policy);
  }

  const evaluatedAt = input.now.toISOString();
  const matchedPolicyVersionIds = matched.map((p) => p.id).sort();

  for (const effect of EFFECT_ORDER) {
    const winner = matched.filter((p) => p.effect === effect).sort(byPriorityThenId)[0];
    if (winner !== undefined) {
      return {
        result: effect,
        reasonCode:
          effect === "deny"
            ? "POLICY_DENY"
            : effect === "require_approval"
              ? "HUMAN_REVIEW_REQUIRED"
              : null,
        basis:
          effect === "deny"
            ? "explicit_deny"
            : effect === "require_approval"
              ? "approval_rule"
              : "allow_rule",
        policyVersionId: winner.id,
        matchedPolicyVersionIds,
        evaluatedAt,
      };
    }
  }

  return {
    result: "deny",
    reasonCode: "POLICY_DENY",
    basis: "implicit_deny",
    policyVersionId: null,
    matchedPolicyVersionIds,
    evaluatedAt,
  };
}

/** Which policy is credited with a decision: highest priority first, then the smallest id, so ties are stable. */
function byPriorityThenId(a: PolicyVersion, b: PolicyVersion): number {
  return b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function conditionHolds(
  condition: PolicyCondition,
  parameters: Readonly<Record<string, unknown>>,
): boolean {
  // A condition about a field the request does not carry means policy and schema disagree: that is an error, not "false".
  if (!Object.hasOwn(parameters, condition.field)) throw new Error("condition field missing");
  const actual = parameters[condition.field];
  if (typeof actual !== "string") throw new TypeError("condition field is not text");

  switch (condition.op) {
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "in":
      return condition.value.includes(actual);
    case "not_in":
      return !condition.value.includes(actual);
    case "email_domain_in": {
      const at = actual.lastIndexOf("@");
      if (at < 1 || at === actual.length - 1) throw new Error("value is not an email address");
      return condition.value.includes(actual.slice(at + 1).toLowerCase());
    }
  }
}
