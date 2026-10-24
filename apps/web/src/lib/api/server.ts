import { cache } from "react";
import { cookies } from "next/headers";
import { apiBase } from "./config";
import type { ApiErrorBody, ApiOverview, Me, Membership } from "./types";

/**
 * Server-side access to the management API for dashboard pages. The browser's session cookie is forwarded to the API,
 * which is the only place a session is verified; nothing here decides who may see or do anything. Import this only from
 * server components.
 */

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string; reason?: string };

const API_COOKIE = /^(__Host-)?axo_(session|csrf)$/;
const TIMEOUT_MS = 8000;

async function forwardedCookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar
    .getAll()
    .filter((c) => API_COOKIE.test(c.name))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const base = apiBase();
  if (base === null) return { ok: false, status: 0, code: "NOT_CONFIGURED" };
  // cookies() first: it opts the page out of static rendering before any request is made.
  const cookie = await forwardedCookieHeader();
  try {
    const response = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { accept: "application/json", ...(cookie === "" ? {} : { cookie }) },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return { ok: true, data: (await response.json()) as T };
    let body: Partial<ApiErrorBody> = {};
    try {
      body = (await response.json()) as Partial<ApiErrorBody>;
    } catch {
      // not JSON: keep the status only
    }
    return {
      ok: false,
      status: response.status,
      code: body.error?.code ?? "ERROR",
      ...(body.error?.reason === undefined ? {} : { reason: body.error.reason }),
    };
  } catch {
    return { ok: false, status: 0, code: "UNREACHABLE" };
  }
}

export interface ActiveOrg extends Membership {
  /** Base of the API paths for this organization. */
  base: string;
}

export type LiveSession =
  | { kind: "demo" }
  | { kind: "signed-out" }
  | { kind: "unreachable" }
  | { kind: "no-organization"; me: Me }
  | { kind: "ready"; me: Me; org: ActiveOrg };

/**
 * Who is looking, and in which organization. Cached for the duration of one request so the layout and the page share one
 * call. The first membership is used; choosing between organizations is a later feature. The role shown to the page is
 * for presentation only: the API checks it again on every call.
 */
export const loadSession = cache(async (): Promise<LiveSession> => {
  if (apiBase() === null) return { kind: "demo" };
  const me = await apiGet<Me>("/v1/me");
  if (!me.ok) {
    if (me.status === 401) return { kind: "signed-out" };
    return { kind: "unreachable" };
  }
  const first = me.data.memberships[0];
  if (first === undefined) return { kind: "no-organization", me: me.data };
  return {
    kind: "ready",
    me: me.data,
    org: { ...first, base: `/v1/orgs/${first.organizationId}` },
  };
});

export const canDecideApprovals = (role: Membership["role"]): boolean =>
  role === "owner" || role === "admin" || role === "approver";
export const canManage = (role: Membership["role"]): boolean =>
  role === "owner" || role === "admin";

/** The overview numbers, shared by the layout (pending count) and the Overview page within one request. */
export const loadOverview = cache((orgBase: string) => apiGet<ApiOverview>(`${orgBase}/overview`));
