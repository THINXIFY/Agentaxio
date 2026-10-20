import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { PlainAgentStatusBadge } from "@/components/dashboard/plain-status";
import { cn } from "@/lib/cn";
import type { DashboardAgent } from "@/mocks/dashboard";

/** Where "View details" for an agent goes. */
export function agentHref(agent: Pick<DashboardAgent, "id">): string {
  return `/dashboard/agents/${agent.id}`;
}

/**
 * Agents as a calm list: who it is, what it is for, whether it is active, and one clear way in. The same row works from
 * 320px to ultra-wide: the status and link sit to the right on wide screens and under the purpose on phones.
 */
export function AgentList({
  agents,
  className,
}: {
  agents: readonly DashboardAgent[];
  className?: string;
}) {
  return (
    <ul className={className}>
      {agents.map((a) => (
        <li
          key={a.id}
          className={cn(
            "grid grid-cols-1 gap-x-5 gap-y-3 border-t border-border/50 px-6 py-5 first:border-t-0",
            "transition-colors duration-200 ease-standard hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
          )}
        >
          <div className="flex min-w-0 items-start gap-4">
            <AgentAvatar name={a.name} className="size-11 text-sm" />
            <div className="min-w-0">
              <h3 className="text-base font-medium">{a.name}</h3>
              <p className="mt-1 text-base leading-snug text-muted-foreground">{a.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-15 sm:flex-col sm:items-end sm:gap-2 sm:pl-0">
            <PlainAgentStatusBadge status={a.status} />
            <Link
              href={agentHref(a)}
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
