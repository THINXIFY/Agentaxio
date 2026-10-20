export const siteConfig = {
  name: "AgentAxio",
  tagline: "Control Every AI Action",
  /**
   * Positioning copy must stay within docs/SECURITY.md "claims we can make":
   * authorization and human approval for explicitly integrated actions, not universal agent control.
   */
  description:
    "Authorization, human approval and audit for AI agent actions that run through AgentAxio-controlled enforcement points.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;
