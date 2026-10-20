# FE-09 — Art direction audit and the new benchmark

Status: art direction approved on the Platform, Features and Security benchmark, then rolled out to every marketing page (branch `fe-09-art-direction`, from the approved FE-08 work). Before and after screenshots: `docs/screenshots/fe-09/before` (benchmark pages) and `after` (all ten pages).

## 1. Audit of the FE-08 pages (what was generic, and where)

| Pattern                                                        | Where it showed up                                           | Why it read as templated                                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **One hero skeleton on every page**                            | all ten pages                                                | A rule-prefixed eyebrow, a display-size title, a lead paragraph, a row of pills and two buttons, in the same order each time.                                      |
| **Zig-zag text-and-panel rows**                                | Platform (five rows), Features (six rows)                    | Identical "text left, framed panel right, then swap" structure repeated 11 times, with outlined numerals as the only variation.                                    |
| **Visuals that explained nothing**                             | Platform and Features panels                                 | Small illustrative panels (a list of three agents, a three-line audit) carried less information than the paragraph beside them, and were reused from the homepage. |
| **Pills everywhere**                                           | Security (a 12-row ledger of pills), every hero, every frame | Status was shown so often that it stopped meaning anything, and competed with the content.                                                                         |
| **A "three equal cards" architecture**                         | Security trust-boundary diagram                              | Three same-sized bordered cards with check lists. It said nothing about boundaries, enforcement points or where secrets live.                                      |
| **The same centred CTA band**                                  | the end of every page                                        | Centred heading, one sentence, two buttons, a radial glow. Identical on all ten pages.                                                                             |
| **Alternating full-bleed dark/light bands with equal padding** | every page                                                   | A predictable metronome of sections, each starting with an eyebrow and a display heading.                                                                          |
| **Rounded, bordered containers around everything**             | `Window`, `Callout`, panels                                  | The same radius and border applied to content that needed none.                                                                                                    |
| **Vague copy**                                                 | headings                                                     | "Six things, done carefully", "Start where agencies already work", "Know every agent…", "One checkpoint…" describe a mood, not the product.                        |

## 2. What changed, and why

**Structure: pages as short documents, not stacks of bands.** Every redesigned page is a restrained hero, then numbered chapters. Each chapter keeps its index and label in a narrow left margin (like a specification) and its content in the wide column beside it. The hero title is deliberately smaller than before (`page` size, about 56 px at most), with a 19-character measure, so it does not shout.

**The product is the centrepiece, not an illustration of it.**

- **Platform** opens with the intended action-request flow as a real table: five stations (AI agent → AgentAxio authorization → Human approval → Trusted executor → Destination API) against three sample requests. It uses the dashboard's own stage markers and keeps _requested, authorized, approved, executed_ and _denied_ as separate facts. The middle request is _approved but not yet run_, which is the distinction the whole product exists to keep. A small dot hops along the connectors (CSS only; it rests under reduced motion).
- **Features** is one large frame that swaps between six demonstrations, each built from the **actual dashboard components** (agent list, identity cards, permission summaries, approval card, activity rows with Details, the n8n integration card) on the dashboard's own neutral surfaces. Choosing a control changes the demonstration; the details sit beneath it.
- **Security** opens with a credible schematic: three zones, six numbered enforcement points (the trust boundaries from `docs/SECURITY.md`), and where each secret lives, followed by a table of what is enforced at each point and a custody table for the four kinds of secret.

**Less decoration, fewer pills.** Status is stated once per page in a single strip with a legend, and then used as quiet dot-and-word marks. The Security ledger became three plain columns (Built, Designed, Planned). No card frames, no icons-as-decoration, one soft light from the top left in each hero.

**Typography.** Existing families kept (Space Grotesk display, Geist body, Geist Mono labels). Two new heading sizes, `page` and `chapter`, tighter and smaller than the display scale. Text columns are capped at 58–62 characters; running text is 17 px; mono is used only for indices, labels and data.

**Distinct endings.** The identical CTA band is gone from these pages. Platform closes with a three-part "where this stands" and three plain links; Features with a ledger of what is not promised yet; Security with "what we do not claim" and the vulnerability-disclosure gap.

**Section transitions.** Dark-to-light hand-offs alternate between a hairline and a rounded overlap (`round`), instead of one treatment everywhere. Chapters are paired (two light, two dark) rather than strictly alternating.

**Copy rewritten to be specific.** Examples: _"Agents propose. AgentAxio decides. Only then does anything run."_ (Platform), _"The controls, as they appear in the product."_ (Features), _"No single part can decide, hold the keys, and act."_ (Security). Every status disclosure, scope limit and "not built" statement was kept.

## 3. Honesty rules still enforced

All product visuals carry "Conceptual demo · invented data · not connected" (frames) or "Conceptual … designed, not built" (diagrams). `marketing-pages.test.tsx` still fails on certifications, customers, testimonials, prices or percentages outside `data-not-claimed`; new tests (`art.test.tsx`) check the request-flow distinctions (approved is never shown as executed), that all six enforcement points appear on the schematic, and that the n8n demo is "Planned" and "Not connected" with no Connect button.

## 4. Not changed

The FE-07 dashboard, the homepage and its orbital hero, all routes, the six-page navigation, accessibility, legal disclaimers and pricing decisions. Remaining pages keep their FE-08 design until this direction is approved.

## 5. Rollout (done after approval)

| Page | Composition | Product shown |
|---|---|---|
| Developers | Hero that is the proposed contract itself: one request as a five-step sequence (workflow → AgentAxio → reviewer → executor → workflow) with readable, highlighted request and response bodies | Request, decision and status bodies; the nine-status lifecycle as a typographic ledger; the n8n workflow as a numbered strip |
| Solutions | One chapter per audience, each with a different arrangement (text / demo, demo / text, two demos under the text) | Real dashboard components: per-client agents, an approval card with the dashboard's disabled controls, activity records with Details, and an SDK sketch labelled as planned |
| Pricing | A three-column "plan shapes" ledger asking the same six questions of each plan, all answered "Not decided" | None, deliberately: no prices, no offer. Sizing versus safety, then an FAQ |
| About | An editorial statement, four principles, a roadmap ledger | None. "No borrowed credibility" is stated plainly |
| Contact | Reach-us list beside the form, a rule between them rather than a box | The validated form that never claims to send |
| Privacy, Terms | The same hero and chapter language, a sticky contents rail, inline review flags | None |

Every page now follows the same system: a restrained hero with one status strip, numbered chapters with the index in the margin, status words instead of pills, and an ending that is specific to the page (a row of links, a ledger, a disclosure) rather than a shared call-to-action band.

**Removed (no longer used):** `PageHero`, `FeatureRow`, `Window`, `PageCta`, `SectionHeading`, `StatusPill`, `Callout`, `TrustBoundary`, `AuthorizationFlow`, `PolicyPrecedence`, `RevocationTimeline`, `N8nWorkflow`, `ExecutorChecks`, `StatusLifecycle`, `ClientLanes`, `SdkSketch`, `AgentsPanel`. The homepage's own panels (`feature-panels`, `integration-flow`, `code-tabs`) are untouched.

## 6. Still true

The honesty rules, the claims guard test, accessibility, reduced-motion behaviour, the six-page navigation, every route, and the FE-07 dashboard and homepage are unchanged. Open launch items remain in `docs/FE-08-LAUNCH-BLOCKERS.md`.
