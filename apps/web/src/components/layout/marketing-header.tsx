"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { marketingNav, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";

const sectionIdOf = (item: NavItem) => item.href.split("#")[1] ?? null;

/** Tracks which homepage section is crossing the middle of the viewport. */
function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = React.useState<string | null>(null);
  const key = ids.join("|");

  React.useEffect(() => {
    const els = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) setActive(id);
          else setActive((prev) => (prev === id ? null : prev));
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return active;
}

/**
 * Minimal marketing top bar on the forced-dark palette. Transparent over the hero, gaining a blurred
 * backdrop and hairline once the page scrolls. The nav marks the section currently in view.
 */
export function MarketingHeader({
  items = marketingNav,
  tone = "dark",
  cta = { href: "/dashboard", label: "Explore the demo" },
}: {
  items?: NavItem[];
  tone?: "dark" | "light";
  /** The header’s call to action. Defaults to the live demo dashboard. */
  cta?: { href: string; label: string };
}) {
  const surface = tone === "dark" ? "surface-dark" : "surface-light";
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const active = useActiveSection(items.map(sectionIdOf).filter((id): id is string => id !== null));

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        surface,
        "sticky top-0 z-(--z-sticky) border-b transition-[background-color,border-color,backdrop-filter] duration-300 ease-standard",
        scrolled
          ? "border-border bg-background/95 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <Container className="flex h-(--topbar-height) items-center gap-6">
        <Logo className="shrink-0" />

        <nav aria-label="Primary" className="hidden flex-1 items-center justify-center md:flex">
          <ul className="flex items-center gap-0.5 lg:gap-2">
            {items.map((item) => (
              <li key={item.href}>
                <NavEntry item={item} active={active === sectionIdOf(item)} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Button asChild size="sm" className="hidden lg:inline-flex">
            <Link href={cta.href}>
              {cta.label} <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>

          <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </DrawerTrigger>
            <DrawerContent side="right" title="Menu" className={surface}>
              <nav aria-label="Mobile primary">
                <ul className="flex flex-col text-xl">
                  {items.map((item) => (
                    <li key={item.href} className="border-b border-border">
                      <NavEntry
                        item={item}
                        active={active === sectionIdOf(item)}
                        mobile
                        onNavigate={() => setMenuOpen(false)}
                      />
                    </li>
                  ))}
                </ul>
              </nav>
              <Button asChild className="mt-8 w-full" size="lg">
                <Link href={cta.href} onClick={() => setMenuOpen(false)}>
                  {cta.label} <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            </DrawerContent>
          </Drawer>
        </div>
      </Container>
    </header>
  );
}

function NavEntry({
  item,
  active,
  mobile = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  if (item.planned) {
    return (
      <span aria-disabled="true" className="cursor-default px-3 py-2 text-muted-foreground/70">
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "location" : undefined}
      className={cn(
        "group relative block text-sm text-muted-foreground transition-colors duration-200 ease-standard hover:text-foreground aria-[current=location]:text-foreground",
        mobile ? "py-4 text-lg" : "rounded-control px-3 py-2",
      )}
    >
      {item.label}
      {/* Underline draws in from the left on hover and stays for the active section. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute h-px origin-left scale-x-0 bg-primary transition-transform duration-300 ease-emphasized group-hover:scale-x-100 group-aria-[current=location]:scale-x-100",
          mobile ? "bottom-0 left-0 w-full" : "inset-x-3 bottom-1",
        )}
      />
    </Link>
  );
}
