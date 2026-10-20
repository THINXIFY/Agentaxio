import * as React from "react";
import { ChevronRight } from "lucide-react";
import { RequestLifecycle } from "@/components/dashboard/request-lifecycle";
import { Code } from "@/components/ui/typography";
import { formatDateTimeUtc } from "@/lib/format";
import { PLAIN_STATUS } from "@/lib/plain-language";
import type { DashboardRequest } from "@/mocks/dashboard";

/**
 * The detail behind a request, collapsed by default so the everyday view stays simple. This is where precise security
 * wording lives: the three separate facts (authorization, approval, execution) and the technical identifiers. Opening it
 * never changes anything. Native <details> keeps it keyboard and screen-reader friendly with no script.
 */
export function RequestDetails({
  request,
  label = "Details",
  className,
}: {
  request: DashboardRequest;
  label?: string;
  className?: string;
}) {
  return (
    <details className={`group/details ${className ?? ""}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-1 text-base font-medium text-primary-text marker:hidden hover:underline [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 transition-transform duration-200 ease-standard group-open/details:rotate-90"
        />
        {label}
      </summary>

      <div className="mt-3 space-y-5 rounded-control bg-surface-sunken p-5">
        <p className="text-base leading-relaxed">
          {PLAIN_STATUS[request.status].explanation}{" "}
          <span className="text-muted-foreground">{request.decisionReason}</span>
        </p>

        <div>
          <p className="mb-2.5 text-sm font-medium text-muted-foreground">
            Permission check, approval and result are separate steps
          </p>
          <RequestLifecycle request={request} />
        </div>

        <dl className="grid gap-x-8 gap-y-3 border-t border-border/60 pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Request ID</dt>
            <dd className="mt-1 font-mono break-all">{request.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Requested</dt>
            <dd className="mt-1">{formatDateTimeUtc(request.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Action</dt>
            <dd className="mt-1">
              <Code>{request.action}</Code>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Target</dt>
            <dd className="mt-1">
              {request.application} · <span className="font-mono">{request.resource}</span> ·{" "}
              {request.environment}
            </dd>
          </div>
          {request.approvedBy ? (
            <div>
              <dt className="text-muted-foreground">Reviewed by</dt>
              <dd className="mt-1">{request.approvedBy}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </details>
  );
}
