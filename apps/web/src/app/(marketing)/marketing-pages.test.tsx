import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AboutPage from "@/app/(marketing)/about/page";
import ContactPage from "@/app/(marketing)/contact/page";
import DevelopersPage from "@/app/(marketing)/developers/page";
import FeaturesPage from "@/app/(marketing)/features/page";
import PlatformPage from "@/app/(marketing)/platform/page";
import PricingPage from "@/app/(marketing)/pricing/page";
import PrivacyPage from "@/app/(marketing)/privacy/page";
import SecurityPage from "@/app/(marketing)/security/page";
import SolutionsPage from "@/app/(marketing)/solutions/page";
import TermsPage from "@/app/(marketing)/terms/page";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { ContactForm, validate } from "@/components/marketing/site/contact-form";
import { companyNav, legalNav, marketingNav } from "@/config/navigation";
import { axe } from "@/test/axe";

let pathname = "/platform";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: () => {} }) }));

afterEach(() => vi.restoreAllMocks());

const PAGES: ReadonlyArray<[string, () => React.ReactElement]> = [
  ["Platform", () => <PlatformPage />],
  ["Features", () => <FeaturesPage />],
  ["Solutions", () => <SolutionsPage />],
  ["Security", () => <SecurityPage />],
  ["Developers", () => <DevelopersPage />],
  ["Pricing", () => <PricingPage />],
  ["About", () => <AboutPage />],
  ["Contact", () => <ContactPage />],
  ["Privacy", () => <PrivacyPage />],
  ["Terms", () => <TermsPage />],
];

const SITE_ROUTES = new Set([
  "/",
  "/dashboard",
  "/dashboard/integrations",
  ...[...marketingNav, ...companyNav, ...legalNav].map((n) => n.href),
]);
const EXTERNAL_ALLOWED = new Set(["https://github.com/THINXIFY/Agentaxio"]);

