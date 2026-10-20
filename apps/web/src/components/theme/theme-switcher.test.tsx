import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

const setTheme = vi.fn();
let currentTheme: string | undefined = "system";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: currentTheme, setTheme }),
}));

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    setTheme.mockClear();
    currentTheme = "system";
  });

  it("offers Light, Dark and System as named toggle buttons in a labelled group", () => {
    render(<ThemeSwitcher />);
    const group = screen.getByRole("group", { name: "Colour theme" });
    expect(group).toBeInTheDocument();
    for (const name of ["Light", "Dark", "System"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("marks the stored preference as pressed", () => {
    currentTheme = "dark";
    render(<ThemeSwitcher />);
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
  });

  it("applies the chosen theme", async () => {
    render(<ThemeSwitcher />);
    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(setTheme).toHaveBeenCalledWith("light");
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
