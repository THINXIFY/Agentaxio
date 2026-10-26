import { render, screen, within } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { N8nCard, SetupSteps, TestGuide } from "@/components/live/n8n-integration";
import { describeConnection, WORKFLOW_FILE } from "@/lib/api/connection";
import type { ApiAgent } from "@/lib/api/types";
import { axe } from "@/test/axe";

const agent = (over: Partial<ApiAgent> = {}): ApiAgent => ({
  id: "a1",
  name: "Lead Intake Agent",
  description: null,
  status: "active",
  environment: "dev",
  environmentId: "e",
  ownerUserId: "u",
  createdAt: "2026-10-26T10:00:00Z",
  lastRequestAt: null,
  activeCredentials: 1,
  pendingApprovals: 0,
  ...over,
});

describe("n8n integration card", () => {
  it("says Not connected, in words, when there is no agent or key", async () => {
    const { container } = render(<N8nCard connection={describeConnection([])} />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText(/Add one under My Agents/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is ready but not 'connected' until a request has actually arrived", () => {
    render(<N8nCard connection={describeConnection([agent()])} />);
    expect(screen.getByText(/Ready · waiting for the first request/)).toBeInTheDocument();
    expect(screen.queryByText("Receiving requests")).toBeNull();
  });

  it("reports receiving requests with the time, and is honest about what that means", async () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    const { container } = render(
      <N8nCard connection={describeConnection([agent({ lastRequestAt: recent })])} />,
    );
    expect(screen.getByText("Receiving requests")).toBeInTheDocument();
    expect(screen.getAllByText(/last request/)).toHaveLength(2); // the card line and the agent row
    expect(container.textContent).toMatch(/can’t tell n8n from any other tool/);
    expect(container.textContent).toMatch(/mock/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists agents with whether they have a key and are switched on", () => {
    render(
      <N8nCard
        connection={describeConnection([
          agent({ id: "a1", name: "On" }),
          agent({ id: "a2", name: "Off", status: "suspended" }),
          agent({ id: "a3", name: "Keyless", activeCredentials: 0 }),
        ])}
      />,
    );
    const list = screen.getByRole("list");
    expect(within(list).getByText(/has an access key/)).toBeInTheDocument();
    expect(within(list).getByText(/switched off/)).toBeInTheDocument();
    expect(within(list).getByText(/no access key/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "On" })).toHaveAttribute(
      "href",
      "/dashboard/agents/a1",
    );
  });
});

describe("setup and test guidance", () => {
  it("offers the workflow download, the address to use, and never asks for a CRM credential", async () => {
    const { container } = render(<SetupSteps agentApiUrl="http://127.0.0.1:8787" urlIsDefault />);
    const link = screen.getByRole("link", { name: /Download the example workflow/ });
    expect(link).toHaveAttribute("href", WORKFLOW_FILE);
    expect(link).toHaveAttribute("download");
    expect(screen.getByText("http://127.0.0.1:8787")).toBeInTheDocument();
    expect(container.textContent).toMatch(/shown\s*once/);
    expect(container.textContent).toMatch(/Never put a CRM or other tool’s own credentials/);
    expect(container.textContent).not.toMatch(/axo_[0-9a-f]{24}/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("explains the expected path and the common errors, and says only Completed means it ran", async () => {
    const { container } = render(<TestGuide />);
    for (const code of ["401", "422", "429"])
      expect(screen.getByText(`${code}:`)).toBeInTheDocument();
    expect(container.textContent).toMatch(/fails closed/);
    expect(container.textContent).toMatch(/only “Completed” means it did/);
    expect(await axe(container)).toHaveNoViolations();
  });
});
