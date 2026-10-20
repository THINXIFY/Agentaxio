import { cn } from "@/lib/cn";

/** Two-letter monogram tile for an agent. Decorative: the agent name is always rendered next to it. */
export function AgentAvatar({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-sunken font-mono text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {letters}
    </span>
  );
}

/** Short, human-readable handle derived from an agent id: "mock_agt_lead_intake" → "lead-intake". */
export function agentHandle(agentId: string): string {
  return agentId.replace(/^mock_agt_/, "").replace(/_/g, "-");
}
