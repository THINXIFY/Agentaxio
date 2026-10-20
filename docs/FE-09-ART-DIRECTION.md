# FE-09 — Art direction audit and the new benchmark

Status: Platform, Features and Security redesigned as the visual-quality benchmark (branch `fe-09-art-direction`, from the approved FE-08 work). **Developers, Solutions, Pricing, About, Contact, Privacy and Terms are intentionally unchanged** until this direction is approved. Before and after screenshots: `docs/screenshots/fe-09/before` and `after`.

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

## 5. If approved: the rollout plan

1. Developers: code-forward composition with the proposed contract as the centrepiece (a real request/response/poll sequence, the nine-status lifecycle as a diagram), same chapter structure.
2. Solutions: one chapter per audience, each with a real demonstration (per-client agents, a policy for a SaaS agent, an approver's day).
3. Pricing, About, Contact: calmer, typographic compositions, with distinct endings.
4. Privacy and Terms: refine reading experience only.
5. Remove the now-unused FE-08 pieces (`PageHero`, `FeatureRow`, `Window`, `PageCta`, `TrustBoundary`, and so on) once no page uses them.
