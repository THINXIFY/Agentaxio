import type { NextConfig } from "next";

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
};

export default nextConfig;
