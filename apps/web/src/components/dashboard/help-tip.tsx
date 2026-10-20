"use client";

import * as React from "react";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

/**
 * A small "?" that explains an unfamiliar term. It is a button that opens a popover (not a hover-only tooltip), so it
 * works with a keyboard, a screen reader and a touch screen. Nothing essential is hidden in it: the page still makes sense
 * without ever opening one.
 */
export function HelpTip({
  term,
  children,
  className,
}: {
  /** The word or phrase being explained; becomes the accessible name ("What is …?"). */
  term: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`What is “${term}”?`}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-surface-hover hover:text-foreground data-[state=open]:bg-surface-hover data-[state=open]:text-foreground",
          className,
        )}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-4">
        <p className="text-sm font-medium">{term}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </PopoverContent>
    </Popover>
  );
}
