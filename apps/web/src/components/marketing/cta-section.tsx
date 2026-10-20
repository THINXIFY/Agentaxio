import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Parallax } from "@/components/motion/parallax";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { HOME_SECTION_IDS } from "@/config/navigation";
import { planeVertices, type Plane, type Pt } from "@/lib/iso";

const STACK: readonly Plane[] = [0, 1, 2].map((i) => ({
  cx: 400,
  cy: 330 - i * 96,
  halfW: 320,
  halfH: 160,
}));
const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

export function CtaSection() {
  return (
    <Section
      tone="dark"
      aria-labelledby="cta-title"
      className="relative z-10 -mt-5 rounded-t-panel border-t border-border"
    >
      {/* Minimal violet lighting from below: one soft radial, no gradient banding. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-[70%] bg-[radial-gradient(55%_100%_at_50%_100%,color-mix(in_srgb,var(--primary)_13%,transparent),transparent)]"
      />

      {/* Echo of the hero's layered planes: static, faint, decorative. */}
      <Parallax
        distance={100}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 flex -translate-y-1/2 justify-center"
      >
        <svg viewBox="0 0 800 520" className="w-[min(135vw,980px)] max-w-none">
          <g fill="none" className="stroke-foreground/[0.08]">
            {STACK.map((plane, i) => (
              <polygon key={i} points={pts(planeVertices(plane))} />
            ))}
          </g>
          <line
            x1="400"
            y1="90"
            x2="400"
            y2="490"
            strokeDasharray="2 8"
            className="stroke-foreground/[0.1]"
          />
          <circle cx="400" cy="234" r="4" className="fill-primary/70" />
        </svg>
      </Parallax>

      <Container className="text-center">
        <Reveal>
          <Heading id="cta-title" level={2} size="display-lg" className="mx-auto max-w-3xl">
            Move fast. Keep the final say<span className="text-primary">.</span>
          </Heading>
        </Reveal>
        <Reveal delay={0.1}>
          <Text variant="lead" className="mx-auto mt-6 max-w-xl text-pretty">
            Open the demo dashboard and follow sample requests from proposal to outcome. No sign-up,
            no real data.
          </Text>
        </Reveal>
        <Reveal
          delay={0.2}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/dashboard">
              Explore the demo dashboard <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href={`/#${HOME_SECTION_IDS.developers}`}>Read the n8n contract</Link>
          </Button>
        </Reveal>
      </Container>
    </Section>
  );
}
