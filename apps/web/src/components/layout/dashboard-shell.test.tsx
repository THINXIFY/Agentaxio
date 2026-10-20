import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu, NotificationsMenu } from "@/components/layout/dashboard-menus";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { appNav, primaryNav } from "@/config/navigation";
import { axe } from "@/test/axe";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const setThemeSpy = vi.hoisted(() => vi.fn());
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: setThemeSpy }) }));

const KNOWN_ROUTES = new Set([...appNav.map((n) => n.href), "/", "/#developers"]);

beforeEach(() => {
  setThemeSpy.mockClear();
  pathname = "/dashboard";
});

describe("DashboardSidebar", () => {
  it("shows exactly six primary navigation items, in plain language", () => {
    render(<DashboardSidebar />);
    const nav = screen.getByRole("navigation", { name: "Dashboard" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Overview", "My Agents", "Permissions", "Approvals", "Activity", "Integrations"]);
  });

  it("puts Settings, Team and Billing in a secondary section at the bottom", () => {
    render(<DashboardSidebar />);
    const nav = screen.getByRole("navigation", { name: "Dashboard" });
    for (const name of ["Settings", "Team & Organization", "Billing"])
      expect(within(nav).queryByRole("link", { name })).toBeNull();
    const workspace = screen.getByRole("navigation", { name: "Workspace" });
    expect(
      within(workspace)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Settings", "Team & Organization", "Billing"]);
    // the secondary section comes after the primary menu in the DOM
    expect(nav.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("marks only the current page with aria-current", () => {
    pathname = "/dashboard/audit";
    render(<DashboardSidebar />);
    const current = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Activity");
  });

  it("keeps My Agents highlighted for an agent’s details and for agent identities", () => {
    for (const path of ["/dashboard/agents/mock_agt_lead_intake", "/dashboard/identities"]) {
      pathname = path;
      const { unmount } = render(<DashboardSidebar />);
      expect(screen.getByRole("link", { name: "My Agents" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
      unmount();
    }
  });

  it("highlights Integrations as a primary item and Billing in the secondary section", () => {
    pathname = "/dashboard/integrations";
    const a = render(<DashboardSidebar />);
    expect(screen.getByRole("link", { name: "Integrations" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    a.unmount();
    pathname = "/dashboard/billing";
    render(<DashboardSidebar />);
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Integrations" })).not.toHaveAttribute("aria-current");
  });

  it("only links to implemented routes", () => {
    render(<DashboardSidebar />);
    for (const link of screen.getAllByRole("link"))
      expect(KNOWN_ROUTES.has(link.getAttribute("href")!)).toBe(true);
  });

  it("has no axe violations", async () => {
    const { container } = render(<DashboardSidebar />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("DashboardShell", () => {
  it("provides landmarks, a skip target and the demo notice", () => {
    render(
      <DashboardShell>
        <h1>Page</h1>
      </DashboardShell>,
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("note")).toHaveTextContent(/Frontend demo/);
    expect(screen.getByRole("navigation", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("exposes a mobile navigation drawer with the same menu, and closes it on navigation", async () => {
    const user = userEvent.setup();
    render(
      <DashboardShell>
        <h1>Page</h1>
      </DashboardShell>,
    );
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const dialog = await screen.findByRole("dialog", { name: "Navigation" });
    const nav = within(dialog).getByRole("navigation", { name: "Dashboard" });
    expect(within(nav).getAllByRole("link")).toHaveLength(primaryNav.length);
    expect(within(dialog).getByRole("link", { name: "Integrations" })).toBeInTheDocument();
    const secondary = within(dialog).getByRole("navigation", { name: "Workspace" });
    expect(within(secondary).getAllByRole("link")).toHaveLength(3);
    await user.click(within(dialog).getByRole("link", { name: "Activity" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the theme switcher available", () => {
    render(
      <DashboardShell>
        <h1>Page</h1>
      </DashboardShell>,
    );
    expect(screen.getByRole("group", { name: "Colour theme" })).toBeInTheDocument();
  });
});

describe("top bar menus (keyboard accessible)", () => {
  it("account menu opens from the keyboard, links to real routes, and disables Sign out honestly", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: "Account menu for Demo Admin" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    const links = within(menu)
      .getAllByRole("menuitem")
      .filter((i) => i.tagName === "A");
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(KNOWN_ROUTES.has(l.getAttribute("href")!)).toBe(true);
    const signOut = within(menu).getByRole("menuitem", { name: /Sign out/ });
    expect(signOut).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByText("no sessions in demo")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus(); // focus returns to the trigger
  });

  it("account menu carries the Light / Dark / System choice for screens where the top-bar switcher is hidden", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole("button", { name: "Account menu for Demo Admin" }));
    const menu = await screen.findByRole("menu");
    const dark = within(menu).getByRole("menuitemradio", { name: "Dark" });
    expect(dark).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemradio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await user.click(within(menu).getByRole("menuitemradio", { name: "System" }));
    expect(setThemeSpy).toHaveBeenCalledWith("system");
  });

  it("notifications are labelled as sample data, use plain wording and link to real pages", async () => {
    const user = userEvent.setup();
    render(<NotificationsMenu />);
    await user.click(screen.getByRole("button", { name: /Notifications, \d+ sample items/ }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Sample data")).toBeInTheDocument();
    const links = within(panel).getAllByRole("link");
    expect(links.length).toBeGreaterThan(1);
    for (const l of links) expect(KNOWN_ROUTES.has(l.getAttribute("href")!)).toBe(true);
    expect(within(panel).getAllByText(/needs approval/).length).toBeGreaterThan(0);
    expect(panel.textContent).not.toMatch(/Authorization|crm\.lead\.create/);
  });
});
