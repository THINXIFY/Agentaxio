"use client";

import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { usePortalContainer } from "@/components/ui/portal-container";
import { cn } from "@/lib/cn";

/**
 * Tooltips add a short, non-essential hint on hover/focus. Never put information ONLY in a tooltip: touch users and
 * disabled controls cannot reveal it, so anything important is also shown as visible text.
 */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={250} skipDelayDuration={400}>
      {children}
    </RadixTooltip.Provider>
  );
}

export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof RadixTooltip.Content>) {
  const container = usePortalContainer();
  return (
    <RadixTooltip.Portal container={container}>
      <RadixTooltip.Content
        sideOffset={sideOffset}
        className={cn(
          "ax-pop z-(--z-toast) max-w-64 rounded-control border border-border bg-surface-raised px-2.5 py-1.5 text-xs leading-snug text-foreground shadow-floating",
          className,
        )}
        {...props}
      />
    </RadixTooltip.Portal>
  );
}
