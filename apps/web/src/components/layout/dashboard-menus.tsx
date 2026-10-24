"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, ExternalLink, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useShellMode } from "@/components/layout/shell-mode";
import { useMounted } from "@/hooks/use-mounted";
import { postJson } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { requestSentence } from "@/lib/plain-language";
import { formatAgo, listDashboardRequests } from "@/mocks/dashboard";

/** Notifications: sample items in the demo, the real pending-approval count in live mode. */
export function NotificationsMenu() {
  const shell = useShellMode();
  return shell.mode === "live" ? (
    <LiveNotificationsMenu pending={shell.pendingApprovals ?? 0} />
  ) : (
    <DemoNotificationsMenu />
  );
}

function LiveNotificationsMenu({ pending }: { pending: number }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Notifications, ${String(pending)} waiting for approval`}
        className="relative inline-flex size-11 items-center justify-center rounded-control text-muted-foreground transition-colors duration-200 hover:bg-surface-hover hover:text-foreground data-[state=open]:bg-surface-hover data-[state=open]:text-foreground"
      >
        <Bell className="size-[1.125rem]" aria-hidden="true" />
        {pending > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary-text ring-2 ring-shell"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-medium">Notifications</h2>
        </div>
        <p className="px-4 py-5 text-base">
          {pending === 0
            ? "Nothing is waiting for approval."
            : pending === 1
              ? "1 request is waiting for a person to decide."
              : `${String(pending)} requests are waiting for a person to decide.`}
        </p>
        <div className="border-t border-border px-4 py-2.5">
          <PopoverClose asChild>
            <Link
              href="/dashboard/approvals"
              className="text-base font-medium text-primary-text hover:underline"
            >
              See all approvals
            </Link>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Notifications built from the sample requests. Each entry links to the page where it can be reviewed. */
function DemoNotificationsMenu() {
  const requests = listDashboardRequests();
  const items = [
    ...requests
      .filter((r) => r.status === "pending_approval")
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        title: `${r.agentName} needs approval`,
        detail: `Wants to ${requestSentence(r)} · ${formatAgo(r.createdAt)}`,
        href: "/dashboard/approvals",
        tone: "warning" as const,
      })),
    ...requests
      .filter((r) => r.status === "failed")
      .slice(0, 1)
      .map((r) => ({
        id: r.id,
        title: `${r.agentName}’s action didn’t complete`,
        detail: `Tried to ${requestSentence(r)} · ${formatAgo(r.createdAt)}`,
        href: "/dashboard/audit",
        tone: "danger" as const,
      })),
  ];

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Notifications, ${items.length} sample items`}
        className="relative inline-flex size-11 items-center justify-center rounded-control text-muted-foreground transition-colors duration-200 hover:bg-surface-hover hover:text-foreground data-[state=open]:bg-surface-hover data-[state=open]:text-foreground"
      >
        <Bell className="size-[1.125rem]" aria-hidden="true" />
        {items.length > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary-text ring-2 ring-shell"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-medium">Notifications</h2>
          <Badge tone="brand">Sample data</Badge>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing needs your attention.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1.5">
            {items.map((n) => (
              <li key={n.id}>
                <PopoverClose asChild>
                  <Link
                    href={n.href}
                    className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-hover focus-visible:bg-surface-hover"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.tone === "warning" ? "bg-warning" : "bg-danger",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-base font-medium">{n.title}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{n.detail}</span>
                    </span>
                  </Link>
                </PopoverClose>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border px-4 py-2.5">
          <PopoverClose asChild>
            <Link
              href="/dashboard/approvals"
              className="text-base font-medium text-primary-text hover:underline"
            >
              See all approvals
            </Link>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Account menu. In the demo it is an invented user and “Sign out” is explicitly unavailable. In live mode it shows who the
 * API says is signed in, and signing out ends that server-side session.
 */
export function AccountMenu() {
  const shell = useShellMode();
  const live = shell.mode === "live";
  const signedIn = live && shell.state !== "signed-out";
  const email = live ? (shell.email ?? "Signed in") : "demo.admin@example.test";
  const name = live ? (shell.email ?? "Signed in") : "Demo Admin";
  const detail =
    live && shell.organization ? `${shell.organization} · ${shell.role ?? "member"}` : null;
  const initials = live ? (shell.email ?? "?").slice(0, 2).toUpperCase() : "DA";
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? (theme ?? "system") : "system";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className="inline-flex size-11 items-center justify-center rounded-full transition-opacity duration-200 hover:opacity-90 data-[state=open]:opacity-90"
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-subtle font-mono text-xs font-medium text-subtle-foreground"
        >
          {initials}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="px-2.5 py-2">
          <p className="text-sm font-medium">{live ? "Signed in as" : name}</p>
          <p className="text-sm text-muted-foreground">{email}</p>
          {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        </div>
        <DropdownMenuSeparator />
        {/* The top-bar switcher is hidden on small screens, so the same choice lives here. */}
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden="true" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden="true" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden="true" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/">
            <ExternalLink aria-hidden="true" />
            Back to website
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {live ? (
          signedIn ? (
            <DropdownMenuItem
              onSelect={() => {
                void postJson("/auth/logout").then(() => {
                  window.location.reload();
                });
              }}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <a href="/api/auth/login?return_to=/dashboard">
                <LogOut aria-hidden="true" />
                Sign in
              </a>
            </DropdownMenuItem>
          )
        ) : (
          <DropdownMenuItem disabled>
            <LogOut aria-hidden="true" />
            Sign out
            <span className="ml-auto text-xs">no sessions in demo</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
