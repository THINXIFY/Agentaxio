import * as React from "react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

const rise = (delayMs: number, risePx?: string) =>
  ({ "--d": `${delayMs}ms`, ...(risePx ? { "--rise": risePx } : {}) }) as React.CSSProperties;

/**
 * Opening band for every marketing page. It never waits for JavaScript: the entrance is CSS only (see .hero-rise), so the
 * page title paints on the first frame it is available.
 *
 *  - layout "split"   text on the left, a diagram or code window on the right (Platform, Security, Developers)
 *  - layout "center"  centred, quiet (Pricing, Contact)
 *  - layout "wide"    a long left-aligned statement with a small aside (About)
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  actions,
  status,
  aside,
  layout = "split",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead: React.ReactNode;
  actions?: React.ReactNode;
  /** A status pill row, e.g. "Designed · not built". */
  status?: React.ReactNode;
  /** The visual for the right-hand side of a split hero. */
  aside?: React.ReactNode;
  layout?: "split" | "center" | "wide";
  className?: string;
}) {
  const centered = layout === "center";
  return (
    <Section
      tone="dark"
      spacing="none"
      aria-labelledby="page-title"
      className={cn(
        "-mt-(--topbar-height) pt-[calc(var(--topbar-height)+3.5rem)] pb-16 sm:pt-[calc(var(--topbar-height)+5rem)] sm:pb-24",
        className,
      )}
    >
      <div aria-hidden="true" className="bg-wash absolute inset-x-0 top-0 -z-10 h-[70%]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-px bg-border" />

      <Container
        className={cn(
          "grid grid-cols-1 gap-12",
          layout === "split" && "items-center lg:grid-cols-12 lg:gap-10",
          centered && "justify-items-center text-center",
        )}
      >
        <div
          className={cn(
            layout === "split" && "lg:col-span-6",
            layout === "wide" && "max-w-4xl",
            centered && "max-w-3xl",
          )}
        >
          <div className="hero-rise" style={rise(0, "12px")}>
            <Eyebrow className={cn("flex items-center gap-3", centered && "justify-center")}>
              <span aria-hidden="true" className="h-px w-8 bg-primary" />
              {eyebrow}
            </Eyebrow>
          </div>

          <div className="hero-rise" style={rise(120, "24px")}>
            <Heading id="page-title" level={1} size="display-lg" className="mt-6">
              {title}
            </Heading>
          </div>

          <div className="hero-rise" style={rise(260)}>
            <Text variant="lead" className={cn("mt-6 max-w-xl text-pretty", centered && "mx-auto")}>
              {lead}
            </Text>
          </div>

          {status ? (
            <div
              className={cn("hero-rise mt-6 flex flex-wrap gap-2", centered && "justify-center")}
              style={rise(360)}
            >
              {status}
            </div>
          ) : null}

          {actions ? (
            <div
              className={cn(
                "hero-rise mt-8 flex flex-col gap-3 sm:flex-row",
                centered && "justify-center",
              )}
              style={rise(440)}
            >
              {actions}
            </div>
          ) : null}
        </div>

        {aside ? (
          <div className="hero-rise lg:col-span-6" style={rise(380, "28px")}>
            {aside}
          </div>
        ) : null}
      </Container>
    </Section>
  );
}
