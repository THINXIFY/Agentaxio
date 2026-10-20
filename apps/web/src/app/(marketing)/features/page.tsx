import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ArtHero, Chapter, StatusMark, StatusStrip } from "@/components/marketing/art/chapter";
import { FeatureShowcase } from "@/components/marketing/art/feature-showcase";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Agent management, identity and access, permission policies, human approvals, activity and audit logs, and the n8n integration, shown as the product's own demo UI.",
};

const LATER = [
  { item: "A TypeScript SDK", when: "after the n8n demo is proven end to end" },
  { item: "Policy version history with safe rollbacks", when: "after private beta" },
  { item: "Finer-grained resource scopes and approval chains", when: "after private beta" },
  { item: "Usage analytics and billing", when: "commercial phase" },
  { item: "MCP tool gateways and further integrations", when: "considered, not started" },
] as const;

export default function FeaturesPage() {
  return (
    <>
      <ArtHero
        label="Features"
        title="The controls, as they appear in the product."
        lead="Six controls sit between an agent and the tools it uses. Pick one to see the demo UI it uses, built from the same components as the demo dashboard."
      >
        <StatusStrip kinds={["demo", "designed", "planned"]}>
          Every screen below is a conceptual demo on invented data. Nothing is connected, and the
          controls themselves are designed, not built.
        </StatusStrip>
        <div className="mt-10 sm:mt-12">
          <FeatureShowcase />
        </div>
      </ArtHero>

      <Chapter
        id="later"
        index="01"
        label="After the first release"
        round
        title="What we are deliberately not promising yet."
        lead="These are on the list, in this rough order. None of them is built, and none should be assumed."
      >
        <Reveal>
          <ul className="border-t border-border">
            {LATER.map((l) => (
              <li
                key={l.item}
                className="flex flex-col gap-1 border-b border-border py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
              >
                <span className="text-base">{l.item}</span>
                <StatusMark status="planned" className="shrink-0 text-muted-foreground">
                  {l.when}
                </StatusMark>
              </li>
            ))}
          </ul>
          <p className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-base">
            {[
              { href: "/platform", label: "How the pieces fit together" },
              { href: "/security", label: "The security design" },
              { href: "/dashboard", label: "Open the demo dashboard" },
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
          </p>
        </Reveal>
      </Chapter>
    </>
  );
}
