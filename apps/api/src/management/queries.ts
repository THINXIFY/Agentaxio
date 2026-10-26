import { invalid, notFound } from "../errors";
import { assertUuid, type ManagementContext } from "./context";

/**
 * Read models for the dashboard. Every query runs under the signed-in member's organization context, so row-level
 * security limits it to that organization whatever the SQL says; none of them can return submitted parameter values
 * (the ciphertext column is not readable by this role) or credential digests.
 */

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

export interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "suspended" | "revoked";
  environment: string;
  environmentId: string;
  ownerUserId: string;
  createdAt: string;
  lastRequestAt: string | null;
  activeCredentials: number;
  pendingApprovals: number;
}

export async function listAgents(context: ManagementContext): Promise<AgentRow[]> {
  const r = await context.tx.query<{
    id: string;
    name: string;
    description: string | null;
    status: AgentRow["status"];
    environment: string;
    environment_id: string;
    owner_user_id: string;
    created_at: Date;
    last_request_at: Date | null;
    active_credentials: number;
    pending_approvals: number;
  }>(
    `SELECT a.id, a.name, a.description, a.status, e.name AS environment, a.environment_id, a.owner_user_id,
            a.created_at,
            (SELECT max(q.created_at) FROM axo.action_requests q WHERE q.agent_id = a.id) AS last_request_at,
            (SELECT count(*)::integer FROM axo.agent_credentials c
              WHERE c.agent_id = a.id AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > now())) AS active_credentials,
            (SELECT count(*)::integer FROM axo.approval_requests p JOIN axo.action_requests q ON q.id = p.action_request_id
              WHERE q.agent_id = a.id AND p.state = 'pending' AND p.expires_at > now()) AS pending_approvals
       FROM axo.agents a JOIN axo.environments e ON e.id = a.environment_id AND e.organization_id = a.organization_id
      ORDER BY (a.status = 'active') DESC, a.created_at DESC`,
  );
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    description: x.description,
    status: x.status,
    environment: x.environment,
    environmentId: x.environment_id,
    ownerUserId: x.owner_user_id,
    createdAt: x.created_at.toISOString(),
    lastRequestAt: iso(x.last_request_at),
    activeCredentials: x.active_credentials,
    pendingApprovals: x.pending_approvals,
  }));
}

