import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Original AgentAxio mark: an "A" whose crossbar is an authorization checkpoint on an axis.
 * The strokes follow the text colour (white on dark, ink on light); the checkpoint detail uses the `mark`
 * role (electric violet on dark and light). Placeholder until brand sign-off.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-7", className)}
    >
      <path
        d="M5 27 16 5l11 22"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 20.5h11" strokeWidth="3" strokeLinecap="round" className="stroke-mark" />
      <circle cx="16" cy="5" r="2.25" className="fill-mark" />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  showWordmark = true,
}: {
  href?: string;
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="AgentAxio home"
      className={cn("inline-flex items-center gap-2.5 rounded-control", className)}
    >
      <LogoMark />
      {showWordmark ? (
        <span className="font-display text-lg font-semibold tracking-tight">AgentAxio</span>
      ) : null}
    </Link>
  );
}
