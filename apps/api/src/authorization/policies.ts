import { LIMITS } from "../config";
import type { Tx } from "../db/pool";

/**
 * The trusted policy-loading layer (docs/BE-01-B1-SECURITY-REVIEW.md, section 5). It returns only the CURRENT version
 * of each policy that is ENABLED and can apply to the authenticated agent. Row-level security has already narrowed
 * the rows to the agent's organization, environment and scope; the evaluator re-validates every row regardless.
 *
 * Runs in the same transaction as the decision, after axo.enter_agent_context took a shared lock on the environment,
 * so the policies and the policy epoch read there are a matching pair.
 */

export class PolicyLoadError extends Error {}

interface PolicyRow {
  id: string;
  policy_id: string;
  organization_id: string;
  action_key: string;
  environment_id: string | null;
  agent_id: string | null;
  effect: string;
  conditions: unknown;
  priority: number;
  enabled: boolean;
}

export async function loadCurrentPolicies(tx: Tx, actionKey: string): Promise<unknown[]> {
  const result = await tx.query<PolicyRow>(
    `SELECT v.id, p.id AS policy_id, p.organization_id, p.action_key, p.environment_id, p.agent_id,
            v.effect, v.conditions, v.priority, v.enabled
       FROM axo.policies p
       JOIN LATERAL (SELECT * FROM axo.policy_versions x WHERE x.policy_id = p.id
                      ORDER BY x.version DESC LIMIT 1) v ON true
      WHERE p.action_key = $1 AND v.enabled
      LIMIT $2`,
    [actionKey, LIMITS.maxPoliciesPerDecision + 1],
  );
  if (result.rows.length > LIMITS.maxPoliciesPerDecision) {
    throw new PolicyLoadError("too many policies to evaluate");
  }
  return result.rows.map((r) => ({
    id: r.id,
    policyId: r.policy_id,
    organizationId: r.organization_id,
    actionKey: r.action_key,
    environmentId: r.environment_id,
    agentId: r.agent_id,
    effect: r.effect,
    conditions: r.conditions,
    priority: r.priority,
    enabled: r.enabled,
  }));
}
