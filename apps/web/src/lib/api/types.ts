/**
 * Shapes returned by the AgentAxio management API (apps/api/src/management/*). Declared here by hand so the web app
 * never imports server code. The API is the source of truth: these are a view over it, and every decision they show was
 * made by the server. Parameter values appear only in ApprovalReview, which the server releases to approvers alone.
 */

export type OrgRole = "owner" | "admin" | "approver" | "viewer";

export interface Membership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
}

export interface Me {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  mfaFresh: boolean;
  memberships: Membership[];
  stepUpWindowMinutes: number;
}

export interface ApiAgent {
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

export interface ApiCredential {
  id: string;
  keyId: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

export type PolicyEffectName = "deny" | "require_approval" | "allow";

export interface ApiPolicy {
  id: string;
  action: string;
  agentId: string | null;
  agentName: string | null;
  environmentId: string | null;
  environment: string | null;
  version: number;
  versionId: string;
  effect: PolicyEffectName;
  enabled: boolean;
  priority: number;
  conditions: unknown;
  updatedAt: string;
}

export interface ApiEnvironment {
  id: string;
  name: string;
  state: "active" | "halted";
  policyEpoch: number;
}

export interface ApiRequest {
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

export interface ApiActivityEvent {
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

export type ApprovalStateName = "pending" | "approved" | "rejected" | "expired" | "canceled";

export interface ApiApprovalSummary {
  id: string;
  requestId: string;
  state: ApprovalStateName;
  agentId: string;
  agentName: string;
  environment: string;
  action: string;
  resource: string;
  requestStatus: string;
  createdAt: string;
  expiresAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface ApiApprovalReview extends ApiApprovalSummary {
  digest: string;
  parameters: Record<string, string> | null;
  parametersErased: boolean;
  policyChangedSinceRequest: boolean;
  decisionComment: string | null;
}

export interface ApiOverview {
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
  daily: Array<{
    day: string;
    requests: number;
    denied: number;
    approval: number;
    succeeded: number;
  }>;
}

export interface ApiMember {
  userId: string;
  email: string | null;
  role: OrgRole;
  createdAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; trace_id?: string; reason?: string; detail?: string };
}
