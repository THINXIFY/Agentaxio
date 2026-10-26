import * as React from "react";
import {
  CreateOrganizationPanel,
  SignedOutPanel,
  UnreachablePanel,
} from "@/components/live/session-gate";
import { PageHeader } from "@/components/layout/page-header";
import type { LiveSession } from "@/lib/api/server";

export type ReadySession = Extract<LiveSession, { kind: "ready" }>;

/**
 * Live pages call this first. Either the person is signed in with an organization (`ready`), or there is a plain page
 * explaining what to do next. Nothing here grants anything: the API answers every data request for itself.
 */
export function gate(
  session: LiveSession,
  title: string,
): { ready: ReadySession } | { node: React.ReactNode } {
  switch (session.kind) {
    case "ready":
      return { ready: session };
    case "signed-out":
      return {
        node: (
          <>
            <PageHeader title={title} />
            <SignedOutPanel />
          </>
        ),
      };
    case "no-organization":
      return {
        node: (
          <>
            <PageHeader title={title} />
            <CreateOrganizationPanel />
          </>
        ),
      };
    case "demo":
    case "unreachable":
      return {
        node: (
          <>
            <PageHeader title={title} />
            <UnreachablePanel />
          </>
        ),
      };
  }
}

/** A failed data request, as a calm panel rather than a crash. */
export function LoadFailed({ what }: { what: string }) {
  return (
    <p
      role="alert"
      className="rounded-card border border-danger-border bg-danger-muted p-5 text-base text-danger-text"
    >
      {what} couldn’t be loaded just now. Nothing was changed. Reload the page to try again.
    </p>
  );
}
