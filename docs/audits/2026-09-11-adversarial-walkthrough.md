# Adversarial walkthrough execution — 2026-09-11

Walkthrough revision: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` on `adversarial-completion`.
Starting baseline: `5f8743915a44dd8e63039e99c3162befdd14a40d`.
Authority: `.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md`.

## Result and evidence boundary

All 62 baseline scenarios were reconciled against current source, a fresh isolated full-suite run, newly connected browser batches, and exact-lineage evidence where reuse is named. Totals: **49 Proven, 8 Source only, 3 Gated, 2 Not reviewed, 0 Failure** after repairing the one demonstrated failure. All 57 scenarios locally runnable inside the authorized no-provider/no-deploy boundary received fresh test/source execution and either fresh or explicitly reused connected proof; Source only means that execution did not satisfy the entire expected outcome. The five excluded boundaries are the O08/X04/X09 policy/legal gates and O12/U06 manual print/assistive-technology checks.

No real email, Slack, Square, QuickBooks, payment, deployment, credentials, physical warehouse action, legal filing or assistive-technology run occurred. Provider results are deterministic fixture proof only.

- Runtime: one isolated reset/fixture owner, API `54351`, Postgres `54352`; Next `:3219`; browser session `adversarial-completion`.
- Fresh base suite: **203 files / 1,919 tests passed** (`/private/tmp/mgr-remainder-evidence/f3-full-test.log`).
- After fix: **9 files / 134 UI tests passed**; TypeScript passed; lint passed with the existing public-menu unused-parameter warning.
- New browser/readback artifacts: `/private/tmp/mgr-remainder-evidence/f3-browser/`.
- True browser zoom was unavailable through agent-browser. A 720×450 CSS canvas was captured as the layout-space equivalent of 1440×900 at 200%; it is not actual zoom proof.

## Failure repaired

At 375px, Today measured `scrollWidth=388`: the Composer select retained intrinsic minimum width. A focused assertion failed first. Commit `95ca6c0` adds `min-w-0` at the shared `ComposerStripView` owner. Fresh browser measurement is 375/375 with History visible. This layout correction adds no customer-facing field, verb, policy or result, so guide copy did not change.

## Scenario ledger

## A01
Scenario ID(s): A01
Screen name(s) / walkthrough URL: Create brewery; First-run checklist; Import; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: New admin, no setup data.
Expected outcome: Checklist follows actual dependencies; create first usable order without hidden database work.
Observed outcome and evidence: Fresh provisioning/import/opening/order tests ran, but the browser fixture was already provisioned. No connected empty-brewery-to-first-usable-order traversal without operator database work was captured. Existing assertion coverage: `tests/provision-brewery.test.ts`; `tests/commands-import.test.ts`.
Design status: Partial — the named connected acceptance boundary remains unresolved.
Implementation status / proof link: Source only. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the named connected boundary before promotion to Proven.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## A02
Scenario ID(s): A02
Screen name(s) / walkthrough URL: Expired invite; Expired reset; No membership; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Expired/used invitation, password reset, user without membership.
Expected outcome: Clear destination, retry path, and responsible contact; no login loop.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New browser evidence at 375px shows the expired-invite recovery links and missing-reset-session destination (`invite-expired-375.json`, `password-no-session-375.json`). Existing assertion coverage: `tests/auth-confirm.test.ts`; `tests/invite-auth.test.ts`; `tests/auth-config.test.ts`; `tests/commands-invites.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## A03
Scenario ID(s): A03
Screen name(s) / walkthrough URL: Permission denied; Order; Finished goods; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Admin, Sales, Warehouse, Brewer, Customer open the same deep link.
Expected outcome: Correct content and permitted actions; denial gives a useful exit without leaking records.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New five-role evidence on the same order and SKU shows Admin/Sales/Warehouse verbs, Brewer's role-specific useful denial exit, and Customer redirect without staff data (`f3-browser/*-{order,sku}*.json`). Existing assertion coverage: `tests/denied.test.ts`; `tests/nav-page-roles.test.ts`; `tests/rls-orders.test.ts`; `tests/rls-tenancy.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## A04
Scenario ID(s): A04
Screen name(s) / walkthrough URL: Me; Portal Me; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Switch brewery/account while a form is dirty.
Expected outcome: Explicit discard/preserve decision; no draft crosses tenant boundaries.
Observed outcome and evidence: Fresh request-context and tenant-isolation tests ran. The product still lacks a connected dirty-form brewery/customer switch decision walkthrough. Existing assertion coverage: `tests/request-auth.test.ts`.
Design status: Partial — the named connected acceptance boundary remains unresolved.
Implementation status / proof link: Source only. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the named connected boundary before promotion to Proven.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## A05
Scenario ID(s): A05
Screen name(s) / walkthrough URL: Session expired; Team member; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Access revoked while a page remains open.
Expected outcome: Failed save preserves understandable context; no success fiction or sensitive cached account bleed.
Observed outcome and evidence: Fresh team/revocation tests ran. Open-page revocation followed by save and cached-data inspection was not reproduced in the browser. Existing assertion coverage: `tests/team.test.ts`; `tests/request-auth.test.ts`.
Design status: Partial — the named connected acceptance boundary remains unresolved.
Implementation status / proof link: Source only. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the named connected boundary before promotion to Proven.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## A06
Scenario ID(s): A06
Screen name(s) / walkthrough URL: Today; Beer; Work; More; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Phone tabs, desktop rail, browser Back, direct URL.
Expected outcome: Same jobs remain reachable; active navigation and page title agree.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New desktop/phone evidence covers rail collapse/re-expand by pointer and Ctrl+B, Today/Beer navigation, browser Back and direct URLs (`sidebar-*.json/png`, `admin-today-375-after.png`). Existing assertion coverage: `tests/mgr-nav.test.ts`; `tests/nav-ready-links.test.ts`; `tests/screen-links.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I01
Scenario ID(s): I01
Screen name(s) / walkthrough URL: Entity picker; New order; SKU detail; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Similar product names with several keg/case formats.
Expected outcome: Every picker, confirmation, movement, and invoice identifies brand plus format and unit.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New staff, shipping, invoice and portal evidence names brand plus package format; repeated portal quantities have unique brand/format accessible names. Existing assertion coverage: `tests/order-form-rules.test.ts`; `tests/search.test.ts`; `tests/price-group-barcode.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I02
Scenario ID(s): I02
Screen name(s) / walkthrough URL: Format; Record movement; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Wrong BBL-per-unit discovered after movements exist.
Expected outcome: Explicit historical policy; correcting configuration cannot silently rewrite past volume.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage `/private/tmp/mgr-remainder-evidence/format-history-correctness.md` additionally proves historical bbl values remain frozen after a format correction. Existing assertion coverage: `tests/formats.test.ts`; `tests/volume.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I03
Scenario ID(s): I03
Screen name(s) / walkthrough URL: Format; Package BOM; Repack; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Format defaults, SKU overrides, mixed packs, repack.
Expected outcome: Inheritance is visible; changing a default has clear scope; repack accounts for source, destination, and volume.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage F1 format/BOM phone and desktop proof from `/private/tmp/mgr-remainder-evidence/f1-implementation.md`. Existing assertion coverage: `tests/formats.test.ts`; `tests/packaging.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I04
Scenario ID(s): I04
Screen name(s) / walkthrough URL: Record movement; Movement recorded; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Sample, festival, loss, destruction, depletion, opening stock.
Expected outcome: Correct sign, unit, location, classification, and required destination fields; no invalid offered combinations.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Newly opened the movement owner at desktop and phone and inspected the offered classified movement set; close behavior is covered under U05. Existing assertion coverage: `tests/commands-inventory.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I05
Scenario ID(s): I05
Screen name(s) / walkthrough URL: Finished goods; Record movement; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Wrong movement posted yesterday.
Expected outcome: Find original, inspect effects, choose supported correction, retain actor/reason/link; blocked corrections are honest.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New history paging exposes original IDs and correction actions. Reused exact-lineage `/private/tmp/mgr-remainder-evidence/program12-reversal.md`. Existing assertion coverage: `tests/commands-inventory.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I06
Scenario ID(s): I06
Screen name(s) / walkthrough URL: Finished goods; Confirm order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Two warehouses; stock exists only at the other source.
Expected outcome: Local stock and global ATP are distinct; intentional oversell warning has an actionable consequence.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New browser evidence shows `-9 ATP · 0 on hand · 9 allocated` on a SKU with no on-hand rows (`admin-shortfall.json`). Existing assertion coverage: `tests/orders-lifecycle.test.ts`; `tests/commands-inventory.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I07
Scenario ID(s): I07
Screen name(s) / walkthrough URL: Weekly count; Variance by brand; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Exact-match count, variance count, recount after another worker moves stock.
Expected outcome: Count remains durable with zero variance; stale snapshot is handled; no duplicate depletion.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New Taproom-role browser run saved 3→2 remaining units as an immutable count receipt with a 0.5 bbl depletion and movement ID (`weekly-count-recorded-375.png/json`). Existing assertion coverage: `tests/purchasing.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I08
Scenario ID(s): I08
Screen name(s) / walkthrough URL: Pars and allocation; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Existing inbound transfer when opening replenishment again.
Expected outcome: Explain whether suggestions include in-flight supply; prevent accidental duplicate demand or clearly warn.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Program 10 replenishment desktop/phone evidence. Existing assertion coverage: `tests/commands-inventory.test.ts`; `tests/replenishment-form.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I09
Scenario ID(s): I09
Screen name(s) / walkthrough URL: SKU; Location detail; Bin; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Archive product/location/bin still referenced by history.
Expected outcome: Historical records remain intelligible; new use is constrained without destroying references.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Newly followed an inventory history from page 1 to page 2 with stable SKU/bin/lot context (`admin-history-older.json`). Existing assertion coverage: `tests/bins.test.ts`; `tests/commands-catalog.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O01
Scenario ID(s): O01
Screen name(s) / walkthrough URL: New order; Customer detail; Ship-to form; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Customer lacks price list, SKU price, or ship-to.
Expected outcome: Block near the missing input and link the authorized person to the remedy; preserve order work.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/pricing.test.ts`; `tests/commands-portal.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O02
Scenario ID(s): O02
Screen name(s) / walkthrough URL: New order; Review order; Order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Price/address changes while an order is drafted or open.
Expected outcome: Explicit price and address snapshot policy; review shows any changes before commitment.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/orders-lifecycle.test.ts`; `tests/pricing.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O03
Scenario ID(s): O03
Screen name(s) / walkthrough URL: Confirm order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Confirm causes negative ATP.
Expected outcome: Quantified warning identifies affected product, location scope, and competing demand; intentional oversell remains possible.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New `-9` ATP rendering supplies the quantified shortfall; current tests cover intentional oversell and competing demand. Existing assertion coverage: `tests/orders-lifecycle.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O04
Scenario ID(s): O04
Screen name(s) / walkthrough URL: Ship and invoice; Put back; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Ordered 10, picked 6, shipped 4.
Expected outcome: Show 6 unshipped units cancelled under current policy, 2 staged units to put back, 4 billed, and released demand. Do not invent a backorder.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New browser run shipped 4 units as 2 from each of two explicit lot/bin sources. Readback proves two -2 unit/-1 bbl removals and one aggregate qty-4, $600 invoice (`ship-two-lots-*.png/json/txt`). Fresh fulfillment tests cover the exact 10 ordered/6 picked/4 shipped and put-back arithmetic. Existing assertion coverage: `tests/orders-fulfillment.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O05
Scenario ID(s): O05
Screen name(s) / walkthrough URL: Pick; Ship and invoice; Shipment done; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Pick all zero; then attempt shipment.
Expected outcome: Deliberate explanation of whether this closes the order or should be cancellation; no misleading “delivered” implication.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/orders-fulfillment.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O06
Scenario ID(s): O06
Screen name(s) / walkthrough URL: Adjust lines; Put back; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Sales adjusts or cancels an order already staged by Warehouse.
Expected outcome: Before/after quantities, reason, warehouse acknowledgment, and durable end to restock work.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Program 10 put-back browser/readback proof for the connected cross-role handoff. Existing assertion coverage: `tests/orders-fulfillment.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O07
Scenario ID(s): O07
Screen name(s) / walkthrough URL: Pick; Ship and invoice; Adjust lines; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Two workers pick/ship/adjust the same order.
Expected outcome: Stale state is rejected or explicitly reconciled; neither overwrites silently. Backend proof required.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/command-idempotency.test.ts`; `tests/orders-lifecycle.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O08
Scenario ID(s): O08
Screen name(s) / walkthrough URL: Return and credit; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Full return, partial sellable return, damaged return, price-only credit.
Expected outcome: Each supported case separates money from stock; credits cannot exceed remaining eligible amounts/quantities.
Observed outcome and evidence: Fresh tests and reused exact-lineage Program 10 browser/readback prove sellable, damaged and source-linked returns. Price-only credit and the policy separating money from physical disposition remain an explicit product gate. Existing assertion coverage: `tests/orders-fulfillment.test.ts`.
Design status: Decision or legal-policy gate preserved; no behavior inferred.
Implementation status / proof link: Gated. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Obtain the named product/domain decision before implementation or sign-off.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## O09
Scenario ID(s): O09
Screen name(s) / walkthrough URL: Transfer detail; Complete transfer; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Transfer entered to wrong taproom, discovered after completion.
Expected outcome: Named correction path moves the physical stock and preserves the original event.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Program 10 paired-transfer readback preserving lot identity. Existing assertion coverage: `tests/stock-transfers.test.ts`; `tests/orders-fulfillment.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O10
Scenario ID(s): O10
Screen name(s) / walkthrough URL: Ship on delivery; Driver; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Self-delivery with failed stop, partial delivery, route return.
Expected outcome: Distinguish loaded/shipped/delivered; explicit invoice timing; returned goods and outstanding work remain accounted for.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Program 5 delivery browser evidence. Existing assertion coverage: `tests/delivery.test.ts`; `tests/orders-fulfillment.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O11
Scenario ID(s): O11
Screen name(s) / walkthrough URL: Driver; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Unassigned driver or another driver's route.
Expected outcome: Appropriate access restrictions; route assignment changes have visible consequences. Backend proof required.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/delivery.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O12
Scenario ID(s): O12
Screen name(s) / walkthrough URL: Pick sheet; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Print pick sheet with long names and multiple pages.
Expected outcome: Source/destination, order identity, quantities/units, grouping, and headers survive printing.
Observed outcome and evidence: Print CSS and pick-sheet assertions ran, but no long-name multipage physical/print-preview artifact established repeated headers, grouping and source/destination across page breaks. Existing assertion coverage: `tests/app-screen-parity.test.ts`.
Design status: Not reviewed — required manual acceptance was not performed.
Implementation status / proof link: Not reviewed. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: Perform the named manual acceptance check and retain its artifact.
Owner / follow-up: Release QA with the required manual tool/output.

## P01
Scenario ID(s): P01
Screen name(s) / walkthrough URL: Shop; Order detail; Review order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Save draft, sign out, return next day.
Expected outcome: Resume, edit, review, and submit the same draft.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Newly saved ORD-0004 at 375px, cleared cookies, signed in again, reopened it through Continue/edit, and recovered quantity 2 plus its ship-to (`portal-draft-*.json/txt/png`). Existing assertion coverage: `tests/portal-cart.test.ts`; `tests/commands-portal.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P02
Scenario ID(s): P02
Screen name(s) / walkthrough URL: Shop; Review order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Order creation commits but response is lost.
Expected outcome: Recover that action without producing a second order. Backend fault injection required.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/command-idempotency.test.ts`; `tests/command-retries.test.ts`; `tests/commands-portal.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P03
Scenario ID(s): P03
Screen name(s) / walkthrough URL: Shop; Review order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Submission fails after draft exists; change cart and retry.
Expected outcome: Persisted order matches reviewed values, or edits are explicitly prevented.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/portal-cart.test.ts`; `tests/commands-portal.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P04
Scenario ID(s): P04
Screen name(s) / walkthrough URL: Review order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Availability or price changes after cart review.
Expected outcome: Refresh/revalidation policy is visible; no silent substitution or surprise total.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/pricing.test.ts`; `tests/commands-portal.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P05
Scenario ID(s): P05
Screen name(s) / walkthrough URL: Shop; Pick; Ship and invoice; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Decimal, negative, huge, blank, and pasted quantity.
Expected outcome: Consistent whole/fractional-unit rules across UI, command, and database; row-specific accessible errors.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New 375px portal run shows negative/decimal values keep Save/Review disabled; whole quantity 2 enables both and yields $300 (`portal-{negative,decimal,normal}.json`). Existing assertion coverage: `tests/order-form-rules.test.ts`; `tests/commands-orders.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P06
Scenario ID(s): P06
Screen name(s) / walkthrough URL: Order detail; Invoice history; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Brewery short ships or changes order.
Expected outcome: Customer sees what changed, why, final amount, and whether anything remains due.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/orders-fulfillment.test.ts`; `tests/commands-portal.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P07
Scenario ID(s): P07
Screen name(s) / walkthrough URL: Pay invoice; Paid invoice; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Payment pending, failed, already paid elsewhere, or partially paid.
Expected outcome: Payment source and last update visible; avoid duplicate payment requests and premature “paid.”
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage `/private/tmp/mgr-remainder-evidence/q6-browser.md`; provider calls remained disabled. Existing assertion coverage: No existing automated proof identified.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P08
Scenario ID(s): P08
Screen name(s) / walkthrough URL: Question invoice; Payment unavailable; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Customer disputes one line or cannot pay online.
Expected outcome: Useful next action with invoice context; no unsupported button or dead-end explanation.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Q6 Payment unavailable browser proof with Return to invoice. Existing assertion coverage: `tests/invoice-questions.test.ts`; `tests/commands-portal.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## R01
Scenario ID(s): R01
Screen name(s) / walkthrough URL: Schedule batch; Brew day; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Recipe changes after a batch is scheduled.
Expected outcome: Batch retains the intended version; substitutions and recalculations are explicit.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/production.test.ts`; `tests/recipe-schedule.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## R02
Scenario ID(s): R02
Screen name(s) / walkthrough URL: Cellar transfer; Fermentation reading; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Vessel conflict, split/merge transfer, late fermentation reading.
Expected outcome: Capacity, occupancy, chronology, and source/destination are reconciled; invalid transitions explain the remedy.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/production.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## R03
Scenario ID(s): R03
Screen name(s) / walkthrough URL: Close packaging run; Run closed; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Packaging closes with less beer or more material consumption than planned.
Expected outcome: Actual output, materials, lot identity, remaining beer, and loss reconcile in one reviewed outcome.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/packaging.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## R04
Scenario ID(s): R04
Screen name(s) / walkthrough URL: Run closed; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Batch completion loss later reclassified as samples/destruction.
Expected outcome: Original loss identity survives; exact compensation and classification are visible; named schema gate remains until supported.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Program 12 loss/reversal evidence. Existing assertion coverage: No existing automated proof identified.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## R05
Scenario ID(s): R05
Screen name(s) / walkthrough URL: Import; Purchase orders; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Partial PO receipt, damaged material, over-receipt, duplicate receipt.
Expected outcome: Remaining order quantity, actual usable stock, supplier disposition, and retry outcome are clear.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/purchasing.test.ts`; `tests/command-idempotency.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## R06
Scenario ID(s): R06
Screen name(s) / walkthrough URL: Run closed; SKU detail; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Material substitution, lot recall, count correction.
Expected outcome: Trace source lots through batches and packages to affected recipients; demonstrate both forward and backward trace.
Observed outcome and evidence: Fresh trace, purchasing, packaging and shipping tests plus the new two-lot ship prove major links. One connected material-substitution/recall traversal through every affected batch, package and recipient in both directions was not completed. Existing assertion coverage: `tests/compliance.test.ts`; `tests/purchasing.test.ts`; `tests/packaging.test.ts`.
Design status: Partial — the named connected acceptance boundary remains unresolved.
Implementation status / proof link: Source only. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the named connected boundary before promotion to Proven.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## R07
Scenario ID(s): R07
Screen name(s) / walkthrough URL: Schedule batch; Schedule packaging run; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Plan changes after production or purchasing starts.
Expected outcome: Separate suggestion from commitment; show dependencies and what cannot be undone.
Observed outcome and evidence: Fresh planning/commitment tests distinguish suggestions from writes. A connected plan change after physical production or purchasing begins, with all dependencies and irreversible effects, was not demonstrated. Existing assertion coverage: `tests/packaging.test.ts`; `tests/purchasing.test.ts`.
Design status: Partial — the named connected acceptance boundary remains unresolved.
Implementation status / proof link: Source only. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the named connected boundary before promotion to Proven.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## X01
Scenario ID(s): X01
Screen name(s) / walkthrough URL: Weekly count; Variance by brand; Taproom sale; Refund; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: POS sale, refund, physical count, and delayed sync overlap.
Expected outcome: One coherent inventory model; no double depletion; expected consumption and physical observation stay distinguishable.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New physical-count browser proof is combined with reused exact-lineage Program 14 Square fixture evidence; late POS facts remain comparison-only. Existing assertion coverage: No existing automated proof identified.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X02
Scenario ID(s): X02
Screen name(s) / walkthrough URL: Square locations; POS item; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: New/unmapped external location or product, later mapped.
Expected outcome: Held records remain visible and retryable; original event date retained; no silent default mapping.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Program 14 held/unmapped/retry browser evidence. Existing assertion coverage: No existing automated proof identified.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X03
Scenario ID(s): X03
Screen name(s) / walkthrough URL: Taproom; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Keg kick/swap, same beer replacement, guest keg, partial keg.
Expected outcome: Correct interval/custody and nominal size; duplicate swap conflict is understandable; guest stock excluded from owned inventory.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Program 12 tap kick/swap/guest evidence. Existing assertion coverage: `tests/kegs.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X04
Scenario ID(s): X04
Screen name(s) / walkthrough URL: Return and credit; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Keg return, deposit refund, ownership discrepancy.
Expected outcome: Physical return and financial credit reconcile without assuming they always occur together.
Observed outcome and evidence: Keg custody tests ran, but independently reconciling physical empty return, beer return and deposit refund still requires an accepted product policy. Existing assertion coverage: `tests/kegs.test.ts`; `tests/orders-fulfillment.test.ts`.
Design status: Decision or legal-policy gate preserved; no behavior inferred.
Implementation status / proof link: Gated. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Obtain the named product/domain decision before implementation or sign-off.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## X05
Scenario ID(s): X05
Screen name(s) / walkthrough URL: Pushed invoice; Push rejected; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: QBO POST succeeds, local acknowledgment fails.
Expected outcome: Retry reuses durable outbound identity/payload; no duplicate invoice. Backend/external-boundary proof required.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Q6 deterministic success/ack-loss evidence; no real QBO call. Existing assertion coverage: No existing automated proof identified.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X06
Scenario ID(s): X06
Screen name(s) / walkthrough URL: Mapping conflict; Fix mapping; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Accounting mapping conflict or edited external invoice.
Expected outcome: Show authority, drift, and explicit resolution; never silently overwrite the accounting book.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Q6 mapping/drift evidence. Existing assertion coverage: No existing automated proof identified.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X07
Scenario ID(s): X07
Screen name(s) / walkthrough URL: Disconnect Slack; Disconnect Square; Disconnect QuickBooks; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Disconnect/reconnect Slack, Square, or QBO with pending work.
Expected outcome: Explain what stops, what is retained, who can reconnect, and how backlog resumes.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New disconnected POS/QBO pages are combined with reused exact-lineage Program 14/Q6 lifecycle evidence; no real provider call. Existing assertion coverage: `tests/chat-oauth.test.ts`; `tests/commands-chat.test.ts`; `tests/chat-jobs.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X08
Scenario ID(s): X08
Screen name(s) / walkthrough URL: Personal DM; Team digest; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Slack alert becomes resolved or user loses access before opening it.
Expected outcome: Current status and permissions govern the destination; private details are not exposed in notifications.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/chat-jobs.test.ts`; `tests/chat-delivery-policy.test.ts`; `tests/chat-linking.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X09
Scenario ID(s): X09
Screen name(s) / walkthrough URL: Compliance months; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Compliance month crosses timezone boundary; late correction after filing.
Expected outcome: Define effective date and immutable filed snapshot/amendment policy. This is a product/data review, not verification of current legal requirements.
Observed outcome and evidence: Timezone calculation tests ran. Effective filing/amendment policy and current legal correctness require product/domain review. Existing assertion coverage: `tests/compliance.test.ts`; `tests/time-window.test.ts`.
Design status: Decision or legal-policy gate preserved; no behavior inferred.
Implementation status / proof link: Gated. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Obtain the named product/domain decision before implementation or sign-off.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## X10
Scenario ID(s): X10
Screen name(s) / walkthrough URL: Sale channels; Channel; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: New sale channel or destination lacks reporting setup.
Expected outcome: Missing configuration is discoverable before reporting; no “compliant” claim inferred from collecting a state code.
Observed outcome and evidence: Fresh compliance/channel setup tests ran. A connected new-destination-before-reporting walkthrough and accepted readiness/compliance definition remain incomplete. Existing assertion coverage: `tests/sale-channels.test.ts`; `tests/compliance.test.ts`.
Design status: Partial — the named connected acceptance boundary remains unresolved.
Implementation status / proof link: Source only. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the named connected boundary before promotion to Proven.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## U01
Scenario ID(s): U01
Screen name(s) / walkthrough URL: Permission denied; Session expired; Today empty; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Empty, loading, unavailable, forbidden, not found, and server error.
Expected outcome: Distinct meaning and next action; not every failure is an empty list or generic Retry.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New browser evidence distinguishes expired invite, expired reset and role denial with specific next actions. Existing assertion coverage: `tests/not-found.test.ts`; `tests/landings.test.ts`; `tests/denied.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U02
Scenario ID(s): U02
Screen name(s) / walkthrough URL: Record movement; Shop; Offline outbox; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Double click, slow request, offline, reload during save.
Expected outcome: Clear saving/unknown/confirmed states; no duplicate effects; inputs survive recoverable failures.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New portal save/sign-out/relogin and movement-close runs supply connected recovery neighbors. Existing assertion coverage: `tests/command-retries.test.ts`; `tests/command-idempotency.test.ts`; `tests/command-form-message.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U03
Scenario ID(s): U03
Screen name(s) / walkthrough URL: Composer proposal; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: AI proposal becomes stale before confirmation.
Expected outcome: Canonical effects and warnings shown; revalidation blocks stale execution; proposal never auto-commits.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Reused exact-lineage Composer proposal/preview evidence. Existing assertion coverage: No existing automated proof identified.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U04
Scenario ID(s): U04
Screen name(s) / walkthrough URL: Search; Orders; Finished goods; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Old open record beyond first 50; large catalog/history.
Expected outcome: Paging/search reaches the record; counts indicate scope; latency remains usable with realistic data.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Newly reached page 2 of movement history; reused exact-lineage F1 proof covers 1,001 SKUs and 1,502 bins. Existing assertion coverage: `tests/search.test.ts`; `tests/formats.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U05
Scenario ID(s): U05
Screen name(s) / walkthrough URL: Format; Package BOM; Pars and allocation; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Keyboard-only, 200% zoom, narrow phone, long names.
Expected outcome: Reachable actions, visible focus, correct dialog focus return, no trapped or clipped critical controls.
Observed outcome and evidence: New pointer/keyboard collapse, Escape and Close focus return, phone layout and long-label runs passed. A 720×450 CSS-canvas equivalent of 1440×900 at 200% fit, but agent-browser could not change actual zoom, so true 200% is not claimed. Existing assertion coverage: No existing automated proof identified.
Design status: Partial — the named connected acceptance boundary remains unresolved.
Implementation status / proof link: Source only. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: Complete the named connected boundary before promotion to Proven.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## U06
Scenario ID(s): U06
Screen name(s) / walkthrough URL: Shop; Ship and invoice; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Screen reader on repeated quantities and inline errors.
Expected outcome: Unique accessible names, units, error association, and announced progress/result.
Observed outcome and evidence: Unique repeated-quantity accessible names were observed and accessibility assertions passed. No actual screen reader announced inline errors, progress and results. Existing assertion coverage: No existing automated proof identified.
Design status: Not reviewed — required manual acceptance was not performed.
Implementation status / proof link: Not reviewed. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: Perform the named manual acceptance check and retain its artifact.
Owner / follow-up: Release QA with the required manual tool/output.

## U07
Scenario ID(s): U07
Screen name(s) / walkthrough URL: Today; Order; Compliance months; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Browser/device timezone differs from brewery.
Expected outcome: Dates, due work, timeline, and reporting periods use an explicit coherent policy.
Observed outcome and evidence: Fresh brewery-timezone/date-policy tests passed and timelines show full dates. No connected browser run changed the device timezone relative to the brewery. Existing assertion coverage: `tests/time-window.test.ts`; `tests/chat-delivery-policy.test.ts`.
Design status: Partial — the named connected acceptance boundary remains unresolved.
Implementation status / proof link: Source only. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the named connected boundary before promotion to Proven.
Owner / follow-up: Owning product/domain area; retain in release evidence.

## U08
Scenario ID(s): U08
Screen name(s) / walkthrough URL: Record movement; Composer proposal; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Same write from form, API, and future AI.
Expected outcome: Same command-owned validation, authorization, transaction, and error meaning.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Existing assertion coverage: `tests/registry.test.ts`; `tests/api-command.test.ts`; `tests/write-atomicity.test.ts`; `tests/rls-command-boundary.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U09
Scenario ID(s): U09
Screen name(s) / walkthrough URL: Permission denied; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Tampered tenant/customer ID or direct RPC invocation.
Expected outcome: Database independently rejects unauthorized access. No walkthrough can prove this; link real backend tests.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. Fresh RLS, tenant-context and direct-RPC assertions ran against isolated Postgres. Existing assertion coverage: `tests/rls-tenancy.test.ts`; `tests/rls-orders.test.ts`; `tests/rls-ledger.test.ts`; `tests/rls-command-boundary.test.ts`; `tests/data-api-boundary.test.ts`; `tests/rpc-allowlist.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U10
Scenario ID(s): U10
Screen name(s) / walkthrough URL: Session expired; Movement recorded; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Support needs to investigate uncertain save.
Expected outcome: User can supply an action/record reference and correlation information without exposing credentials.
Observed outcome and evidence: Fresh isolated full-suite execution exercised the scenario's registered implementation and assertions. New order/count/movement receipts expose safe UUID references; no credentials are displayed. Existing assertion coverage: `tests/command-form-message.test.ts`; `tests/command-retries.test.ts`.
Design status: Pass for the exercised acceptance boundary.
Implementation status / proof link: Proven. Fresh suite: `/private/tmp/mgr-remainder-evidence/f3-full-test.log`; scenario artifacts are newly run unless labeled reused exact-lineage.
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: None from this audit; retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.


## Baseline findings B01–B20

| Finding | Disposition | Scenario rows |
| --- | --- | --- |
| B01 | Partial | A01/A02 |
| B02 | Proven | A06/U01 |
| B03 | Proven | A03 |
| B04 | Proven | I04 |
| B05 | Proven | P01 |
| B06 | Proven | P03 |
| B07 | Proven | P02/U02 |
| B08 | Proven | O04/O05 |
| B09 | Proven | O06 |
| B10 | Gated | O08 |
| B11 | Proven | I05/I07 |
| B12 | Partial | O12/U07 |
| B13 | Proven | I06 |
| B14 | Proven | U04 |
| B15 | Partial | A04 |
| B16 | Proven | I09 |
| B17 | Proven | P07/P08 |
| B18 | Not reviewed | U06 |
| B19 | Proven | X01 |
| B20 | Proven | U02/U03 |

B01 remains partial because empty cutover is not connected; B10 preserves the price-only-credit decision; B12 retains print/time proof; B15 retains dirty switching; B18 retains actual screen-reader acceptance. Every other Proven finding links to a Proven scenario row above.

## Connected jobs J01–J07

| Job | Disposition | Rows | Boundary |
| --- | --- | --- | --- |
| J01 | Partial | A01, O01–O08, P01–P08 | Configured ordering works; empty cutover/buyer notification incomplete. |
| J02 | Proven | O04/O06/O07 | Exact arithmetic, put-back and races tested; connected shipment captured. |
| J03 | Source only | R01–R06 | Complete source-material recall traversal missing. |
| J04 | Proven (fixtures) | I07/X01–X03 | Fresh count plus deterministic POS/tap proof. |
| J05 | Partial/gated | O10/X04 | Delivery works; independent deposit/asset policy gated. |
| J06 | Partial | I05/P02/U02/U10 | Recovery/correction works; complete export/restore absent. |
| J07 | Gated review question | X03/X07 | Publishing destination, failure/retry and ownership undiscovered. |

## Capability proposals F01–F25

These dispositions distinguish accepted work from review questions; the audit does not convert proposals into scope.

| Capability | Disposition |
| --- | --- |
| F01 | Partial |
| F02 | Accepted/delivered |
| F03 | Review question |
| F04 | Accepted/delivered (fixture boundary) |
| F05 | Partial/decision gate |
| F06 | Partial |
| F07 | Review question |
| F08 | Partial |
| F09 | Accepted/delivered |
| F10 | Accepted/delivered |
| F11 | Accepted/delivered |
| F12 | Accepted/delivered |
| F13 | Accepted/delivered (fixture boundary) |
| F14 | Partial/decision gate |
| F15 | Accepted subset |
| F16 | Partial/legal gate |
| F17 | Accepted/delivered |
| F18 | Accepted/delivered |
| F19 | Review question |
| F20 | Review question |
| F21 | Review question |
| F22 | Review question |
| F23 | Review question |
| F24 | Accepted subset |
| F25 | Review question/operations gate |

Accepted-subset limits: F05/F14 retain the stock-versus-money decision; F06 does not claim exhaustive exception coverage; F08/F25 do not claim full export/restore/offboarding; F15 inherits the deposit/asset gate; F16 makes no current legal claim; F24 proves draft/reorder/requested-date behavior but does not approve pack-minimum or substitution policy.

## Verification

- `bash scripts/test-db.sh`; test environment 3/3 passed.
- `bun run test`; 203 files / 1,919 tests passed.
- Focused UI inventory/composer suite; 9 files / 134 tests passed.
- `bunx tsc --noEmit`; passed.
- `bun run lint`; passed with one existing warning.
- Browser: desktop, phone, CSS-canvas zoom equivalent, pointer, keyboard, role/deep-link, portal draft, weekly count, pagination, shortfall, disconnected providers, and two-lot shipping.


