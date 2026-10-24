# BE-01 B1 — Focused security review

Scope: the committed B1 code (`packages/contracts`, `packages/policy`) at `8e3f3b7`, plus the fixes made in this review. Method: read the code, probe suspected weaknesses with throw-away tests against the real implementation, fix what was confirmed, add regression tests, and **mutation-check** each fix (revert it, confirm a test fails, restore it). This is a self-review by the author of the code. It is not independent assurance and does not replace the external review required by `docs/SECURITY.md` gates 2 and 3.

Frontend and the `apps/api` scaffold are unchanged. No feature was added and the policy language was not expanded.

## 1. Result by review item

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Precedence `deny > require_approval > allow > implicit deny` | **Holds.** | All 8 combinations of effects present × 3 priority arrangements × 2 orderings, with the winning effect always given the lowest priority; plus a property test over random sets and a permutation-invariance property. Mutation (reversed precedence order) fails several tests. |
| 2 | Malformed policies fail closed | **Holds after two fixes** (defects D6, D7, D8). | 17 structurally broken policy shapes, a `__proto__` own key, junk elements (property test, 100 runs), hostile Proxy and throwing getter. All produce `deny` / `EVALUATOR_ERROR`. 500-run junk-input property: never throws, never allows. |
| 3 | Cross-organization isolation | **Holds** for what a pure function can guarantee (section 4). | A policy for the action that belongs to another organization makes the whole evaluation fail closed, in any position and even when disabled. Properties: with a foreign-organization policy in the list the result is never an allow; a principal whose organization has no policies is always denied. |
| 4 | Canonical JSON and digests deterministic | **Holds after one fix** (D2). | 500 random nested values: identical output for any key insertion order, and the output parses back to the same data. Keys sort by UTF-16 code unit (RFC 8785). Numbers use ECMAScript formatting, `-0` equals `0`. Lone surrogates are escaped. Digest changes for every bound element. |
| 5 | Execution-related transitions | **Holds after one fix** (D1). | The full 9×9 matrix is checked against an independently written list of exactly 12 legal pairs. Terminal states have no exits; `succeeded`/`failed`/`unknown` only via `running`; `running` only via `queued_execution`. |
| 6 | Boundary conditions | **Holds after fixes** (D2–D5, D9). | Duplicate JSON keys, NFC/NFD, whitespace variants, invisible characters, lone surrogates, astral characters, numbers, depth/width, inherited properties, null-prototype objects, hostile objects. See section 3. |
| 7 | Field names and operators allowlisted | **Holds after two fixes** (D6, D7). | Operators: closed set of five in the schema (the `discriminatedUnion`). Fields: now checked against the action catalog at write time **and again on every evaluation**, using own-property lookup. |
| 8 | An approval requirement cannot be bypassed by a general allow | **Holds.** | Tested with allows at maximum priority, agent- and environment-scoped, conditional, 200 of them in any order. The only ways to lift an approval requirement are for its scope or conditions not to match, or for it to be disabled or absent, all by design (section 5). |
| 9 | Disabled/draft policies: evaluator or loader? | **Both, with different roles.** Recommendation in section 5. | Behaviour pinned by tests. |
| 10 | Pure-function vs database guarantees | Section 4. | |

## 2. Defects found and fixed

All were confirmed against the real code before fixing. None was exploitable end to end today, because no HTTP layer, database or executor exists yet. Severity is the severity they would have had once B2–B4 existed.

