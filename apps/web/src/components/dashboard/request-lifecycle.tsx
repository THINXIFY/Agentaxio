import * as React from "react";
import { Check, CircleHelp, Clock, Minus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { lifecycleFor, type LifecycleState } from "@/mocks/dashboard";
import type { DashboardRequest } from "@/mocks/dashboard";

const STATE_TEXT: Record<LifecycleState, string> = {
  done: "completed",
  pending: "pending",
  stopped: "stopped",
  na: "not applicable",
  uncertain: "unconfirmed",
};

export function LifecycleMarker({ state }: { state: LifecycleState }) {
  const base = "flex size-5 shrink-0 items-center justify-center rounded-full border";
  const icon = "size-3";
  switch (state) {
    case "done":
      return (
        <span className={cn(base, "border-success-border bg-success-muted text-success-text")}>
          <Check className={icon} aria-hidden="true" />
        </span>
      );
    case "pending":
      return (
        <span className={cn(base, "border-warning-border bg-warning-muted text-warning-text")}>
          <Clock className={icon} aria-hidden="true" />
        </span>
      );
    case "stopped":
      return (
        <span className={cn(base, "border-danger-border bg-danger-muted text-danger-text")}>
          <X className={icon} aria-hidden="true" />
        </span>
      );
    case "uncertain":
      return (
        <span className={cn(base, "border-info-border bg-info-muted text-info-text")}>
          <CircleHelp className={icon} aria-hidden="true" />
        </span>
      );
    case "na":
      return (
        <span className={cn(base, "border-border bg-surface-sunken text-muted-foreground")}>
          <Minus className={icon} aria-hidden="true" />
        </span>
      );
  }
}

/**
 * Authorization → Approval → Execution as three SEPARATE facts. Approval is never shown as proof that anything ran:
 * only the execution stage can say "completed". Each stage is text + icon + tone; colour is never the only signal.
 */
export function RequestLifecycle({
  request,
  className,
}: {
  request: Pick<DashboardRequest, "status" | "reviewRequired">;
  className?: string;
}) {
  const stages = lifecycleFor(request);
  return (
    <ol
      aria-label="Request lifecycle"
      className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3", className)}
    >
      {stages.map((s) => (
        <li key={s.key} className="flex items-start gap-2.5">
          <LifecycleMarker state={s.state} />
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] tracking-[0.12em] text-muted-foreground uppercase">
              {s.title}
            </p>
            <p className="text-sm leading-snug">
              {s.label}
              <span className="sr-only"> ({STATE_TEXT[s.state]})</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
