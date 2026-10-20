import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const containerVariants = cva("mx-auto w-full px-4 sm:px-6 lg:px-8", {
  variants: {
    size: {
      default: "max-w-(--container-max)",
      narrow: "max-w-(--container-narrow)",
      full: "max-w-none",
    },
  },
  defaultVariants: { size: "default" },
});

export interface ContainerProps
  extends React.ComponentProps<"div">, VariantProps<typeof containerVariants> {}

export function Container({ className, size, ...props }: ContainerProps) {
  return <div className={cn(containerVariants({ size }), className)} {...props} />;
}
