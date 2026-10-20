import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Code } from "@/components/ui/typography";
import type { ActionRequestStatus } from "@/lib/contracts";

/**
 * The status vocabulary from docs/N8N-ENFORCEMENT.md (authoritative). Typed against the contract, so adding or renaming a
 * status there fails type-checking here until this page is updated.
 */
const STATUS_DOC: Record<
  ActionRequestStatus,
  { tone: NonNullable<BadgeProps["tone"]>; final: boolean; meaning: string }
> = {
  pending_approval: {
    tone: "warning",
    final: false,
    meaning: "A person must review the exact values. Nothing runs yet, and no token is returned.",
  },
  approved: {
    tone: "info",
    final: false,
    meaning: "A person said yes. Approval is permission, not proof that the action has happened.",
  },
  queued_execution: {
    tone: "info",
    final: false,
    meaning: "Allowed (directly or after approval) and waiting for the trusted executor.",
  },
  running: {
    tone: "info",
    final: false,
    meaning: "The trusted executor is performing the action.",
  },
  succeeded: {
    tone: "success",
    final: true,
    meaning: "The action ran and its outcome was recorded.",
  },
  failed: {
    tone: "danger",
    final: true,
    meaning: "It was allowed, but the action failed when it ran.",
  },
  denied: {
    tone: "danger",
    final: true,
    meaning: "A rule blocked it. Returned immediately, and nothing runs.",
  },
  expired: {
    tone: "neutral",
    final: true,
    meaning: "Nobody approved it in time, so it did not run.",
  },
  unknown: {
    tone: "warning",
    final: true,
    meaning: "The outcome can’t be confirmed. Never repeated automatically.",
  },
};

const MAIN_PATH: readonly ActionRequestStatus[] = [
  "pending_approval",
  "approved",
  "queued_execution",
  "running",
  "succeeded",
];

/** The usual route a request takes, then every status with what it means. */
export function StatusLifecycle() {
  return (
    <div>
      <ol
        aria-label="The usual route of a request"
        className="flex flex-wrap items-center gap-x-2 gap-y-3"
      >
        {MAIN_PATH.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <Badge tone={STATUS_DOC[s].tone} className="font-mono">
              {s}
            </Badge>
            {i < MAIN_PATH.length - 1 ? (
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">
        A request the rules allow outright skips <Code>pending_approval</Code> and{" "}
        <Code>approved</Code> and goes straight to <Code>queued_execution</Code>.
      </p>

      <dl className="mt-8 divide-y divide-border border-y border-border">
        {(Object.keys(STATUS_DOC) as ActionRequestStatus[]).map((s) => (
          <div
            key={s}
            className="grid grid-cols-1 gap-x-6 gap-y-1.5 py-4 sm:grid-cols-[13rem_1fr_auto] sm:items-baseline"
          >
            <dt>
              <Badge tone={STATUS_DOC[s].tone} className="font-mono">
                {s}
              </Badge>
            </dt>
            <dd className="text-sm leading-relaxed text-muted-foreground">
              {STATUS_DOC[s].meaning}
            </dd>
            <dd className="font-mono text-xs text-muted-foreground">
              {STATUS_DOC[s].final ? "final" : "in progress"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
