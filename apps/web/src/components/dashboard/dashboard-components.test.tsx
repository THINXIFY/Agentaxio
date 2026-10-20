import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { ActivityHistory } from "@/components/dashboard/activity-history";
import { ActivityItem } from "@/components/dashboard/activity-item";
import { AgentIdentityCard } from "@/components/dashboard/agent-identity-card";
import { AgentList } from "@/components/dashboard/agent-list";
import { ApprovalCard, PendingItem } from "@/components/dashboard/approval-card";
import { ApprovalsView } from "@/components/dashboard/approvals-view";
import { HelpTip } from "@/components/dashboard/help-tip";
import {
  FeaturedIntegration,
  integrationGroups,
  PlannedIntegrations,
} from "@/components/dashboard/integration-status";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PermissionSummary } from "@/components/dashboard/permission-summary";
import { PlainAgentStatusBadge, PlainStatusBadge } from "@/components/dashboard/plain-status";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ACTION_REQUEST_STATUSES } from "@/lib/contracts";
import {
  approvalCenterRequests,
  listDashboardAgents,
  listDashboardRequests,
  pendingApprovals,
} from "@/mocks/dashboard";
import { axe } from "@/test/axe";

function wrap(ui: React.ReactNode) {
  return (
    <TooltipProvider>
      <ToastProvider>{ui}</ToastProvider>
    </TooltipProvider>
  );
}

const agents = listDashboardAgents();
const requests = listDashboardRequests();
const byStatus = (s: (typeof ACTION_REQUEST_STATUSES)[number]) =>
  requests.find((r) => r.status === s)!;

