"use client";

import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { usePortalContainer } from "@/components/ui/portal-container";
import { cn } from "@/lib/cn";

/** Accessible menu (arrow keys, type-ahead, Escape, focus return) styled with design tokens. */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = "end",
  ...props
}: React.ComponentProps<typeof Menu.Content>) {
  const container = usePortalContainer();
  return (
    <Menu.Portal container={container}>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "ax-pop z-(--z-dialog) min-w-56 rounded-card border border-border bg-surface-raised p-1.5 text-sm text-foreground shadow-floating outline-none",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const itemBase =
  "relative flex cursor-default items-center gap-2.5 rounded-control px-2.5 py-2 outline-none select-none " +
  "transition-colors duration-150 data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none " +
  "data-[disabled]:text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(itemBase, className)} {...props} />;
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn(
        "px-2.5 pt-1.5 pb-1 font-mono text-[0.68rem] tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} {...props} />;
}

/** A single-choice item (e.g. theme). The check mark is the selected indicator; the item also exposes aria-checked. */
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemBase, "pl-8", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-2.5 inline-flex items-center">
        <Check className="size-4 text-primary-text" aria-hidden="true" />
      </Menu.ItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}
