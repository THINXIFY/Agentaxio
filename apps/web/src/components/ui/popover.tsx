"use client";

import * as React from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { usePortalContainer } from "@/components/ui/portal-container";
import { cn } from "@/lib/cn";

/** Non-modal floating panel (e.g. notifications). Focus moves in on open and returns to the trigger on close. */
export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverClose = RadixPopover.Close;

export function PopoverContent({
  className,
  sideOffset = 8,
  align = "end",
  ...props
}: React.ComponentProps<typeof RadixPopover.Content>) {
  const container = usePortalContainer();
  return (
    <RadixPopover.Portal container={container}>
      <RadixPopover.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "ax-pop z-(--z-dialog) w-[min(24rem,calc(100vw-2rem))] rounded-card border border-border bg-surface-raised text-sm text-foreground shadow-floating outline-none",
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  );
}
