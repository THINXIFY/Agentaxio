import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-sunken text-muted-foreground",
        brand: "border-transparent bg-subtle text-subtle-foreground",
        success: "border-success-border bg-success-muted text-success-text",
        warning: "border-warning-border bg-warning-muted text-warning-text",
        danger: "border-danger-border bg-danger-muted text-danger-text",
        info: "border-info-border bg-info-muted text-info-text",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

/** Status is always communicated by text (and usually an icon), never colour alone. */
export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
