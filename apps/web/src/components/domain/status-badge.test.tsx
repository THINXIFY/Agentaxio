import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionRequestStatusBadge } from "@/components/domain/status-badge";
import { ACTION_REQUEST_STATUSES } from "@/lib/contracts";

describe("ActionRequestStatusBadge", () => {
  it.each(ACTION_REQUEST_STATUSES)(
    "renders readable text for %s (never colour alone)",
    (status) => {
      const { container } = render(<ActionRequestStatusBadge status={status} />);
      expect(container.textContent?.trim().length).toBeGreaterThan(2);
      expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    },
  );

  it("keeps authorization and execution distinct", () => {
    render(<ActionRequestStatusBadge status="approved" />);
    expect(screen.getByText(/not yet executed/i)).toBeInTheDocument();
  });

  it("only shows 'Executed' for a succeeded request", () => {
    const labels = ACTION_REQUEST_STATUSES.map((status) => {
      const { container, unmount } = render(<ActionRequestStatusBadge status={status} />);
      const text = container.textContent ?? "";
      unmount();
      return [status, /^executed$/i.test(text.trim())] as const;
    });
    expect(labels.filter(([, executed]) => executed).map(([s]) => s)).toEqual(["succeeded"]);
  });
});
