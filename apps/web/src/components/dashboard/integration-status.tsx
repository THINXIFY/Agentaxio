import * as React from "react";
import { Code2, Plug, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { listIntegrations, type DashboardIntegration } from "@/mocks/dashboard";

/**
 * NOTHING here is connected or available in the pre-release, and the cards say so plainly: every integration carries a
 * "Planned" label and an explicit "Not connected" state, and there are no Connect buttons.
 */

const ICON = { "first-planned": Workflow, planned: Code2, future: Plug } as const;

/** "● Not connected": a hollow dot plus text, so the state never relies on colour. */
export function NotConnected({ className }: { className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-base text-muted-foreground", className)}>
      <span
        aria-hidden="true"
        className="size-2.5 rounded-full border border-dashed border-muted-foreground"
      />
      Not connected
    </p>
  );
}

/** The featured integration (n8n): what it is, where it stands, and that nothing is connected. */
export function FeaturedIntegration({ integration }: { integration: DashboardIntegration }) {
  const Icon = ICON[integration.stage];
  return (
    <article
      aria-labelledby={`integration-${integration.id}`}
      className="rounded-card border border-border/60 bg-surface p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-card bg-subtle text-subtle-foreground"
          >
            <Icon className="size-7" />
          </span>
          <div className="min-w-0">
            <h2
              id={`integration-${integration.id}`}
              className="text-2xl font-semibold tracking-tight"
            >
              {integration.name}
            </h2>
            <p className="mt-1 text-base text-muted-foreground">Workflow automation</p>
          </div>
        </div>
        <Badge tone="brand" className="px-3 py-1 text-[0.8125rem]">
          {integration.stageLabel}
        </Badge>
      </div>

      <p className="mt-6 max-w-2xl text-lg leading-relaxed">
        Let your n8n workflows ask AgentAxio before an agent does something important, so the right
        actions are allowed, held for approval, or blocked.
      </p>

      <dl className="mt-7 grid gap-x-8 gap-y-5 border-t border-border/60 pt-6 sm:grid-cols-2">
        <div>
          <dt className="text-base text-muted-foreground">Connection</dt>
          <dd className="mt-1.5">
            <NotConnected />
          </dd>
        </div>
        <div>
          <dt className="text-base text-muted-foreground">Availability</dt>
          <dd className="mt-1.5 text-base">Not available yet · shown for demonstration only</dd>
        </div>
      </dl>
    </article>
  );
}

/** Other integrations, each marked Planned and Not connected. */
export function PlannedIntegrations({
  integrations,
  className,
}: {
  integrations: readonly DashboardIntegration[];
  className?: string;
}) {
  return (
    <ul className={cn("grid grid-cols-1 gap-5 md:grid-cols-2", className)}>
      {integrations.map((i) => {
        const Icon = ICON[i.stage];
        return (
          <li key={i.id} className="flex">
            <article
              aria-labelledby={`integration-${i.id}`}
              className="flex w-full flex-col rounded-card border border-border/60 bg-surface p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-muted-foreground"
                >
                  <Icon className="size-5" />
                </span>
                <Badge tone="neutral" className="px-3 py-1 text-[0.8125rem]">
                  {i.stageLabel}
                </Badge>
              </div>
              <h3 id={`integration-${i.id}`} className="mt-4 text-lg font-medium">
                {i.name}
              </h3>
              <p className="mt-1.5 flex-1 text-base leading-relaxed text-muted-foreground">
                {i.description}
              </p>
              <NotConnected className="mt-5" />
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/** All integrations from the roadmap, split into the featured one and the rest. */
export function integrationGroups(
  integrations: readonly DashboardIntegration[] = listIntegrations(),
) {
  return {
    featured: integrations.find((i) => i.stage === "first-planned")!,
    others: integrations.filter((i) => i.stage !== "first-planned"),
  };
}
