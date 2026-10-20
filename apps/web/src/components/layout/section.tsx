import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Marketing section with a forced palette, independent of the user's theme:
 *  - dark   cinematic obsidian (hero, proof, CTA bands)
 *  - light  spacious lavender-white content
 *  - lilac  light palette on the lilac tint, for gentle contrast between light sections
 *  - auto   follows the Light/Dark/System setting (use inside the dashboard)
 */
const sectionVariants = cva("relative isolate overflow-clip", {
  variants: {
    tone: {
      dark: "surface-dark",
      light: "surface-light",
      lilac: "surface-light bg-subtle",
      auto: "bg-background text-foreground",
    },
    spacing: {
      none: "",
      md: "py-16 sm:py-20",
      lg: "py-20 sm:py-28 lg:py-32",
      hero: "pt-28 pb-20 sm:pt-36 sm:pb-28 lg:pt-44 lg:pb-36",
    },
  },
  defaultVariants: { tone: "light", spacing: "lg" },
});

export interface SectionProps
  extends React.ComponentProps<"section">, VariantProps<typeof sectionVariants> {}

export function Section({ className, tone, spacing, ...props }: SectionProps) {
  return <section className={cn(sectionVariants({ tone, spacing }), className)} {...props} />;
}
