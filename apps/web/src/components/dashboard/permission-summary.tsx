import * as React from "react";
import { Ban, Check, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PolicyEffect } from "@/lib/contracts";
import { actionLabel, PLAIN_EFFECT } from "@/lib/plain-language";
import type { AgentPermission } from "@/mocks/dashboard";

const EFFECT: Record<PolicyEffect, { tone: "success" | "warning" | "danger"; icon: typeof Check }> =
  {
    allow: { tone: "success", icon: Check },
    require_approval: { tone: "warning", icon: UserCheck },
    deny: { tone: "danger", icon: Ban },
  };

/**
 * What an agent may do, in plain language. Rules are listed in precedence order (blocked first, then needs approval, then
 * allowed). Each effect is text + icon + tone, never colour alone. Display only: the real evaluator is deterministic,
 * default-deny and server-side.
 */
export function PermissionSummary({
  permissions,
  className,
}: {
  permissions: readonly AgentPermission[];
  className?: string;
}) {
  const order: PolicyEffect[] = ["deny", "require_approval", "allow"];
  const sorted = [...permissions].sort((a, b) => order.indexOf(a.effect) - order.indexOf(b.effect));
  const action = sorted[0]?.action;

  return (
    <div className={className}>
      {action ? (
        <p className="mb-3 text-base text-muted-foreground">
          When this agent tries to{" "}
          <span className="text-foreground">{actionLabel(action).toLowerCase()}</span>:
        </p>
      ) : null}
      <ul className="space-y-3">
        {sorted.map((p, i) => {
          const e = EFFECT[p.effect];
          const Icon = e.icon;
          return (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Badge tone={e.tone} className="px-3 py-1 text-[0.8125rem]">
                <Icon aria-hidden="true" />
                {PLAIN_EFFECT[p.effect]}
              </Badge>
              <span className="text-base leading-snug text-muted-foreground">{p.condition}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        Anything not covered by a rule is blocked.
      </p>
    </div>
  );
}
