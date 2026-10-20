import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "@/components/marketing/hero";
import { ProductPreview } from "@/components/marketing/product-preview";
import { WorkflowSection } from "@/components/marketing/workflow-section";
import { PlatformSection } from "@/components/marketing/platform-section";
import { axe } from "@/test/axe";

describe("hero performance contract", () => {
  it("does not depend on JavaScript animation for visibility (CSS entrance only)", () => {
    const { container } = render(<Hero />);
    // [data-reveal*] elements are hidden until GSAP runs; the hero must never use them.
    expect(container.querySelectorAll("[data-reveal], [data-reveal-item]")).toHaveLength(0);
    // ...and it must use the CSS entrance instead.
    expect(container.querySelectorAll(".hero-rise").length).toBeGreaterThan(4);
  });

  it("renders the approved headline with selective emphasis on Control.", () => {
    render(<Hero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("AI Moves Fast. Stay in Control.");
    expect(within(h1).getByText("Control.")).toHaveClass("text-primary-text");
  });

  it("labels its artwork as an illustration, and hides the decorative drawing from assistive technology", () => {
    const { container } = render(<Hero />);
    expect(screen.getByText(/Illustration · sample agents/)).toBeInTheDocument();
    const svg = container.querySelector("svg[viewBox='0 0 1200 560']")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("keeps its calls to action on real homepage anchors", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: /Explore Platform/ })).toHaveAttribute(
      "href",
      "/#platform",
    );
    expect(screen.getByRole("link", { name: "View Documentation" })).toHaveAttribute(
      "href",
      "/#developers",
    );
  });

  it("has no axe violations", async () => {
    const { container } = render(<Hero />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("workflow section", () => {
  it("presents the four-step authorization sequence in order", () => {
    render(<WorkflowSection />);
    const steps = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(steps).toEqual([
      "Register an agent.",
      "Define and enforce permissions.",
      "Request approval when required.",
      "Execute, then record the outcome.",
    ]);
  });
});

describe("platform section", () => {
  it("introduces the four core areas", () => {
    render(<PlatformSection />);
    const areas = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(areas).toEqual(["Agent identity", "Access policies", "Human approvals", "Audit logs"]);
  });

  it("marks its decorative layer figure as hidden from assistive technology", () => {
    const { container } = render(<PlatformSection />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("product preview status visualisation", () => {
  it("summarises the status distribution in text, not colour alone", () => {
    render(<ProductPreview />);
    const bar = screen.getByRole("img", { name: /Executed: 1/ });
    const label = bar.getAttribute("aria-label") ?? "";
    for (const expected of ["Executed", "Pending approval", "Denied", "Queued for execution"]) {
      expect(label).toContain(expected);
    }
    // Total equals the number of sample requests.
    const total = [...label.matchAll(/: (\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
    expect(total).toBe(6);
  });

  it("keeps approved, pending, denied and executed visually distinct by label", () => {
    render(<ProductPreview />);
    const labels = screen.getAllByRole("tab").map((t) => t.textContent ?? "");
    expect(labels.some((l) => /Executed/.test(l))).toBe(true);
    expect(labels.some((l) => /Pending approval/.test(l))).toBe(true);
    expect(labels.some((l) => /Denied/.test(l))).toBe(true);
  });
});
