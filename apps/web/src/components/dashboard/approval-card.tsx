"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { RequestSentence } from "@/components/dashboard/activity-item";
import { PlainStatusBadge } from "@/components/dashboard/plain-status";
import { RequestDetails } from "@/components/dashboard/request-details";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatDateTimeUtc } from "@/lib/format";
import { formatAgo, type DashboardRequest } from "@/mocks/dashboard";

const DEMO_ONLY_HINT =
  "Demonstration only. Approving is not connected to a backend, so nothing is approved or run here.";

/**
 * Approve / Reject for the PREVIEW. They are intentionally unavailable: `aria-disabled` keeps them focusable so keyboard
 * and screen-reader users can reach the explanation, and the click handler does nothing. The reason is also visible text
 * beside the buttons (tooltips alone are invisible on touch devices).
 */
export function DemoOnlyApprovalActions({ requestId }: { requestId: string }) {
  const noteId = `demo-only-${requestId}`;
  const disabledClass = "aria-disabled:pointer-events-auto cursor-not-allowed";
  const swallow = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex items-center gap-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-disabled="true"
              aria-describedby={noteId}
              onClick={swallow}
              className={disabledClass}
            >
              Approve
            </Button>
          </TooltipTrigger>
          <TooltipContent>{DEMO_ONLY_HINT}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              aria-disabled="true"
              aria-describedby={noteId}
              onClick={swallow}
              className={disabledClass}
            >
              Reject
            </Button>
          </TooltipTrigger>
          <TooltipContent>{DEMO_ONLY_HINT}</TooltipContent>
        </Tooltip>
      </div>
      <p id={noteId} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <FlaskConical className="size-4 shrink-0 text-warning-text" aria-hidden="true" />
        Demo only · not connected to a backend
      </p>
    </div>
  );
}

/**
 * A request that needs, or recently had, a person's decision: who asked, what for, and why a person is involved. Pending
 * requests offer (disabled) reviewer actions; reviewed ones show where they ended up. Technical detail is collapsed.
 */
export function ApprovalCard({
  request,
  headingLevel = 3,
  className,
}: {
  request: DashboardRequest;
  /** 2 when the card sits directly under the page h1; 3 inside a section that has its own h2. */
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  const pending = request.status === "pending_approval";
  return (
    <article
      aria-label={`${request.agentName}: ${request.parameters.full_name}`}
      className={cn(
        "min-w-0 rounded-card border bg-surface p-6 transition-colors duration-200 ease-standard hover:bg-surface-hover",
        pending ? "border-warning-border/60" : "border-border/60",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          <AgentAvatar name={request.agentName} className="size-11 text-sm" />
          <div className="min-w-0">
            <Heading className="text-lg font-medium">{request.agentName}</Heading>
            <p className="text-sm text-muted-foreground">
              <time dateTime={request.createdAt} title={formatDateTimeUtc(request.createdAt)}>
                Asked {formatAgo(request.createdAt)}
              </time>
            </p>
          </div>
        </div>
        <PlainStatusBadge status={request.status} />
      </header>

      <p className="mt-5 text-lg leading-snug">
        <RequestSentence request={request} lead={pending ? "Wants to" : "Wanted to"} />
      </p>
      <p className="mt-2 text-base leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Why a person is asked: </span>
        {request.decisionReason}
      </p>

      {pending ? (
        <div className="mt-6">
          <DemoOnlyApprovalActions requestId={request.id} />
        </div>
      ) : request.approvedBy ? (
        <p className="mt-4 text-base text-muted-foreground">Reviewed by {request.approvedBy}.</p>
      ) : null}

      <RequestDetails request={request} className="mt-5" />
    </article>
  );
}

/**
 * Compact version for the Overview: what the agent wants and why, with a single way to go and look. No reviewer buttons
 * here, so Overview never shows a control that does nothing.
 */
export function PendingItem({ request }: { request: DashboardRequest }) {
  return (
    <li className="border-t border-border/50 px-6 py-5 transition-colors duration-200 ease-standard first:border-t-0 hover:bg-surface-hover">
      <div className="flex items-start gap-4">
        <AgentAvatar name={request.agentName} className="size-11 text-sm" />
        <div className="min-w-0">
          <h3 className="text-base font-medium">{request.agentName}</h3>
          <p className="mt-1 text-base leading-snug">
            <RequestSentence request={request} lead="Wants to" />
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <time dateTime={request.createdAt} title={formatDateTimeUtc(request.createdAt)}>
              Asked {formatAgo(request.createdAt)}
            </time>
            {" · "}
            {request.decisionReason}
          </p>
          <Link
            href="/dashboard/approvals"
            aria-label={`Review request from ${request.agentName}`}
            className="group mt-2 inline-flex items-center gap-1.5 rounded-sm py-1 text-base font-medium text-primary-text hover:underline"
          >
            Review
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </li>
  );
}
