"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  CircleHelp,
  Clock,
  LayoutDashboard,
  Minus,
  Plug,
  ScrollText,
  X,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import {
  ActionRequestStatusBadge,
  getActionRequestPresentation,
} from "@/components/domain/status-badge";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { Button } from "@/components/ui/button";
import type { ActionRequestStatus } from "@/lib/contracts";
import { cn } from "@/lib/cn";
import { formatDateTimeUtc } from "@/lib/format";
import {
  countByStatus,
  listMockActionRequests,
  listMockAgents,
  traceFor,
  type MockActionRequest,
  type TraceStepState,
} from "@/mocks";

const STATE_LABEL: Record<TraceStepState, string> = {
  done: "Done",
  current: "In progress",
  waiting: "Waiting",
  skipped: "Skipped",
  stopped: "Stopped",
  uncertain: "Unconfirmed",
};

function StepMarker({ state }: { state: TraceStepState }) {
  const base = "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border";
  const icon = "size-3.5";
  switch (state) {
    case "done":
      return (
        <span className={cn(base, "border-primary bg-primary text-primary-foreground")}>
          <Check className={icon} aria-hidden="true" />
        </span>
      );
    case "current":
      return (
        <span className={cn(base, "border-primary bg-background")}>
          <span className="size-2 rounded-full bg-primary" />
        </span>
      );
    case "waiting":
      return (
        <span className={cn(base, "border-border-strong bg-background text-muted-foreground")}>
          <Clock className={icon} aria-hidden="true" />
        </span>
      );
    case "skipped":
      return (
        <span className={cn(base, "border-border bg-background text-muted-foreground")}>
          <Minus className={icon} aria-hidden="true" />
        </span>
      );
    case "stopped":
      return (
        <span className={cn(base, "border-danger-border bg-danger-muted text-danger-text")}>
          <X className={icon} aria-hidden="true" />
        </span>
      );
    case "uncertain":
      return (
        <span className={cn(base, "border-warning-border bg-warning-muted text-warning-text")}>
          <CircleHelp className={icon} aria-hidden="true" />
        </span>
      );
  }
}

function requestBody(req: MockActionRequest): string {
  return JSON.stringify(
    { action: req.action, resource: req.resource, parameters: req.parameters },
    null,
    2,
  );
}

/** Segment colours per tone. Meaning is also carried by the legend text and the status badges, never colour alone. */
const TONE_BG = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  brand: "bg-primary",
  neutral: "bg-border-strong",
} as const;

/** Display order: outcomes first, then in-flight, then stopped. */
const DISTRIBUTION_ORDER: readonly ActionRequestStatus[] = [
  "succeeded",
  "approved",
  "queued_execution",
  "running",
  "pending_approval",
  "unknown",
  "expired",
  "failed",
  "denied",
];

/**
 * The preview’s decorative sidebar. Deliberately its OWN fixed list (not the dashboard nav) so the approved
 * marketing page does not change when dashboard modules do.
 */
const PREVIEW_NAV = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Agents", icon: Bot },
  { label: "Policies", icon: ScrollText },
  { label: "Approvals", icon: CheckCheck },
  { label: "Audit", icon: Activity },
  { label: "Integrations", icon: Plug },
] as const;

const PANEL_ID = "product-preview-panel";

