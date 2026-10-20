"use client";

import * as React from "react";
import { PortalContainerProvider } from "@/components/ui/portal-container";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

/**
 * A demonstration of the real dashboard UI, shown on a marketing page.
 *
 * It renders the actual dashboard components (the same panels, badges, approval cards and activity rows the demo
 * dashboard uses) inside the dashboard's own neutral dark surfaces, so what a visitor sees is what the product is meant to
 * look like, not an illustration of it. The frame says plainly that it is a conceptual demo on invented data. Floating UI
 * inside it (tooltips) is rendered within the frame so it inherits the same surfaces.
 */
export function ProductFrame({
  title,
  children,
  className,
  bodyClassName,
}: {
  /** What is being shown, e.g. "Approvals". */
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  return (
    <PortalContainerProvider value={root}>
      <TooltipProvider>
        <ToastProvider>
          <figure ref={setRoot} className={cn("dashboard-scope", className)}>
            <div className="surface-dark overflow-hidden rounded-xl border border-border-strong/70 shadow-hero">
              <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-shell px-4 py-2.5 text-xs">
                <span className="font-mono tracking-[0.1em] text-foreground uppercase">
                  AgentAxio <span className="text-muted-foreground">/ {title}</span>
                </span>
                <span className="text-muted-foreground">
                  Conceptual demo · invented data · not connected
                </span>
              </figcaption>
              <div className={cn("bg-workspace p-2.5 sm:p-6", bodyClassName)}>{children}</div>
            </div>
          </figure>
        </ToastProvider>
      </TooltipProvider>
    </PortalContainerProvider>
  );
}