| ID | Defect | Severity | Fix |
|---|---|---|---|
| D1 | `canTransition("constructor", …)` threw, and `isTerminal("constructor")` returned `false` (and `isTerminal("toString")` `true` by accident), because statuses were looked up on the prototype. Statuses arrive from the database as plain strings. | Low–Medium: an unrecognised status was treated as non-terminal | Own-property lookup. An unrecognised status has no successors, so every transition from it is illegal and it counts as terminal. |
| D2 | `canonicalJson([ , 1])` returned `[,1]`, which is not JSON. | Low: digest of invalid JSON | Sparse arrays and arrays with extra properties throw. |
| D3 | Free text accepted **lone surrogates**. They cannot be stored as UTF-8: Postgres would reject the JSON escape or replace the character, so the stored value would differ from the digested one. | Medium: failed or desynchronized digest at execution | Rejected. |
| D4 | Free text accepted invisible characters: Unicode **tag characters** (U+E0000 block, used to smuggle hidden instructions), soft hyphen, Arabic letter mark, Mongolian vowel separator, interlinear annotation marks, U+FFFE/U+FFFF. | Medium: a reviewer could be shown text that differs from what an agent or downstream tool reads | Rejected. Zero-width joiners were already rejected, so joined emoji sequences are refused in V1 (accepted trade-off). |
| D5 | **Exact-match rules could be dodged with whitespace.** "Blocked  Corp" (two spaces) or "Blocked" and "Corp" joined by a no-break, em or ideographic space did not equal "Blocked Corp", so a `deny` or `not_in` rule written for the plain form did not match. | **Medium–High** for deny-lists | Every run of Unicode whitespace is collapsed to one ASCII space after NFC normalization. The unsafe-character check runs **before** this, so a line or paragraph separator is rejected rather than converted to a space. |
| D6 | Write-time validation looked fields up with `fields[name]`, so `constructor`, `toString`, `hasOwnProperty` passed the "field is in the catalog" check. | Medium: weakens the allowlist (item 7) | Own-property lookup. |
| D7 | The evaluator did **not** re-check the allowlist. A policy stored without passing write-time validation (a bug, a direct database edit, a future code path) could use `email_domain_in` on a free-text field, or name a field outside the action, and still apply. A policy for an action that had since left the catalog could still return `allow`. | **Medium–High**: contradicted "defence in depth" in the design | The evaluator calls the same `validatePolicyForAction` on every candidate policy and fails closed if it is invalid; an action outside the catalog is an evaluator error. |
| D8 | Several versions of the same policy, or the same version id twice, were all applied. `PHASE1-DECISIONS` says conflicting configuration denies. | Medium: a loader bug could make a superseded rule take effect | More than one version per policy, or a repeated version id, fails closed. |
| D9 | `validateActionRequest` could throw on a hostile object, and accepted objects with inherited properties (read as if the caller had sent them). | Low (JSON bodies cannot do this; programming errors and prototype pollution could) | Never throws; only plain objects (prototype `Object.prototype` or `null`) are accepted, for the body and for `parameters`. |

Process note: while making D5 the regular expression was first written as `/s+/` (backslash lost in shell quoting). The new tests caught it immediately because it replaced the letter "s" in "leads". This is the reason to keep tests that assert the exact stored value rather than only `ok`.

**Mutation results:** reverting any one of the fixes D1–D9 makes at least one test fail, except one redundancy: removing the explicit "action not in catalog" check does not fail a test, because the allowlist check in D7 rejects any policy for such an action anyway. Both layers are kept.

## 3. Boundary behaviour (what is guaranteed and what is deliberately not)

- **Duplicate JSON keys:** `JSON.parse` keeps the last one before the contracts package sees the data. The value that is digested, shown to the approver and executed is therefore a single, known value, and a body with duplicate keys produces the same digest as the equivalent single-key body (tested). A *different* parser upstream (for example in n8n) could pick the first value; that mismatch can only affect what the agent believes it sent, not what AgentAxio approves or executes. Requirement for B4: parse with the framework's secure JSON parser and **consider rejecting duplicate keys outright**.
- **Numbers:** parameters accept strings only (every number, boolean, null, array and object is rejected). `canonicalJson` is strict for any future use: ECMAScript number formatting, `NaN`/`Infinity` throw.
- **Nesting:** `canonicalJson` throws beyond depth 16. The request validator never walks nested values (a deep value fails the string check at once; 20,000-deep and 100,000-wide inputs are rejected quickly in tests). **The HTTP body-size limit (B4) is the real bound.**
- **Unicode:** NFC only. There is no compatibility folding (NFKC), so full-width and look-alike (homoglyph) characters stay distinct, and matching is **case-sensitive and exact**.

## 4. What B1 guarantees, and what needs the database (B2) or later slices

### Guaranteed by the pure functions (B1, tested)

| Guarantee | Where |
|---|---|
| Deterministic, side-effect-free decision; same input → same output; inputs not mutated | `evaluatePolicy` |
| Precedence deny > require_approval > allow > implicit deny | `evaluatePolicy` |
| Any malformed, conflicting, non-allowlisted, wrong-organization input → `deny`/`EVALUATOR_ERROR`; never throws | `evaluatePolicy` |
| Policy conditions use a closed set of fields (per action) and five operators; no regex, scripting or model | contracts schema + evaluator re-check |
| Normalized, bounded, safe parameter text; strict schema; no tenant/agent/credential fields accepted | `validateActionRequest` |
| Same normalized request → same canonical JSON → same digest; any bound change → different digest | `canonicalJson`, `computeActionDigest` |
| The set of legal status transitions | `canTransition` |

### NOT guaranteed by B1: requires database enforcement or a later slice

