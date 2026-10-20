import * as React from "react";
import { cn } from "@/lib/cn";

function ZoneLabel({
  children,
  trusted = false,
}: {
  children: React.ReactNode;
  trusted?: boolean;
}) {
  return (
    <p
      className={cn(
        "mb-2.5 flex items-center gap-2 font-mono text-[0.68rem] tracking-[0.14em] uppercase",
        trusted ? "text-primary-text" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5", trusted ? "bg-primary" : "border border-muted-foreground")}
      />
      {children}
    </p>
  );
}

function FlowNode({
  title,
  sub,
  holds,
  tone,
}: {
  title: string;
  sub: string;
  holds: string;
  tone: "outside" | "core" | "executor";
}) {
  return (
    <div
      className={cn(
        "grid gap-3 rounded-control border p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6",
        tone === "outside" && "border-border bg-background",
        tone === "core" && "border-primary/60 bg-background",
        tone === "executor" && "border-primary bg-surface-raised",
      )}
    >
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>
      </div>
      <p className="font-mono text-[0.72rem] leading-snug text-muted-foreground sm:text-right">
        <span className="text-primary-text">holds</span> {holds}
      </p>
    </div>
  );
}

function Connector({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-center gap-4 py-0.5 pl-8">
      <div aria-hidden="true" className="relative h-10 w-px bg-border-strong">
        <span className="ax-flow absolute size-1.5 rounded-full bg-primary" />
        <span className="absolute -bottom-px left-1/2 size-1.5 -translate-x-1/2 rotate-45 border-r border-b border-border-strong" />
      </div>
      <p className="font-mono text-[0.72rem] leading-snug text-muted-foreground">
        <span className="text-foreground">{label}</span> · {sub}
      </p>
    </div>
  );
}

/**
 * How the first integration is wired. The n8n workflow lives in an UNTRUSTED zone (dashed); AgentAxio and its
 * trusted executor live inside the trust boundary (violet edge). Only the executor holds downstream credentials.
 */
export function IntegrationFlow() {
  return (
    <figure aria-label="How n8n connects to AgentAxio: the n8n workflow, outside the trust boundary, sends action requests and polls status; only AgentAxio's trusted executor, inside the boundary, holds the downstream tool credentials.">
      <div className="rounded-card border border-dashed border-border-strong p-3">
        <ZoneLabel>Outside the boundary · your workflow</ZoneLabel>
        <FlowNode
          tone="outside"
          title="n8n workflow"
          sub="HTTP Request node"
          holds="AgentAxio key only"
        />
      </div>

      <Connector label="POST /v1/action-requests" sub="then poll for status" />

      <div className="rounded-card border border-primary/40 bg-primary/[0.04] p-3">
        <ZoneLabel trusted>Inside the boundary · AgentAxio</ZoneLabel>
        <FlowNode
          tone="core"
          title="AgentAxio"
          sub="identity · policy · approval"
          holds="decisions, grants, audit"
        />
        <Connector label="internal grant" sub="never sent to n8n" />
        <FlowNode
          tone="executor"
          title="Trusted executor"
          sub="acts on the mock CRM"
          holds="tool credentials"
        />
      </div>

      <figcaption className="mt-3 text-xs text-muted-foreground">
        If AgentAxio is unreachable, the protected action does not run.
      </figcaption>
    </figure>
  );
}
