import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  ArtHero,
  Chapter,
  Prose,
  StatusMark,
  StatusStrip,
} from "@/components/marketing/art/chapter";
import { RequestFlow } from "@/components/marketing/art/request-flow";
import { Reveal } from "@/components/motion/reveal";
import { Code } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "How AgentAxio is designed to sit between an AI agent and the tools it uses: identity, rules, human approval, execution and a record that keeps each step separate.",
};

const KEY_PARTS = [
  { part: "agx", label: "AgentAxio key" },
  { part: "dev", label: "Environment" },
  { part: "7Hk2…", label: "Short preview. The full secret is shown once." },
] as const;

const LADDER = [
  {
    n: "1",
    when: "A blocked rule matches",
    result: "Blocked",
    note: "This beats everything below it.",
    tone: "text-danger-text",
  },
  {
    n: "2",
    when: "A rule asks for approval",
    result: "Needs approval",
    note: "A person has to say yes first.",
    tone: "text-warning-text",
  },
  {
    n: "3",
    when: "A rule allows it",
    result: "Allowed",
    note: "Only if nothing above matched.",
    tone: "text-success-text",
  },
  {
    n: "4",
    when: "No rule matches",
    result: "Blocked",
    note: "The default.",
    tone: "text-danger-text",
  },
] as const;

const LEDGER = [
  { t: "09:31:02", fact: "Authorized", detail: "Policy v3 answered: needs approval" },
  { t: "09:33:40", fact: "Approved", detail: "A reviewer other than the requester said yes" },
  { t: "09:33:41", fact: "Executed", detail: "The executor ran it; outcome: succeeded" },
] as const;

const REVOCATION = [
  { t: "10:02", what: "An administrator suspends the agent." },
  { t: "10:03", what: "Its next request is blocked: the agent is suspended." },
  {
    t: "10:04",
    what: "A request approved earlier but not yet run is re-checked just before it runs, and blocked.",
  },
] as const;

