"use client";

import * as React from "react";
import { Info, TriangleAlert } from "lucide-react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { PlainStatusBadge } from "@/components/dashboard/plain-status";
import { ActionError, useApiAction } from "@/components/live/use-api-action";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { actionVerb, relativeTime, timeLeft } from "@/lib/api/present";
import type { ApiApprovalReview, ApiApprovalSummary } from "@/lib/api/types";
import { formatDateTimeUtc } from "@/lib/format";

const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  email: "Email",
  company: "Company",
};

interface DecisionAnswer {
  outcome: string;
  requestStatus: string;
}

/**
 * A request waiting for a person. The reviewer sees the exact values the agent submitted (released by the server to
 * approvers only), and the decision carries the fingerprint of what they saw: the server refuses it if the stored request
 * is anything else. Approving gives permission; it does not run the action. All rules (who may decide, no self-approval,
 * fresh multi-factor sign-in, expiry) are enforced by the server, and its answer is shown here as given.
 */
export function PendingApprovalCard({
  orgBase,
  approval,
  review,
  canDecide,
}: {
  /** API path prefix of the organization, e.g. /v1/orgs/<id>. */
  orgBase: string;
  approval: ApiApprovalSummary;
  /** Null when the person is not allowed to see the values (a viewer) or the lookup failed. */
  review: ApiApprovalReview | null;
  canDecide: boolean;
}) {
  const { run, pending, failure } = useApiAction();
  const [comment, setComment] = React.useState("");
  const [done, setDone] = React.useState<string | null>(null);
  const noteId = React.useId();
  const parameters = review?.parameters ?? null;
  const decidable = canDecide && review !== null;

  async function decide(decision: "approve" | "reject") {
    if (review === null) return;
    const result = await run<DecisionAnswer>(`${orgBase}/approvals/${approval.id}/decision`, {
      decision,
      reviewedDigest: review.digest,
      ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
    });
    if (result.ok)
      setDone(
        result.data.outcome === "approved"
          ? "Approved. Permission is granted for exactly these details; the action has not run yet."
          : "Rejected. The action will not happen.",
      );
  }

  return (
    <article
      aria-label={`${approval.agentName}: approval request`}
      className="min-w-0 rounded-card border border-warning-border/60 bg-surface p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          <AgentAvatar name={approval.agentName} className="size-11 text-sm" />
          <div className="min-w-0">
            <h3 className="text-lg font-medium">{approval.agentName}</h3>
            <p className="text-sm text-muted-foreground">
              <time dateTime={approval.createdAt} title={formatDateTimeUtc(approval.createdAt)}>
                Asked {relativeTime(approval.createdAt)}
              </time>
              {" · "}
              {approval.environment}
              {" · "}
              {timeLeft(approval.expiresAt)}
            </p>
          </div>
        </div>
        <PlainStatusBadge status="pending_approval" />
      </header>

      <p className="mt-5 text-lg leading-snug">Wants to {actionVerb(approval.action)}</p>

      {parameters !== null ? (
        <dl className="mt-4 grid gap-x-8 gap-y-3 rounded-control bg-surface-sunken p-4 text-base sm:grid-cols-3">
          {Object.entries(parameters).map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-sm text-muted-foreground">{FIELD_LABELS[key] ?? key}</dt>
              <dd className="mt-1 font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-base text-muted-foreground">
          <Info className="mt-1 size-4 shrink-0" aria-hidden="true" />
          {review?.parametersErased
            ? "The submitted details were erased under the retention rules."
            : "Only approvers can see the values the agent submitted."}
        </p>
      )}

      {review?.policyChangedSinceRequest ? (
        <p className="mt-4 flex items-start gap-2 text-base text-warning-text">
          <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
          The rules changed after this request was checked. Even if you approve, the rules are
          checked again just before it runs.
        </p>
      ) : null}

      {done !== null ? (
        <p role="status" className="mt-6 text-base font-medium">
          {done}
        </p>
      ) : decidable ? (
        <div className="mt-6 space-y-4">
          <Field label="Comment (optional)" hint="Kept with the decision in the history.">
            <Textarea
              value={comment}
              maxLength={500}
              rows={2}
              onChange={(e) => {
                setComment(e.target.value);
              }}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button
              loading={pending}
              aria-describedby={noteId}
              onClick={() => void decide("approve")}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              loading={pending}
              aria-describedby={noteId}
              onClick={() => void decide("reject")}
            >
              Reject
            </Button>
            <p id={noteId} className="text-sm text-muted-foreground">
              Approving gives permission once, for exactly these details. It doesn’t run the action
              by itself.
            </p>
          </div>
          <ActionError failure={failure} />
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          {canDecide
            ? "The details couldn’t be loaded, so this can’t be decided from here right now."
            : "You can see this request, but only owners, admins and approvers can decide it."}
        </p>
      )}

      {review !== null ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Fingerprint of these exact details:{" "}
          <span className="font-mono">{review.digest.slice(0, 16)}…</span>
        </p>
      ) : null}
    </article>
  );
}
