# AgentAxio — Frontend Foundation, Homepage and Dashboard (FE-00 … FE-08)

Status: FE-00 foundation; FE-02/FE-03 homepage (redesign, performance); FE-04 dashboard redesign, simplified in FE-05; Obsidian Black × Midnight Violet adopted and the dashboard surfaces refined (FE-06/FE-07). FE-08 completes the marketing website (ten pages). Awaiting visual review. Frontend only; **no backend, auth, billing or deployment exists.** Screenshots: `docs/screenshots/fe-07-dashboard-refined/` (dashboard, current), `fe-06-violet-preview/` (approved concepts), `fe-05/` and `fe-04/` (earlier Lime dashboards), `fe-03/` (homepage, current), `fe-02/` and `fe-01/` (previous designs).

## 1. Documentation reconciliation (resolved 2026-10-20)

The owner approved frontend-first sequencing. The conflicts found in FE-00 were resolved in the documents themselves; no security requirement or backend acceptance gate was relaxed.

| # | Former conflict | Resolution |
|---|---|---|
| 1 | `CLAUDE.md` forbade a dashboard before backend use cases; "implement M01 before interfaces" | `CLAUDE.md` now has an approved **Development order**: frontend track (mock data, `apps/web` only) then backend track M01→M03. UI must never imply enforcement; sections without a use case stay "not built yet". |
| 2 | "No advanced visual work may substitute for negative security tests" | Kept. M01 remains the hard gate before real auth, data, integrations, billing or deployment (`CLAUDE.md`, `ROADMAP.md`, `CLAUDE-MILESTONE-01.md`). |
| 3 | `PHASE1-DECISIONS.md` excluded UI animations | Marketing motion is allowed in the frontend track with reduced-motion support; it never carries security logic. |
| 4 | `PRD.md` golden path used `refund.create` | Golden path is now `crm.lead.create` against a mock CRM; refund/payment/banking remain out of scope. |
| 5 | `ARCHITECTURE.md` used `/v1/decisions`, `approval_required` | Standardized on `N8N-ENFORCEMENT.md`: `POST/GET /v1/action-requests`; statuses `denied`, `pending_approval`, `approved`, `queued_execution`, `running`, `succeeded`, `failed`, `expired`, `unknown`; effects `deny`, `require_approval`, `allow`, `implicit_deny`. `SECURITY.md` and `CLAUDE-MILESTONE-01.md` aligned. |
| 6 | Doc paths in `CLAUDE.md` | Now point at `docs/`. |
| 7 | Brand palette | Now Obsidian Black × Midnight Violet in `CLAUDE.md`, `ROADMAP.md`, `PHASE1-DECISIONS.md` (previous: Electric Lime, Orange, earlier Violet). |

`lib/contracts` is the frontend mirror of that vocabulary; replace it with `packages/contracts` when M01 creates it.

Brand tagline "Control Every AI Action" is positioning only; `SECURITY.md` forbids implying universal control. Copy uses "AgentAxio-controlled enforcement points" wording and states the bypass limitation (direct credentials) on the homepage.

## 2. Structure

```
apps/web/src
  app/                    routes (App Router)
    (marketing)/          header + footer layout; page.tsx = FE-02 homepage
    dashboard/            AppShell layout + Overview, Agents, Settings (Appearance) + planned sections
    design-system/        internal style guide (noindex)
  styles/
    tokens.css            ALL design tokens (primitives + semantic light/dark + .surface-* scopes)
    theme.css             Tailwind v4 @theme mapping (default palette removed; semantic roles only)
    base.css utilities.css motion.css
  components/
    ui/                   Button, Badge, Card, Field/Input/Textarea/Select, Switch, Table, Drawer, typography, misc
    layout/               Container, Section, MarketingHeader/Footer, AppShell, SidebarNav, PageHeader, PlannedPage
    marketing/            hero, hero-visual (isometric plane stack), platform / features / product / workflow /
                          developers / pricing / cta sections, product-preview, feature-panels, integration-flow, code-tabs
    domain/               StatusBadge (typed against the API contract), StatCard
    feedback/             DemoBanner / DemoBadge
    motion/               Reveal, RevealStagger, Parallax, ScrollLine, TiltIn (GSAP)
    theme/                ThemeProvider, ThemeSwitcher (Light/Dark/System)
    brand/                Logo (placeholder mark)
  config/                 site.ts, navigation.ts (HOME_SECTION_IDS drives section ids AND nav links)
  lib/                    cn, gsap (single registration point), motion, format, iso (tested isometric geometry), contracts/
  mocks/                  clearly-labelled sample data + illustrative decision trace (API seam)
  hooks/ test/
```

