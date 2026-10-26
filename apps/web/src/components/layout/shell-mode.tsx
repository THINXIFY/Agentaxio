"use client";

import * as React from "react";
import { Plug } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Whether the dashboard is showing invented demo data or a live local backend, and who is signed in. Display only: the
 * server decides what any person can see or do, and checks it again on every request.
 */
export type ShellMode =
  | { mode: "demo" }
  | {
      mode: "live";
      state: "signed-out" | "unreachable" | "no-organization" | "ready";
      email?: string | null;
      organization?: string;
      role?: string;
      pendingApprovals?: number;
    };

const ShellModeContext = React.createContext<ShellMode>({ mode: "demo" });

export function ShellModeProvider({
  value,
  children,
}: {
  value: ShellMode;
  children: React.ReactNode;
}) {
  return <ShellModeContext.Provider value={value}>{children}</ShellModeContext.Provider>;
}

export const useShellMode = (): ShellMode => React.useContext(ShellModeContext);

/** Persistent strip for the live dashboard: says plainly what is real and what still is not. */
export function LiveBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 border-b border-border/70 bg-workspace px-4 py-2.5 text-sm leading-relaxed text-muted-foreground sm:px-8 lg:px-12",
        className,
      )}
    >
      <Plug className="mt-0.5 size-3.5 shrink-0 text-info-text" aria-hidden="true" />
      <p>
        <strong className="font-semibold text-foreground">Local development backend.</strong>{" "}
        Agents, permissions, approvals and activity here are real records in a local database,
        enforced only for agents that call the AgentAxio API. It is not deployed and has not had an
        independent security review. Anything marked “Mock data” is still a sample.
      </p>
    </div>
  );
}
