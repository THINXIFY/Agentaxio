import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { OrbitArt } from "@/components/marketing/orbit-art";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { HOME_SECTION_IDS } from "@/config/navigation";

/** Each headline line sits in a clip mask so its words rise into place (CSS only; see .hero-rise). */
const LINE = "block overflow-hidden pb-[0.16em] -mb-[0.16em]";
const rise = (delayMs: number, risePx?: string) =>
  ({ "--d": `${delayMs}ms`, ...(risePx ? { "--rise": risePx } : {}) }) as React.CSSProperties;

/**
 * Centered hero. The headline never waits for JavaScript (CSS entrances only, so it paints on the first frame it is
 * available), the artwork is an inline SVG with CSS-only drift, and the whole composition is built from design tokens.
 */
export function Hero() {
  return (
    <Section
      tone="dark"
      spacing="none"
      className="-mt-(--topbar-height) pt-[calc(var(--topbar-height)+2.5rem)] sm:pt-[calc(var(--topbar-height)+3.5rem)]"
      aria-labelledby="hero-title"
    >
      {/* Atmosphere: one soft violet wash from above and one rising behind the artwork. No grid, no extra glow. */}
      <div aria-hidden="true" className="bg-wash absolute inset-x-0 top-0 -z-10 h-[60%]" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-[62%] bg-[radial-gradient(60%_85%_at_50%_100%,color-mix(in_srgb,var(--primary)_26%,transparent),transparent_72%)]"
      />

      <Container className="relative z-10 flex flex-col items-center text-center">
        <p
          className="hero-rise inline-flex items-center gap-2.5 rounded-full border border-border bg-surface/60 py-1.5 pr-4 pl-3 text-[0.7rem] font-medium tracking-[0.18em] text-muted-foreground uppercase backdrop-blur sm:text-xs"
          style={rise(0, "12px")}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
          The control layer for agentic AI
        </p>

        <Heading id="hero-title" level={1} size="display-hero" className="mt-6 max-w-4xl">
          <span className={LINE}>
            <span className="hero-rise block text-muted-foreground" style={rise(120, "70%")}>
              AI Moves Fast.
            </span>
          </span>{" "}
          <span className={LINE}>
            <span className="hero-rise block" style={rise(260, "70%")}>
              Stay in <span className="text-primary-text">Control.</span>
            </span>
          </span>
        </Heading>

        <div className="hero-rise" style={rise(420)}>
          <Text variant="lead" className="mx-auto mt-5 max-w-xl text-pretty sm:text-lg">
            Secure agent identities, enforce access policies, and approve critical actions—all from
            one unified platform.
          </Text>
        </div>

        <div
          className="hero-rise mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row"
          style={rise(540)}
        >
          <Button asChild size="lg" className="group w-full sm:w-auto">
            <Link href={`/#${HOME_SECTION_IDS.platform}`}>
              Explore Platform{" "}
              <ArrowRight
                aria-hidden="true"
                className="transition-transform duration-300 ease-standard group-hover:translate-x-0.5"
              />
            </Link>
          </Button>
          {/* No documentation site exists yet: this goes to the only documentation-style content, the n8n contract preview. */}
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href={`/#${HOME_SECTION_IDS.developers}`}>View Documentation</Link>
          </Button>
        </div>
      </Container>

      {/* Artwork: cropped to the section edge so the core reads as a horizon. */}
      <div
        className="hero-rise relative mx-auto -mt-4 h-[300px] w-full max-w-[1400px] sm:-mt-10 sm:h-[380px] md:-mt-16 md:h-[470px] lg:-mt-24 lg:h-[560px]"
        style={rise(700, "24px")}
      >
        <OrbitArt />
      </div>

      <p className="relative pb-8 text-center font-mono text-[0.7rem] tracking-wide text-muted-foreground">
        Illustration · sample agents · pre-release preview
      </p>
    </Section>
  );
}