## 3. Design system rules

- Components use **semantic roles only** (`bg-surface`, `text-muted-foreground`, `bg-primary`, `text-primary-text`…). The default Tailwind palette is removed, so a raw colour fails the build. Add a role in `tokens.css` first.
- Light/dark are values of the same roles, so no `dark:` variants are needed. `.surface-dark` / `.surface-light` force a palette on a subtree (marketing sections, header). The forced-surface paint rule lives in `@layer base` so utilities such as `bg-surface` can override it.
- **Palette (Obsidian Black × Midnight Violet):** obsidian `#06050C`, midnight navy `#101024`, deep indigo `#252044`, electric violet `#7864F6`, soft lavender `#B9ACFF`, arctic white `#F5F4FA`. Extra neutrals (muted text, surfaces, borders) are defined for both themes in `tokens.css`.
- **Violet rules (WCAG-driven):** `#7864F6` is a *fill*, always with obsidian text (`#06050C`, 4.8:1; white on it is 4.25:1). As text/icon/link, violet is soft lavender `#B9ACFF` on dark and deep violet `#4B38C9` on light (`primary-text`). Keep it restrained: primary action, active item, focus, chart accents.
- **Semantic security colours stay separate from violet:** success is emerald, warning (pending) amber, danger (denied) red, info (approved/queued) a cyan-blue so it cannot read as the brand violet. Status is always text + icon + colour.
- **One-file re-brand:** `no-hardcoded-colors.test.ts` fails if any component, stylesheet or config file contains a hex colour (only `styles/tokens.css` and `config/theme-color.ts` are allowed).
- `tokens.contrast.test.ts` parses `tokens.css` and enforces WCAG 2.2 AA (4.5:1 text, 3:1 input borders/focus ring/status icons) in both palettes.
- Fonts: Geist (UI), Geist Mono (identifiers), Space Grotesk (display), self-hosted via `next/font`.

## 4. Motion and performance rules

- **Hero text never waits for JavaScript:** the hero entrance is pure CSS (`.hero-rise`, `--d` delay); a test fails if hero elements use `data-reveal*`.
- **GSAP is lazy:** imported dynamically after hydration in idle time, one idle slot per component (no long task), and never downloaded for reduced-motion users. Use `useGsapEffect` from `@/lib/gsap`; never import `gsap` directly. `@gsap/react` was removed.
- Every animation runs inside `gsap.matchMedia()` with `(prefers-reduced-motion: no-preference)`; reduced motion shows the final state immediately (the hero artwork becomes a still composition).
- Entrance states are CSS-hidden only under `html.motion-ok`, which an inline bootstrap sets only when JS runs and reduced motion is **not** requested; it self-removes after 4 s if GSAP never initialises. No-JS and reduced-motion users never see hidden content.
- Animate `opacity`/`transform` only. The hero timeline is paused while off-screen.

## 5. Mock data rules

- Everything in `src/mocks` is invented; ids start `mock_`; emails use `@example.test`; parameters are exactly the strict `crm.lead.create` schema (`full_name`, `email`, `company`).
- Any screen rendering mocks shows `DemoBanner`/`DemoBadge` or an explicit "sample data" note. Homepage artwork states it is illustrative.
- `traceFor()` only *renders* a story consistent with a request's status; it performs no authorization.
- Pages read mocks via functions in `mocks/index.ts`: swap those for typed API fetchers later.

## 6. Homepage (FE-02) design and content rules