describe("MetricCard", () => {
  it("is one link named by its title, with a number and a plain sentence", () => {
    render(
      <MetricCard
        title="Pending Approvals"
        value={3}
        helper="requests need a decision"
        href="/dashboard/approvals"
        linkLabel="review pending approvals"
        tone="attention"
      />,
    );
    const link = screen.getByRole("link", { name: "Pending Approvals: review pending approvals" });
    expect(link).toHaveAttribute("href", "/dashboard/approvals");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("requests need a decision")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("PlainStatusBadge", () => {
  it("speaks plainly, and every status has text (colour is never the only signal)", () => {
    for (const status of ACTION_REQUEST_STATUSES) {
      const { container, unmount } = render(<PlainStatusBadge status={status} />);
      expect(container.textContent!.trim().length).toBeGreaterThan(0);
      unmount();
    }
    render(<PlainStatusBadge status="pending_approval" />);
    expect(screen.getByText("Needs approval")).toBeInTheDocument();
  });

  it("shows an approved request as not run yet, and only a succeeded one as completed", () => {
    const { unmount } = render(<PlainStatusBadge status="approved" />);
    expect(screen.getByText(/Approved · not run yet/)).toBeInTheDocument();
    unmount();
    render(<PlainStatusBadge status="succeeded" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("labels agents Active or Suspended", () => {
    const { unmount } = render(<PlainAgentStatusBadge status="active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    unmount();
    render(<PlainAgentStatusBadge status="suspended" />);
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });
});

describe("AgentList", () => {
  it("shows name, purpose, status and a distinct View details link for each agent", () => {
    render(<AgentList agents={agents.slice(0, 3)} />);
    for (const a of agents.slice(0, 3)) {
      expect(screen.getByRole("heading", { name: a.name })).toBeInTheDocument();
      expect(screen.getByText(a.description)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: `View details for ${a.name}` })).toHaveAttribute(
        "href",
        `/dashboard/agents/${a.id}`,
      );
    }
    expect(screen.getAllByText(/^(Active|Suspended)$/)).toHaveLength(3);
  });

  it("has no axe violations", async () => {
    const { container } = render(<AgentList agents={agents} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ActivityItem", () => {
  it("describes the request in plain words instead of technical keys", () => {
    const req = byStatus("pending_approval");
    const { container } = render(
      <ul>
        <ActivityItem request={req} />
      </ul>,
    );
    expect(container.textContent).toContain(req.agentName);
    expect(container.textContent).toContain(`Wants to add a lead to the CRM`);
    expect(container.textContent).toContain(req.parameters.full_name);
    expect(container.textContent).not.toContain("crm.lead.create");
    expect(screen.getByText("Needs approval")).toBeInTheDocument();
  });

  it("keeps authorization, approval and execution as separate precise steps inside Details", async () => {
    const user = userEvent.setup();
    const req = byStatus("approved");
    render(
      <ul>
        <ActivityItem request={req} details />
      </ul>,
    );
    await user.click(screen.getByText("Details"));
    const steps = screen.getByRole("list", { name: "Request lifecycle" });
    expect(within(steps).getByText("Authorization allowed")).toBeInTheDocument();
    expect(within(steps).getByText("Approval granted")).toBeInTheDocument();
    expect(within(steps).getByText("Execution pending")).toBeInTheDocument();
    expect(within(steps).queryByText(/Execution completed/)).toBeNull();
    expect(screen.getByText("crm.lead.create")).toBeInTheDocument(); // technical key lives in Details
  });
});

describe("Approvals", () => {
  it("ApprovalCard explains what the agent wants and why, with Approve/Reject unavailable", async () => {
    const user = userEvent.setup();
    const req = byStatus("pending_approval");
    render(wrap(<ApprovalCard request={req} />));
    expect(screen.getByText(/Wants to add a lead to the CRM/)).toBeInTheDocument();
    expect(screen.getAllByText(req.decisionReason).length).toBeGreaterThan(0);
    for (const name of ["Approve", "Reject"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn).toHaveAttribute("aria-disabled", "true");
      await user.click(btn); // does nothing, throws nothing
    }
    expect(screen.getAllByText(/Demo only · not connected to a backend/).length).toBeGreaterThan(0);
  });

  it("PendingItem (Overview) has no Approve or Reject, only a way to go and review", () => {
    const req = byStatus("pending_approval");
    render(
      <ul>
        <PendingItem request={req} />
      </ul>,
    );
    expect(screen.queryByRole("button", { name: /Approve|Reject/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: `Review request from ${req.agentName}` }),
    ).toHaveAttribute("href", "/dashboard/approvals");
  });

  it("ApprovalsView separates what is waiting from what is already reviewed", () => {
    render(wrap(<ApprovalsView requests={approvalCenterRequests()} />));
    const waiting = pendingApprovals().length;
    expect(
      screen.getByRole("heading", { name: `Waiting for review (${waiting})` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Already reviewed" })).toBeInTheDocument();
    for (const btn of screen.getAllByRole("button", { name: /^(Approve|Reject)$/ }))
      expect(btn).toHaveAttribute("aria-disabled", "true");
  });

  it("shows an empty state when nothing is waiting", () => {
    render(wrap(<ApprovalsView requests={[]} />));
    expect(screen.getByText("Nothing is waiting for you")).toBeInTheDocument();
  });
});

describe("PermissionSummary", () => {
  it("lists rules in plain words, blocked first, and says unmatched actions are blocked", () => {
    const agent = agents.find((a) => a.permissions.length > 1)!;
    const { container } = render(<PermissionSummary permissions={agent.permissions} />);
    const labels = [...container.querySelectorAll("li > span:first-child")].map((n) =>
      n.textContent?.trim(),
    );
    expect(labels[0]).toBe("Blocked");
    expect(container.textContent).toContain("Anything not covered by a rule is blocked.");
    expect(container.textContent).not.toMatch(/\bDeny\b|require_approval/);
  });
});

describe("HelpTip", () => {
  it("opens an explanation from the keyboard and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<HelpTip term="Approval">A person says yes first.</HelpTip>);
    const trigger = screen.getByRole("button", { name: "What is “Approval”?" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("A person says yes first.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("A person says yes first.")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe("ActivityHistory", () => {
  it("starts with everything, newest first, six to a page", () => {
    render(wrap(<ActivityHistory requests={requests} />));
    const list = screen.getByRole("list", { name: "Activity history (sample data)" });
    expect(list.children).toHaveLength(Math.min(6, requests.length));
    expect(screen.getByRole("tab", { name: `All (${requests.length})` })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("filters to blocked requests only", async () => {
    const user = userEvent.setup();
    render(wrap(<ActivityHistory requests={requests} />));
    const blocked = requests.filter((r) => r.status === "denied");
    await user.click(screen.getByRole("tab", { name: `Blocked (${blocked.length})` }));
    const list = screen.getByRole("list", { name: "Activity history (sample data)" });
    expect(list.children).toHaveLength(blocked.length);
    expect(within(list).getAllByText("Blocked").length).toBeGreaterThanOrEqual(blocked.length);
  });

  it("moves to the next page of activity", async () => {
    const user = userEvent.setup();
    render(wrap(<ActivityHistory requests={requests} />));
    await user.click(screen.getByRole("button", { name: /next/i }));
    const list = screen.getByRole("list", { name: "Activity history (sample data)" });
    expect(list.children).toHaveLength(Math.min(6, requests.length - 6));
  });

  it("shows a friendly empty state", async () => {
    const user = userEvent.setup();
    render(wrap(<ActivityHistory requests={requests.filter((r) => r.status !== "denied")} />));
    await user.click(screen.getByRole("tab", { name: "Blocked (0)" }));
    expect(screen.getByText("Nothing to show here")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show everything" }));
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
  });

  it("has no axe violations", async () => {
    const { container } = render(wrap(<ActivityHistory requests={requests} />));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AgentIdentityCard", () => {
  it("shows only a credential preview and copies it with honest feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const agent = agents[0]!;
    render(wrap(<AgentIdentityCard agent={agent} />));
    expect(screen.getByText(agent.credentialPrefix)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: `Copy access key preview for ${agent.name}` }),
    );
    expect(writeText).toHaveBeenCalledWith(agent.credentialPrefix);
    expect(await screen.findByText(/never kept in the browser/)).toBeInTheDocument();
  });
});

describe("Integration cards", () => {
  const { featured, others } = integrationGroups();

  it("features n8n as planned and not connected, with no Connect button", () => {
    const { container } = render(<FeaturedIntegration integration={featured} />);
    expect(screen.getByRole("heading", { name: "n8n" })).toBeInTheDocument();
    expect(screen.getByText("Planned · first integration")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/connected to n8n/i);
  });

  it("shows every other integration as Planned and Not connected", () => {
    render(<PlannedIntegrations integrations={others} />);
    expect(screen.getAllByText("Planned")).toHaveLength(others.length);
    expect(screen.getAllByText("Not connected")).toHaveLength(others.length);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
