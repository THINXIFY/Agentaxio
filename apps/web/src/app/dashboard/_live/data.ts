import type {
  ApiActivityEvent,
  ApiAgent,
  ApiApprovalReview,
  ApiApprovalSummary,
  ApiCredential,
  ApiEnvironment,
  ApiMember,
  ApiPolicy,
  ApiRequest,
} from "@/lib/api/types";
import { apiGet, type ApiResult } from "@/lib/api/server";

/** One function per read the live pages need. Each returns the API's own answer, success or failure, unchanged. */
export const getAgents = (base: string) => apiGet<ApiAgent[]>(`${base}/agents`);
export const getEnvironments = (base: string) => apiGet<ApiEnvironment[]>(`${base}/environments`);
export const getPolicies = (base: string) => apiGet<ApiPolicy[]>(`${base}/policies`);
export const getMembers = (base: string) => apiGet<ApiMember[]>(`${base}/members`);
export const getCredentials = (base: string, agentId: string) =>
  apiGet<ApiCredential[]>(`${base}/agents/${agentId}/credentials`);
export const getRequests = (base: string, limit: number, agentId?: string) =>
  apiGet<ApiRequest[]>(
    `${base}/requests?limit=${String(limit)}${agentId === undefined ? "" : `&agent_id=${agentId}`}`,
  );
export const getActivity = (base: string, limit: number) =>
  apiGet<ApiActivityEvent[]>(`${base}/activity?limit=${String(limit)}`);
export const getApprovals = (base: string, state: "pending" | "all", limit: number) =>
  apiGet<ApiApprovalSummary[]>(`${base}/approvals?state=${state}&limit=${String(limit)}`);
export const getApprovalReview = (base: string, id: string) =>
  apiGet<ApiApprovalReview>(`${base}/approvals/${id}`);

/** Email addresses by user id, for "decided by" lines. Falls back to nothing, never to a guess. */
export function memberEmails(members: ApiResult<ApiMember[]>): Map<string, string> {
  const map = new Map<string, string>();
  if (members.ok) for (const m of members.data) if (m.email !== null) map.set(m.userId, m.email);
  return map;
}