describe.each(PAGES)("marketing page: %s", (_name, make) => {
  it("has exactly one h1, and every section has an accessible name", () => {
    const { container } = render(make());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const section of container.querySelectorAll("section[aria-labelledby]")) {
      const id = section.getAttribute("aria-labelledby")!;
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it("links only to implemented pages, existing anchors, or the approved external link", () => {
    const { container } = render(make());
    for (const a of container.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href")!;
      if (href.startsWith("#")) {
        expect(container.querySelector(`#${href.slice(1)}`), href).not.toBeNull();
      } else if (href.startsWith("http")) {
        expect(EXTERNAL_ALLOWED.has(href), href).toBe(true);
        expect(a.getAttribute("rel")).toMatch(/noopener/);
      } else {
        expect(SITE_ROUTES.has(href), href).toBe(true);
      }
    }
  });

  it("makes no unverifiable claims: certifications, customers, prices or statistics", () => {
    const { container } = render(make());
    // Statements that deny a claim ("no certifications") are marked and excluded from the check.
    const clone = container.cloneNode(true) as HTMLElement;
    for (const el of clone.querySelectorAll("[data-not-claimed]")) el.remove();
    const text = clone.textContent ?? "";
    expect(text).not.toMatch(
      /SOC ?2|ISO ?27001|HIPAA|GDPR|PCI[- ]DSS|certified|certification|pen-?test|penetration test/i,
    );
    expect(text).not.toMatch(/testimonial|trusted by|as seen in|case study/i);
    expect(text).not.toMatch(/[$€£]\s?\d/);
    expect(text).not.toMatch(/\b\d+(\.\d+)?\s?%/);
    expect(text).not.toMatch(/\b\d{2,}[,+]?\s+(customers|teams|companies|agencies)\b/i);
  });

  it("has no axe violations", async () => {
    const { container } = render(make());
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("pre-release honesty", () => {
  it.each(["Platform", "Features", "Security", "Developers", "Solutions"] as const)(
    "%s says how real each capability is",
    (name) => {
      const make = PAGES.find(([n]) => n === name)![1];
      const { container } = render(make());
      expect(container.textContent).toMatch(
        /Demo UI|Designed|Planned|Proposed contract|sample data/,
      );
    },
  );

  it("Security separates built, designed and planned, and claims no certification", () => {
    const { container } = render(<SecurityPage />);
    for (const label of ["Built", "Designed", "Planned"])
      expect(within(container).getAllByText(label).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/Certifications: none claimed/);
    expect(container.textContent).toMatch(/No certifications or compliance approvals/);
    expect(container.textContent).toMatch(/Cannot stop someone who still holds direct credentials/);
  });

  it("Developers labels the API as a proposed, unimplemented contract", () => {
    const { container } = render(<DevelopersPage />);
    expect(within(container).getAllByText(/Proposed contract/).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/API not available yet/);
    // The status vocabulary is the contract's, all nine of them.
    for (const s of [
      "denied",
      "pending_approval",
      "approved",
      "queued_execution",
      "running",
      "succeeded",
      "failed",
      "expired",
      "unknown",
    ])
      expect(container.textContent).toContain(s);
  });

  it("Pricing invents no prices and says so", () => {
    const { container } = render(<PricingPage />);
    expect(screen.getAllByText("Price not decided")).toHaveLength(3);
    expect(container.textContent).toMatch(/Pricing isn.t set yet/);
    expect(container.querySelectorAll("details").length).toBeGreaterThanOrEqual(4);
  });

  it("About invents no team, customers, investors or history", () => {
    const { container } = render(<AboutPage />);
    expect(container.textContent).toMatch(/no customers yet/);
    expect(container.textContent).not.toMatch(
      /founded in|our team|investor|backed by|series [a-c]/i,
    );
  });
});

describe("legal pages are clearly drafts", () => {
  it.each([
    ["Privacy", () => <PrivacyPage />],
    ["Terms", () => <TermsPage />],
  ] as const)("%s is marked draft, not in effect, and flags every gap for review", (_n, make) => {
    const { container } = render(make());
    expect(container.textContent).toMatch(/Draft · not reviewed · not in effect/);
    expect(container.textContent).toMatch(/not a legal document in force/i);
    // Flagged gaps (screen-reader text) plus the closing checklist.
    expect(
      container.textContent!.match(/Needs founder or legal review/g)!.length,
    ).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("heading", { name: /Before publication/ })).toBeInTheDocument();
    // No invented company details.
    expect(container.textContent).not.toMatch(/\bInc\.|\bLtd\b|\bLLC\b|registered in/i);
  });
});

describe("Contact", () => {
  it("lists honest pre-launch options and links the public repository safely", () => {
    render(<ContactPage />);
    expect(screen.getByText(/Contact form: not connected yet/)).toBeInTheDocument();
    expect(screen.getAllByText(/Not published yet/).length).toBeGreaterThanOrEqual(2);
    const repo = screen.getByRole("link", { name: /Open the project on GitHub/ });
    expect(repo).toHaveAttribute("target", "_blank");
    expect(repo).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});

describe("ContactForm", () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/Your name/), "Ada Example");
    await user.type(screen.getByLabelText(/^Email/), "ada@example.test");
    await user.type(
      screen.getByLabelText(/^Message/),
      "We run lead-intake workflows in n8n and want approvals on new companies.",
    );
  };

  it("validates required fields, announces the errors and moves focus to them", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.click(screen.getByRole("button", { name: "Check my message" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Enter your name.");
    expect(alert).toHaveTextContent(/email address/);
    expect(alert).toHaveTextContent(/at least 20 characters/);
    await vi.waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText(/Your name/)).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects a malformed email", () => {
    expect(
      validate({
        topic: "x",
        name: "Ada",
        email: "not-an-email",
        organization: "",
        message: "x".repeat(30),
      }),
    ).toEqual({ email: expect.any(String) });
  });

  it("NEVER claims the message was sent, and makes no network request", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<ContactForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Check my message" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("This form isn’t connected yet. Nothing was sent.");
    expect(container.textContent).not.toMatch(
      /thank you|message sent|successfully|we.ll be in touch|received/i,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the visitor’s text, lets them copy or edit it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ContactForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Check my message" }));
    expect(await screen.findByText(/We run lead-intake workflows/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Copy my message/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ada@example.test"));
    expect(await screen.findByText("Copied to your clipboard.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Edit message/ }));
    expect(screen.getByLabelText(/^Message/)).toHaveValue(
      "We run lead-intake workflows in n8n and want approvals on new companies.",
    );
  });

  it("says plainly if the browser blocks copying", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
      configurable: true,
    });
    render(<ContactForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Check my message" }));
    await user.click(await screen.findByRole("button", { name: /Copy my message/ }));
    expect(await screen.findByText(/blocked copying/)).toBeInTheDocument();
  });
});

describe("site navigation", () => {
  it("header shows the six pages and marks the current one", () => {
    pathname = "/security";
    render(<MarketingHeader />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(marketingNav.map((n) => n.label));
    const current = within(nav)
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Security");
  });

  it("marks no page as current on a page outside the primary navigation (Contact)", () => {
    pathname = "/contact";
    render(<MarketingHeader />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const link of within(nav).getAllByRole("link"))
      expect(link).not.toHaveAttribute("aria-current");
  });

  it("mobile menu opens, lists every page, and closes after choosing one", async () => {
    pathname = "/";
    const user = userEvent.setup();
    render(<MarketingHeader />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    const links = within(dialog).getAllByRole("link");
    for (const item of marketingNav)
      expect(
        links.some((l) => l.getAttribute("href") === item.href),
        item.label,
      ).toBe(true);
    await user.click(within(dialog).getByRole("link", { name: "Pricing" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("footer links every marketing, company and legal page", () => {
    render(<MarketingFooter />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    for (const item of [...marketingNav, ...companyNav, ...legalNav])
      expect(hrefs).toContain(item.href);
  });
});
