"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { isNavItemActive, primaryNav, secondaryNav, type AppNavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";

function NavLink({ item, onNavigate }: { item: AppNavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "group/nav relative flex h-11 items-center gap-3.5 rounded-control px-3.5 text-base font-medium",
        "text-muted-foreground transition-colors duration-200 ease-standard hover:bg-surface-hover hover:text-foreground",
        "aria-[current=page]:bg-surface-hover aria-[current=page]:text-foreground",
        // restrained violet indicator: a short bar on the leading edge
        "before:absolute before:top-1/2 before:-left-3 before:h-5 before:w-[3px] before:-translate-y-1/2 before:scale-y-0 before:rounded-full before:bg-primary-text before:transition-transform before:duration-300 before:ease-emphasized",
        "aria-[current=page]:before:scale-y-100",
      )}
    >
      <Icon
        aria-hidden="true"
        className="size-5 shrink-0 transition-colors duration-200 group-aria-[current=page]/nav:text-primary-text"
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * The dashboard menu: six everyday destinations, then a quieter secondary section (Settings, Team, Billing) pinned to the
 * bottom. Used as the fixed desktop sidebar and, identically, inside the drawer on small screens.
 */
export function DashboardSidebar({
  onNavigate,
  showLogo = true,
  className,
}: {
  onNavigate?: () => void;
  /** The drawer already has its own title, so it hides the logo. */
  showLogo?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      {showLogo ? (
        <div className="flex h-(--topbar-height) shrink-0 items-center pl-6">
          <Logo href="/dashboard" />
        </div>
      ) : null}

      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        <ul className="flex flex-col gap-1">
          {primaryNav.map((item) => (
            <li key={item.href}>
              <NavLink item={item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border/60 px-4 py-4">
        <nav aria-label="Workspace">
          <ul className="flex flex-col gap-1">
            {secondaryNav.map((item) => (
              <li key={item.href}>
                <NavLink item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-3 px-3.5 text-sm text-muted-foreground">Demo · sample data</p>
      </div>
    </div>
  );
}
