import {
  Bot,
  CreditCard,
  LayoutDashboard,
  type LucideIcon,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  /** Route not built yet: rendered as non-interactive text instead of a dead link. */
  planned?: boolean;
}

export interface AppNavItem extends NavItem {
  icon: LucideIcon;
  description: string;
  /** Other dashboard routes that belong under this item, so it stays highlighted while they are open. */
  alsoActiveFor?: string[];
}

/** Section anchors on the homepage. The single source for both section `id`s and nav links. */
export const HOME_SECTION_IDS = {
  platform: "platform",
  features: "features",
  product: "product",
  workflow: "workflow",
  developers: "developers",
  pricing: "pricing",
} as const;

/**
 * Primary marketing navigation: one real page per destination (FE-08). Every href must have a page under
 * src/app/(marketing) (enforced by navigation.test.ts).
 */
export const marketingNav: NavItem[] = [
  { label: "Platform", href: "/platform" },
  { label: "Features", href: "/features" },
  { label: "Solutions", href: "/solutions" },
  { label: "Security", href: "/security" },
  { label: "Developers", href: "/developers" },
  { label: "Pricing", href: "/pricing" },
];

/** Secondary marketing destinations, reached from the footer. */
export const companyNav: NavItem[] = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const legalNav: NavItem[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

/**
 * Primary dashboard navigation: six everyday destinations, always visible on desktop and in the mobile drawer. Every href
 * must have a page under src/app/dashboard (enforced by navigation.test.ts): unbuilt modules get an honest placeholder
 * page, never a dead link.
 *
 * Route paths are the stable contract with the future backend and are deliberately NOT renamed to match the labels:
 * "Permissions" is /dashboard/policies and "Activity" is /dashboard/audit.
 */
export const primaryNav: AppNavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "What needs your attention, and what your agents have been doing.",
  },
  {
    label: "My Agents",
    href: "/dashboard/agents",
    icon: Bot,
    description: "The agents you have set up, and what each one is for.",
    // Agent identities (credentials) live inside My Agents rather than in the main menu.
    alsoActiveFor: ["/dashboard/identities"],
  },
  {
    label: "Permissions",
    href: "/dashboard/policies",
    icon: ShieldCheck,
    description: "What each agent is allowed, and what needs a person’s approval.",
  },
  {
    label: "Approvals",
    href: "/dashboard/approvals",
    icon: UserCheck,
    description: "Requests waiting for someone to say yes or no.",
  },
  {
    label: "Activity",
    href: "/dashboard/audit",
    icon: ScrollText,
    description: "A history of what your agents asked to do, and what happened.",
  },
  {
    label: "Integrations",
    href: "/dashboard/integrations",
    icon: Plug,
    description: "The tools your agents will work through. Nothing is connected yet.",
  },
];

/** Secondary section at the bottom of the sidebar: the workspace itself rather than day-to-day work. */
export const secondaryNav: AppNavItem[] = [
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    description: "Appearance, and details of this workspace.",
  },
  {
    label: "Team & Organization",
    href: "/dashboard/team",
    icon: Users,
    description: "Who can manage agents and approve requests.",
  },
  {
    label: "Billing",
    href: "/dashboard/billing",
    icon: CreditCard,
    description: "Plans and usage. Not available in the pre-release.",
  },
];

/** Every dashboard destination reachable from the menu, in display order. */
export const appNav: AppNavItem[] = [...primaryNav, ...secondaryNav];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True when the item, or one of the routes that live under it, is the current page. */
export function isNavItemActive(pathname: string, item: AppNavItem): boolean {
  return (
    isActivePath(pathname, item.href) ||
    (item.alsoActiveFor ?? []).some((href) => isActivePath(pathname, href))
  );
}
