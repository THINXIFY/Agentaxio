# FE-08 — Marketing website: launch blockers and open decisions

Status: written at the end of FE-08 (2026-10-20). The marketing website is complete as a **pre-release** site on clearly labelled sample data. Nothing below stops further frontend work; each item blocks **publishing the site as a launched product**, or opening it to real users.

## Needs founder decisions or information

| # | Item | Where it shows up | Why it blocks launch |
|---|---|---|---|
| 1 | Legal entity name, registered address, legal and privacy contacts | `/privacy`, `/terms` (flagged inline) | The legal pages deliberately state none of this. Inventing it would be a false legal statement. |
| 2 | A real contact address and a response expectation | `/contact` ("Not published yet") | The contact form is not connected and cannot send anything. |
| 3 | A security contact and vulnerability-disclosure process | `/security`, `/contact` | Must exist before any private beta (docs/SECURITY.md gate 2). |
| 4 | Team, company history and funding details (if any) to publish | `/about` | Intentionally omitted. No team, investors, customers or history have been invented. |
| 5 | Pricing, plan names, limits, billing provider and country eligibility | `/pricing` | Pricing is undecided. Plan names (Builder, Team, Organization) are working labels only. |
| 6 | Domain, trademark clearance for "AgentAxio", hosting provider and region | privacy draft, `config/site.ts` | Open decisions in docs/PRD.md. The site is `noindex` until these are settled. |

## Needs legal review before the pages are final

- **Privacy Policy** (`/privacy`): purposes, legal bases, retention, processors, international transfers, data-subject rights, children's data, cookie/local-storage wording, DPO or representative. The draft describes only what the site does today (theme preference in `localStorage`; no analytics; contact form sends nothing) and **must be re-verified** if any third-party script, font host or analytics is ever added.
- **Terms of Service** (`/terms`): acceptable use, warranties and liability limits, ownership, paid-plan terms, service levels, governing law and jurisdiction, data-processing terms.

Both pages are labelled "Draft · not reviewed · not in effect" and end with a checklist ("Before publication").

## Product and engineering gates (unchanged by FE-08)

The website describes the product as **designed, not built**. These gates are untouched and still apply:

- No enforcement, accounts, credentials, integrations or billing exist. The backend milestones (M01 → M03) have not started.
- `docs/SECURITY.md` gate 1 (local prototype tests), gate 2 (external private beta) and gate 3 (sensitive production, with independent assessment) are all "not yet reached". The Security page says so.
- The Developers page shows a **proposed** n8n contract (`POST /v1/action-requests`, `GET /v1/action-requests/:id`). The API is not implemented and its exact shape will be fixed by a generated, tested OpenAPI spec.
- The TypeScript SDK sketch on `/solutions` is illustrative only. No SDK exists.

## Content that must be re-checked whenever the product changes

- Every **status pill** (Built / Demo UI / Designed / Planned / Proposed / Draft) is the single source of truth for what the pages claim. Change a pill the moment the underlying capability changes, and never the other way round.
- `marketing-pages.test.tsx` fails if a page mentions certifications, compliance regimes, testimonials, prices or percentages outside an element marked `data-not-claimed`. Keep that guard.
- The footer line "Not a certified or independently audited security product" stays until an independent assessment is complete and published.

## Technical follow-ups (not launch-blocking)

- The contact form needs a backend (or a hosted form service chosen by the founders) and an explicit decision on spam protection and data handling. Only the "unavailable" branch of `ContactForm` needs to change.
- `robots` is `noindex, nofollow` site-wide. Remove it, and add a sitemap, only when the site is meant to be found.
- Open Graph images and per-page social metadata have not been created.
- The repository has no deployment configuration by design.
