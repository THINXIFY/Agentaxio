"use client";

import type { ApiErrorBody } from "./types";

/**
 * Browser-side calls to the management API through this site's own `/api/*` paths. The session cookie is HttpOnly and
 * travels by itself; the only thing read here is the CSRF token (a separate, readable cookie) which is sent back in a
 * header. The server verifies the origin, the session and the token, and decides everything else.
 */

const CSRF_COOKIES = ["__Host-axo_csrf", "axo_csrf"] as const;

function readCsrfToken(): string | undefined {
  for (const part of document.cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name !== undefined && (CSRF_COOKIES as readonly string[]).includes(name))
      return value.join("=");
  }
  return undefined;
}

export type ClientResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; reason?: string; message: string };

export async function postJson<T = Record<string, unknown>>(
  path: string,
  body: unknown = {},
): Promise<ClientResult<T>> {
  const csrf = readCsrfToken();
  try {
    const response = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(csrf === undefined ? {} : { "x-csrf-token": csrf }),
      },
      body: JSON.stringify(body),
    });
    const text = response.status === 204 ? "" : await response.text();
    let parsed: unknown = {};
    try {
      parsed = text === "" ? {} : JSON.parse(text);
    } catch {
      // keep {}
    }
    if (response.ok) return { ok: true, status: response.status, data: parsed as T };
    const error = (parsed as Partial<ApiErrorBody>).error;
    return {
      ok: false,
      status: response.status,
      code: error?.code ?? "ERROR",
      ...(error?.reason === undefined ? {} : { reason: error.reason }),
      message: error?.message ?? "Something went wrong.",
    };
  } catch {
    return {
      ok: false,
      status: 0,
      code: "UNREACHABLE",
      message: "The AgentAxio service could not be reached. Nothing was changed.",
    };
  }
}

/** Where to send a person to confirm with multi-factor authentication again, then come back here. */
export const stepUpUrl = (returnTo: string): string =>
  `/api/auth/login?step_up=1&return_to=${encodeURIComponent(returnTo)}`;
