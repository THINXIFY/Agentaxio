import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A readable, scrollable code block with a tiny JSON highlighter (keys neutral, strings violet, punctuation muted).
 * Input is always static text written in this repository, never user data. The block is keyboard-focusable so a long
 * line can be scrolled without a mouse.
 */
const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],])/g;

function highlight(src: string): React.ReactNode[] {
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

export function CodeBlock({
  label,
  head,
  json,
  plain = false,
  note,
  className,
}: {
  /** Accessible name, e.g. "Request". */
  label: string;
  /** Plain, muted lines above the body: the HTTP line and headers. */
  head?: readonly string[];
  json: string;
  /** Render as plain code (comment lines muted) instead of highlighting JSON. */
  plain?: boolean;
  /** A short sentence under the block. */
  note?: string;
  className?: string;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      <pre
        tabIndex={0}
        role="region"
        aria-label={`${label} (scrollable)`}
        className="overflow-x-auto rounded-md border border-border bg-background/70 p-4 font-mono text-[0.8125rem] leading-relaxed"
      >
        <code>
          {head?.map((h) => (
            <span key={h} className="block text-muted-foreground">
              {h}
            </span>
          ))}
          {head?.length ? <span className="block h-2" /> : null}
          {plain
            ? json.split(String.fromCharCode(10)).map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    "block",
                    line.trimStart().startsWith("//") && "text-muted-foreground",
                  )}
                >
                  {line || " "}
                </span>
              ))
            : highlight(json)}
        </code>
      </pre>
      {note ? <figcaption className="mt-2 text-sm text-muted-foreground">{note}</figcaption> : null}
    </figure>
  );
}
