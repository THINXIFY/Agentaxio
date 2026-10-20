import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Headings use Space Grotesk (display) for marketing; the product UI uses Geist (sans).
 * `level` controls the semantic element, `size` controls the look — keep them independent
 * so document outline stays correct.
 */
const headingVariants = cva("text-balance text-foreground", {
  variants: {
    size: {
      "display-hero": "font-display text-display-hero font-semibold",
      "display-2xl": "font-display text-display-2xl font-semibold",
      "display-xl": "font-display text-display-xl font-semibold",
      "display-lg": "font-display text-display-lg font-semibold",
      "display-md": "font-display text-display-md font-semibold",
      "display-sm": "font-display text-display-sm font-semibold",
      xl: "text-2xl font-semibold tracking-tight",
      lg: "text-xl font-semibold tracking-tight",
      md: "text-lg font-semibold",
      sm: "text-base font-semibold",
    },
  },
  defaultVariants: { size: "display-md" },
});

export interface HeadingProps
  extends Omit<React.ComponentProps<"h2">, "children">, VariantProps<typeof headingVariants> {
  level?: 1 | 2 | 3 | 4;
  children: React.ReactNode;
}

export function Heading({ level = 2, size, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag className={cn(headingVariants({ size }), className)} {...props} />;
}

const textVariants = cva("", {
  variants: {
    variant: {
      lead: "text-lg leading-relaxed text-muted-foreground sm:text-xl",
      body: "text-base leading-relaxed text-foreground",
      small: "text-sm leading-normal text-foreground",
      muted: "text-sm leading-normal text-muted-foreground",
    },
  },
  defaultVariants: { variant: "body" },
});

export interface TextProps extends React.ComponentProps<"p">, VariantProps<typeof textVariants> {}

export function Text({ variant, className, ...props }: TextProps) {
  return <p className={cn(textVariants({ variant }), className)} {...props} />;
}

/** Small uppercase label above headings. */
export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "font-mono text-xs font-medium tracking-[0.14em] text-accent-text uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-sm border border-border-strong bg-surface-sunken px-1.5 font-mono text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Code({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.85em] text-foreground",
        className,
      )}
      {...props}
    />
  );
}
