/**
 * Cookie handling, kept small and strict (no cookie library: only the three cookies this service uses).
 *
 *   session   HttpOnly, opaque 256-bit token, SameSite=Lax. With `secure`, the name carries the __Host- prefix, which
 *             makes browsers require Secure + Path=/ + no Domain, so a sibling subdomain cannot overwrite it.
 *   csrf      readable by the page's script (it must copy it into the X-CSRF-Token header), SameSite=Strict.
 *   oidc      binds one login attempt to the browser that started it (blocks login CSRF), SameSite=Lax because the
 *             identity provider returns the browser with a top-level GET.
 */

export interface CookieNames {
  session: string;
  csrf: string;
  oidc: string;
}

export const cookieNames = (secure: boolean): CookieNames => ({
  session: secure ? "__Host-axo_session" : "axo_session",
  csrf: secure ? "__Host-axo_csrf" : "axo_csrf",
  oidc: secure ? "__Host-axo_oidc" : "axo_oidc",
});

/** Parse a Cookie header. Duplicates keep the FIRST value (a later one could have been planted by a sibling site). */
export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (header === undefined || header.length > 4096) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      !/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(value)
    )
      continue;
    if (!out.has(name)) out.set(name, value);
  }
  return out;
}

export interface CookieOptions {
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Lax" | "Strict";
  maxAgeSeconds: number;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new TypeError("cookie value must be url-safe");
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${String(Math.max(0, Math.floor(options.maxAgeSeconds)))}`,
    `SameSite=${options.sameSite}`,
    ...(options.httpOnly ? ["HttpOnly"] : []),
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export const expireCookie = (name: string, options: Omit<CookieOptions, "maxAgeSeconds">): string =>
  `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=${options.sameSite}${
    options.httpOnly ? "; HttpOnly" : ""
  }${options.secure ? "; Secure" : ""}`;