export function ProductPreview() {
  const requests = listMockActionRequests();
  const counts = countByStatus(requests);
  const activeAgents = listMockAgents().filter((a) => a.status === "active").length;
  const initial = requests.find((r) => r.status === "pending_approval") ?? requests[0]!;
  const [selectedId, setSelectedId] = React.useState(initial.id);
  const tabs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selected = requests.find((r) => r.id === selectedId) ?? initial;
  const trace = traceFor(selected);

  const move = (index: number) => {
    const next = (index + requests.length) % requests.length;
    const req = requests[next];
    if (!req) return;
    setSelectedId(req.id);
    tabs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        return move(index + 1);
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        return move(index - 1);
      case "Home":
        e.preventDefault();
        return move(0);
      case "End":
        e.preventDefault();
        return move(requests.length - 1);
    }
  };

  const distribution = DISTRIBUTION_ORDER.filter((s) => counts[s] > 0).map((status) => ({
    status,
    count: counts[status],
    ...getActionRequestPresentation(status),
  }));

  const stats = [
    { label: "Active agents", value: activeAgents },
    { label: "Awaiting approval", value: counts.pending_approval },
    { label: "Denied", value: counts.denied },
    { label: "Outcome unknown", value: counts.unknown },
  ];

  return (
    <div className="surface-dark overflow-hidden rounded-card border border-border-strong shadow-hero">
      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-sunken px-4 py-2.5 sm:px-5">
        <p className="font-mono text-xs text-muted-foreground">
          demo-workspace <span aria-hidden="true">/</span> dev <span aria-hidden="true">/</span>{" "}
          <span className="text-foreground">approvals</span>
        </p>
        <DemoBadge />
      </div>
      <p
        role="note"
        className="border-b border-border px-4 py-2 text-xs text-muted-foreground sm:px-5"
      >
        Interactive preview on sample data. Nothing here approves, denies or executes anything.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[11.5rem_minmax(0,1fr)]">
        {/* Sidebar (decorative replica of the dashboard navigation) */}
        <aside
          aria-hidden="true"
          className="hidden flex-col gap-6 border-r border-border bg-surface-sunken p-4 lg:flex"
        >
          <span className="flex items-center gap-2 px-1.5 font-display text-sm font-semibold">
            <LogoMark className="size-5" /> AgentAxio
          </span>
          <ul className="flex flex-col gap-0.5">
            {PREVIEW_NAV.map(({ label, icon: Icon }) => {
              const active = label === "Approvals";
              return (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[0.8rem]",
                    active ? "bg-surface-raised text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("size-4", active && "text-primary-text")} />
                  {label}
                  {active && (
                    <span className="ml-auto rounded-full bg-primary px-1.5 font-mono text-[0.65rem] text-primary-foreground">
                      {counts.pending_approval}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="min-w-0">
          {/* KPI strip */}
          <dl className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
            {stats.map((s) => (
              <div key={s.label} className="px-4 py-3.5 sm:px-5">
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="mt-1 font-display text-2xl leading-none font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>

          {/* Status distribution of the sample requests */}
          <div className="border-b border-border px-4 py-3.5 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Sample requests by status</p>
              <p className="font-mono text-xs text-muted-foreground">{requests.length} total</p>
            </div>
            <div
              role="img"
              aria-label={distribution.map((d) => `${d.label}: ${d.count}`).join(", ")}
              className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full"
            >
              {distribution.map((d) => (
                <span
                  key={d.status}
                  className={cn("h-full", TONE_BG[d.tone], d.status === "unknown" && "opacity-60")}
                  style={{ flexGrow: d.count, flexBasis: 0 }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              {distribution.map((d) => (
                <li key={d.status} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      TONE_BG[d.tone],
                      d.status === "unknown" && "opacity-60",
                    )}
                  />
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-mono">{d.count}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid xl:grid-cols-[17.5rem_minmax(0,1fr)]">
            {/* Request list */}
            <div
              role="tablist"
              aria-label="Sample action requests"
              aria-orientation="vertical"
              className="flex max-h-[24rem] flex-col overflow-y-auto border-b border-border xl:max-h-none xl:border-r xl:border-b-0"
            >
              {requests.map((req, i) => {
                const active = req.id === selected.id;
                return (
                  <button
                    key={req.id}
                    ref={(el) => {
                      tabs.current[i] = el;
                    }}
                    role="tab"
                    id={`tab-${req.id}`}
                    type="button"
                    aria-selected={active}
                    aria-controls={PANEL_ID}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setSelectedId(req.id)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    className={cn(
                      "flex flex-col items-start gap-2 border-b border-l-2 border-b-border px-4 py-3 text-left transition-colors duration-200 ease-standard last:border-b-0",
                      active
                        ? "border-l-primary bg-surface-raised"
                        : "border-l-transparent hover:bg-surface",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-medium">{req.agentName}</span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {formatDateTimeUtc(req.createdAt).replace(" UTC", "")}
                      </span>
                    </span>
                    <ActionRequestStatusBadge status={req.status} />
                  </button>
                );
              })}
            </div>

            {/* Detail */}
            <div
              role="tabpanel"
              id={PANEL_ID}
              aria-labelledby={`tab-${selected.id}`}
              tabIndex={0}
              className="flex min-w-0 flex-col gap-7 p-5 sm:p-7 xl:min-h-[31rem]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl font-semibold tracking-tight">
                    {selected.agentName}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {selected.id} · {selected.environment}
                  </p>
                </div>
                <ActionRequestStatusBadge status={selected.status} />
              </div>

              <div className="grid gap-7 2xl:grid-cols-2">
                <section aria-labelledby="pp-body" className="min-w-0">
                  <h4
                    id="pp-body"
                    className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase"
                  >
                    Proposed action
                  </h4>
                  <pre
                    tabIndex={0}
                    aria-label="Proposed action as JSON"
                    className="mt-3 overflow-x-auto rounded-control border border-border bg-surface-sunken p-4 font-mono text-xs leading-relaxed"
                  >
                    {requestBody(selected)}
                  </pre>
                  <p className="mt-2 text-xs text-muted-foreground">
                    The agent’s identity comes from its credential, not from this body.
                  </p>
                  <p className="mt-4 text-sm">
                    <span className="text-muted-foreground">Reason code: </span>
                    <span className="font-mono text-xs">{selected.reasonCode ?? "—"}</span>
                  </p>
                </section>

                <section aria-labelledby="pp-trace" className="min-w-0">
                  <h4
                    id="pp-trace"
                    className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase"
                  >
                    Decision trace
                  </h4>
                  <ol className="relative mt-4 space-y-5">
                    <span
                      aria-hidden="true"
                      className="absolute top-3 bottom-3 left-3 w-px bg-border"
                    />
                    {trace.map((step) => (
                      <li key={step.id} className="relative flex gap-4">
                        <StepMarker state={step.state} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {step.label}
                            <span className="sr-only"> — {STATE_LABEL[step.state]}</span>
                          </p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              {selected.status === "pending_approval" && (
                <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-5">
                  <Button size="sm" disabled>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    Reject
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Disabled in this preview. A requester can never approve their own request.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-sunken px-4 py-3 sm:px-5">
        <p className="text-xs text-muted-foreground">
          Statuses follow the V1 action-request contract.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            Open the demo dashboard <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
