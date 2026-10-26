import { render, screen, within } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { DemoAgentDetail } from "@/app/dashboard/_demo/agent-detail";
import { DemoAgentsPage as AgentsPage } from "@/app/dashboard/_demo/agents";
import { DemoApprovalsPage as ApprovalsPage } from "@/app/dashboard/_demo/approvals";
import { DemoActivityPage as ActivityPage } from "@/app/dashboard/_demo/activity";
import BillingPage from "@/app/dashboard/billing/page";
import { DemoIdentitiesPage as IdentitiesPage } from "@/app/dashboard/_demo/identities";
import IntegrationsPage from "@/app/dashboard/integrations/page";
import { DemoOverviewPage as OverviewPage } from "@/app/dashboard/_demo/overview";
import { DemoPermissionsPage as PermissionsPage } from "@/app/dashboard/_demo/permissions";
import SettingsPage from "@/app/dashboard/settings/page";
import { DemoTeamPage as TeamPage } from "@/app/dashboard/_demo/team";
import DashboardTemplate from "@/app/dashboard/template";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { appNav } from "@/config/navigation";
import { listDashboardAgents } from "@/mocks/dashboard";
import { axe } from "@/test/axe";

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: () => {} }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const AGENT_IDS = listDashboardAgents().map((a) => a.id);
const KNOWN_ROUTES = new Set([
  ...appNav.map((n) => n.href),
  "/dashboard/identities",
  ...AGENT_IDS.map((id) => `/dashboard/agents/${id}`),
  "/",
  "/#developers",
]);

async function agentDetail(id: string) {
  return DemoAgentDetail({ id });
}

const PAGES: ReadonlyArray<
  [string, () => Promise<React.ReactElement> | React.ReactElement, string]
> = [
  ["Overview", () => <OverviewPage />, "Overview"],
  ["My Agents", () => <AgentsPage />, "My Agents"],
  ["Agent details", () => agentDetail(AGENT_IDS[0]!), listDashboardAgents()[0]!.name],
  ["Agent Identities", () => <IdentitiesPage />, "Agent Identities"],
  ["Permissions", () => <PermissionsPage />, "Permissions"],
  ["Approvals", () => <ApprovalsPage />, "Approvals"],
  ["Activity", () => <ActivityPage />, "Activity"],
  ["Integrations", () => <IntegrationsPage />, "Integrations"],
  ["Team & Organization", () => <TeamPage />, "Team & Organization"],
  ["Settings", () => <SettingsPage />, "Settings"],
  ["Billing", () => <BillingPage />, "Billing"],
];

async function renderPage(make: () => Promise<React.ReactElement> | React.ReactElement) {
  const element = await make();
  return render(
    <TooltipProvider>
      <ToastProvider>{element}</ToastProvider>
    </TooltipProvider>,
  );
}

