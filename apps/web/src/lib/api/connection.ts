import type { ApiAgent } from "./types";

/**
 * How connected is the n8n integration, from facts AgentAxio actually has?
 *
 * AgentAxio cannot tell n8n from any other caller of its API: it knows only that a request arrived with an agent's key. So
 * "receiving requests" means exactly that, and the page says so. Nothing here probes n8n or claims a workflow is healthy.
 */
export type ConnectionState =
  /** No usable agent exists. */
  | "no-agent"
  /** There are agents, but none has an active access key. */
  | "no-key"
  /** At least one agent has a key, and no request has arrived yet. */
  | "waiting"
  /** A request has arrived with an agent key. */
  | "receiving";

export interface AgentConnection {
  id: string;
  name: string;
  environment: string;
  status: ApiAgent["status"];
  hasActiveKey: boolean;
  lastRequestAt: string | null;
}

export interface Connection {
  state: ConnectionState;
  /** The most recent request from any usable agent, or null. */
  lastRequestAt: string | null;
  agents: AgentConnection[];
}

export function describeConnection(agents: readonly ApiAgent[]): Connection {
  const usable = agents.filter((a) => a.status !== "revoked");
  const rows: AgentConnection[] = usable.map((a) => ({
    id: a.id,
    name: a.name,
    environment: a.environment,
    status: a.status,
    hasActiveKey: a.activeCredentials > 0,
    lastRequestAt: a.lastRequestAt,
  }));
  // Only an agent that is switched on and holds a key can be "connected".
  const live = rows.filter((a) => a.status === "active" && a.hasActiveKey);
  const seen = live
    .map((a) => a.lastRequestAt)
    .filter((t): t is string => t !== null)
    .sort()
    .at(-1);
  const state: ConnectionState =
    rows.length === 0
      ? "no-agent"
      : live.length === 0
        ? "no-key"
        : seen === undefined
          ? "waiting"
          : "receiving";
  return { state, lastRequestAt: seen ?? null, agents: rows };
}

export const DEFAULT_AGENT_API_URL = "http://127.0.0.1:8787";
export const WORKFLOW_FILE = "/n8n/agentaxio-crm-lead-create.workflow.json";
