"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { postJson, stepUpUrl, type ClientResult } from "@/lib/api/client";

/**
 * Shared behaviour for every button or form that changes something through the management API: one request at a time,
 * a plain-language message when the server says no, and a way to confirm with multi-factor authentication again when the
 * server asks for it. The server decides every outcome; this only reports it.
 */

export interface ActionFailure {
  message: string;
  stepUp: boolean;
  code: string;
  reason?: string;
}

const BY_REASON: Record<string, string> = {
  SELF_APPROVAL:
    "You can’t decide a request from an agent you own, registered or issued a key for. Ask a different approver.",
  POLICY_AUTHOR:
    "You wrote a rule that applies to this request, so someone else has to decide it. Ask a different approver.",
  DIGEST_MISMATCH:
    "The details changed since you opened this page, so nothing was recorded. Reload and review it again.",
  ALREADY_DECIDED: "Someone has already decided this request.",
  ORIGIN: "This page isn’t allowed to make that change from here.",
};

export function describeFailure(
  result: Extract<ClientResult<unknown>, { ok: false }>,
): ActionFailure {
  const base = {
    code: result.code,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
  };
  if (result.code === "STEP_UP_REQUIRED")
    return {
      ...base,
      stepUp: true,
      message: "Please confirm it’s you with multi-factor authentication, then try again.",
    };
  if (result.reason !== undefined && BY_REASON[result.reason] !== undefined)
    return { ...base, stepUp: false, message: BY_REASON[result.reason] ?? result.message };
  const message =
    result.status === 401
      ? "Your session has ended. Sign in again to continue."
      : result.status === 403
        ? "You don’t have permission to do that."
        : result.status === 404
          ? "That no longer exists, or you can’t see it."
          : result.status === 410
            ? "This has expired, so it can no longer be decided."
            : result.status === 422
              ? "Those details aren’t valid. Check them and try again."
              : result.status === 429
                ? "Too many attempts. Wait a minute and try again."
                : result.status === 409
                  ? result.message
                  : "The AgentAxio service had a problem. Nothing was changed.";
  return { ...base, stepUp: false, message };
}

export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [failure, setFailure] = React.useState<ActionFailure | null>(null);

  const run = React.useCallback(
    async <T,>(path: string, body: unknown = {}): Promise<ClientResult<T>> => {
      setPending(true);
      setFailure(null);
      const result = await postJson<T>(path, body);
      setPending(false);
      if (!result.ok) setFailure(describeFailure(result));
      else router.refresh();
      return result;
    },
    [router],
  );

  return { run, pending, failure, clear: () => setFailure(null) };
}

/** The message for a failed action, with a sign-in-again link when multi-factor confirmation is needed. */
export function ActionError({ failure }: { failure: ActionFailure | null }) {
  if (failure === null) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger-text">
      {failure.message}{" "}
      {failure.stepUp ? (
        <a
          className="underline"
          href={stepUpUrl(typeof window === "undefined" ? "/dashboard" : window.location.pathname)}
        >
          Confirm now
        </a>
      ) : null}
      {failure.code === "UNAUTHENTICATED" ? (
        <a className="underline" href="/api/auth/login?return_to=/dashboard">
          Sign in
        </a>
      ) : null}
    </p>
  );
}
