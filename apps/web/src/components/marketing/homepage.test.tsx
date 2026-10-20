import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/(marketing)/page";
import { CodeTabs, type CodeTab } from "@/components/marketing/code-tabs";
import { ProductPreview } from "@/components/marketing/product-preview";
import { HOME_SECTION_IDS, marketingNav } from "@/config/navigation";
import { axe } from "@/test/axe";

const KNOWN_ROUTES = new Set(["/", "/dashboard", "/dashboard/agents", "/dashboard/settings"]);

describe("HomePage", () => {
  it("has exactly one h1 with the approved headline", () => {
    render(<HomePage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("AI Moves Fast. Stay in Control.");
  });

  it("uses the approved eyebrow, description and calls to action", () => {
    render(<HomePage />);
    expect(screen.getByText(/the control layer for agentic ai/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Secure agent identities, enforce access policies, and approve critical actions/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore Platform/ })).toHaveAttribute(
      "href",
      "/#platform",
    );
    expect(screen.getByRole("link", { name: "View Documentation" })).toHaveAttribute(
      "href",
      "/#developers",
    );
  });

  it("defines every section anchor the navigation points at", () => {
    const { container } = render(<HomePage />);
    for (const id of Object.values(HOME_SECTION_IDS)) {
      expect(container.querySelector(`#${id}`), `missing #${id}`).not.toBeNull();
    }
    for (const item of marketingNav) {
      expect(container.querySelector(`#${item.href.slice(2)}`)).not.toBeNull();
    }
  });

  it("gives every section an accessible name", () => {
    const { container } = render(<HomePage />);
    for (const section of container.querySelectorAll("section")) {
      const labelledBy = section.getAttribute("aria-labelledby");
      expect(labelledBy, section.id || "section").toBeTruthy();
      expect(container.querySelector(`#${labelledBy}`)).not.toBeNull();
    }
  });

  it("links only to implemented routes or existing anchors (no dead links)", () => {
    const { container } = render(<HomePage />);
    const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      if (href.startsWith("/#")) {
        expect(container.querySelector(`#${href.slice(2)}`), href).not.toBeNull();
      } else {
        expect(KNOWN_ROUTES.has(href), `unknown route ${href}`).toBe(true);
      }
    }
  });

  it("does not make claims it cannot back (customers, certifications, prices, payments)", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/refund|payment|testimonial|SOC ?2|ISO ?27001|trusted by|GDPR|HIPAA/i);
    expect(text).not.toMatch(/[$€£]\s?\d/); // no invented prices
    expect(text).not.toMatch(/\d+\s?%|\d+x faster|\b\d{2,}[,+]?\s+(customers|teams|companies)\b/i); // no invented statistics
  });

  it("states that unbuilt integrations are not available", () => {
    render(<HomePage />);
    expect(screen.getByText(/The API is not available yet/i)).toBeInTheDocument();
    const status = screen.getByRole("heading", { name: /integration status/i }).parentElement!;
    expect(within(status).getByText(/TypeScript SDK/)).toBeInTheDocument();
    // Both SDK and MCP gateways are explicitly marked as not started.
    expect(within(status).getAllByText(/not started/i)).toHaveLength(2);
  });

  it("shows the pricing preview without prices and with a clearly disabled plans control", () => {
    render(<HomePage />);
    const disabled = screen.getByText(/Plans and prices · not published/);
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(disabled.tagName).not.toBe("A");
    expect(disabled.tagName).not.toBe("BUTTON");
  });

  it("labels its product data as sample data", () => {
    render(<HomePage />);
    expect(screen.getAllByText(/sample data/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mock data/i).length).toBeGreaterThan(0);
  });

  it("has no axe violations", async () => {
    const { container } = render(<HomePage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ProductPreview", () => {
  it("starts on the pending-approval request and shows its exact parameters", () => {
    render(<ProductPreview />);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Pending approval");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByLabelText("Proposed action as JSON")).toHaveTextContent(
      "grace@example.test",
    );
  });

  it("keeps Approve and Reject disabled and says why", () => {
    render(<ProductPreview />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByText(/Disabled in this preview/)).toBeInTheDocument();
  });

  it("only offers the approver actions on a pending request", async () => {
    const user = userEvent.setup();
    render(<ProductPreview />);
    const denied = screen.getAllByRole("tab").find((t) => /Denied/.test(t.textContent ?? ""))!;
    await user.click(denied);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("selects on click and supports arrow, Home and End keys with roving tabindex", async () => {
    const user = userEvent.setup();
    render(<ProductPreview />);
    const tabs = screen.getAllByRole("tab");

    await user.click(tabs[2]!);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(tabs[2]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowDown}");
    expect(tabs[3]).toHaveAttribute("aria-selected", "true");
    expect(tabs[3]).toHaveFocus();

    await user.keyboard("{End}");
    expect(tabs[tabs.length - 1]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}"); // wraps
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
  });

  it("never presents a pending, denied or expired request as executed", async () => {
    const user = userEvent.setup();
    render(<ProductPreview />);
    for (const tab of screen.getAllByRole("tab")) {
      await user.click(tab);
      const panel = screen.getByRole("tabpanel");
      if (/Pending approval|Denied|Expired/.test(tab.textContent ?? "")) {
        expect(within(panel).getByText(/Trusted executor/)).toBeInTheDocument();
        expect(panel.textContent).not.toMatch(/Grant consumed once|mock lead created/i);
      }
    }
  });
});

describe("CodeTabs", () => {
  const tabs: CodeTab[] = [
    { id: "a", label: "One", json: '{ "a": 1 }' },
    { id: "b", label: "Two", json: '{ "b": 2 }', caption: "second" },
    { id: "c", label: "Three", json: '{ "c": 3 }' },
  ];

  it("shows the selected tab's content and navigates by keyboard", async () => {
    const user = userEvent.setup();
    render(<CodeTabs tabs={tabs} label="Example" />);
    const list = screen.getByRole("tablist", { name: "Example" });
    const [one, two, three] = within(list).getAllByRole("tab");
    expect(one).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent('"a": 1');

    await user.click(one!);
    await user.keyboard("{ArrowRight}");
    expect(two).toHaveAttribute("aria-selected", "true");
    expect(two).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("second");

    await user.keyboard("{End}");
    expect(three).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}"); // wraps to first
    expect(one).toHaveAttribute("aria-selected", "true");
  });

  it("links each tab to its panel", () => {
    render(<CodeTabs tabs={tabs} label="Example" />);
    const tab = screen.getAllByRole("tab")[0]!;
    const panel = screen.getByRole("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
  });
});