| Needed property | Why a pure function cannot provide it | Planned enforcement |
|---|---|---|
| **Policies supplied belong to the caller's organization and are the current ones** | The evaluator can only compare the organization id *on the data it is handed*. If the loader passes the wrong organization's rows *with that organization's id on the principal*, nothing detects it. | B2: `organization_id` on every table, composite foreign keys, forced RLS keyed to the authenticated organization; B4: the loader takes the organization **only from the authenticated credential**. |
| **The principal is who they say** | `principal` is an input. | B3: credential → agent → organization/environment derived from the database, never from the request. |
| **One current version per policy; immutability of versions** | The evaluator can detect duplicates but cannot stop edits. | B2: `policy_versions` without `UPDATE`/`DELETE` grants; `current_version_id` constraint. |
| **Status transitions cannot be bypassed** | `canTransition` is advisory code. | B2: a `CHECK`/trigger over the same 12 pairs (generated from `allTransitions()`); a test asserts the database matrix equals the code matrix. |
| **Atomic, single-use grants; idempotency; no duplicate execution** | Needs transactions and unique constraints. | B2/B4/M02: `UNIQUE` keys, atomic claim, concurrency tests (S11, S12). |
| **Stored parameters equal the digested ones** | The digest is only as good as the comparison at execution. | M02: the executor recomputes the digest from stored parameters before acting. |
| **Revocation and policy change between approval and execution** | Time and state. | M02: re-evaluate and re-check agent/credential/environment inside the claim transaction. |
| **Audit written with the decision; append-only** | I/O. | B2/B4: same-transaction insert; no `UPDATE`/`DELETE` grants. |
| **Request size and rate bounds; policy-count bound** | Not in scope of pure code. | B4: body limit, rate limits; B2: limit on policies per organization. |
| **Every route authenticated and fail-closed on dependency failure** | HTTP layer. | B3/B4: route registry test; `503` on any dependency failure. |

## 5. Disabled and draft policies (item 9)

Recommendation: **the trusted policy-loading layer selects policies; the evaluator keeps its checks as a second line of defence.**

1. **Loader (B4), in SQL:** return only the *current* version of each policy, for the authenticated organization, that is `enabled`, in scope for the agent's environment, for the requested action. "Draft" has no representation in the data model: a draft is simply not the current version and not enabled, so it must never be loaded. Filtering in SQL also keeps the number of rows bounded.
2. **Evaluator:** continues to ignore `enabled: false`. The reasons to keep it: a loader bug must not turn a switched-off allow into an allow (or ignore a switch-off of a deny), and the behaviour is pinned by tests. It does **not** silently skip corrupt disabled policies: a malformed disabled policy for the action still fails closed, so corruption is visible instead of hidden.
3. **Audit:** the decision already records `matchedPolicyVersionIds`. When the loader is built it should record the set of loaded version ids and the organization's `policy_epoch` with the decision, so "which policies were considered" is reconstructable without relying on the evaluator to report what it skipped.
4. **Operational note:** because corrupt disabled rows block the action, the policy-write path (management API, M02) must validate with `validatePolicyForAction` and never store an invalid policy.

## 6. Residual risks (accepted for now, not fixed)

| Risk | Why it remains | Guidance |
|---|---|---|
| **Deny-lists on free text are unreliable.** Matching is exact and case-sensitive, so "BLOCKED CORP", a different spelling, or a homoglyph does not match a rule for "Blocked Corp". | Case folding, NFKC or fuzzy matching would be a language change; the brief says not to expand the policy language. | Prefer **allow-lists** (`in`, `email_domain_in`) and `require_approval` for anything sensitive, because a miss fails safe. Treat a `deny` on a free-text field as a convenience, not a control. A later decision may add case-insensitive comparison. |
| Joined emoji sequences and some scripts that use ZWJ/ZWNJ are refused | Those characters are also a spoofing vector. | Revisit if real users need them. |
| Homoglyph look-alikes in names and company text | Not detectable by a deterministic rule. | The approver sees the exact value; the review screen must render it escaped. |
| `canonicalJson` and `computeActionDigest` throw on bad input | Intentional: a digest must never be computed over something that was silently altered. | Callers (B4) must catch and map to an invalid request or `503`, never to an allow. |
| Unbounded policy-list size | The evaluator parses every candidate policy for the action. | Bound in the loader/database (B2/B4). |
| The principal and the policy organization are both caller-supplied | See section 4. | Enforced by authentication and the database, not by this package. |

## 7. Requirements carried into later slices

- **B2:** generate the status `CHECK` from `allTransitions()` and test equality; `policy_versions` immutable; unique `(organization_id, id)` and composite foreign keys; forced RLS; a test that no tenant table lacks `organization_id`.
- **B3:** organization, agent and environment derived from the credential only.
- **B4:** secure JSON parse (consider duplicate-key rejection); body-size limit; catch exceptions from `validateActionRequest`/`computeActionDigest`/`evaluatePolicy` as fail-closed; the loader rules in section 5.
- **M02 (important):** at claim time the policy is re-evaluated. A request that was **allowed** at submission but is `require_approval` at claim time has **no approval** and must be denied (`POLICY_CHANGED`). A `require_approval` result at claim time is acceptable **only** if an approved approval exists for the **same digest**. The claim must never treat "approved earlier" as a substitute for a fresh deny check.

## 8. Test totals after this review

`pnpm check` (format, ESLint, TypeScript, tests) passes: web 583, API scaffold 3, contracts 74 (was 50), policy 54 (was 32).