export interface CredentialRow {
  id: string;
  keyId: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

export async function listCredentials(
  context: ManagementContext,
  input: { agentId: string },
): Promise<CredentialRow[]> {
  assertUuid(input.agentId, "agent id");
  const r = await context.tx.query<{
    id: string;
    key_id: string;
    created_at: Date;
    expires_at: Date | null;
    revoked_at: Date | null;
    revoked_reason: string | null;
  }>(
    `SELECT id, key_id, created_at, expires_at, revoked_at, revoked_reason FROM axo.agent_credentials
      WHERE agent_id = $1 ORDER BY created_at DESC`,
    [input.agentId],
  );
  return r.rows.map((x) => ({
    id: x.id,
    keyId: x.key_id,
    createdAt: x.created_at.toISOString(),
    expiresAt: iso(x.expires_at),
    revokedAt: iso(x.revoked_at),
    revokedReason: x.revoked_reason,
  }));
}

export interface PolicyRow {
  id: string;
  action: string;
  agentId: string | null;
  agentName: string | null;
  environmentId: string | null;
  environment: string | null;
  version: number;
  versionId: string;
  effect: "deny" | "require_approval" | "allow";
  enabled: boolean;
  priority: number;
  conditions: unknown;
  updatedAt: string;
}

export async function listPolicies(context: ManagementContext): Promise<PolicyRow[]> {
  const r = await context.tx.query<{
    id: string;
    action_key: string;
    agent_id: string | null;
    agent_name: string | null;
    environment_id: string | null;
    environment: string | null;
    version: number;
    version_id: string;
    effect: PolicyRow["effect"];
    enabled: boolean;
    priority: number;
    conditions: unknown;
    updated_at: Date;
  }>(
    `SELECT p.id, p.action_key, p.agent_id, a.name AS agent_name, p.environment_id, e.name AS environment,
            v.version, v.id AS version_id, v.effect, v.enabled, v.priority, v.conditions, v.created_at AS updated_at
       FROM axo.policies p
       JOIN LATERAL (SELECT * FROM axo.policy_versions x WHERE x.policy_id = p.id ORDER BY x.version DESC LIMIT 1) v ON true
       LEFT JOIN axo.agents a ON a.id = p.agent_id AND a.organization_id = p.organization_id
       LEFT JOIN axo.environments e ON e.id = p.environment_id AND e.organization_id = p.organization_id
      ORDER BY v.created_at DESC`,
  );
  return r.rows.map((x) => ({
    id: x.id,
    action: x.action_key,
    agentId: x.agent_id,
    agentName: x.agent_name,
    environmentId: x.environment_id,
    environment: x.environment,
    version: x.version,
    versionId: x.version_id,
    effect: x.effect,
    enabled: x.enabled,
    priority: x.priority,
    conditions: x.conditions,
    updatedAt: x.updated_at.toISOString(),
  }));
}

export interface PolicyVersionRow {
  version: number;
  effect: string;
  enabled: boolean;
  priority: number;
  conditions: unknown;
  createdAt: string;
  createdBy: string;
}

export async function listPolicyVersions(
  context: ManagementContext,
  input: { policyId: string },
): Promise<PolicyVersionRow[]> {
  assertUuid(input.policyId, "policy id");
  const r = await context.tx.query<{
    version: number;
    effect: string;
    enabled: boolean;
    priority: number;
    conditions: unknown;
    created_at: Date;
    created_by_user_id: string;
  }>(
    `SELECT version, effect, enabled, priority, conditions, created_at, created_by_user_id
       FROM axo.policy_versions WHERE policy_id = $1 ORDER BY version DESC`,
    [input.policyId],
  );
  if (r.rows.length === 0) throw notFound("policy not found");
  return r.rows.map((x) => ({
    version: x.version,
    effect: x.effect,
    enabled: x.enabled,
    priority: x.priority,
    conditions: x.conditions,
    createdAt: x.created_at.toISOString(),
    createdBy: x.created_by_user_id,
  }));
}

export interface EnvironmentRow {
  id: string;
  name: string;
  state: "active" | "halted";
  policyEpoch: number;
}

export async function listEnvironments(context: ManagementContext): Promise<EnvironmentRow[]> {
  const r = await context.tx.query<{
    id: string;
    name: string;
    enforcement_state: EnvironmentRow["state"];
    policy_epoch: string;
  }>("SELECT id, name, enforcement_state, policy_epoch FROM axo.environments ORDER BY name");
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    state: x.enforcement_state,
    policyEpoch: Number(x.policy_epoch),
  }));
}

export interface RequestRow {
  id: string;
  agentId: string;
  agentName: string;
  environment: string;
  action: string;
  resource: string;
  status: string;
  reasonCode: string | null;
  digest: string;
  createdAt: string;
  updatedAt: string;
}

