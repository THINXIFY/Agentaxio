"use client";

import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

/**
 * Tabs (also used as segmented filters). Radix provides roving focus, arrow-key navigation and ARIA wiring.
 *  - variant "underline": page-level sections.
 *  - variant "segmented": compact filter control inside a toolbar.
 */
export const Tabs = RadixTabs.Root;

export function TabsList({
  className,
  variant = "underline",
  ...props
}: React.ComponentProps<typeof RadixTabs.List> & { variant?: "underline" | "segmented" }) {
  return (
    <RadixTabs.List
      data-variant={variant}
      className={cn(
        "group/tabs inline-flex items-center",
        variant === "underline" && "gap-5 border-b border-border",
        variant === "segmented" &&
          "gap-0.5 rounded-control border border-border bg-surface-sunken p-0.5",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "relative inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 ease-standard",
        "hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        // underline
        "group-data-[variant=underline]/tabs:-mb-px group-data-[variant=underline]/tabs:border-b-2 group-data-[variant=underline]/tabs:border-transparent group-data-[variant=underline]/tabs:py-2.5",
        "group-data-[variant=underline]/tabs:data-[state=active]:border-primary-text",
        // segmented
        "group-data-[variant=segmented]/tabs:h-8 group-data-[variant=segmented]/tabs:rounded-[0.375rem] group-data-[variant=segmented]/tabs:px-3",
        "group-data-[variant=segmented]/tabs:data-[state=active]:bg-surface-raised group-data-[variant=segmented]/tabs:data-[state=active]:shadow-raised",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      className={cn(
        "ax-tab-in outline-none focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}
