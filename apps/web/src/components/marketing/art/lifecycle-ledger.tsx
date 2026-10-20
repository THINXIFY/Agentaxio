import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Code } from "@/components/ui/typography";
import type { ActionRequestStatus } from "@/lib/contracts";
import { cn } from "@/lib/cn";

/**
 * The status vocabulary from docs/N8N-ENFORCEMENT.md (authoritative), typed against the contract: adding or renaming a
 * status there fails type-checking here until this page is updated. Colour is never the only signal: every status is
 * its own name in text.
 */
const DOC: Record<ActionRequestStatus, { text: string; final: boolean; meaning: string }> = {
  pending_approval: {
    text: "text-warning-text",
    final: false,
    meaning: "A person must review the exact values. Nothing runs yet, and no token is returned.",
  },
  approved: {
    text: "text-info-text",
    final: false,
    meaning: "A person said yes. Approval is permission, not proof that the action has happened.",
  },
  queued_execution: {
    text: "text-info-text",
    final: false,
    meaning: "Allowed (directly or after approval) and waiting for the trusted executor.",
  },
  running: {
    text: "text-info-text",
    final: false,
    meaning: "The trusted executor is performing the action.",
  },
  succeeded: {
    text: "text-success-text",
    final: true,
    meaning: "The action ran and its outcome was recorded.",
  },
  failed: {
    text: "text-danger-text",
    final: true,
    meaning: "It was allowed, but the action failed when it ran.",
  },
  denied: {
    text: "text-danger-text",
    final: true,
    meaning: "A rule blocked it. Returned immediately, and nothing runs.",
  },
  expired: {
    text: "text-muted-foreground",
    final: true,
    meaning: "Nobody approved it in time, so it did not run.",
  },
  unknown: {
    text: "text-warning-text",
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

export function LifecycleLedger() {
  return (
    <div>
      <ol
        aria-label="The usual route of a request"
        className="flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-sm"
      >
        {MAIN_PATH.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={DOC[s].text}>{s}</span>
            {i < MAIN_PATH.length - 1 ? (
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">
        A request the rules allow outright skips <Code>pending_approval</Code> and{" "}
        <Code>approved</Code> and goes straight to <Code>queued_execution</Code>.
      </p>

      <dl className="mt-8 border-t border-border">
        {(Object.keys(DOC) as ActionRequestStatus[]).map((s) => (
          <div
            key={s}
            className="grid grid-cols-1 gap-x-8 gap-y-1 border-b border-border py-4 sm:grid-cols-[12rem_minmax(0,1fr)_5.5rem] sm:items-baseline"
          >
            <dt className={cn("font-mono text-sm", DOC[s].text)}>{s}</dt>
            <dd className="text-base leading-relaxed text-muted-foreground">{DOC[s].meaning}</dd>
            <dd className="font-mono text-xs text-muted-foreground sm:text-right">
              {DOC[s].final ? "final" : "in progress"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
