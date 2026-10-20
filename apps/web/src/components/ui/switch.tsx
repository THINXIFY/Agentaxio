"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps extends Omit<
  React.ComponentProps<"button">,
  "onChange" | "role" | "type"
> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/** Accessible toggle (role="switch"). Needs an accessible name via aria-label or aria-labelledby. */
export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  className,
  disabled,
  ...props
}: SwitchProps) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isControlled = checked !== undefined;
  const on = isControlled ? checked : internal;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => {
        if (!isControlled) setInternal(!on);
        onCheckedChange?.(!on);
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-input-border",
        "transition-colors duration-200 ease-standard disabled:cursor-not-allowed disabled:opacity-50",
        // Border stays input-border in both states so the control keeps ≥3:1 boundary contrast (a violet fill alone has too little contrast against a light page).
        on ? "bg-primary" : "bg-surface-sunken",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block size-4 rounded-full shadow-raised transition-transform duration-200 ease-standard",
          on ? "translate-x-[1.375rem] bg-primary-foreground" : "translate-x-1 bg-muted-foreground",
          // thumb is primary-foreground on the violet fill (4.8:1)
        )}
      />
    </button>
  );
}
