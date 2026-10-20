"use client";

import * as React from "react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { HOME_SECTION_IDS } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { planeVertices, type Plane, type Pt } from "@/lib/iso";

const PILLARS: ReadonlyArray<{ n: string; title: string; body: string; signal: string }> = [
  {
    n: "01",
    title: "Agent identity",
    body: "Each agent gets its own scoped credential per environment. AgentAxio works out who is asking from the credential, never from what the request claims.",
    signal: "agent · environment · key prefix",
  },
  {
    n: "02",
    title: "Access policies",
    body: "Policies are deterministic and default-deny. A deny rule beats an approval rule, which beats an allow. No model decides who gets access.",
    signal: "deny > require_approval > allow",
  },
  {
    n: "03",
    title: "Human approvals",
    body: "Sensitive actions wait for an authorized reviewer who sees the exact parameters. Change a value and it becomes a new request that needs a new approval.",
    signal: "exact parameters · no self-approval",
  },
  {
    n: "04",
    title: "Audit logs",
    body: "Decisions, approvals and execution outcomes are recorded as separate events, so “authorized” is never mistaken for “executed”.",
    signal: "authorized ≠ executed",
  },
];

/** A small version of the hero's plane stack; the plane matching the pillar being read is lit. */
const MINI: readonly Plane[] = [0, 1, 2, 3].map((i) => ({
  cx: 120,
  cy: 186 - i * 42,
  halfW: 104,
  halfH: 52,
}));
const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

function StackFigure({ active }: { active: number }) {
  return (
    <svg viewBox="0 0 240 236" aria-hidden="true" className="h-auto w-44 overflow-visible">
      <line
        x1="120"
        y1="20"
        x2="120"
        y2="214"
        strokeDasharray="2 6"
        className="stroke-foreground/25"
      />
      {MINI.map((plane, i) => {
        const on = i === active;
        return (
          <polygon
            key={i}
            points={pts(planeVertices(plane))}
            className={cn(
              "transition-[fill,stroke] duration-500 ease-standard",
              on
                ? "fill-primary/70 stroke-primary-text"
                : "fill-foreground/[0.03] stroke-foreground/25",
            )}
            strokeWidth={on ? 1.5 : 1}
          />
        );
      })}
    </svg>
  );
}

export function PlatformSection() {
  const [active, setActive] = React.useState(0);
  const items = React.useRef<Array<HTMLLIElement | null>>([]);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number(entry.target.getAttribute("data-index")));
        }
      },
      { rootMargin: "-35% 0px -45% 0px" },
    );
    items.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <Section
      id={HOME_SECTION_IDS.platform}
      tone="light"
      aria-labelledby="platform-title"
      className="relative z-10 -mt-5 rounded-t-panel"
    >
      <Container className="grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <Reveal>
              <Eyebrow>The platform</Eyebrow>
              <Heading id="platform-title" level={2} size="display-md" className="mt-5">
                One checkpoint between your agents and the tools they use.
              </Heading>
              <Text variant="lead" className="mt-6 max-w-md">
                AgentAxio sits where an AI agent’s proposed action meets a real tool. It identifies
                the agent, applies policy, asks a person when it matters, and keeps the record.
              </Text>
            </Reveal>

            <div className="mt-10 hidden items-end gap-8 lg:flex">
              <StackFigure active={active} />
              <p className="max-w-[12rem] border-l-2 border-primary-text pl-4 text-sm leading-relaxed text-muted-foreground">
                Scope: AgentAxio protects actions routed through its trusted enforcement points. It
                can’t stop a workflow that still holds direct credentials to the tool.
              </p>
            </div>
            <p className="mt-8 max-w-md border-l-2 border-primary-text pl-4 text-sm leading-relaxed text-muted-foreground lg:hidden">
              Scope: AgentAxio protects actions routed through its trusted enforcement points. It
              can’t stop a workflow that still holds direct credentials to the tool.
            </p>
          </div>
        </div>

        <ol className="relative lg:col-span-7 lg:col-start-6">
          {/* rail */}
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[0.3125rem] w-px bg-foreground/15"
          />
          {PILLARS.map((p, i) => {
            const on = i === active;
            return (
              <li
                key={p.n}
                ref={(el) => {
                  items.current[i] = el;
                }}
                data-index={i}
                className="relative pb-14 pl-10 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-[0.55rem] left-0 size-[0.6875rem] rounded-full border transition-colors duration-300 ease-standard",
                    on ? "border-primary-text bg-primary" : "border-foreground/40 bg-background",
                  )}
                />
                <p className="font-mono text-xs text-muted-foreground">{p.n}</p>
                <h3 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                  {p.title}
                </h3>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
                <p className="mt-5 font-mono text-xs text-primary-text">{p.signal}</p>
              </li>
            );
          })}
        </ol>
      </Container>
    </Section>
  );
}
