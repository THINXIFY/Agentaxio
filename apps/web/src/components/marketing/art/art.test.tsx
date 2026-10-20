import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ArchitectureDiagram,
  BOUNDARIES,
  CredentialCustody,
  EnforcementPoints,
} from "@/components/marketing/art/architecture";
import { CodeBlock } from "@/components/marketing/art/code-block";
import { ContractSequence } from "@/components/marketing/art/contract-sequence";
import { FeatureShowcase } from "@/components/marketing/art/feature-showcase";
import { LifecycleLedger } from "@/components/marketing/art/lifecycle-ledger";
import { RequestFlow } from "@/components/marketing/art/request-flow";
import { axe } from "@/test/axe";

describe("RequestFlow", () => {
  it("shows five stations and three requests, as a table with proper headers", () => {
    render(<RequestFlow />);
    const table = screen.getByRole("table", { name: /Three sample requests/ });
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    for (const station of [
      "AI agent",
      "AgentAxio authorization",
      "Human approval",
      "Trusted executor",
      "Destination API",
    ])
      expect(
        heads.some((h) => h?.includes(station)),
        station,
      ).toBe(true);
    expect(within(table).getAllByRole("rowheader")).toHaveLength(3);
  });

  it("keeps requested, authorized, approved and executed as separate facts", () => {
    render(<RequestFlow />);
    const table = screen.getByRole("table", { name: /Three sample requests/ });
    const rows = within(table).getAllByRole("row").slice(1);
    // 1: allowed by a rule, no approval needed, executed
    expect(rows[0]).toHaveTextContent("Allowed by a rule");
    expect(rows[0]).toHaveTextContent("Not needed");
    expect(rows[0]).toHaveTextContent("Executed");
    // 2: approved by a person, but NOT executed: approval is never shown as proof of execution
    expect(rows[1]).toHaveTextContent("Approved by a reviewer");
    expect(rows[1]).toHaveTextContent("Approved, not run yet");
    expect(rows[1]).not.toHaveTextContent(/Executed|created/);
    // 3: blocked by a rule, nothing runs
    expect(rows[2]).toHaveTextContent("Blocked by a rule");
    expect(rows[2]).toHaveTextContent("Did not run");
    expect(rows[2]).not.toHaveTextContent(/Executed|created/);
  });

  it("says it is conceptual, and offers the same facts as a list for small screens", () => {
    const { container } = render(<RequestFlow />);
    expect(container.textContent).toMatch(
      /Conceptual: the enforcement backend is designed, not built/,
    );
    expect(screen.getByRole("list", { name: /Three sample requests/ })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<RequestFlow />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Architecture", () => {
  it("defines the six trust boundaries from the security baseline, in order", () => {
    expect(BOUNDARIES.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6]);
    render(<EnforcementPoints />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getAllByText("Designed")).toHaveLength(6);
  });

  it("marks every enforcement point on the schematic and says it is not built", () => {
    const { container } = render(<ArchitectureDiagram />);
    for (let n = 1; n <= 6; n += 1)
      expect(
        screen.getAllByLabelText(`Enforcement point ${n}`).length,
        `point ${n}`,
      ).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/None of it is built or running/);
    expect(container.textContent).toMatch(/The only place the tool’s credentials live/);
  });

  it("says where each secret lives, and that the workflow never sees a grant", () => {
    const { container } = render(<CredentialCustody />);
    expect(container.textContent).toMatch(/Inside AgentAxio only/);
    expect(container.textContent).toMatch(/Never sent to the workflow/);
    expect(container.textContent).toMatch(/Not built yet/);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <>
        <ArchitectureDiagram />
        <EnforcementPoints />
        <CredentialCustody />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FeatureShowcase", () => {
  it("offers the six controls as tabs and starts on Agent management", () => {
    render(<FeatureShowcase />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.replace(/^\d+/, "").split(/(?=[A-Z])/)[0])).toHaveLength(
      6,
    );
    expect(screen.getByRole("tab", { name: /Agent management/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "My Agents" })).toBeInTheDocument();
  });

  it("labels the demonstration as conceptual and not connected", () => {
    render(<FeatureShowcase />);
    expect(screen.getByText(/Conceptual demo · invented data · not connected/)).toBeInTheDocument();
  });

  it("switches the demonstration when a control is chosen, using the real dashboard components", async () => {
    const user = userEvent.setup();
    render(<FeatureShowcase />);
    await user.click(screen.getByRole("tab", { name: /Human approvals/ }));
    expect(screen.getByRole("tab", { name: /Human approvals/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The dashboard's own approval card, with the same disabled controls.
    for (const name of ["Approve", "Reject"])
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText(/Demo only · not connected to a backend/).length).toBeGreaterThan(0);
  });

  it("works from the keyboard", async () => {
    const user = userEvent.setup();
    render(<FeatureShowcase />);
    screen.getByRole("tab", { name: /Agent management/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: /Identity and access/ })).toHaveFocus();
  });

  it("shows the n8n integration as planned and not connected, with no Connect button", async () => {
    const user = userEvent.setup();
    const { container } = render(<FeatureShowcase />);
    await user.click(screen.getByRole("tab", { name: /n8n integration/ }));
    expect(screen.getByText("Planned · first integration")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect/i })).toBeNull();
    expect(container.textContent).not.toMatch(/\bconnected to n8n\b/i);
  });

  it("has no axe violations in any state", async () => {
    const user = userEvent.setup();
    const { container } = render(<FeatureShowcase />);
    for (const tab of screen.getAllByRole("tab")) {
      await user.click(tab);
      expect(await axe(container)).toHaveNoViolations();
    }
  });
});

describe("Developer contract", () => {
  it("walks one request from proposal to outcome, in five steps", () => {
    const { container } = render(<ContractSequence />);
    const steps = screen.getByRole("list", { name: /One request, from proposal to outcome/ });
    expect(steps.children).toHaveLength(5);
    expect(container.textContent).toContain("POST /v1/action-requests");
    expect(container.textContent).toMatch(/Idempotency-Key/);
    expect(container.textContent).toMatch(
      /No grant or execution token is returned to the workflow/,
    );
    // The key placeholder is a placeholder, never something that looks like a real secret.
    expect(container.textContent).toMatch(/Bearer <scoped-agent-key>/);
    expect(container.textContent).not.toMatch(/agx_[a-z]+_[A-Za-z0-9]{6,}/);
  });

  it("lists the nine contract statuses and marks which are final", () => {
    const { container } = render(<LifecycleLedger />);
    const defs = [...container.querySelectorAll("dt")].map((d) => d.textContent);
    expect(defs).toEqual([
      "pending_approval",
      "approved",
      "queued_execution",
      "running",
      "succeeded",
      "failed",
      "denied",
      "expired",
      "unknown",
    ]);
    expect(container.textContent).toMatch(/Approval is permission, not proof/);
    expect(container.textContent!.match(/final/g)!.length).toBeGreaterThanOrEqual(5);
  });

  it("code blocks are keyboard-reachable scrollable regions", () => {
    render(<CodeBlock label="Request" json={"{}"} />);
    const region = screen.getByRole("region", { name: "Request (scrollable)" });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <>
        <ContractSequence />
        <LifecycleLedger />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
