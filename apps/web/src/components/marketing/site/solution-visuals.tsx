import * as React from "react";
import { Building2, KeyRound, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Sample visuals for the Solutions and Features pages. Everything here is invented for illustration (client names are
 * generic, credential prefixes are fake) and is labelled as such by the section around it.
 */

/** Agencies: one lane per client, each with its own agent, environment and credential. */
export function ClientLanes() {
  const lanes = [
    { client: "Client A", agent: "Lead Intake Agent", env: "dev", prefix: "agx_dev_7Hk2…" },
    { client: "Client B", agent: "Inbound Qualifier", env: "dev", prefix: "agx_dev_Qm4x…" },
    { client: "Client C", agent: "Legacy Import Agent", env: "staging", prefix: "agx_stg_B9sd…" },
  ];
  return (
    <ul aria-label="Illustrative client lanes" className="space-y-3">
      {lanes.map((l) => (
        <li
          key={l.client}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border border-border bg-surface-sunken/60 p-4"
        >
          <Building2 className="size-4 shrink-0 text-primary-text" aria-hidden="true" />
          <span className="min-w-[5.5rem] text-sm font-semibold">{l.client}</span>
          <span className="min-w-0 flex-1 text-sm text-muted-foreground">{l.agent}</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <KeyRound className="size-3.5" aria-hidden="true" />
            {l.prefix}
          </span>
          <Badge>{l.env}</Badge>
        </li>
      ))}
      <li className="flex items-start gap-3 pt-1 text-sm leading-relaxed text-muted-foreground">
        <ShieldOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Suspending one client’s agent leaves the others untouched.</span>
      </li>
    </ul>
  );
}

/** SaaS developers: the shape a planned TypeScript SDK might take. Not published and not final. */
export function SdkSketch() {
  return (
    <pre
      tabIndex={0}
      role="region"
      aria-label="Illustrative SDK sketch (scrollable)"
      className="overflow-x-auto rounded-control border border-border bg-background p-5 font-mono text-[0.8125rem] leading-relaxed"
    >
      <code>
        <span className="text-muted-foreground">{"// Illustrative sketch of a planned SDK."}</span>
        {"\n"}
        <span className="text-muted-foreground">
          {"// Nothing is published and the shape may change."}
        </span>
        {"\n"}
        <span className="text-primary-text">const</span>
        {" result = "}
        <span className="text-primary-text">await</span>
        {" agentaxio.actions.request({\n"}
        {'  action: "crm.lead.create",\n'}
        {'  resource: "mockcrm/leads",\n'}
        {"  parameters: { full_name, email, company },\n"}
        {"  idempotencyKey,\n"}
        {"});\n\n"}
        <span className="text-primary-text">if</span>
        {' (result.status !== "succeeded") {\n'}
        <span className="text-muted-foreground">
          {"  // pending_approval, denied, failed, expired ...\n"}
        </span>
        {"}"}
      </code>
    </pre>
  );
}

/** Features: an agent inventory with owners and states. */
export function AgentsPanel() {
  const rows = [
    { name: "Lead Intake Agent", owner: "Demo Admin", env: "dev", state: "Active" },
    { name: "Inbound Qualifier", owner: "Demo Owner", env: "dev", state: "Active" },
    { name: "Legacy Import Agent", owner: "Demo Admin", env: "staging", state: "Suspended" },
  ];
  return (
    <ul aria-hidden="true" className="divide-y divide-border border-y border-border">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.name}</p>
            <p className="text-xs text-muted-foreground">
              Owner: {r.owner} · {r.env}
            </p>
          </div>
          <Badge tone={r.state === "Active" ? "success" : "warning"}>{r.state}</Badge>
        </li>
      ))}
    </ul>
  );
}
