"use client";

import * as React from "react";
import { Check, CircleDashed, KeyRound, X } from "lucide-react";
import { useGsapEffect, type GsapApi } from "@/lib/gsap";
import { NO_PREFERENCE_MOTION_QUERY, REDUCED_MOTION_QUERY } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * Illustrative panels for the features mosaic. All values are sample data. Panels are aria-hidden
 * (the surrounding text carries the meaning) and none of them are controls.
 */

const ROW_H = 44;

const RULES = [
  { effect: "deny", match: "legacy-import · crm.lead.create" },
  { effect: "require_approval", match: "lead-intake · crm.lead.create" },
  { effect: "allow", match: "any agent · env dev" },
  { effect: "implicit_deny", match: "no rule matched" },
] as const;
const MATCHED = 1;

/**
 * Shows first-match-wins: a cursor checks rules top-down and settles on the first that matches.
 * Dimming is done with colour (never opacity) and tags toggle visibility, so text keeps AA contrast in every frame.
 */
export function RuleScan() {
  const ref = React.useRef<HTMLDivElement>(null);

  const prepare = React.useCallback(() => window.matchMedia(REDUCED_MOTION_QUERY).matches, []);
  const setup = React.useCallback(({ gsap }: GsapApi) => {
    const root = ref.current;
    if (!root) return;
    const q = (sel: string) => gsap.utils.toArray<HTMLElement>(root.querySelectorAll(sel));
    const cursor = root.querySelector<HTMLElement>("[data-cursor]");
    const tags = q("[data-tag]");
    const noMatch = q("[data-tag=no-match]");
    const matched = q("[data-tag=match], [data-tag=skipped]");
    if (!cursor) return;

    const mm = gsap.matchMedia();
    mm.add(NO_PREFERENCE_MOTION_QUERY, () => {
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8, paused: true });
      tl.set(tags, { autoAlpha: 0 })
        .set(cursor, { y: 0, autoAlpha: 0 })
        .to(cursor, { autoAlpha: 1, duration: 0.3 })
        .to({}, { duration: 0.7 })
        .set(noMatch, { autoAlpha: 1 })
        .to(cursor, { y: ROW_H * MATCHED, duration: 0.55, ease: "power2.inOut" })
        .set(matched, { autoAlpha: 1 })
        .to({}, { duration: 3 });

      // Run only while on screen.
      const io = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) tl.play();
        else tl.pause();
      });
      io.observe(root);
      return () => io.disconnect();
    });
    return () => mm.revert();
  }, []);
  useGsapEffect(setup, prepare);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="rounded-control border border-border bg-background"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 font-mono text-xs text-muted-foreground">
        <span>request</span>
        <span className="text-foreground">lead-intake → crm.lead.create</span>
      </div>
      <div className="relative">
        {/* cursor: the rule currently being checked / matched */}
        <div
          data-cursor=""
          className="absolute inset-x-0 top-0 border-l-2 border-primary bg-primary/10"
          style={{ height: ROW_H, transform: `translateY(${ROW_H * MATCHED}px)` }}
        />
        {RULES.map((r, i) => (
          <div
            key={r.effect}
            data-row=""
            className={cn(
              "relative flex items-center gap-4 border-b border-border px-4 font-mono text-xs last:border-b-0",
              i === MATCHED ? "text-foreground" : "text-muted-foreground",
            )}
            style={{ height: ROW_H }}
          >
            <span className="w-4 text-muted-foreground">{i === 3 ? "–" : i + 1}</span>
            <span className="w-28 shrink-0 sm:w-32">{r.effect}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.match}</span>
            <span className="relative hidden w-24 text-right sm:block">
              {i < MATCHED && <span data-tag="no-match">no match</span>}
              {i === MATCHED && (
                <span data-tag="match" className="text-primary-text">
                  match · stop
                </span>
              )}
              {i > MATCHED && <span data-tag="skipped">not evaluated</span>}
            </span>
          </div>
        ))}
      </div>
      <dl className="grid gap-x-6 gap-y-2 border-t border-border bg-surface-sunken px-4 py-3.5 font-mono text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">decision</dt>
          <dd className="text-primary-text">pending_approval</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">reason</dt>
          <dd className="truncate">HUMAN_REVIEW_REQUIRED</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">policy version</dt>
          <dd>v3</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">model in the loop</dt>
          <dd>none</dd>
        </div>
      </dl>
    </div>
  );
}

export function IdentityPanel() {
  const rows = [
    { agent: "Lead Intake Agent", env: "dev", prefix: "agx_dev_7Hk2…" },
    { agent: "Inbound Qualifier", env: "dev", prefix: "agx_dev_Qm4x…" },
    { agent: "Legacy Import Agent", env: "staging", prefix: "agx_stg_B9sd…", suspended: true },
  ];
  return (
    <ul aria-hidden="true" className="divide-y divide-border border-y border-border">
      {rows.map((r) => (
        <li key={r.prefix} className="flex items-center gap-3 py-3">
          <KeyRound className="size-4 shrink-0 text-primary-text" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.agent}</p>
            <p className="font-mono text-xs text-muted-foreground">{r.prefix}</p>
          </div>
          <span className="font-mono text-[0.7rem] text-muted-foreground">
            {r.suspended ? "suspended" : r.env}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ApprovalPanel() {
  const params = [
    ["full_name", "Ada Example"],
    ["email", "ada@example.test"],
    ["company", "Sample Co"],
  ] as const;
  return (
    <div aria-hidden="true" className="rounded-control border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-mono text-xs text-muted-foreground">crm.lead.create</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-warning-text">
          <CircleDashed className="size-3.5" /> Awaiting reviewer
        </span>
      </div>
      <dl className="space-y-2.5 px-4 py-4 text-sm">
        {params.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        Read-only. A changed value is a new request.
      </p>
    </div>
  );
}

export function GrantPanel() {
  const steps = [
    { label: "Issued", note: "payload digest 9f3a…e41b", state: "done" },
    { label: "Consumed", note: "single use, atomic", state: "done" },
    { label: "Replay", note: "rejected", state: "stopped" },
  ] as const;
  return (
    <ol aria-hidden="true" className="relative space-y-5">
      <span className="absolute top-2 bottom-2 left-[0.6875rem] w-px bg-border" />
      {steps.map((s) => (
        <li key={s.label} className="relative flex items-center gap-4">
          <span
            className={cn(
              "relative z-10 flex size-[1.375rem] items-center justify-center rounded-full border",
              s.state === "done"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-danger-border bg-danger-muted text-danger-text",
            )}
          >
            {s.state === "done" ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
          <span className="text-sm font-medium">{s.label}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">{s.note}</span>
        </li>
      ))}
    </ol>
  );
}

export function AuditPanel() {
  const events = [
    { t: "09:31:02", label: "authorized", note: "policy v3 · pending_approval" },
    { t: "09:33:40", label: "approved", note: "reviewer ≠ requester" },
    { t: "09:33:41", label: "executed", note: "mock CRM · succeeded" },
  ];
  return (
    <ul
      aria-hidden="true"
      className="divide-y divide-border border-y border-border font-mono text-xs"
    >
      {events.map((e) => (
        <li key={e.label} className="flex items-center gap-4 py-2.5">
          <span className="text-muted-foreground">{e.t}</span>
          <span className={e.label === "executed" ? "text-primary-text" : "text-foreground"}>
            {e.label}
          </span>
          <span className="ml-auto truncate text-muted-foreground">{e.note}</span>
        </li>
      ))}
    </ul>
  );
}
