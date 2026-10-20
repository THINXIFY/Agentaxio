import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appNav,
  companyNav,
  HOME_SECTION_IDS,
  isActivePath,
  isNavItemActive,
  legalNav,
  marketingNav,
  primaryNav,
  secondaryNav,
} from "@/config/navigation";

describe("isActivePath", () => {
  it("matches Overview only on the exact dashboard path", () => {
    expect(isActivePath("/dashboard", "/dashboard")).toBe(true);
    expect(isActivePath("/dashboard/agents", "/dashboard")).toBe(false);
  });

  it("matches nested routes for sections", () => {
    expect(isActivePath("/dashboard/agents", "/dashboard/agents")).toBe(true);
    expect(isActivePath("/dashboard/agents/abc", "/dashboard/agents")).toBe(true);
    expect(isActivePath("/dashboard/agents-archive", "/dashboard/agents")).toBe(false);
  });
});

describe("dashboard navigation", () => {
  it("has exactly six primary items, in order, with Integrations directly visible", () => {
    expect(primaryNav.map((n) => n.label)).toEqual([
      "Overview",
      "My Agents",
      "Permissions",
      "Approvals",
      "Activity",
      "Integrations",
    ]);
  });

  it("keeps the existing route paths (labels changed, routes did not)", () => {
    expect(primaryNav.map((n) => n.href)).toEqual([
      "/dashboard",
      "/dashboard/agents",
      "/dashboard/policies",
      "/dashboard/approvals",
      "/dashboard/audit",
      "/dashboard/integrations",
    ]);
  });

  it("puts Settings, Team and Billing in a separate secondary section", () => {
    expect(secondaryNav.map((n) => n.label)).toEqual([
      "Settings",
      "Team & Organization",
      "Billing",
    ]);
    expect(primaryNav.some((n) => secondaryNav.includes(n))).toBe(false);
  });

  it("keeps My Agents highlighted for agent details and agent identities", () => {
    const agents = primaryNav[1]!;
    expect(isNavItemActive("/dashboard/identities", agents)).toBe(true);
    expect(isNavItemActive("/dashboard/agents/some-agent", agents)).toBe(true);
    expect(isNavItemActive("/dashboard/identities", primaryNav[0]!)).toBe(false);
    expect(isNavItemActive("/dashboard/integrations", secondaryNav[0]!)).toBe(false);
  });

  it("has unique hrefs", () => {
    const hrefs = appNav.map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("never links to a route that does not exist (no dead links)", () => {
    const appDir = join(__dirname, "..", "app");
    for (const href of [...appNav.map((n) => n.href), "/dashboard/identities"]) {
      const segments = href.split("/").filter(Boolean);
      expect(existsSync(join(appDir, ...segments, "page.tsx")), href).toBe(true);
    }
  });
});

describe("marketing navigation", () => {
  const marketingDir = join(__dirname, "..", "app", "(marketing)");
  const all = [...marketingNav, ...companyNav, ...legalNav];

  it("lists the six primary pages in order", () => {
    expect(marketingNav.map((n) => n.label)).toEqual([
      "Platform",
      "Features",
      "Solutions",
      "Security",
      "Developers",
      "Pricing",
    ]);
  });

  it("never links to a page that does not exist (no dead links)", () => {
    for (const item of all) {
      expect(item.planned, item.label).toBeFalsy();
      expect(item.href, item.label).toMatch(/^\/[a-z-]+$/);
      expect(existsSync(join(marketingDir, item.href.slice(1), "page.tsx")), item.href).toBe(true);
    }
  });

  it("has unique destinations", () => {
    const hrefs = all.map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps the homepage section ids defined for in-page links", () => {
    expect(Object.values(HOME_SECTION_IDS)).toContain("platform");
    expect(Object.values(HOME_SECTION_IDS)).toContain("developers");
  });
});
