import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The first n8n workflow, node by node, as a numbered strip. Typographic: numbered markers joined by a hairline, no
 * cards. Below `md` it becomes a vertical list with the same markers.
 */
const NODES = [
  { title: "Trigger", note: "Manual or chat" },
  { title: "Agent proposes", note: "Typed JSON values" },
  { title: "HTTP Request", note: "POST /v1/action-requests", key: true },
  { title: "Poll the status", note: "Wait, then GET, a bounded number of times" },
  { title: "If succeeded", note: "Otherwise show pending, denied or failed" },
] as const;

export function WorkflowStrip({ className }: { className?: string }) {
  return (
    <ol
      aria-label="The first n8n workflow"
      className={cn("grid grid-cols-1 gap-y-6 md:grid-cols-5 md:gap-y-0", className)}
    >
      {NODES.map((n, i) => (
        <li key={n.title} className="relative md:pr-5">
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
                "key" in n && n.key
                  ? "border-primary-text text-primary-text"
                  : "border-border-strong text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            {i < NODES.length - 1 ? (
              <span aria-hidden="true" className="hidden h-px flex-1 bg-border-strong md:block" />
            ) : null}
          </span>
          <p className="mt-3 text-sm font-semibold">{n.title}</p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{n.note}</p>
        </li>
      ))}
    </ol>
  );
}
