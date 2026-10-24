import type { NextConfig } from "next";
import { apiBase } from "./src/lib/api/config";

/**
 * Baseline hardening headers. A Content-Security-Policy is deliberately NOT set here yet:
 * it needs a nonce strategy for the theme/motion bootstrap scripts and must be designed
 * together with the auth/session work (see docs/FRONTEND-FOUNDATION.md, "Deferred").
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /**
   * Live mode only (AXO_API_URL set): the browser talks to the management API through this site's own origin, so the
   * session cookie is first-party. Exactly two prefixes are forwarded, to one fixed destination; there is no open proxy.
   * Without AXO_API_URL nothing is forwarded and the dashboard stays in its labelled demo mode.
   */
  async rewrites() {
    const base = apiBase();
    if (base === null) return [];
    return [
      { source: "/api/auth/:path*", destination: `${base}/auth/:path*` },
      { source: "/api/v1/:path*", destination: `${base}/v1/:path*` },
    ];
  },
};

export default nextConfig;
