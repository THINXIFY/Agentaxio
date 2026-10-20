import * as React from "react";
import { ArrowDown, ArrowRight, KeyRound } from "lucide-react";
import { StatusMark } from "@/components/marketing/art/chapter";
import { cn } from "@/lib/cn";

/**
 * The intended architecture, drawn as a schematic: three zones, the numbered enforcement points where one zone meets
 * another, and where each secret lives. The six numbered boundaries are the trust boundaries from docs/SECURITY.md.
 *
 * Everything here is DESIGNED, NOT BUILT, and the caption says so. Nothing in the diagram implies a working service.
 */

export interface Boundary {
  n: number;
  between: string;
  enforced: string;
}

export const BOUNDARIES: readonly Boundary[] = [
  {
    n: 1,
    between: "Browser and management API",
    enforced: "Role checks happen on the server. A role label in the interface confers nothing.",
  },
  {
    n: 2,
    between: "Workflow or SDK and the action-request API",
    enforced:
      "The scoped agent key is authenticated. Agent, organization and environment are derived on the server, never read from the request. An idempotency key is required.",
  },
  {
    n: 3,
    between: "Action-request API and the policy evaluator and database",
    enforced:
      "Deterministic rules with a default of blocked. Tenant is enforced on every query. Any error fails closed.",
  },
  {
    n: 4,
    between: "Authorized human and the approval endpoints",
    enforced:
      "The approver role is checked, requesters cannot approve their own requests, and the exact values are shown and cannot be edited.",
  },
  {
    n: 5,
    between: "Grant validator, trusted executor and the downstream service",
    enforced:
      "A single-use grant bound to the exact values. Agent, credential and policy version are re-checked just before running. Only the executor holds the tool’s credentials.",
  },
  {
    n: 6,
    between: "Internal services and logging",
    enforced:
      "An append-only activity history. Secrets, raw authorization headers and sensitive values are never logged.",
  },
];

