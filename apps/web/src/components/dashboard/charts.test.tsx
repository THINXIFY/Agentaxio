import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequestsChart, Sparkline } from "@/components/dashboard/charts";
import { listDashboardRequests, outcomesByDay } from "@/mocks/dashboard";
import { axe } from "@/test/axe";

const data = outcomesByDay(listDashboardRequests());

describe("Sparkline", () => {
  it("is decorative: hidden from assistive technology and not focusable", () => {
    const { container } = render(<Sparkline values={[1, 3, 2, 4]} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });
});

describe("RequestsChart", () => {
  it("shows a legend with totals that match the data, so colour is never the only signal", () => {
    render(<RequestsChart data={data} caption="Sample" />);
    const legend = screen.getAllByRole("list")[0]!;
    const sum = (k: "allowed" | "approval" | "blocked") => data.reduce((n, d) => n + d[k], 0);
    expect(legend).toHaveTextContent(`Allowed${sum("allowed")}`);
    expect(legend).toHaveTextContent(`Needs approval${sum("approval")}`);
    expect(legend).toHaveTextContent(`Blocked${sum("blocked")}`);
  });

  it("offers the exact figures as a table", () => {
    render(<RequestsChart data={data} caption="Requests per day" />);
    const table = screen.getByRole("table", { name: "Requests per day" });
    expect(within(table).getAllByRole("row")).toHaveLength(data.length + 1);
  });

  it("has no axe violations", async () => {
    const { container } = render(<RequestsChart data={data} caption="Sample" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("outcomesByDay", () => {
  it("accounts for every sample request exactly once, derived from the requests (never invented)", () => {
    const requests = listDashboardRequests();
    const total = data.reduce((n, d) => n + d.allowed + d.approval + d.blocked, 0);
    expect(total).toBe(requests.length);
    expect(data.reduce((n, d) => n + d.blocked, 0)).toBe(
      requests.filter((r) => r.status === "denied").length,
    );
  });
});
