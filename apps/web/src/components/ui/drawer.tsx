"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { usePortalContainer } from "@/components/ui/portal-container";
import { cn } from "@/lib/cn";

/** Accessible slide-over (focus trap, Esc to close, scroll lock, labelled) built on Radix Dialog. */
export const Drawer = Dialog.Root;
export const DrawerTrigger = Dialog.Trigger;
export const DrawerClose = Dialog.Close;

export function DrawerContent({
  side = "left",
  title,
  description,
  className,
  children,
}: {
  side?: "left" | "right";
  /** Required: announced to screen readers. */
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const container = usePortalContainer();
  return (
    <Dialog.Portal container={container}>
      <Dialog.Overlay className="ax-fade-in fixed inset-0 z-(--z-overlay) bg-overlay backdrop-blur-sm" />
      <Dialog.Content
        data-side={side}
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "ax-drawer fixed inset-y-0 z-(--z-dialog) flex w-[min(20rem,88vw)] flex-col border-border bg-background text-foreground shadow-hero outline-none",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          className,
        )}
      >
        <div className="flex h-(--topbar-height) shrink-0 items-center justify-between border-b border-border px-4">
          <Dialog.Title className="font-display text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Close
            aria-label="Close menu"
            className="inline-flex size-9 items-center justify-center rounded-control text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </Dialog.Close>
        </div>
        {description ? (
          <Dialog.Description className="sr-only">{description}</Dialog.Description>
        ) : null}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
