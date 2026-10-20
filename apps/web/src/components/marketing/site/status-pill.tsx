import * as React from "react";
import { CircleDashed, FileWarning, FlaskConical, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * How far along something really is. These labels exist so no page can imply a capability that has not been built:
 *
 *  - built     exists today (the labelled demo UI and this website)
 *  - demo      shown in the demo dashboard with sample data; there is no backend behind it
 *  - designed  specified in the design documents, not built
 *  - planned   on the roadmap, not specified in detail
 *  - proposed  an API contract that is drafted but not implemented
 *  - draft     a document that has not been reviewed
 */
const STATUS = {
  built: { label: "Built", tone: "success", icon: ShieldCheck },
  demo: { label: "Demo UI · sample data", tone: "brand", icon: FlaskConical },
  designed: { label: "Designed · not built", tone: "warning", icon: CircleDashed },
  planned: { label: "Planned", tone: "neutral", icon: Sparkles },
  proposed: { label: "Proposed contract · not implemented", tone: "info", icon: CircleDashed },
  draft: { label: "Draft · not reviewed", tone: "warning", icon: FileWarning },
} as const;

export type Availability = keyof typeof STATUS;

export function StatusPill({
  status,
  label,
  className,
}: {
  status: Availability;
  /** Override the default wording, e.g. "Backend planned". */
  label?: string;
  className?: string;
}) {
  const { label: defaultLabel, tone, icon: Icon } = STATUS[status];
  return (
    <Badge tone={tone} className={className}>
      <Icon aria-hidden="true" />
      {label ?? defaultLabel}
    </Badge>
  );
}