/** Request history. The status reflects expiry at read time; reason codes are those an agent would also see. */
export async function listRequests(
  context: ManagementContext,
  filter: { limit?: number; agentId?: string } = {},
): Promise<RequestRow[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  if (filter.agentId !== undefined) assertUuid(filter.agentId, "agent id");
  const r = await context.tx.query<{
    id: string;
    agent_id: string;
    agent_name: string;
    environment: string;
    action_key: string;
    resource: string;
    status: string;
    reason_code: string | null;
    canonical_digest: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT r.id, r.agent_id, a.name AS agent_name, e.name AS environment, r.action_key, r.resource,
            CASE WHEN r.status = 'pending_approval' AND r.expires_at <= now() THEN 'expired'
                 WHEN r.status = 'queued_execution' AND g.consumed_at IS NULL AND g.expires_at <= now() THEN 'expired'
                 ELSE r.status END AS status,
            CASE r.status WHEN 'failed' THEN 'EXECUTION_FAILED' WHEN 'unknown' THEN 'OUTCOME_UNKNOWN'
                          WHEN 'denied' THEN d.reason_code WHEN 'pending_approval' THEN d.reason_code ELSE NULL END AS reason_code,
            r.canonical_digest, r.created_at, r.updated_at
       FROM axo.action_requests r
       JOIN axo.agents a ON a.id = r.agent_id AND a.organization_id = r.organization_id
       JOIN axo.environments e ON e.id = r.environment_id AND e.organization_id = r.organization_id
       LEFT JOIN axo.execution_grants g ON g.action_request_id = r.id
       LEFT JOIN LATERAL (SELECT x.reason_code FROM axo.decisions x WHERE x.action_request_id = r.id
                           ORDER BY x.decided_at DESC, x.id DESC LIMIT 1) d ON true
      WHERE ($1::uuid IS NULL OR r.agent_id = $1)
      ORDER BY r.created_at DESC LIMIT $2`,
    [filter.agentId ?? null, limit],
  );
  return r.rows.map((x) => ({
    id: x.id,
    agentId: x.agent_id,
    agentName: x.agent_name,
    environment: x.environment,
    action: x.action_key,
    resource: x.resource,
    status: x.status,
    reasonCode: x.reason_code,
    digest: x.canonical_digest,
    createdAt: x.created_at.toISOString(),
    updatedAt: x.updated_at.toISOString(),
  }));
}

export interface ActivityEvent {
  id: number;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  event: string;
  objectType: string;
  objectId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
}

/** The audit trail, newest first. Metadata holds ids, reason codes and field names only, never submitted values. */
export async function listActivity(
  context: ManagementContext,
  filter: { limit?: number; beforeId?: number; requestId?: string } = {},
): Promise<ActivityEvent[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  if (filter.beforeId !== undefined && !Number.isSafeInteger(filter.beforeId))
    throw invalid("beforeId must be an integer");
  if (filter.requestId !== undefined) assertUuid(filter.requestId, "request id");
  const r = await context.tx.query<{
    id: string;
    occurred_at: Date;
    actor_type: string;
    actor_id: string | null;
    event_type: string;
    object_type: string;
    object_id: string | null;
    request_id: string | null;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, occurred_at, actor_type, actor_id, event_type, object_type, object_id, request_id, metadata
       FROM axo.audit_events
      WHERE ($1::bigint IS NULL OR id < $1) AND ($2::uuid IS NULL OR request_id = $2)
      ORDER BY id DESC LIMIT $3`,
    [filter.beforeId ?? null, filter.requestId ?? null, limit],
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    occurredAt: x.occurred_at.toISOString(),
    actorType: x.actor_type,
    actorId: x.actor_id,
    event: x.event_type,
    objectType: x.object_type,
    objectId: x.object_id,
    requestId: x.request_id,
    metadata: x.metadata,
  }));
}