describe.each(PAGES)("dashboard page: %s", (_name, make, title) => {
  it("has exactly one h1 with the page title", async () => {
    await renderPage(make);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(title);
  });

  it("links only to implemented routes", async () => {
    const { container } = await renderPage(make);
    for (const a of container.querySelectorAll("a[href]")) {
      expect(KNOWN_ROUTES.has(a.getAttribute("href")!), a.getAttribute("href")!).toBe(true);
    }
  });

  it("never offers a working Approve or Reject control", async () => {
    await renderPage(make);
    for (const btn of screen.queryAllByRole("button", { name: /^(Approve|Reject)$/ })) {
      expect(btn).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("has no axe violations", async () => {
    const { container } = await renderPage(make);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Overview", () => {
  it("is built from simple parts: three summary cards, one small chart, My Agents, Pending Approvals, Recent Activity", async () => {
    await renderPage(() => <OverviewPage />);
    for (const title of ["Connected Agents", "Pending Approvals", "Blocked Actions"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${title}:`) })).toBeInTheDocument();
    }
    for (const name of ["Recent requests", "My Agents", "Pending Approvals", "Recent Activity"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    // Everything else that used to crowd the page is gone.
    for (const gone of ["Agent distribution", "Integration status", "Approval center"]) {
      expect(screen.queryByRole("region", { name: gone })).toBeNull();
    }
    expect(
      document.querySelectorAll("svg[role='img'], [role='img'][aria-label*='chart']"),
    ).toHaveLength(0);
  });

  it("gives each agent a View details link and shows pending requests without Approve/Reject buttons", async () => {
    await renderPage(() => <OverviewPage />);
    const agents = screen.getByRole("region", { name: "My Agents" });
    expect(
      within(agents).getAllByRole("link", { name: /^View details for / }).length,
    ).toBeGreaterThan(0);
    const pending = screen.getByRole("region", { name: "Pending Approvals" });
    expect(within(pending).queryByRole("button", { name: /Approve|Reject/ })).toBeNull();
    expect(within(pending).getAllByText(/Wants to add a lead to the CRM/).length).toBeGreaterThan(
      0,
    );
  });

  it("uses everyday words rather than security jargon", async () => {
    const { container } = await renderPage(() => <OverviewPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(
      /Authorization|Policy Evaluation|Audit Trail|Agent Registry|crm\.lead\.create/,
    );
    expect(text).toMatch(/Needs approval|Blocked|Completed/);
  });

  it("labels everything as sample data and never claims live status", async () => {
    const { container } = await renderPage(() => <OverviewPage />);
    expect(screen.getAllByText(/Mock data/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sample data as of 20 Oct 2026/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/real-time|monitoring in real time|99.d+%|uptime/i);
  });
});

describe("My Agents and agent details", () => {
  it("lists every agent with a way into its details", async () => {
    await renderPage(() => <AgentsPage />);
    for (const a of listDashboardAgents())
      expect(screen.getByRole("link", { name: `View details for ${a.name}` })).toBeInTheDocument();
  });

  it("has no filter boxes or tables to wade through", async () => {
    await renderPage(() => <AgentsPage />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("agent details show the agent’s purpose, access key preview, permissions and activity", async () => {
    await renderPage(() => agentDetail("mock_agt_lead_intake"));
    expect(screen.getByRole("link", { name: "Back to My Agents" })).toHaveAttribute(
      "href",
      "/dashboard/agents",
    );
    for (const name of ["About this agent", "What it can do", "Recent activity"])
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    expect(screen.getByText(/agx_dev_/)).toBeInTheDocument();
    expect(screen.getByText("Anything not covered by a rule is blocked.")).toBeInTheDocument();
  });

  it("every sample agent has a details page, and unknown agents are a 404", async () => {
    for (const id of AGENT_IDS) expect(DemoAgentDetail({ id })).toBeTruthy();
    await expect(agentDetail("not-an-agent")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("Permissions", () => {
  it("explains the three answers and is honest that editing is not built", async () => {
    const { container } = await renderPage(() => <PermissionsPage />);
    const answers = screen.getByRole("region", { name: /three answers/ });
    for (const word of ["Allowed", "Needs approval", "Blocked"])
      expect(within(answers).getByText(word)).toBeInTheDocument();
    expect(screen.getByText("Not built yet")).toBeInTheDocument();
    expect(container.textContent).toMatch(/nothing here is enforced/);
    expect(screen.queryAllByRole("button", { name: /save|add|edit|publish|create/i })).toHaveLength(
      0,
    );
  });
});

describe("Activity", () => {
  it("says only “Completed” means the action ran", async () => {
    await renderPage(() => <ActivityPage />);
    expect(
      screen.getByText(/“Completed” is the only status that means the action actually ran/),
    ).toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("offers the theme choice and read-only workspace details", async () => {
    await renderPage(() => <SettingsPage />);
    expect(screen.getByRole("group", { name: "Colour theme" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Workspace" })).toHaveTextContent("Sample data");
  });
});

describe("Integrations", () => {
  it("features n8n with a clear status, and never shows a fake connection or a Connect button", async () => {
    const { container } = await renderPage(() => <IntegrationsPage />);
    const n8n = screen.getByRole("article", { name: "n8n" });
    expect(n8n).toHaveTextContent("Planned · first integration");
    expect(n8n).toHaveTextContent("Not connected");
    expect(n8n).toHaveTextContent("Not available yet");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: /connect/i })).toBeNull();
    expect(container.textContent).not.toMatch(/connected to n8n|Connected/);
  });

  it("explains how it will work in three plain steps", async () => {
    await renderPage(() => <IntegrationsPage />);
    const region = screen.getByRole("region", { name: "How it will work" });
    expect(region.querySelector("ol")!.children).toHaveLength(3);
    expect(screen.getByText("AgentAxio checks your rules")).toBeInTheDocument();
  });

  it("shows the TypeScript SDK and future integrations as Planned and not connected", async () => {
    await renderPage(() => <IntegrationsPage />);
    const more = screen.getByRole("region", { name: "More integrations" });
    for (const name of ["TypeScript SDK", "Additional integrations"]) {
      const card = within(more).getByRole("article", { name });
      expect(card).toHaveTextContent("Planned");
      expect(card).toHaveTextContent("Not connected");
    }
  });

  it("keeps the bypass caveat visible", async () => {
    await renderPage(() => <IntegrationsPage />);
    expect(screen.getByText(/can bypass it/)).toBeInTheDocument();
  });
});

describe("placeholders are honest", () => {
  it.each([
    ["Team & Organization", () => <TeamPage />],
    ["Billing", () => <BillingPage />],
  ] as const)("%s says it is not built and offers no controls", async (_name, make) => {
    await renderPage(make);
    expect(screen.getByText("Not built yet")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Back to Overview" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("Billing does not invent plans or prices", async () => {
    const { container } = await renderPage(() => <BillingPage />);
    expect(container.textContent).not.toMatch(/[$€£]\s?\d/);
    expect(container.textContent).toMatch(/Pricing has not been decided/);
  });
});

describe("route template", () => {
  it("re-mounts content inside the page-enter wrapper", () => {
    const { container } = render(
      <DashboardTemplate>
        <p>content</p>
      </DashboardTemplate>,
    );
    expect(container.firstElementChild).toHaveClass("page-enter");
  });
});
