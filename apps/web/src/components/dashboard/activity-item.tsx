import * as React from "react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { PlainStatusBadge } from "@/components/dashboard/plain-status";
import { RequestDetails } from "@/components/dashboard/request-details";
import { formatDateTimeUtc } from "@/lib/format";
import { requestSentence } from "@/lib/plain-language";
import { formatAgo, type DashboardRequest } from "@/mocks/dashboard";

/** "Lead Intake Agent tried to add a lead to the CRM: Ada Lovelace at Analytical Engines." */
export function RequestSentence({
  request,
  lead = "Asked to",
}: {
  request: DashboardRequest;
  /** How the sentence starts: "Asked to" for history, "Wants to" for something still waiting. */
  lead?: string;
}) {
  return (
    <>
      {lead} {requestSentence(request)}
    </>
  );
}

/**
 * One thing an agent did or tried to do, in plain words: the agent, what it wanted, when, and what happened. `details`
 * adds a collapsed disclosure with the precise, technical record.
 */
export function ActivityItem({
  request,
  details = false,
  headingLevel = 3,
}: {
  request: DashboardRequest;
  details?: boolean;
  /** 2 when the list sits directly under the page h1; 3 inside a panel that has its own h2. */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <li className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-border/50 px-6 py-5 transition-colors duration-200 ease-standard first:border-t-0 hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="flex min-w-0 items-start gap-4">
        <AgentAvatar name={request.agentName} className="size-11 text-sm" />
        <div className="min-w-0">
          <Heading className="text-base font-medium">{request.agentName}</Heading>
          <p className="mt-1 text-base leading-snug text-muted-foreground">
            <RequestSentence
              request={request}
              lead={request.status === "pending_approval" ? "Wants to" : "Asked to"}
            />
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <time dateTime={request.createdAt} title={formatDateTimeUtc(request.createdAt)}>
              {formatAgo(request.createdAt)}
            </time>
            {" · "}
            {request.application}
          </p>
        </div>
      </div>
      <div className="pl-15 sm:pl-0">
        <PlainStatusBadge status={request.status} />
      </div>
      {details ? <RequestDetails request={request} className="sm:col-span-2 sm:pl-15" /> : null}
    </li>
  );
}
