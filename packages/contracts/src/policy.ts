import { z } from "zod";
import { ACTION_CATALOG, isActionKey } from "./actions";
import { POLICY_EFFECTS } from "./vocabulary";

/**
 * Policy versions and their condition grammar (docs/BE-01A-ARCHITECTURE-REVIEW.md 5.3). Conditions are data, never
 * code: a flat AND of comparisons on parameter fields, using a fixed set of operators. There are no regular
 * expressions (ReDoS), no expressions, no scripting and no model calls.
 */

const fieldName = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .max(64);
const comparable = z.string().min(1).max(256);
const domain = z
  .string()
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/);

const ConditionSchema = z.discriminatedUnion("op", [
  z.strictObject({ field: fieldName, op: z.literal("eq"), value: comparable }),
  z.strictObject({ field: fieldName, op: z.literal("neq"), value: comparable }),
  z.strictObject({
    field: fieldName,
    op: z.literal("in"),
    value: z.array(comparable).min(1).max(100),
  }),
  z.strictObject({
    field: fieldName,
    op: z.literal("not_in"),
    value: z.array(comparable).min(1).max(100),
  }),
  z.strictObject({
    field: fieldName,
    op: z.literal("email_domain_in"),
    value: z.array(domain).min(1).max(100),
  }),
]);
export type PolicyCondition = z.infer<typeof ConditionSchema>;

/** `all: []` matches every request for the action, which is how "always require approval" is expressed. */
export const PolicyConditionsSchema = z.strictObject({ all: z.array(ConditionSchema).max(20) });
export type PolicyConditions = z.infer<typeof PolicyConditionsSchema>;

/** One immutable version of a policy. An edit creates a new version; a version never changes. */
export const PolicyVersionSchema = z.strictObject({
  id: z.string().min(1).max(64),
  policyId: z.string().min(1).max(64),
  organizationId: z.string().min(1).max(64),
  actionKey: z.string().min(1).max(64),
  /** `null` applies to every environment of the organization. */
  environmentId: z.string().min(1).max(64).nullable(),
  /** `null` applies to every agent in scope. */
  agentId: z.string().min(1).max(64).nullable(),
  effect: z.enum(POLICY_EFFECTS),
  conditions: PolicyConditionsSchema,
  priority: z.number().int().min(0).max(1000),
  enabled: z.boolean(),
});
export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;

export type PolicyWriteValidation = { ok: true } | { ok: false; issues: readonly string[] };

/**
 * Write-time validation: the action must exist, every condition must name a field of that action, and the operator
 * must suit the field. The evaluator re-checks defensively and fails closed, but a bad policy should never be saved.
 */
export function validatePolicyForAction(
  actionKey: string,
  conditions: unknown,
): PolicyWriteValidation {
  if (!isActionKey(actionKey)) return { ok: false, issues: ["actionKey: unknown_action"] };
  const parsed = PolicyConditionsSchema.safeParse(conditions);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `conditions.${i.path.join(".")}: ${i.code}`),
    };
  }
  const fields: Readonly<Record<string, string>> = ACTION_CATALOG[actionKey].fields;
  const issues: string[] = [];
  parsed.data.all.forEach((c, index) => {
    // Own properties only: "constructor" and "toString" must not pass as fields of the action.
    const kind = Object.hasOwn(fields, c.field) ? fields[c.field] : undefined;
    if (kind === undefined) issues.push(`conditions.all.${String(index)}.field: unknown_field`);
    else if (c.op === "email_domain_in" && kind !== "email") {
      issues.push(`conditions.all.${String(index)}.op: not_applicable_to_field`);
    }
  });
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
