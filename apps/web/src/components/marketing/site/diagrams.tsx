import * as React from "react";
import {
  ArrowDown,
  ArrowRight,
  Ban,
  Bot,
  Check,
  Cog,
  FileClock,
  Fingerprint,
  Hourglass,
  ShieldCheck,
  UserCheck,
  Webhook,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Code } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

/**
 * Diagrams for the marketing pages. They are built from semantic HTML (ordered lists and definition lists) rather than
 * pictures, so they read in order for assistive technology and reflow from desktop to a 320px phone. Every value is
 * illustrative, and the page around each diagram says how much of it exists today.
 */

function Node({
  icon: Icon,
  title,
  children,
  accent = false,
  className,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children?: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-4 rounded-control border p-4",
        accent ? "border-primary/50 bg-subtle/40" : "border-border bg-surface-sunken/60",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-raised text-primary-text"
      >
        <Icon className="size-[1.125rem]" aria-hidden={true} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {children ? (
          <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

function Down({ label }: { label?: string }) {
  return (
    <li aria-hidden="true" className="flex items-center gap-2 pl-[1.125rem] text-muted-foreground">
      <ArrowDown className="size-4" />
      {label ? <span className="font-mono text-[0.7rem]">{label}</span> : null}
    </li>
  );
}

/** The three answers a permission check can give. Text, icon and colour together. */
function Outcomes() {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      <li>
        <Badge tone="success">
          <Check aria-hidden="true" /> Allowed
        </Badge>
      </li>
      <li>
        <Badge tone="warning">
          <UserCheck aria-hidden="true" /> Needs approval
        </Badge>
      </li>
      <li>
        <Badge tone="danger">
          <Ban aria-hidden="true" /> Blocked
        </Badge>
      </li>
    </ul>
  );
}

/** Platform: the path of one request, from an agent's proposal to the audit record. */
export function AuthorizationFlow() {
  return (
    <ol aria-label="How one request is handled" className="space-y-2.5">
      <li>
        <Node icon={Bot} title="An agent proposes an action">
          For example <Code>crm.lead.create</Code> with typed values. Treated as untrusted input.
        </Node>
      </li>
      <Down label="authenticated request" />
      <li>
        <Node icon={ShieldCheck} title="AgentAxio checks the rules" accent>
          Who is asking comes from the credential, never from the request. The rules are fixed and
          the default is blocked.
          <Outcomes />
        </Node>
      </li>
      <Down label="allowed, or approved by a person" />
      <li>
        <Node icon={Cog} title="A trusted executor carries it out">
          It re-checks the agent, the credential and the rules, uses a single-use grant, then
          performs the action.
        </Node>
      </li>
      <Down label="both facts recorded" />
      <li>
        <Node icon={FileClock} title="The activity history keeps two separate facts">
          “Authorized” and “executed” are different entries, so the record never says more than
          happened.
        </Node>
      </li>
    </ol>
  );
}

/** Security: who is trusted with what, and where the boundaries sit. */
export function TrustBoundary() {
  const zones = [
    {
      key: "untrusted",
      label: "Not trusted",
      title: "Agents and workflows",
      icon: Bot,
      points: [
        "Agent text and proposed values are treated as untrusted input",
        "Holds only its own AgentAxio credential",
        "Never holds the downstream tool’s credentials",
      ],
    },
    {
      key: "control",
      label: "AgentAxio control plane",
      title: "Decide and record",
      icon: ShieldCheck,
      points: [
        "Identity comes from the credential",
        "Deterministic rules, default blocked",
        "Approvals by people, never self-approval",
        "Append-only activity history",
      ],
    },
    {
      key: "executor",
      label: "Trusted executor",
      title: "Act, once",
      icon: Cog,
      points: [
        "Holds the tool’s credentials",
        "Verifies a single-use grant bound to the exact values",
        "Fails closed on any error",
      ],
    },
  ] as const;
  return (
    <ol aria-label="Trust boundaries" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {zones.map((z, i) => {
        const Icon = z.icon;
        return (
          <li key={z.key} className="relative">
            <div
              className={cn(
                "h-full rounded-control border p-5",
                z.key === "control"
                  ? "border-primary/50 bg-subtle/40"
                  : "border-dashed border-border-strong bg-surface-sunken/60",
              )}
            >
              <p className="font-mono text-[0.68rem] tracking-[0.14em] text-muted-foreground uppercase">
                {z.label}
              </p>
              <p className="mt-3 flex items-center gap-2.5 text-base font-semibold">
                <Icon className="size-[1.125rem] text-primary-text" aria-hidden="true" />
                {z.title}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm leading-snug text-muted-foreground">
                {z.points.map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-primary-text"
                      aria-hidden="true"
                    />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            {i < zones.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-1/2 -right-[1.0625rem] z-10 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground lg:flex"
              >
                <ArrowRight className="size-3.5" />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Platform and Security: which rule wins. First match decides; nothing matching means blocked. */
export function PolicyPrecedence() {
  const rows = [
    { rank: "1", tone: "danger", label: "Blocked", text: "A rule says no. This always wins." },
    {
      rank: "2",
      tone: "warning",
      label: "Needs approval",
      text: "A person must say yes first.",
    },
    {
      rank: "3",
      tone: "success",
      label: "Allowed",
      text: "A rule says yes and nothing above it matched.",
    },
    { rank: "4", tone: "danger", label: "Blocked", text: "No rule matched at all. The default." },
  ] as const;
  return (
    <ol aria-label="Order in which rules win" className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.rank} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-xs text-muted-foreground"
          >
            {r.rank}
          </span>
          <Badge tone={r.tone} className="shrink-0">
            {r.label}
          </Badge>
          <span className="text-sm leading-snug text-muted-foreground">{r.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** Platform: what revocation looks like, in order. Sample times, not live data. */
export function RevocationTimeline() {
  const events = [
    { t: "10:02", label: "Agent suspended", note: "by an administrator", tone: "warning" },
    {
      t: "10:03",
      label: "New request",
      note: "Blocked: the agent is suspended",
      tone: "danger",
    },
    {
      t: "10:04",
      label: "Approved earlier, not yet run",
      note: "Re-checked just before running. Blocked.",
      tone: "danger",
    },
  ] as const;
  return (
    <ol aria-label="What happens after an agent is suspended" className="space-y-4">
      {events.map((e) => (
        <li key={e.t} className="flex gap-4">
          <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
            {e.t}
          </span>
          <div className="min-w-0 flex-1 border-l border-border pl-4">
            <p className="text-sm font-medium">{e.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{e.note}</p>
          </div>
          <Badge tone={e.tone} className="h-fit shrink-0">
            {e.tone === "danger" ? "Blocked" : "Suspended"}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

/** Developers: the n8n workflow, node by node. */
export function N8nWorkflow() {
  const nodes = [
    { icon: Webhook, title: "Trigger", note: "Manual or chat" },
    { icon: Bot, title: "Agent proposes", note: "Typed JSON values" },
    { icon: ShieldCheck, title: "HTTP Request", note: "POST /v1/action-requests", accent: true },
    { icon: Hourglass, title: "Poll status", note: "Wait, then GET, bounded" },
    { icon: Check, title: "If succeeded", note: "Otherwise show pending, denied or failed" },
  ] as const;
  return (
    <ol
      aria-label="The first n8n workflow"
      className="grid grid-cols-1 gap-2.5 md:grid-cols-5 md:gap-3"
    >
      {nodes.map((n, i) => {
        const Icon = n.icon;
        return (
          <li key={n.title} className="relative">
            <div
              className={cn(
                "h-full rounded-control border p-4",
                "accent" in n && n.accent
                  ? "border-primary/50 bg-subtle/40"
                  : "border-border bg-surface-sunken/60",
              )}
            >
              <Icon className="size-[1.125rem] text-primary-text" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{n.title}</p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{n.note}</p>
            </div>
            {i < nodes.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-1/2 -right-[1.0625rem] z-10 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground md:flex"
              >
                <ArrowRight className="size-3.5" />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Developers: the checks the trusted executor repeats before anything runs. */
export function ExecutorChecks() {
  const checks = [
    "The credential is still active",
    "The agent is still active (not suspended)",
    "The current policy version still allows it",
    "The values match the approved payload digest exactly",
    "The grant is unused, unexpired and consumed atomically",
  ];
  return (
    <ol aria-label="Checks before anything runs" className="space-y-2.5">
      {checks.map((c, i) => (
        <li key={c} className="flex items-start gap-3.5 text-sm leading-snug">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-[0.7rem] text-muted-foreground"
          >
            {i + 1}
          </span>
          <span className="pt-0.5">{c}</span>
        </li>
      ))}
      <li className="flex items-start gap-3.5 border-t border-border pt-4 text-sm leading-snug">
        <Fingerprint className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
        <span>
          Only then does it perform the action and record what happened. Any error means it does not
          run.
        </span>
      </li>
    </ol>
  );
}