- **Direction:** asymmetric hero with an original isometric "glass plane" artwork (01 Agents → 02 Identity → 03 Policy gateway → 04 Executor + audit). Pointer parallax (fine pointers only), scroll recede, packets that are allowed / held for review / denied. Elsewhere: an editorial numbered list instead of cards (platform), a hairline "blueprint" mosaic of unequal cells (features), a realistic dashboard window that tilts in on scroll (product), four staged workflow columns with outlined numerals (how it works), a vertical n8n sequence plus tabbed contract examples (developers), and an honest pricing preview.
- **Rhythm:** hero (dark) → platform (soft white) → features (dark) → product (soft white, dark window) → workflow (dark) → developers (charcoal) → pricing preview (soft white) → CTA + footer (dark). Light sections overlap the previous one as a rounded "sheet".
- **Headline:** "AI Moves Fast. Stay in Control." Hero secondary CTA "View Documentation" links to `/#developers` because no documentation site exists; the n8n contract preview is the only documentation-style content.
- **Pricing preview:** contains no prices, tiers or capabilities. It lists what is decided (usage metering never changes policy evaluation; billing comes after the core and beta; validate willingness to pay first, per ROADMAP/PRD) and what is open (provider, plans, prices, free tier), with a visibly disabled "not published" control.
- Only implemented destinations are links: homepage anchors, `/dashboard`, `/dashboard/agents`, `/dashboard/settings`. Security, Contact and legal pages are not listed until built. Tests fail on unknown routes, missing anchors, invented prices/statistics/customers/certifications, or any enabled control that does nothing (Approve/Reject are disabled and labelled).
- The n8n section is labelled "Contract preview · V1 design — the API is not available yet", lists SDK and MCP gateways as "not started", and states the direct-credentials bypass limitation.
- Decorative lettering (outlined numerals, footer wordmark) is drawn with CSS `::before` from `data-text`, so it is not DOM text and does not create contrast or screen-reader noise.
- The site is `noindex` until real content ships.

## 7. Dashboard (FE-04, simplified in FE-05)

FE-05 deliberately **reduced** the FE-04 dashboard. Guiding rule: if a chart, button, label or section doesn't help someone understand or do something important, simplify or remove it. Screenshots: `docs/screenshots/fe-05/`.

**Shell and surfaces (FE-07).** Two calm layers. The **sidebar** is always the darkest surface (`#06050C`) in Light and Dark alike. The **workspace** (top bar and page) is neutral: near-black `#111116` in Dark, soft off-white `#F4F4F7` in Light (never pure white), with cards one step above (`#18181E` / `#FCFCFD`), hover `#202028` / `#F1F1F5`, hairline borders `#26262F` / `#E3E3EA`. These live in `styles/tokens.css` under `.dashboard-scope` (set on the dashboard root, which is also the Radix portal target via `PortalContainerProvider`, so menus, popovers and the drawer inherit them); the marketing site keeps the base palette. Violet appears only as an accent: active nav item, links, focus, chart bars. Lg+: fixed 16 rem sidebar; <lg: the same menu in a drawer. Top bar: notifications popover, Light/Dark/System switcher (hidden on small screens; the same choice lives in the account menu), account menu. Content is capped at 72 rem and aligned with the top bar. Body text is 16 px or larger.

**Navigation.** Six primary items, always visible on desktop and in the mobile drawer: Overview, My Agents, Permissions, Approvals, Activity, Integrations. A quieter secondary section at the bottom of the sidebar holds Settings, Team & Organization and Billing. Agent identities are reached from My Agents (the route stays, and My Agents stays highlighted). **Route paths did not change** (`/dashboard/policies` is "Permissions", `/dashboard/audit` is "Activity") so the future backend contract is untouched; `/dashboard/agents/[id]` is the only new route (the "View details" page, 404 for unknown ids). `navigation.test.ts` fails if any link has no page.

**Pages.**

