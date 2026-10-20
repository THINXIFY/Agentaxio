import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/layout/container";
import { HOME_SECTION_IDS } from "@/config/navigation";

/** Only implemented destinations are links. Pages that do not exist yet are simply not listed. */
const COLUMNS: ReadonlyArray<{
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}> = [
  {
    title: "Explore",
    links: [
      { label: "Platform", href: `/#${HOME_SECTION_IDS.platform}` },
      { label: "Product", href: `/#${HOME_SECTION_IDS.product}` },
      { label: "How it works", href: `/#${HOME_SECTION_IDS.workflow}` },
      { label: "Developers", href: `/#${HOME_SECTION_IDS.developers}` },
      { label: "Pricing", href: `/#${HOME_SECTION_IDS.pricing}` },
    ],
  },
  {
    title: "Demo",
    links: [
      { label: "Dashboard overview", href: "/dashboard" },
      { label: "Agents", href: "/dashboard/agents" },
      { label: "Settings", href: "/dashboard/settings" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="surface-dark relative overflow-hidden border-t border-border">
      <Container className="grid grid-cols-1 gap-10 pt-14 pb-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-xs space-y-4">
          <Logo />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Authorization, human approval and audit for AI agent actions.
          </p>
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
            Pre-release preview · sample data
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={`Footer: ${col.title}`}>
            <h2 className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
              {col.title}
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-foreground/90 transition-colors duration-200 hover:text-primary-text"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>

      <Container className="flex flex-col gap-2 border-t border-border py-5 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>© {new Date().getUTCFullYear()} AgentAxio. All rights reserved.</p>
        <p>Not a certified or independently audited security product. Visuals use sample data.</p>
      </Container>

      {/* Oversized outlined wordmark, cropped by the page edge. Decorative. */}
      <p
        aria-hidden="true"
        data-text="AgentAxio"
        className="deco-text text-outline pointer-events-none -mb-[0.2em] text-center font-display text-[clamp(3.5rem,14vw,12rem)] leading-[0.85] font-semibold tracking-[-0.06em] select-none"
      />
    </footer>
  );
}
