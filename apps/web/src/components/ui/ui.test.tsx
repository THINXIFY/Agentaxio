import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/axe";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("blocks interaction and announces busy state while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders as the child element with asChild", () => {
    render(
      <Button asChild>
        <a href="/dashboard">Open</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/dashboard");
  });
});

describe("Field", () => {
  it("associates label, hint and error with the control", async () => {
    const { container } = render(
      <Field label="Email" hint="We never share it." error="Enter a valid email." required>
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText(/Email/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toHaveLength(2);
    expect(container.querySelector(`#${CSS.escape(describedBy.split(" ")[1]!)}`)).toHaveTextContent(
      "Enter a valid email.",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations across input, textarea and select", async () => {
    const { container } = render(
      <form>
        <Field label="Name">
          <Input />
        </Field>
        <Field label="Notes">
          <Textarea />
        </Field>
        <Field label="Environment">
          <Select>
            <option>dev</option>
          </Select>
        </Field>
      </form>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Switch", () => {
  it("toggles aria-checked and notifies the caller", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Notify approvers" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole("switch", { name: "Notify approvers" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

describe("Table", () => {
  it("is a labelled, keyboard-focusable region with column headers", async () => {
    const { container } = render(
      <Table label="Agents">
        <TableHead>
          <tr>
            <TableHeaderCell>Agent</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Lead Intake Agent</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("region", { name: "Agents" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("columnheader", { name: "Agent" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("cn", () => {
  it("treats custom display sizes as font sizes, not colours", () => {
    expect(cn("text-sm", "text-display-xl")).toBe("text-display-xl");
    expect(cn("text-foreground", "text-display-xl")).toBe("text-foreground text-display-xl");
  });

  it("lets later semantic colour classes win", () => {
    expect(cn("bg-surface", "bg-primary")).toBe("bg-primary");
  });
});