- *Overview*: three summary cards with small sample trend lines (Connected Agents, Pending Approvals, Blocked Actions), one "Recent requests" chart (derived from the sample requests, with a text table), My Agents, Pending Approvals, Recent Activity. No filters or integration widgets. "Connected Agents" counts agents that are *active in the sample data*; its helper text says so, and no real tool is linked.
- *My Agents*: one list (name, purpose, Active/Suspended, View details). *Agent details*: about, access-key preview, what it can do, recent activity.
- *Permissions*: explains the three possible answers (Allowed / Needs approval / Blocked, default blocked) and shows sample per-agent rules read-only. Editing is **not built**, and the page says so.
- *Approvals*: what is waiting for a person (cards with a plain sentence, why a person is asked, disabled Approve/Reject) and what was already reviewed.
- *Activity*: newest first, four filters (All / Needs attention / Blocked / Completed), pagination, no table. Each item opens a **Details** disclosure with the precise record.
- *Integrations*: featured n8n card ("Planned · first integration", "Not connected", "Not available yet · shown for demonstration only"), a three-step "How it will work", and TypeScript SDK and additional integrations as **Planned**. No Connect buttons, no connected states.
- *Settings* (appearance + read-only workspace), *Team & Organization* and *Billing* (honest "Not built yet" placeholders; Billing states pricing is undecided and shows no prices).

**Plain language.** `lib/plain-language.ts` is the single place for everyday wording: Needs approval, Blocked, Completed, "Approved · not run yet", Didn't complete, "Asked to add a lead to the CRM: …" instead of `crm.lead.create`. Precise terms stay where they belong: API contracts, `lifecycleFor()`, and the Details disclosure (Authorization / Approval / Execution, request id, action key). Unfamiliar terms are explained by `HelpTip`, a "?" button that opens a popover (keyboard, screen-reader and touch friendly; never hover-only), and by visible helper text.

**Status model (unchanged in substance).** Authorization, approval and execution remain **three separate facts** (`lifecycleFor()`); only a `succeeded` request is shown as completed, and an approved one reads "Approved · not run yet". `plain-language.test.ts` enforces that no other status claims completion.

**Demo-only controls.** Approve / Reject use `aria-disabled` (focusable, so the explanation is reachable), do nothing on click, and show visible text "Demo only · not connected to a backend". Overview shows pending requests with a Review link instead of buttons. The only real interaction on data is copying a sample access-key *preview* (toast: real secrets are never kept in the browser).

**Data.** `mocks/dashboard.ts` builds on the base mocks (used by the homepage, untouched). Everything is invented, labelled, dated "as of 20 Oct 2026 10:00 UTC" and read through functions (the API seam).

**Components.** ui/: tabs, dropdown-menu, popover, tooltip, toast, pagination. dashboard/: MetricCard, Panel, AgentList, ActivityItem, RequestDetails, ApprovalCard/PendingItem, ApprovalsView, ActivityHistory, PermissionSummary, RequestLifecycle, PlainStatusBadge, HelpTip, CredentialPreview/AgentIdentityCard, FeaturedIntegration/PlannedIntegrations. Removed in FE-05: charts, agents table, audit table, identity grid, workspace menu, collapsible sidebar.

**Motion.** Short and predictable: card/row hover tint, popover/tab fade, a 320 ms page fade via `template.tsx`; everything collapses to the end state under reduced motion.

## 8a. Midnight Violet adoption (2026-10-20)

The two Midnight Violet concepts (`docs/screenshots/fe-06-violet-preview/`) were approved and adopted; the development-only `/preview` routes were removed. The palette now lives in the base roles of `styles/tokens.css`. The homepage uses the new centered hero (original orbital SVG artwork in `components/marketing/orbit-art.tsx`, CSS-only drift that rests under reduced motion) and every other section re-skins through tokens alone. The dashboard adopted the concept's trend lines and chart, then (FE-07) its surfaces were refined to be darker and more neutral, with a polished Light theme. `tokens.contrast.test.ts` checks all four palettes (light, dark, dashboard light, dashboard dark).

## 8b. Marketing website (FE-08)

Ten pages under `app/(marketing)`, all in the existing Obsidian Black × Midnight Violet system and on the shared header and footer. The homepage and the FE-07 dashboard were not redesigned; only their navigation links changed.

