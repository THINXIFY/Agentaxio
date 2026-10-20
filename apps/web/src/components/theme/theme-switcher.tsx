"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/cn";

const OPTIONS: ReadonlyArray<{
  value: "light" | "dark" | "system";
  label: string;
  icon: LucideIcon;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Segmented Light / Dark / System control. Each option is a toggle button with an accessible name. */
export function ThemeSwitcher({
  className,
  showLabels = false,
}: {
  className?: string;
  showLabels?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  // Until mounted we cannot know the stored preference; render all options unpressed to stay hydration-safe.
  const current = mounted ? (theme ?? "system") : null;

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-control border border-border bg-surface-sunken p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const pressed = current === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            aria-label={showLabels ? undefined : label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-[0.375rem] px-2.5 text-sm font-medium",
              "transition-colors duration-200 ease-standard",
              pressed
                ? "bg-surface-raised text-foreground shadow-raised"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {showLabels ? <span>{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