export interface ExecutionRow {
  requestId: string;
  state: string;
  connector: string;
  externalReference: string | null;
  errorClass: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function listExecutions(
  context: ManagementContext,
  input: { requestId: string },
): Promise<ExecutionRow[]> {
  assertUuid(input.requestId, "request id");
  const r = await context.tx.query<{
    action_request_id: string;
    state: string;
    connector: string;
    external_reference: string | null;
    error_class: string | null;
    started_at: Date;
    finished_at: Date | null;
  }>(
    `SELECT action_request_id, state, connector, external_reference, error_class, started_at, finished_at
       FROM axo.execution_attempts WHERE action_request_id = $1 ORDER BY started_at`,
    [input.requestId],
  );
  return r.rows.map((x) => ({
    requestId: x.action_request_id,
    state: x.state,
    connector: x.connector,
    externalReference: x.external_reference,
    errorClass: x.error_class,
    startedAt: x.started_at.toISOString(),
    finishedAt: iso(x.finished_at),
  }));
}

export interface Overview {
  agents: { active: number; suspended: number; revoked: number };
  pendingApprovals: number;
  last24Hours: {
    requests: number;
    denied: number;
    awaitingApproval: number;
    succeeded: number;
    failed: number;
    unknown: number;
  };
  /** Requests per UTC day for the last 7 days, oldest first. */
  daily: Array<{
    day: string;
    requests: number;
    denied: number;
    /** Waiting for a person, or expired without a decision. */
    approval: number;
    succeeded: number;
  }>;
}

export async function overview(context: ManagementContext): Promise<Overview> {
  const agents = await context.tx.query<{ status: "active" | "suspended" | "revoked"; n: number }>(
    "SELECT status, count(*)::integer AS n FROM axo.agents GROUP BY status",
  );
  const pending = await context.tx.query<{ n: number }>(
    "SELECT count(*)::integer AS n FROM axo.approval_requests WHERE state = 'pending' AND expires_at > now()",
  );
  const day = await context.tx.query<{
    requests: number;
    denied: number;
    awaiting: number;
    succeeded: number;
    failed: number;
    unknown: number;
  }>(
    `SELECT count(*)::integer AS requests,
            (count(*) FILTER (WHERE status = 'denied'))::integer AS denied,
            (count(*) FILTER (WHERE status = 'pending_approval' AND expires_at > now()))::integer AS awaiting,
            (count(*) FILTER (WHERE status = 'succeeded'))::integer AS succeeded,
            (count(*) FILTER (WHERE status = 'failed'))::integer AS failed,
            (count(*) FILTER (WHERE status = 'unknown'))::integer AS unknown
       FROM axo.action_requests WHERE created_at > now() - interval '24 hours'`,
  );
  const daily = await context.tx.query<{
    day: Date;
    requests: number;
    denied: number;
    approval: number;
    succeeded: number;
  }>(
    `SELECT (d AT TIME ZONE 'UTC')::date AS day,
            (SELECT count(*)::integer FROM axo.action_requests q WHERE q.created_at >= d AND q.created_at < d + interval '1 day') AS requests,
            (SELECT count(*)::integer FROM axo.action_requests q WHERE q.created_at >= d AND q.created_at < d + interval '1 day' AND q.status = 'denied') AS denied,
            (SELECT count(*)::integer FROM axo.action_requests q WHERE q.created_at >= d AND q.created_at < d + interval '1 day' AND q.status IN ('pending_approval', 'expired')) AS approval,
            (SELECT count(*)::integer FROM axo.action_requests q WHERE q.created_at >= d AND q.created_at < d + interval '1 day' AND q.status = 'succeeded') AS succeeded
       FROM generate_series(date_trunc('day', now(), 'UTC') - interval '6 days', date_trunc('day', now(), 'UTC'), interval '1 day') d
      ORDER BY d`,
  );
  const count = (status: string) => agents.rows.find((a) => a.status === status)?.n ?? 0;
  const today = day.rows[0];
  return {
    agents: { active: count("active"), suspended: count("suspended"), revoked: count("revoked") },
    pendingApprovals: pending.rows[0]?.n ?? 0,
    last24Hours: {
      requests: today?.requests ?? 0,
      denied: today?.denied ?? 0,
      awaitingApproval: today?.awaiting ?? 0,
      succeeded: today?.succeeded ?? 0,
      failed: today?.failed ?? 0,
      unknown: today?.unknown ?? 0,
    },
    daily: daily.rows.map((x) => ({
      day: x.day.toISOString().slice(0, 10),
      requests: x.requests,
      denied: x.denied,
      approval: x.approval,
      succeeded: x.succeeded,
    })),
  };
}
