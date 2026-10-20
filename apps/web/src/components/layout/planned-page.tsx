import * as React from "react";
import { Circle } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

/**
 * Honest placeholder for a module whose backend use case does not exist yet (CLAUDE.md: no generic dashboards).
 * One panel: it says plainly that the page is not built, what it will let people do, and when it lands. It offers NO
 * simulated controls.
 */
export function PlannedPage({
  title,
  description,
  milestone,
  willInclude,
  note,
  back = { href: "/dashboard", label: "Back to Overview" },
}: {
  title: string;
  description: string;
  /** Where this arrives (docs/ROADMAP.md). */
  milestone: string;
  /** What the module will let people do. */
  willInclude: readonly string[];
  /** Optional extra statement, e.g. a security principle that already applies. */
  note?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        back={back}
        actions={<Badge tone="neutral">Not built yet</Badge>}
      />

      <Panel
        id="planned-scope"
        title="What this page will do"
        description="Planned. None of it is available in the pre-release."
        className="max-w-3xl"
      >
        <ul className="space-y-4">
          {willInclude.map((item) => (
            <li key={item} className="flex items-start gap-3.5 text-base leading-relaxed">
              <Circle
                aria-hidden="true"
                className="mt-2 size-2 shrink-0 fill-transparent text-muted-foreground"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {note ? (
          <p className="mt-7 border-l-2 border-primary-text pl-4 text-base leading-relaxed text-muted-foreground">
            {note}
          </p>
        ) : null}
        <p className="mt-7 border-t border-border/60 pt-5 text-base text-muted-foreground">
          {milestone} This page has no controls until it exists, so nothing here can be mistaken for
          a working feature.
        </p>
      </Panel>
    </>
  );
}
