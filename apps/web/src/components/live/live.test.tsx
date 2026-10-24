import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingApprovalCard } from "@/components/live/approval-card";
import {
  AcceptInvitationForm,
  CredentialsPanel,
  CreatePolicyForm,
  InviteForm,
} from "@/components/live/forms";
import { LiveAgentList, LiveRequestItem } from "@/components/live/records";
import { SignedOutPanel } from "@/components/live/session-gate";
import { AccountMenu } from "@/components/layout/dashboard-menus";
import { ShellModeProvider } from "@/components/layout/shell-mode";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ApiApprovalReview, ApiApprovalSummary } from "@/lib/api/types";
import { axe } from "@/test/axe";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/dashboard/approvals",
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: () => {} }) }));

const DIGEST = "a".repeat(64);
const future = new Date(Date.now() + 10 * 60_000).toISOString();
const approval: ApiApprovalSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  requestId: "22222222-2222-4222-8222-222222222222",
  state: "pending",
  agentId: "33333333-3333-4333-8333-333333333333",
  agentName: "Lead Intake Agent",
  environment: "dev",
  action: "crm.lead.create",
  resource: "mockcrm/leads",
  requestStatus: "pending_approval",
  createdAt: new Date().toISOString(),
  expiresAt: future,
  decidedBy: null,
  decidedAt: null,
};
const review: ApiApprovalReview = {
  ...approval,
  digest: DIGEST,
  parameters: { full_name: "Grace Hopper", email: "grace@example.test", company: "Navy Test Co" },
  parametersErased: false,
  policyChangedSinceRequest: false,
  decisionComment: null,
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  document.cookie = "axo_csrf=csrf-token-value; path=/";
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "axo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

const wrap = (node: React.ReactElement) => (
  <TooltipProvider>
    <ToastProvider>{node}</ToastProvider>
  </TooltipProvider>
);

describe("PendingApprovalCard", () => {
  it("shows the exact submitted values and sends the reviewed fingerprint with the CSRF token", async () => {
    fetchMock.mockReturnValue(
      reply(200, { outcome: "approved", requestStatus: "queued_execution" }),
    );
    const user = userEvent.setup();
    render(
      wrap(
        <PendingApprovalCard orgBase="/v1/orgs/o1" approval={approval} review={review} canDecide />,
      ),
    );
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("grace@example.test")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Comment/), "Looks right");
    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/orgs/o1/approvals/${approval.id}/decision`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-token-value");
    expect(JSON.parse(init.body as string)).toEqual({
      decision: "approve",
      reviewedDigest: DIGEST,
      comment: "Looks right",
    });
    expect(await within(screen.getByRole("article")).findByRole("status")).toHaveTextContent(
      /has not run yet/,
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("says a rejection means the action will not happen", async () => {
    fetchMock.mockReturnValue(reply(200, { outcome: "rejected", requestStatus: "denied" }));
    const user = userEvent.setup();
    render(
      wrap(
        <PendingApprovalCard orgBase="/v1/orgs/o1" approval={approval} review={review} canDecide />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(await within(screen.getByRole("article")).findByRole("status")).toHaveTextContent(
      /will not happen/,
    );
  });

  it("reports the server's refusal of self-approval and does not pretend anything was recorded", async () => {
    fetchMock.mockReturnValue(
      reply(403, { error: { code: "FORBIDDEN", message: "x", reason: "SELF_APPROVAL" } }),
    );
    const user = userEvent.setup();
    render(
      wrap(
        <PendingApprovalCard orgBase="/v1/orgs/o1" approval={approval} review={review} canDecide />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/agent you own/);
    expect(within(screen.getByRole("article")).queryByRole("status")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers a way to confirm with multi-factor sign-in when the server asks for it", async () => {
    window.history.pushState({}, "", "/dashboard/approvals");
    fetchMock.mockReturnValue(reply(403, { error: { code: "STEP_UP_REQUIRED", message: "x" } }));
    const user = userEvent.setup();
    render(
      wrap(
        <PendingApprovalCard orgBase="/v1/orgs/o1" approval={approval} review={review} canDecide />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    const alert = await screen.findByRole("alert");
    const link = within(alert).getByRole("link", { name: "Confirm now" });
    expect(link.getAttribute("href")).toBe(
      "/api/auth/login?step_up=1&return_to=%2Fdashboard%2Fapprovals",
    );
  });

  it("explains a changed fingerprint and an expired approval", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(
      reply(409, { error: { code: "CONFLICT", message: "x", reason: "DIGEST_MISMATCH" } }),
    );
    const { unmount } = render(
      wrap(
        <PendingApprovalCard orgBase="/v1/orgs/o1" approval={approval} review={review} canDecide />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/details changed/);
    unmount();
    fetchMock.mockReturnValueOnce(reply(410, { error: { code: "EXPIRED", message: "x" } }));
    render(
      wrap(
        <PendingApprovalCard orgBase="/v1/orgs/o1" approval={approval} review={review} canDecide />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/);
  });

  it("never offers Approve or Reject to someone who may only look, nor when the details could not be loaded", () => {
    const { rerender } = render(
      wrap(
        <PendingApprovalCard
          orgBase="/v1/orgs/o1"
          approval={approval}
          review={null}
          canDecide={false}
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: /Approve|Reject/ })).toBeNull();
    expect(screen.getByText(/Only approvers can see the values/)).toBeInTheDocument();
    expect(screen.getByText(/only owners, admins and approvers can decide/)).toBeInTheDocument();
    rerender(
      wrap(
        <PendingApprovalCard orgBase="/v1/orgs/o1" approval={approval} review={null} canDecide />,
      ),
    );
    expect(screen.queryByRole("button", { name: /Approve|Reject/ })).toBeNull();
  });

  it("warns when the rules changed since the request was checked, and has no accessibility violations", async () => {
    const { container } = render(
      wrap(
        <PendingApprovalCard
          orgBase="/v1/orgs/o1"
          approval={approval}
          review={{ ...review, policyChangedSinceRequest: true }}
          canDecide
        />,
      ),
    );
    expect(screen.getByText(/rules changed after this request was checked/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("access keys", () => {
  const credential = {
    id: "c1",
    keyId: "axo_0123456789abcdef01234567",
    createdAt: new Date().toISOString(),
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
  };

  it("shows a new key once, in memory only, and never writes it to browser storage", async () => {
    const secret = "axo_0123456789abcdef01234567_SECRETSECRETSECRETSECRETSECRETSECRETSECRE";
    fetchMock.mockReturnValue(reply(201, { credentialId: "c2", keyId: "k", fullKey: secret }));
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(
      wrap(
        <CredentialsPanel
          orgBase="/v1/orgs/o1"
          agentId="a1"
          agentStatus="active"
          credentials={[credential]}
          canManage
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: /Create a new access key/ }));
    expect(await screen.findByText(secret)).toBeInTheDocument();
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("SECRET");
    setItem.mockRestore();
  });

  it("offers no key controls to people who cannot manage keys, and none for a revoked agent", () => {
    const { rerender } = render(
      wrap(
        <CredentialsPanel
          orgBase="/v1/orgs/o1"
          agentId="a1"
          agentStatus="active"
          credentials={[credential]}
          canManage={false}
        />,
      ),
    );
    expect(screen.queryByRole("button")).toBeNull();
    rerender(
      wrap(
        <CredentialsPanel
          orgBase="/v1/orgs/o1"
          agentId="a1"
          agentStatus="revoked"
          credentials={[]}
          canManage
        />,
      ),
    );
    expect(screen.queryByRole("button", { name: /Create a new access key/ })).toBeNull();
  });
});

describe("permissions form", () => {
  it("sends a fixed-grammar rule and refuses an invalid domain before anything is sent", async () => {
    fetchMock.mockReturnValue(reply(201, { policyId: "p", versionId: "v", version: 1 }));
    const user = userEvent.setup();
    render(
      wrap(
        <CreatePolicyForm
          orgBase="/v1/orgs/o1"
          agents={[{ id: "a1", name: "Agent One" }]}
          environments={[{ id: "e1", name: "dev" }]}
        />,
      ),
    );
    await user.selectOptions(screen.getByLabelText("Agent"), "a1");
    await user.type(screen.getByLabelText(/email is at these domains/), "not a domain!");
    expect(screen.getByRole("button", { name: "Add rule" })).toBeDisabled();
    await user.clear(screen.getByLabelText(/email is at these domains/));
    await user.type(screen.getByLabelText(/email is at these domains/), "acme.com, partner.org");
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as unknown;
    expect(body).toEqual({
      actionKey: "crm.lead.create",
      effect: "require_approval",
      conditions: {
        all: [{ field: "email", op: "email_domain_in", value: ["acme.com", "partner.org"] }],
      },
      agentId: "a1",
    });
  });
});

describe("records and shell in live mode", () => {
  it("lists real agents with honest wording for a revoked one", async () => {
    const { container } = render(
      <LiveAgentList
        agents={[
          {
            id: "a1",
            name: "Active One",
            description: null,
            status: "active",
            environment: "dev",
            environmentId: "e",
            ownerUserId: "u",
            createdAt: "2026-10-24T10:00:00Z",
            lastRequestAt: null,
            activeCredentials: 1,
            pendingApprovals: 2,
          },
          {
            id: "a2",
            name: "Gone Two",
            description: "Old",
            status: "revoked",
            environment: "prod",
            environmentId: "e",
            ownerUserId: "u",
            createdAt: "2026-10-24T10:00:00Z",
            lastRequestAt: null,
            activeCredentials: 0,
            pendingApprovals: 0,
          },
        ]}
      />,
    );
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByText(/2 waiting for approval/)).toBeInTheDocument();
    expect(screen.getByText("No description yet.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("never shows submitted values in the request history, and keeps authorized separate from executed", async () => {
    const request = {
      id: "r1",
      agentId: "a",
      agentName: "Lead Intake Agent",
      environment: "dev",
      action: "crm.lead.create",
      resource: "mockcrm/leads",
      status: "queued_execution",
      reasonCode: null,
      digest: "b".repeat(64),
      createdAt: "2026-10-24T10:00:00Z",
      updatedAt: "2026-10-24T10:01:00Z",
    };
    const { container } = render(
      <ul>
        <LiveRequestItem request={request} approval="approved" />
      </ul>,
    );
    expect(screen.getAllByText("Waiting to run").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/Execution completed/);
    expect(container.textContent).toMatch(/Approval granted/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows who is signed in and signs out through the API", async () => {
    fetchMock.mockReturnValue(reply(204, {}));
    const user = userEvent.setup();
    render(
      wrap(
        <ShellModeProvider
          value={{
            mode: "live",
            state: "ready",
            email: "ada@example.test",
            organization: "Acme",
            role: "approver",
            pendingApprovals: 2,
          }}
        >
          <AccountMenu />
        </ShellModeProvider>,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Account menu for ada@example.test" }));
    expect(screen.getByText("Acme · approver")).toBeInTheDocument();
    expect(screen.queryByText(/no sessions in demo/)).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Sign out/ })).toBeEnabled();
  });

  it("offers sign-in when signed out", () => {
    const { container } = render(<SignedOutPanel />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/api/auth/login?return_to=/dashboard",
    );
    expect(container.textContent).toMatch(/never sees your password/);
  });
});

describe("people", () => {
  it("shows an invitation code once and sends the invite with the chosen role", async () => {
    const code = "A".repeat(43);
    fetchMock.mockReturnValue(
      reply(200, { invitationId: "i", token: code, expiresInSeconds: 604800 }),
    );
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(wrap(<InviteForm orgBase="/v1/orgs/o1" />));
    await user.type(screen.getByLabelText(/Their email address/), "grace@example.test");
    await user.selectOptions(screen.getByLabelText(/^Role/), "viewer");
    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(await screen.findByText(code)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/orgs/o1/invitations");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "grace@example.test",
      role: "viewer",
    });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("joins with a code and reports the server's refusal plainly", async () => {
    fetchMock.mockReturnValue(reply(404, { error: { code: "NOT_FOUND", message: "x" } }));
    const user = userEvent.setup();
    render(wrap(<AcceptInvitationForm />));
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
    await user.type(screen.getByLabelText(/Invitation code/), "B".repeat(43));
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no longer exists, or you can’t see it/,
    );
  });
});
