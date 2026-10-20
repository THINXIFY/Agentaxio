"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Search box with a real label (visually hidden), a clear button, and the native search role. */
export function SearchInput({
  value,
  onValueChange,
  label,
  placeholder = "Search",
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name; describes what is being searched. */
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const id = React.useId();
  return (
    <div role="search" className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-10 w-full rounded-control border border-input-border bg-surface-sunken pr-9 pl-9 text-sm text-foreground transition-[border-color] duration-200 ease-standard placeholder:text-muted-foreground hover:border-primary-text focus-visible:border-primary-text focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