export default function PlatformPage() {
  return (
    <>
      <ArtHero
        label="Platform"
        title="Agents propose. AgentAxio decides. Only then does anything run."
        lead="AgentAxio is designed to sit between an AI agent and the tools it uses. For every action you route through it, it checks who is asking, applies your rules, asks a person when a rule says to, and records what happened."
      >
        <StatusStrip>
          Conceptual and shown on invented data. The enforcement backend is designed, not built, so
          nothing here is operating yet.
        </StatusStrip>
        <RequestFlow className="mt-10" />
      </ArtHero>

      <Chapter
        id="identity"
        index="01"
        label="Identity"
        round
        title="Each agent has its own key. The request never says who it is."
        lead="AgentAxio works out who is asking from the credential, on the server. A workflow can’t claim to be a different agent, because nothing in the request is believed about identity."
      >
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-10 lg:gap-12">
          <Reveal className="lg:col-span-6">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              Anatomy of an agent key (a sample, not a real key)
            </p>
            <p className="mt-5 font-mono text-[clamp(1.75rem,1.1rem+3vw,3.25rem)] leading-none tracking-tight">
              <span>agx</span>
              <span className="text-muted-foreground">_</span>
              <span>dev</span>
              <span className="text-muted-foreground">_</span>
              <span className="text-primary-text">7Hk2…</span>
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-y-3 border-t border-border-strong pt-5 sm:grid-cols-3 sm:gap-x-6">
              {KEY_PARTS.map((k) => (
                <li key={k.part}>
                  <Code className="text-xs">{k.part}</Code>
                  <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{k.label}</p>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-4">
            <Prose className="text-base">
              <p>One key per agent and environment, so revoking one agent touches no other.</p>
              <p>
                Stored hashed by AgentAxio and shown once, when it is created. The dashboard only
                ever shows the short preview.
              </p>
            </Prose>
          </Reveal>
        </div>
      </Chapter>

      <Chapter
        id="permissions"
        index="02"
        label="Permissions"
        title="Rules decide. If none says yes, the answer is no."
        lead="Rules are checked in a fixed order and always give the same answer to the same request. No AI model takes part in the decision."
      >
        <Reveal>
          <ol aria-label="The order in which rules win" className="border-t border-border">
            {LADDER.map((r) => (
              <li
                key={r.n}
                className="grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 gap-y-1 border-b border-border py-5 md:grid-cols-[3.5rem_minmax(0,17rem)_12rem_1fr] md:gap-x-8"
              >
                <span
                  aria-hidden="true"
                  className="font-display text-3xl leading-none text-muted-foreground/60 md:text-4xl"
                >
                  {r.n}
                </span>
                <span className="text-base font-medium">{r.when}</span>
                <span className={cn("col-start-2 font-mono text-sm md:col-start-auto", r.tone)}>
                  {r.result}
                </span>
                <span className="col-start-2 text-sm text-muted-foreground md:col-start-auto">
                  {r.note}
                </span>
              </li>
            ))}
          </ol>
        </Reveal>
      </Chapter>

      <Chapter
        id="approvals"
        index="03"
        label="Approvals"
        tone="dark"
        title="A person approves values, not summaries."
        lead="When a rule asks for approval, an authorized reviewer sees the exact values the agent proposed, and decides."
      >
        <Reveal className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border">
          <div className="md:pr-10">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              The reviewer can
            </p>
            <ul className="mt-4 space-y-3 text-base leading-relaxed">
              <li>See the exact values, field by field</li>
              <li>Approve the request as proposed</li>
              <li>Reject it</li>
            </ul>
          </div>
          <div className="md:pl-10">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              The reviewer cannot
            </p>
            <ul className="mt-4 space-y-3 text-base leading-relaxed">
              <li>Edit a value in place. A change is a new request and needs a new approval</li>
              <li>Approve their own request</li>
              <li>
                Make an approval count as execution. It is permission, not proof that the action ran
              </li>
            </ul>
          </div>
        </Reveal>
      </Chapter>

      <Chapter
        id="activity"
        index="04"
        label="Activity"
        tone="dark"
        title="Approved and done are two different records."
        lead="Each step is written down as its own fact, so the history never claims more than actually happened."
      >
        <Reveal>
          <ol
            aria-label="A sample activity record"
            className="border-t border-border font-mono text-sm"
          >
            {LEDGER.map((l) => (
              <li
                key={l.t}
                className="grid grid-cols-[5.5rem_1fr] gap-x-5 gap-y-0.5 border-b border-border py-4 md:grid-cols-[7rem_9rem_1fr]"
              >
                <span className="text-muted-foreground">{l.t}</span>
                <span className="text-primary-text">{l.fact}</span>
                <span className="col-start-2 font-sans text-[0.9375rem] text-muted-foreground md:col-start-auto">
                  {l.detail}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">A sample record on invented values.</p>
        </Reveal>
      </Chapter>

      <Chapter
        id="revocation"
        index="05"
        label="Revocation"
        title="Switch an agent off and it stays off."
        lead="Suspending an agent takes effect at every AgentAxio-controlled enforcement point. An approval can’t outlive the agent’s access, because access is checked again at the moment of execution."
      >
        <Reveal>
          <ol
            aria-label="What happens after an agent is suspended"
            className="max-w-2xl border-l border-border-strong pl-6"
          >
            {REVOCATION.map((r) => (
              <li key={r.t} className="relative pb-7 last:pb-0">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 -left-[1.9375rem] size-2 rounded-full bg-primary-text"
                />
                <p className="font-mono text-xs text-muted-foreground">{r.t}</p>
                <p className="mt-1 text-base leading-relaxed">{r.what}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </Chapter>

      <Chapter
        id="status"
        index="06"
        label="Where this stands"
        tone="dark"
        title="What exists today, and what does not."
      >
        <Reveal className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
          <div className="md:pr-8">
            <StatusMark status="built" />
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              This website and a demo dashboard, on invented data.
            </p>
          </div>
          <div className="md:px-8">
            <StatusMark status="designed" />
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Everything in the flow above: authentication, rules, approvals, the executor and the
              record.
            </p>
          </div>
          <div className="md:pl-8">
            <StatusMark status="planned">Scope</StatusMark>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Only actions routed through AgentAxio are controlled. Anyone still holding a tool’s
              credentials directly can bypass it.
            </p>
          </div>
        </Reveal>
        <Reveal
          delay={0.08}
          className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-base sm:flex-row sm:gap-8"
        >
          {[
            { href: "/dashboard", label: "Open the demo dashboard" },
            { href: "/security", label: "Read the security design" },
            { href: "/developers", label: "Read the developer contract" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group inline-flex items-center gap-2 font-medium text-primary-text underline-offset-4 hover:underline"
            >
              {l.label}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </Reveal>
      </Chapter>
    </>
  );
}
