import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/layout/container";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

export const metadata: Metadata = {
  title: "Design system",
  description: "Internal reference for AgentAxio tokens and components.",
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-(--z-sticky) border-b border-border bg-background/85 backdrop-blur-lg">
        <Container className="flex h-(--topbar-height) items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              / design-system
            </span>
          </div>
          {/* Labels would overflow a 320px header, so small screens get the icon-only switcher. */}
          <ThemeSwitcher className="sm:hidden" />
          <ThemeSwitcher showLabels className="hidden sm:inline-flex" />
        </Container>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
