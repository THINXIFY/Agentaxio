import * as React from "react";
import { LifecycleMarker } from "@/components/dashboard/request-lifecycle";
import type { LifecycleState } from "@/mocks/dashboard";
import { Code } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

/**
 * The intended path of an action request, and where three sample requests stand along it.
 *
 * Stations run left to right. Each request is a row, and each cell says exactly what is true at that station, using the
 * same stage markers as the dashboard. The point of the table is the distinctions: a request is REQUESTED, then
 * AUTHORIZED (or blocked) by a rule, then APPROVED by a person if a rule asks, and only then EXECUTED. The middle row is
 * approved but has not run yet: approval is never shown as proof that something happened.
 *
 * Conceptual and not yet built. The caption says so, and nothing here is live.
 */

const STATIONS = [
  { title: "AI agent", note: "Proposes an action" },
  { title: "AgentAxio authorization", note: "Checks the credential and the rules" },
  { title: "Human approval", note: "Only when a rule asks for it" },
  { title: "Trusted executor", note: "Holds the tool’s credentials" },
  { title: "Destination API", note: "A mock CRM in the demo" },
] as const;

interface Cell {
  state: LifecycleState;
  text: string;
}

const REQUESTS: ReadonlyArray<{
  title: string;
  action: string;
  cells: readonly [Cell, Cell, Cell, Cell, Cell];
}> = [
  {
    title: "A lead from a known company",
    action: "crm.lead.create",
    cells: [
      { state: "done", text: "Requested" },
      { state: "done", text: "Allowed by a rule" },
      { state: "na", text: "Not needed" },
      { state: "done", text: "Executed" },
      { state: "done", text: "Lead created (mock)" },
    ],
  },
  {
    title: "A lead from an unfamiliar company",
    action: "crm.lead.create",
    cells: [
      { state: "done", text: "Requested" },
      { state: "done", text: "Answer: needs approval" },
      { state: "done", text: "Approved by a reviewer" },
      { state: "pending", text: "Approved, not run yet" },
      { state: "na", text: "Nothing sent yet" },
    ],
  },
  {
    title: "A lead from a blocked company",
    action: "crm.lead.create",
    cells: [
      { state: "done", text: "Requested" },
      { state: "stopped", text: "Blocked by a rule" },
      { state: "na", text: "Not asked" },
      { state: "na", text: "Did not run" },
      { state: "na", text: "Nothing sent" },
    ],
  },
];

function CellContent({ cell }: { cell: Cell }) {
  return (
    <span className="flex items-start gap-2.5">
      <LifecycleMarker state={cell.state} />
      <span
        className={cn(
          "text-sm leading-snug",
          cell.state === "na" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {cell.text}
      </span>
    </span>
  );
}

export function RequestFlow({ className }: { className?: string }) {
  return (
    <figure className={className}>
      {/* md+: stations as columns, requests as rows */}
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">
            Three sample requests and where each one stands at each station
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[15%] pr-4 pb-5 align-bottom">
                <span className="font-mono text-[0.68rem] tracking-[0.12em] text-muted-foreground uppercase">
                  Request
                </span>
              </th>
              {STATIONS.map((s, i) => (
                <th key={s.title} scope="col" className="pr-4 pb-5 align-top font-normal">
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      style={{ "--i": i } as React.CSSProperties}
                      className="flow-station flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-xs text-muted-foreground"
                    >
                      {i + 1}
                    </span>
                    {i < STATIONS.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="relative -mr-4 h-px flex-1 bg-border-strong"
                      >
                        <span
                          style={{ "--i": i } as React.CSSProperties}
                          className="flow-dot absolute -top-[2px] left-0 size-[5px] rounded-full bg-primary-text"
                        />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-foreground">
                    {s.title}
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                    {s.note}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REQUESTS.map((r) => (
              <tr key={r.title} className="border-t border-border">
                <th scope="row" className="py-5 pr-4 align-top font-normal">
                  <span className="block text-sm font-medium text-foreground">{r.title}</span>
                  <Code className="mt-1.5 inline-block text-xs">{r.action}</Code>
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} className="py-5 pr-4 align-top">
                    <CellContent cell={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* <md: one card per request, stations listed in order */}
      <ol
        aria-label="Three sample requests and where each one stands"
        className="space-y-8 md:hidden"
      >
        {REQUESTS.map((r) => (
          <li key={r.title}>
            <p className="text-base font-medium">{r.title}</p>
            <Code className="mt-1.5 inline-block text-xs">{r.action}</Code>
            <ul className="mt-4 space-y-3.5 border-l border-border-strong pl-5">
              {STATIONS.map((s, i) => (
                <li key={s.title} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 -left-[2.0625rem] flex size-[1.125rem] items-center justify-center rounded-full border border-border-strong bg-background font-mono text-[0.6rem] text-muted-foreground"
                  >
                    {i + 1}
                  </span>
                  <p className="text-xs text-muted-foreground">{s.title}</p>
                  <div className="mt-1">
                    <CellContent cell={r.cells[i]!} />
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <figcaption className="mt-8 max-w-[68ch] border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground">Four separate facts:</strong> asked,
        answered by a rule, approved by a person, executed. The middle request is approved but has
        not run, which is why the record keeps them apart. Conceptual: the enforcement backend is
        designed, not built.
      </figcaption>
    </figure>
  );
}