function Tag({ n }: { n: number | string }) {
  return (
    <span
      role="img"
      aria-label={`Enforcement point ${n}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-primary-text/70 font-mono text-[0.68rem] leading-none text-primary-text"
    >
      {n}
    </span>
  );
}

function Part({
  title,
  detail,
  holds,
  tags,
  external = false,
  className,
}: {
  title: string;
  detail: string;
  holds?: string;
  tags?: ReadonlyArray<number | string>;
  external?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative z-10 border p-4",
        external ? "border-dashed border-border-strong" : "border-border-strong bg-background/60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        {tags?.length ? (
          <span className="flex shrink-0 gap-1">
            {tags.map((t) => (
              <Tag key={t} n={t} />
            ))}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      {holds ? (
        <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs leading-snug text-foreground">
          <KeyRound className="mt-px size-3.5 shrink-0 text-primary-text" aria-hidden="true" />
          {holds}
        </p>
      ) : null}
    </div>
  );
}

function Down() {
  return (
    <span
      aria-hidden="true"
      className="relative z-10 flex justify-center py-1 text-muted-foreground"
    >
      <ArrowDown className="size-3.5" />
    </span>
  );
}

function Across({ n, label }: { n: number; label: string }) {
  return (
    <div className="relative z-10 flex flex-col items-center justify-center gap-1 px-1 text-center">
      <Tag n={n} />
      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="font-mono text-[0.6rem] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

const ZONE_LABEL = "font-mono text-[0.68rem] tracking-[0.12em] uppercase";

/** The schematic. Desktop is a drawing; below `lg` the same parts are listed zone by zone, in order. */
export function ArchitectureDiagram({ className }: { className?: string }) {
  return (
    <figure className={className}>
      {/* lg+: the drawing */}
      <div
        className="hidden gap-y-0 lg:grid lg:grid-cols-[1fr_4.25rem_1.25fr_4.25rem_1fr] lg:grid-rows-[auto_auto_auto_auto_auto]"
        role="group"
        aria-label="Architecture schematic: three zones and six enforcement points"
      >
        {/* zone panels */}
        <div
          aria-hidden="true"
          className="col-start-1 row-span-5 row-start-1 border border-dashed border-border-strong"
        />
        <div
          aria-hidden="true"
          className="col-start-3 row-span-5 row-start-1 border border-primary/50 bg-subtle/30"
        />
        <div
          aria-hidden="true"
          className="col-start-5 row-span-5 row-start-1 border border-dashed border-border-strong"
        />

        {/* zone headings */}
        <p
          className={cn(
            ZONE_LABEL,
            "relative z-10 col-start-1 row-start-1 px-4 pt-4 text-muted-foreground",
          )}
        >
          Outside · not trusted
        </p>
        <p
          className={cn(
            ZONE_LABEL,
            "relative z-10 col-start-3 row-start-1 px-4 pt-4 text-primary-text",
          )}
        >
          AgentAxio control plane
        </p>
        <p
          className={cn(
            ZONE_LABEL,
            "relative z-10 col-start-5 row-start-1 px-4 pt-4 text-muted-foreground",
          )}
        >
          Trusted executor
        </p>

        {/* zone A */}
        <div className="col-start-1 row-start-2 p-4">
          <Part
            title="AI agent or n8n workflow"
            detail="Proposes an action as typed values. Treated as untrusted input."
            holds="Holds only its AgentAxio key, never the tool’s credentials"
          />
        </div>
        <div className="col-start-1 row-start-4 p-4">
          <Part
            title="Approver, in a browser"
            detail="Reviews the exact values and decides. Cannot approve their own request."
            tags={[1]}
          />
        </div>

        <p className="relative z-10 col-start-1 row-start-3 self-center px-5 text-xs leading-relaxed text-muted-foreground">
          Never sees a grant, and never holds the tool’s credentials.
        </p>

        {/* connectors A to B */}
        <div className="col-start-2 row-start-2 flex items-center">
          <Across n={2} label="agent key" />
        </div>
        <div className="col-start-2 row-start-4 flex items-center">
          <Across n={4} label="decision" />
        </div>

        {/* zone B */}
        <div className="col-start-3 row-start-2 px-4 pt-4">
          <Part
            title="Request API"
            detail="Authenticates the key and derives agent, organization and environment."
            tags={[2]}
          />
          <Down />
        </div>
        <div className="col-start-3 row-start-3 px-4">
          <Part
            title="Policy evaluator and database"
            detail="Deterministic rules, default blocked. Records the policy version used."
            holds="Holds hashed agent credentials, policies and internal grants"
            tags={[3]}
          />
          <Down />
        </div>
        <div className="col-start-3 row-start-4 px-4">
          <Part
            title="Approval service"
            detail="Shows exact values. A change is a new request needing a new approval."
            tags={[4]}
          />
          <Down />
        </div>
        <div className="col-start-3 row-start-5 px-4 pb-4">
          <Part
            title="Activity history"
            detail="Authorization and execution are separate, append-only records."
            tags={[6]}
          />
        </div>

        {/* connector B to C */}
        <div className="col-start-4 row-start-3 flex items-center">
          <Across n={5} label="grant stays inside" />
        </div>

        <p className="relative z-10 col-start-5 row-start-2 self-center px-5 text-xs leading-relaxed text-muted-foreground">
          Decides nothing. It acts only on a valid grant created inside AgentAxio, never on a
          request from outside.
        </p>

        {/* zone C */}
        <div className="col-start-5 row-start-3 px-4">
          <Part
            title="Grant verifier and executor"
            detail="Checks the single-use grant, re-checks agent, credential and policy, then acts once."
            holds="The only place the tool’s credentials live"
            tags={[5]}
          />
          <Down />
        </div>
        <div className="col-start-5 row-start-4 px-4">
          <Part
            title="Destination API"
            detail="The tool being protected. Reached only through the executor."
            external
          />
        </div>
      </div>

      {/* <lg: the same parts, zone by zone */}
      <ol aria-label="Architecture, zone by zone" className="space-y-6 lg:hidden">
        {[
          {
            zone: "Outside · not trusted",
            parts: [
              {
                title: "AI agent or n8n workflow",
                detail: "Proposes an action as typed values. Treated as untrusted input.",
                holds: "Holds only its AgentAxio key, never the tool’s credentials",
              },
              {
                title: "Approver, in a browser",
                detail: "Reviews the exact values and decides. Cannot approve their own request.",
                tags: [1, 4],
              },
            ],
          },
          {
            zone: "AgentAxio control plane",
            parts: [
              {
                title: "Request API",
                detail: "Authenticates the key and derives agent, organization and environment.",
                tags: [2],
              },
              {
                title: "Policy evaluator and database",
                detail: "Deterministic rules, default blocked. Records the policy version used.",
                holds: "Holds hashed agent credentials, policies and internal grants",
                tags: [3],
              },
              {
                title: "Approval service",
                detail: "Shows exact values. A change is a new request needing a new approval.",
                tags: [4],
              },
              {
                title: "Activity history",
                detail: "Authorization and execution are separate, append-only records.",
                tags: [6],
              },
            ],
          },
          {
            zone: "Trusted executor",
            parts: [
              {
                title: "Grant verifier and executor",
                detail:
                  "Checks the single-use grant, re-checks agent, credential and policy, then acts once.",
                holds: "The only place the tool’s credentials live",
                tags: [5],
              },
              {
                title: "Destination API",
                detail: "The tool being protected. Reached only through the executor.",
                external: true,
              },
            ],
          },
        ].map((z) => (
          <li key={z.zone}>
            <p className={cn(ZONE_LABEL, "mb-3 text-muted-foreground")}>{z.zone}</p>
            <ul className="space-y-2.5 border-l border-border-strong pl-4">
              {z.parts.map((p) => (
                <li key={p.title}>
                  <Part
                    title={p.title}
                    detail={p.detail}
                    holds={"holds" in p ? p.holds : undefined}
                    tags={"tags" in p ? p.tags : undefined}
                    external={"external" in p ? p.external : false}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <figcaption className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <StatusMark status="designed" className="text-foreground" />
        <span>
          Conceptual schematic of the intended design. None of it is built or running. Numbers match
          the enforcement points below.
        </span>
      </figcaption>
    </figure>
  );
}

/** What is enforced at each numbered boundary. */
export function EnforcementPoints() {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {BOUNDARIES.map((b) => (
        <li
          key={b.n}
          className="grid grid-cols-[1.75rem_1fr] gap-x-4 gap-y-1 py-5 md:grid-cols-[1.75rem_minmax(0,17rem)_1fr_auto] md:gap-x-8"
        >
          <Tag n={b.n} />
          <p className="text-sm font-semibold">{b.between}</p>
          <p className="col-start-2 text-sm leading-relaxed text-muted-foreground md:col-start-auto">
            {b.enforced}
          </p>
          <StatusMark status="designed" className="col-start-2 mt-1 md:col-start-auto md:mt-0" />
        </li>
      ))}
    </ol>
  );
}

const CUSTODY = [
  {
    secret: "Agent key",
    lives: "In the workflow’s credential store",
    rules:
      "Scoped to one agent and environment. Stored hashed by AgentAxio. Shown once, at creation. Revocable.",
  },
  {
    secret: "Execution grant",
    lives: "Inside AgentAxio only",
    rules: "Single-use, short-lived and bound to the exact values. Never sent to the workflow.",
  },
  {
    secret: "The tool’s credentials",
    lives: "In the trusted executor only",
    rules: "Never placed in an agent, a workflow or the browser.",
  },
  {
    secret: "Human sessions",
    lives: "In the browser, through established sign-in",
    rules:
      "HttpOnly, Secure, SameSite cookies. No long-lived secrets in local storage. Not built yet.",
  },
] as const;

/** Where each secret lives, and what is true of it. */
export function CredentialCustody() {
  return (
    <dl className="divide-y divide-border border-y border-border">
      {CUSTODY.map((c) => (
        <div
          key={c.secret}
          className="grid grid-cols-1 gap-x-8 gap-y-1.5 py-5 md:grid-cols-[13rem_minmax(0,16rem)_1fr]"
        >
          <dt className="text-sm font-semibold">{c.secret}</dt>
          <dd className="flex items-start gap-2 text-sm leading-snug text-foreground">
            <KeyRound className="mt-0.5 size-3.5 shrink-0 text-primary-text" aria-hidden="true" />
            {c.lives}
          </dd>
          <dd className="text-sm leading-relaxed text-muted-foreground">{c.rules}</dd>
        </div>
      ))}
    </dl>
  );
}