| Page | What it is | Distinctive composition |
|---|---|---|
| `/platform` | Identities, permissions, approvals, activity, revocation, and a four-step workflow | Path-of-one-request diagram in the hero; five numbered rows alternating dark and light |
| `/features` | Agent management, identity & access, permission policies, human approvals, activity & audit, n8n | Sticky "on this page" bar; six framed panels with status pills |
| `/solutions` | Agencies, SaaS developers, businesses using AI agents, with illustrative examples | Per-audience visuals (client lanes, SDK sketch, approval and audit panels) and an honest fit check |
| `/security` | Intended architecture, default deny, credentials, audit design, threats, gates | Built / designed / planned ledger, trust-boundary diagram, "what we do not claim" |
| `/developers` | n8n-first strategy, request lifecycle, planned endpoints, trusted executor, example responses | Code-forward hero, workflow diagram, the nine contract statuses, proposed-contract labels |
| `/pricing` | Plan shapes and what may differ, with **no prices** | Three working-name shapes, "size, not safety", FAQ |
| `/about` | Mission, principles, vision, honest roadmap | Editorial statement, principles with scroll-drawn rule |
| `/contact` | Pre-launch contact options and a form that never claims to send | Validated form with an explicit "nothing was sent" state |
| `/privacy`, `/terms` | Clearly marked drafts | Contents rail, inline "needs review" flags, closing checklist |

**Honesty rules (enforced by `marketing-pages.test.tsx`).** Every capability carries a `StatusPill` (`built`, `demo`, `designed`, `planned`, `proposed`, `draft`), so no page can imply something exists that does not. Pages may not mention certifications, compliance regimes, testimonials, prices or percentages except inside an element marked `data-not-claimed` (statements that *deny* a claim). The only external link is the public repository, with `rel="noopener noreferrer"`.

**Contact form.** Client-side validation with an announced error summary and focus management. A valid submission makes **no network request** and shows "This form isn't connected yet. Nothing was sent.", keeping the visitor's text with Copy and Edit actions. There is no success state anywhere.

**Reusable pieces** (`components/marketing/site/`): `PageHero` (CSS-only entrance, so titles never wait for JavaScript; split / centre / wide layouts), `FeatureRow` (window or plain treatment), `Window`, `SectionHeading`, `PageCta`, `StatusPill`, `Callout`, diagrams built from semantic lists (`AuthorizationFlow`, `TrustBoundary`, `PolicyPrecedence`, `RevocationTimeline`, `N8nWorkflow`, `ExecutorChecks`), `StatusLifecycle` (typed against the contract statuses), `ContactForm`, `LegalDocument` and `ReviewFlag`. Existing homepage panels (`IdentityPanel`, `RuleScan`, `ApprovalPanel`, `AuditPanel`, `IntegrationFlow`) and `CodeTabs` are reused.

**Navigation.** `marketingNav` is the six primary pages; About, Contact, Privacy and Terms are in the footer (`companyNav`, `legalNav`). `navigation.test.ts` fails if any link has no page. The header marks the current page with `aria-current="page"`; the mobile menu lists the same pages.

**Motion.** Hero entrances are CSS only. Below the fold, `Reveal`, `RevealStagger`, `ScrollLine` and `RuleScan` (GSAP, lazily loaded) animate opacity and transform only; reduced motion shows everything immediately and never loads GSAP.

Open items before launch (entity details, contact addresses, pricing, legal review) are in `docs/FE-08-LAUNCH-BLOCKERS.md`.

## 8. Deferred on purpose

Authentication/sessions and role-based UI (server-side only), CSP (needs a nonce strategy with auth), remaining marketing pages (Pricing, Security, Contact, legal), real brand mark sign-off, error tracking, e2e tests in CI, i18n, billing. Baseline security headers are set in `next.config.ts`.

## 9. Commands

```
corepack pnpm install
pnpm dev          # http://localhost:3000
pnpm check        # format:check + lint + typecheck + test
pnpm build
```
