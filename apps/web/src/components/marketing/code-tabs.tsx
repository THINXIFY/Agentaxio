"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/** Minimal JSON highlighter: keys neutral, strings violet (primary-text), punctuation muted. Input is static, never user data. */
const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],])/g;

function highlightJson(src: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of src.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(src.slice(last, idx));
    if (m[1]) {
      out.push(
        m[2] ? (
          <React.Fragment key={i++}>
            <span className="text-foreground">{m[1]}</span>
            <span className="text-muted-foreground">{m[2]}</span>
          </React.Fragment>
        ) : (
          <span key={i++} className="text-primary-text">
            {m[1]}
          </span>
        ),
      );
    } else if (m[3]) {
      out.push(
        <span key={i++} className="text-muted-foreground">
          {m[3]}
        </span>,
      );
    }
    last = idx + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export interface CodeTab {
  id: string;
  label: string;
  /** Plain, muted lines above the JSON (HTTP method, headers). */
  headerLines?: readonly string[];
  json: string;
  caption?: string;
}

/** Accessible tabbed code viewer (arrow keys, Home/End, roving tabindex). */
export function CodeTabs({ tabs, label }: { tabs: readonly CodeTab[]; label: string }) {
  const [active, setActive] = React.useState(tabs[0]!.id);
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const current = tabs.find((t) => t.id === active) ?? tabs[0]!;

  const move = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    setActive(tab.id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        return move(index + 1);
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        return move(index - 1);
      case "Home":
        e.preventDefault();
        return move(0);
      case "End":
        e.preventDefault();
        return move(tabs.length - 1);
    }
  };

  return (
    <div className="overflow-hidden rounded-control border border-border bg-background">
      <div
        role="tablist"
        aria-label={label}
        className="flex border-b border-border bg-surface-sunken"
      >
        {tabs.map((t, i) => {
          const selected = t.id === current.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`code-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`code-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "relative px-4 py-2.5 font-mono text-xs transition-colors duration-200 ease-standard",
                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 bottom-0 h-px bg-primary transition-opacity duration-200",
                  selected ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`code-panel-${current.id}`}
        aria-labelledby={`code-tab-${current.id}`}
        tabIndex={0}
      >
        <pre className="min-h-[15.5rem] overflow-x-auto p-4 font-mono text-[0.8rem] leading-relaxed">
          <code>
            {current.headerLines?.map((line) => (
              <React.Fragment key={line}>
                <span className="text-muted-foreground">{line}</span>
                {"\n"}
              </React.Fragment>
            ))}
            {current.headerLines?.length ? "\n" : null}
            {highlightJson(current.json)}
          </code>
        </pre>
        {current.caption ? (
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {current.caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
