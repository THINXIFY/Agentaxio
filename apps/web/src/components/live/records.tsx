import * as React from "react";
import Link from "next/link";
import { ArrowRight, Ban, CheckCircle2, ShieldX } from "lucide-react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { PlainStatusBadge } from "@/components/dashboard/plain-status";
import { LifecycleStages } from "@/components/dashboard/request-lifecycle";
import { Badge } from "@/components/ui/badge";
import { Code } from "@/components/ui/typography";
import {
  actionVerb,
  eventLabel,
  liveLifecycle,
  reasonText,
  relativeTime,
  toRequestStatus,
  type ApprovalFact,
} from "@/lib/api/present";
import type { ApiActivityEvent, ApiAgent, ApiRequest } from "@/lib/api/types";
import { formatDateTimeUtc } from "@/lib/format";
import { PLAIN_STATUS } from "@/lib/plain-language";

export function LiveAgentStatusBadge({ status }: { status: ApiAgent["status"] }) {
  if (status === "active")
    return (
      <Badge tone="success" className="px-3 py-1 text-[0.8125rem]">
        <CheckCircle2 aria-hidden="true" />
        Active
      </Badge>
    );
  if (status === "suspended")
    return (
      <Badge tone="warning" className="px-3 py-1 text-[0.8125rem]">
        <ShieldX aria-hidden="true" />
        Suspended
      </Badge>
    );
  return (
    <Badge tone="danger" className="px-3 py-1 text-[0.8125rem]">
      <Ban aria-hidden="true" />
      Revoked
    </Badge>
  );
}

/** Agents as a calm list, from the real registry. */
export function LiveAgentList({ agents }: { agents: readonly ApiAgent[] }) {
  return (
    <ul>
      {agents.map((a) => (
        <li
          key={a.id}
          className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-border/50 px-6 py-5 transition-colors duration-200 ease-standard first:border-t-0 hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div className="flex min-w-0 items-start gap-4">
            <AgentAvatar name={a.name} className="size-11 text-sm" />
            <div className="min-w-0">
              <h3 className="text-base font-medium">{a.name}</h3>
              <p className="mt-1 text-base leading-snug text-muted-foreground">
                {a.description ?? "No description yet."}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {a.environment} ·{" "}
                {a.activeCredentials === 0
                  ? "no active key"
                  : `${String(a.activeCredentials)} active key${a.activeCredentials === 1 ? "" : "s"}`}
                {a.pendingApprovals > 0
                  ? ` · ${String(a.pendingApprovals)} waiting for approval`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-15 sm:flex-col sm:items-end sm:gap-2 sm:pl-0">
            <LiveAgentStatusBadge status={a.status} />
            <Link
              href={`/dashboard/agents/${a.id}`}
              aria-label={`View details for ${a.name}`}
              className="group inline-flex items-center gap-1.5 rounded-sm py-1 text-base font-medium text-primary-text hover:underline"
            >
              View details
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One request in plain words, with its three separate facts available underneath. Submitted values are never shown here. */
export function LiveRequestItem({
  request,
  approval,
  details = true,
  headingLevel = 3,
}: {
  request: ApiRequest;
  approval?: ApprovalFact;
  details?: boolean;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  const status = toRequestStatus(request.status);
  const reason = reasonText(request.reasonCode);
  return (
    <li className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-border/50 px-6 py-5 transition-colors duration-200 ease-standard first:border-t-0 hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="flex min-w-0 items-start gap-4">
        <AgentAvatar name={request.agentName} className="size-11 text-sm" />
        <div className="min-w-0">
          <Heading className="text-base font-medium">{request.agentName}</Heading>
          <p className="mt-1 text-base leading-snug text-muted-foreground">
            {status === "pending_approval" ? "Wants to" : "Asked to"} {actionVerb(request.action)}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <time dateTime={request.createdAt} title={formatDateTimeUtc(request.createdAt)}>
              {relativeTime(request.createdAt)}
            </time>
            {" · "}
            {request.environment}
          </p>
        </div>
      </div>
      <div className="pl-15 sm:pl-0">
        <PlainStatusBadge status={status} />
      </div>
      {details ? (
        <details className="group/details sm:col-span-2 sm:pl-15">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-1 text-base font-medium text-primary-text marker:hidden hover:underline [&::-webkit-details-marker]:hidden">
            Details
          </summary>
          <div className="mt-3 space-y-5 rounded-control bg-surface-sunken p-5">
            <p className="text-base leading-relaxed">
              {PLAIN_STATUS[status].explanation}
              {reason ? <span className="text-muted-foreground"> {reason}</span> : null}
            </p>
            <div>
              <p className="mb-2.5 text-sm font-medium text-muted-foreground">
                Permission check, approval and result are separate steps
              </p>
              <LifecycleStages stages={liveLifecycle(status, approval)} />
            </div>
            <dl className="grid gap-x-8 gap-y-3 border-t border-border/60 pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Request ID</dt>
                <dd className="mt-1 font-mono break-all">{request.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last change</dt>
                <dd className="mt-1">{formatDateTimeUtc(request.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Action</dt>
                <dd className="mt-1">
                  <Code>{request.action}</Code>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fingerprint of the exact details</dt>
                <dd className="mt-1 font-mono break-all">{request.digest.slice(0, 16)}…</dd>
              </div>
            </dl>
          </div>
        </details>
      ) : null}
    </li>
  );
}

/** The audit trail: what happened, in order, by whom (a person, the system or an agent). Ids and codes only. */
export function LiveEventList({
  events,
  members,
}: {
  events: readonly ApiActivityEvent[];
  members: ReadonlyMap<string, string>;
}) {
  return (
    <ol>
      {events.map((e) => (
        <li
          key={e.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-border/50 px-6 py-3.5 first:border-t-0"
        >
          <p className="text-base">{eventLabel(e.event)}</p>
          <p className="text-sm text-muted-foreground">
            <time dateTime={e.occurredAt} title={formatDateTimeUtc(e.occurredAt)}>
              {relativeTime(e.occurredAt)}
            </time>
          </p>
          <p className="text-sm text-muted-foreground">
            {e.actorType === "user"
              ? `by ${(e.actorId !== null ? members.get(e.actorId) : undefined) ?? "a team member"}`
              : e.actorType === "agent"
                ? "by the agent"
                : "by AgentAxio"}
            {e.requestId !== null ? ` · request ${e.requestId.slice(0, 8)}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
