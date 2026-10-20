import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { ArrowLinks, ArtHero, Chapter, StatusStrip } from "@/components/marketing/art/chapter";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "AgentAxio pricing has not been decided. Here is how plans may be sized, and what will not depend on your plan.",
};

const DIMENSIONS = [
  { name: "Agents", note: "How many you can register" },
  { name: "Environments", note: "Separate spaces such as dev and staging" },
  { name: "Approvers", note: "How many people can review requests" },
  { name: "Activity history", note: "How long records stay in the dashboard" },
  { name: "Integrations", note: "Which enforcement points are available" },
  { name: "Support", note: "How quickly and how directly we respond" },
] as const;

const SHAPES = [
  { name: "Builder", who: "One person or a small team trying AgentAxio with a few agents." },
  {
    name: "Team",
    who: "A team running agents for real work, with several people reviewing requests.",
  },
  { name: "Organization", who: "A company or agency with many agents, clients or business units." },
] as const;

const FAQ = [
  {
    q: "When will pricing be published?",
    a: "It has not been decided. We will publish prices before any paid plan opens, and not before the product is ready to be used for real.",
  },
  {
    q: "Is there a free plan or a trial?",
    a: "Not decided. Today the only thing you can try is the demo dashboard, which runs on invented sample data.",
  },
  {
    q: "Can I sign up or pay now?",
    a: "No. There are no accounts and no billing yet. Nothing on this page is an offer.",
  },
  {
    q: "Will you charge per request?",
    a: "We expect usage to play some part, for example in how many agents or requests a plan covers. How exactly is still open.",
  },
  {
    q: "Will a cheaper plan make the rules weaker?",
    a: "No. Plans may limit how much you can use. They will never change how rules are evaluated or relax the default of blocking.",
  },
] as const;

export default function PricingPage() {
  return (
    <>
      <ArtHero
        label="Pricing"
        title="Pricing isn’t set yet. Here is what we’re deciding."
        lead="We would rather say so than invent numbers for a product that is still being built. This page shows the shape of the decision: how plans might be sized, and what will not depend on your plan."
      >
        <StatusStrip kinds={["planned"]}>
          Pre-launch. There are no prices, no plans for sale and no sign-up. The plan names below
          are working labels.
        </StatusStrip>
      </ArtHero>

      <Chapter
        id="shapes"
        index="01"
        label="Plan shapes"
        round
        wide
        title="Three possible ways to size it."
        lead="Each column asks the same six questions. None of them has an answer yet."
      >
        <Reveal className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border-strong/50">
          {SHAPES.map((s) => (
            <div key={s.name} className="md:px-7 md:first:pl-0 md:last:pr-0">
              <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
                Working name
              </p>
              <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">{s.name}</h3>
              <p className="mt-2 min-h-[3.5rem] text-base leading-relaxed text-muted-foreground">
                {s.who}
              </p>
              <dl className="mt-6 border-t border-border-strong/50">
                {DIMENSIONS.map((d) => (
                  <div
                    key={d.name}
                    className="flex items-baseline justify-between gap-4 border-b border-border py-3"
                  >
                    <dt className="text-sm">{d.name}</dt>
                    <dd className="font-mono text-xs text-muted-foreground">Not decided</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 font-display text-xl font-semibold tracking-tight text-muted-foreground">
                Price not decided
              </p>
            </div>
          ))}
        </Reveal>
      </Chapter>

      <Chapter
        id="differences"
        index="02"
        label="Size, not safety"
        tone="dark"
        title="If plans differ, it will be by how much you use, not how safe the rules are."
      >
        <Reveal className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border">
          <div className="md:pr-10">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              What may differ
            </p>
            <dl className="mt-4 space-y-4">
              {DIMENSIONS.map((d) => (
                <div key={d.name}>
                  <dt className="text-base font-medium">{d.name}</dt>
                  <dd className="text-sm text-muted-foreground">{d.note}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="md:pl-10">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              What will not depend on your plan
            </p>
            <ul className="mt-4 space-y-4 text-base leading-relaxed">
              <li>How rules are evaluated</li>
              <li>The default of blocking anything no rule allows</li>
              <li>The separate records for “authorized” and “executed”</li>
            </ul>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Plans will meter usage. They will never change how a request is decided.
            </p>
          </div>
        </Reveal>
      </Chapter>

      <Chapter id="faq" index="03" label="Questions" title="Pricing, honestly.">
        <Reveal>
          <ul className="border-t border-border">
            {FAQ.map((f) => (
              <li key={f.q} className="border-b border-border">
                <details className="group/faq">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard group-open/faq:rotate-90"
                    />
                  </summary>
                  <p className="max-w-[62ch] pb-6 text-base leading-relaxed text-muted-foreground">
                    {f.a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
          <ArrowLinks
            className="mt-10"
            links={[
              { href: "/contact", label: "Tell us how many agents you run" },
              { href: "/dashboard", label: "Explore the demo" },
            ]}
          />
        </Reveal>
      </Chapter>
    </>
  );
}
