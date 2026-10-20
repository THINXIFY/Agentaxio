import * as React from "react";
import { FileWarning, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

const TONES = {
  scope: {
    icon: TriangleAlert,
    box: "border-warning-border bg-warning-muted/60 text-warning-text",
  },
  review: { icon: FileWarning, box: "border-warning-border bg-warning-muted/60 text-warning-text" },
  info: { icon: Info, box: "border-info-border bg-info-muted/60 text-info-text" },
} as const;

/**
 * An inline notice. Used for scope limits ("only actions routed through AgentAxio are controlled"), items that need
 * founder or legal review before launch, and neutral information. Always text plus an icon; never colour alone.
 */
export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, box } = TONES[tone];
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-control border-l-2 p-4 text-sm leading-relaxed",
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1 text-foreground/90">{children}</div>
      </div>
    </div>
  );
}
