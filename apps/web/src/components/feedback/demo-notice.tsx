import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { MOCK_DATA_NOTICE } from "@/mocks";

/** Inline marker for any panel that renders mock records. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="brand" className={className}>
      <FlaskConical aria-hidden="true" />
      Mock data
    </Badge>
  );
}

/**
 * Persistent strip for demo shells; states plainly that no control here is real.
 * Quiet by design (it never changes), but always present and always readable.
 */
export function DemoBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 border-b border-border/70 bg-workspace px-4 py-2.5 text-sm leading-relaxed text-muted-foreground sm:px-8 lg:px-12",
        className,
      )}
    >
      <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning-text" aria-hidden="true" />
      <p>
        <strong className="font-semibold text-foreground">Frontend demo.</strong> {MOCK_DATA_NOTICE}
      </p>
    </div>
  );
}
