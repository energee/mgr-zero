# Adversarial walkthrough execution — 2026-09-11

Walkthrough code revision: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` on `adversarial-completion`.
Starting baseline: `5f8743915a44dd8e63039e99c3162befdd14a40d`.
Authority: `.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md`.

## Result and evidence boundary

All 62 authoritative review cases were executed or inspected against current source. Within the authorized local boundary, 57/57 runnable cases received targeted test, source, or connected browser execution. Twenty-nine satisfied their complete expected outcome; 28 remain Source only because a connected design branch or capability is absent. The other five retain their required policy/legal/manual/assistive-technology boundary. Totals: **29 Proven, 28 Source only, 3 Gated, 2 Not reviewed, 0 Failure**.

No real email, Slack, Square, QuickBooks, payment, deployment, credentials, physical warehouse action, legal filing, printer, true 200% browser zoom, or assistive-technology run occurred. Provider results are deterministic local fixture proof only. The [durable execution ledger](evidence/2026-09-11-f3-execution.md) maps each row to exact fresh/reused evidence and its limit.

- Runtime: one isolated reset/fixture owner, API `54351`, Postgres `54352`; Next `:3219`; named browser session `adversarial-completion`.
- Browser coverage: desktop 1440×900 and phone 375×812, pointer and keyboard, six-role same-record deep links, local/global stock, old-record search, and customer short shipment.
- Code proof revision `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` includes the final customer-balance and dual-membership repairs after the fully tested remediation revision `662979b991d41d133a647bf6039e97ae8dd7894a`; the final audit-only commit changes no runtime source.
- Exact-code full suite: **203 files / 1,932 tests passed** at `662979b991d41d133a647bf6039e97ae8dd7894a`. At `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`, focused portal/order/RLS tests passed 105/105; final audit-only documentation checks passed 46/46.

## Failures repaired

The walkthrough found and fixed seven shared-owner defects: a 375 px composer overflow; fractional portal quantities accepted below an integer-only cart; confirmation that hid source-location stock; a portal short shipment that hid reason/cancellation; direct movements that accepted inactive SKUs or lower-case sample/festival state; shortage copy that contradicted an unpaid invoice; and a whole-unit SQL guard that misclassified dual-membership staff. Each behavior has focused regression proof in the [execution ledger](evidence/2026-09-11-f3-execution.md#fixes-found-by-the-walkthrough). No demonstrated failure remains open, so the Failure count is zero.

## Scenario ledger

## A01
Scenario ID(s): A01
Screen name(s) / walkthrough URL: Create brewery; First-run checklist; Import; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: New admin, no setup data.
Expected outcome: Checklist follows actual dependencies; create first usable order without hidden database work.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/provision-brewery.test.ts` — “provisions without membership via Bearer and replays concurrently without duplicate breweries”; `tests/commands-import.test.ts` — “imports ship-tos and channel price cells and reports duplicate creates explicitly”. No customer-ready first-order cutover job was exercised. See [exact A01 execution and boundary](evidence/2026-09-11-f3-execution.md#a01).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#a01).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## A02
Scenario ID(s): A02
Screen name(s) / walkthrough URL: Expired invite; Expired reset; No membership; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Expired/used invitation, password reset, user without membership.
Expected outcome: Clear destination, retry path, and responsible contact; no login loop.
Observed outcome and evidence: Historical evidence label: **Review question**. Reused browser artifacts from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`: `f3-browser/invite-expired-375.json`, `password-no-session-375.json`, and `no-membership-375.json`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/auth-confirm.test.ts` — “sets a session cookie once, then rejects replay” and `tests/invite-auth.test.ts` — “derives the displayed destination from membership”. Used-invite recovery was backend-only. See [exact A02 execution and boundary](evidence/2026-09-11-f3-execution.md#a02).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#a02).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## A03
Scenario ID(s): A03
Screen name(s) / walkthrough URL: Permission denied; Order; Finished goods; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Admin, Sales, Warehouse, Brewer, Customer open the same deep link.
Expected outcome: Correct content and permitted actions; denial gives a useful exit without leaking records.
Observed outcome and evidence: Historical evidence label: **Review question**. New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/a03-admin-order.txt`, `a03-admin-url.txt`, `a03-sales-order.txt`, `a03-sales-url.txt`, `a03-warehouse-order.txt`, `a03-warehouse-url.txt`, `a03-brewer-order.txt`, `a03-brewer-url.txt`, `a03-taproom-order.txt`, `a03-taproom-url.txt`, `a03-customer-order.txt`, and `a03-customer-url.txt` on order `8b6707a2-56c1-45f5-915a-04ac6735fca8`; the six exact role outcomes are recorded above. See [exact A03 execution and boundary](evidence/2026-09-11-f3-execution.md#a03).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#a03).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## A04
Scenario ID(s): A04
Screen name(s) / walkthrough URL: Me; Portal Me; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Switch brewery/account while a form is dirty.
Expected outcome: Explicit discard/preserve decision; no draft crosses tenant boundaries.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/request-context-binding.test.ts` — “limits selected-context reads across detail families while preserving explicit switching”. No dirty-form account/brewery switch decision UI was exercised. See [exact A04 execution and boundary](evidence/2026-09-11-f3-execution.md#a04).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#a04).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## A05
Scenario ID(s): A05
Screen name(s) / walkthrough URL: Session expired; Team member; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Access revoked while a page remains open.
Expected outcome: Failed save preserves understandable context; no success fiction or sensitive cached account bleed.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/team.test.ts` — “revokes a membership but never self or the last admin, and keeps the Auth user”. No open dirty page → revoked save → cache inspection browser chain was exercised. See [exact A05 execution and boundary](evidence/2026-09-11-f3-execution.md#a05).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#a05).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## A06
Scenario ID(s): A06
Screen name(s) / walkthrough URL: Today; Beer; Work; More; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Phone tabs, desktop rail, browser Back, direct URL.
Expected outcome: Same jobs remain reachable; active navigation and page title agree.
Observed outcome and evidence: Historical evidence label: **Review question**. Reused browser evidence from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`: `f3-browser/sidebar-collapsed.json`, `sidebar-reexpanded.json`, `admin-today-375-after.png`, and `phone-beer-url.txt`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/screen-links.test.ts` — “walks the main flows end to end”. Navigation source was unchanged by the later remediation. See [exact A06 execution and boundary](evidence/2026-09-11-f3-execution.md#a06).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#a06).
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I01
Scenario ID(s): I01
Screen name(s) / walkthrough URL: Entity picker; New order; SKU detail; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Similar product names with several keg/case formats.
Expected outcome: Every picker, confirmation, movement, and invoice identifies brand plus format and unit.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/catalog-view.test.ts` — “maps list_skus through formatVolume of ½ / ⅙ / case” and `tests/compliance-view.test.ts` — “formats every date as a short calendar day and owns every movement SKU”; reused exact order/SKU/invoice browser captures from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`. See [exact I01 execution and boundary](evidence/2026-09-11-f3-execution.md#i01).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#i01).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I02
Scenario ID(s): I02
Screen name(s) / walkthrough URL: Format; Record movement; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Wrong BBL-per-unit discovered after movements exist.
Expected outcome: Explicit historical policy; correcting configuration cannot silently rewrite past volume.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/formats.test.ts` — “a case of six four-packs derives 6 × child bbl; a movement freezes that volume; cycles and second levels are rejected” and `tests/inventory-reversal.test.ts` — “freezes report package class when the format definition is corrected”. See [exact I02 execution and boundary](evidence/2026-09-11-f3-execution.md#i02).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#i02).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I03
Scenario ID(s): I03
Screen name(s) / walkthrough URL: Format; Package BOM; Repack; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Format defaults, SKU overrides, mixed packs, repack.
Expected outcome: Inheritance is visible; changing a default has clear scope; repack accounts for source, destination, and volume.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/formats.test.ts` — “replace_format_bom writes the format's bill with on_break; sku_bom is gone” and `tests/packaging.test.ts` — “breaks one case into six four-packs, volume-neutral, and returns the tray to stock”. No single visible default/inheritance → mixed-pack → repack job was exercised. See [exact I03 execution and boundary](evidence/2026-09-11-f3-execution.md#i03).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#i03).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## I04
Scenario ID(s): I04
Screen name(s) / walkthrough URL: Record movement; Movement recorded; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Sample, festival, loss, destruction, depletion, opening stock.
Expected outcome: Correct sign, unit, location, classification, and required destination fields; no invalid offered combinations.
Observed outcome and evidence: Historical evidence label: **Review question**. New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-inventory.test.ts` — “records every supported manual movement with exact signs, classification, and barrel volume”; its SQL readback covers all nine types and invalid sign/channel/state combinations. See [exact I04 execution and boundary](evidence/2026-09-11-f3-execution.md#i04).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#i04).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I05
Scenario ID(s): I05
Screen name(s) / walkthrough URL: Finished goods; Record movement; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Wrong movement posted yesterday.
Expected outcome: Find original, inspect effects, choose supported correction, retain actor/reason/link; blocked corrections are honest.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/inventory-reversal.test.ts` — “appends the exact frozen opposite and replays before lifecycle checks”, “restricts roles, foreign resources, unsupported types and compensation chains”, and “reads scoped inventory metadata, names, and linked history even at zero stock”. See [exact I05 execution and boundary](evidence/2026-09-11-f3-execution.md#i05).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#i05).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I06
Scenario ID(s): I06
Screen name(s) / walkthrough URL: Finished goods; Confirm order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Two warehouses; stock exists only at the other source.
Expected outcome: Local stock and global ATP are distinct; intentional oversell warning has an actionable consequence.
Observed outcome and evidence: Historical evidence label: **Review question**. New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/i06-admin-confirm-1440.json`, `i06-admin-confirm-1440.png`, and `i06-admin-confirm.txt` on order `c285f69b-3895-41f4-9a03-fe9753270926`; new regression rerun at `662979b991d41d133a647bf6039e97ae8dd7894a` in `tests/order-sheets-view.test.ts` — “maps picked-below-ordered as a warning stepper”. See [exact I06 execution and boundary](evidence/2026-09-11-f3-execution.md#i06).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#i06).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I07
Scenario ID(s): I07
Screen name(s) / walkthrough URL: Weekly count; Variance by brand; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Exact-match count, variance count, recount after another worker moves stock.
Expected outcome: Count remains durable with zero variance; stale snapshot is handled; no duplicate depletion.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/taproom-count.test.ts` — “persists a matching count and every explicit line without posting” and “waits for a real concurrent bin transfer, then refuses its stale observation”; the latter continues through refresh, one variance movement, and `get_taproom_count` reopen. See [exact I07 execution and boundary](evidence/2026-09-11-f3-execution.md#i07).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#i07).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## I08
Scenario ID(s): I08
Screen name(s) / walkthrough URL: Pars and allocation; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Existing inbound transfer when opening replenishment again.
Expected outcome: Explain whether suggestions include in-flight supply; prevent accidental duplicate demand or clearly warn.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/replenishment-form.test.ts` — “requires a SKU and a finite nonnegative quantity, allowing explicit zero to release” and `tests/purchasing.test.ts` — “one draft per resolved vendor, gap rounded up to the purchase unit; a material with no vendor is skipped”. No connected existing-inbound-transfer effect on suggestions or duplicate-demand result was exercised. See [exact I08 execution and boundary](evidence/2026-09-11-f3-execution.md#i08).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#i08).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## I09
Scenario ID(s): I09
Screen name(s) / walkthrough URL: SKU; Location detail; Bin; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Archive product/location/bin still referenced by history.
Expected outcome: Historical records remain intelligible; new use is constrained without destroying references.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-inventory.test.ts` — “keeps a referenced SKU, location, and bin legible after edits and blocks new movement on the inactive SKU”. Product and location/bin retirement do not exist, so the complete three-entity archive scenario remains absent. See [exact I09 execution and boundary](evidence/2026-09-11-f3-execution.md#i09).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#i09).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## O01
Scenario ID(s): O01
Screen name(s) / walkthrough URL: New order; Customer detail; Ship-to form; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Customer lacks price list, SKU price, or ship-to.
Expected outcome: Block near the missing input and link the authorized person to the remedy; preserve order work.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/pricing.test.ts` — “create_order copies the customer's channel and prices lines from it; an unpriced sku is refused” and `tests/commands-portal.test.ts` — “rejects a ship-to that belongs to another customer”. No rendered adjacent remedy preserving the dirty order was exercised. See [exact O01 execution and boundary](evidence/2026-09-11-f3-execution.md#o01).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#o01).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## O02
Scenario ID(s): O02
Screen name(s) / walkthrough URL: New order; Review order; Order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Price/address changes while an order is drafted or open.
Expected outcome: Explicit price and address snapshot policy; review shows any changes before commitment.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-quote.test.ts` — “freezes the selected customer's price, deposit, addresses, and honest pending tax” and “rejects price, ship-to, source, or deposit drift without writing an order”. Changed facts were not visibly compared before commitment. See [exact O02 execution and boundary](evidence/2026-09-11-f3-execution.md#o02).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#o02).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## O03
Scenario ID(s): O03
Screen name(s) / walkthrough URL: Confirm order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Confirm causes negative ATP.
Expected outcome: Quantified warning identifies affected product, location scope, and competing demand; intentional oversell remains possible.
Observed outcome and evidence: Historical evidence label: **Review question**. New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/i06-admin-confirm-1440.json` shows source zero versus brewery ATP ten and the intentional-confirm consequence; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-lifecycle.test.ts` — “confirm warns (but does not block) when overselling”. See [exact O03 execution and boundary](evidence/2026-09-11-f3-execution.md#o03).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#o03).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O04
Scenario ID(s): O04
Screen name(s) / walkthrough URL: Ship and invoice; Put back; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Ordered 10, picked 6, shipped 4.
Expected outcome: Show 6 unshipped units cancelled under current policy, 2 staged units to put back, 4 billed, and released demand. Do not invent a backorder.
Observed outcome and evidence: Historical evidence label: **Review question**. New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “connects ordered 10 → picked 6 → shipped 4 → put back 2 with six cancelled and demand released”; corrected portal readback at `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`: `f3-quality-browser/p06-corrected-375.json`. See [exact O04 execution and boundary](evidence/2026-09-11-f3-execution.md#o04).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#o04).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O05
Scenario ID(s): O05
Screen name(s) / walkthrough URL: Pick; Ship and invoice; Shipment done; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Pick all zero; then attempt shipment.
Expected outcome: Deliberate explanation of whether this closes the order or should be cancellation; no misleading “delivered” implication.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “ship with all lines qty_shipped 0 creates no invoice and releases allocations”. No rendered explanation of closed-versus-cancelled meaning was exercised. See [exact O05 execution and boundary](evidence/2026-09-11-f3-execution.md#o05).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#o05).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## O06
Scenario ID(s): O06
Screen name(s) / walkthrough URL: Adjust lines; Put back; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Sales adjusts or cancels an order already staged by Warehouse.
Expected outcome: Before/after quantities, reason, warehouse acknowledgment, and durable end to restock work.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “adjust after pick sets needs_restock; re-pick clears it” and “clears needs_restock and writes an order event; no movement”. See [exact O06 execution and boundary](evidence/2026-09-11-f3-execution.md#o06).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#o06).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O07
Scenario ID(s): O07
Screen name(s) / walkthrough URL: Pick; Ship and invoice; Adjust lines; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Two workers pick/ship/adjust the same order.
Expected outcome: Stale state is rejected or explicitly reconciled; neither overwrites silently. Backend proof required.
Observed outcome and evidence: Historical evidence label: **Review question**. New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “serializes distinct workers racing shipment and adjustment so only one transition wins”; assertions require one successful transition, one stale conflict, and one shipment/invoice effect. See [exact O07 execution and boundary](evidence/2026-09-11-f3-execution.md#o07).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#o07).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O08
Scenario ID(s): O08
Screen name(s) / walkthrough URL: Return and credit; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Full return, partial sellable return, damaged return, price-only credit.
Expected outcome: Each supported case separates money from stock; credits cannot exceed remaining eligible amounts/quantities.
Observed outcome and evidence: Historical evidence label: **Review question**. Return tests cover currently coupled physical/financial returns; price-only and independent disposition policy remains Product/Finance-owned. See [exact O08 execution and boundary](evidence/2026-09-11-f3-execution.md#o08).
Design status: Gated — a product, finance, operations, compliance, or legal decision is required.
Implementation status / proof link: **Gated** — [durable proof index](evidence/2026-09-11-f3-execution.md#o08).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Settle the named policy boundary before implementation or release claims.
Owner / follow-up: Product and Finance.

## O09
Scenario ID(s): O09
Screen name(s) / walkthrough URL: Transfer detail; Complete transfer; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Transfer entered to wrong taproom, discovered after completion.
Expected outcome: Named correction path moves the physical stock and preserves the original event.
Observed outcome and evidence: Historical evidence label: **Review question**. New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/stock-transfers.test.ts` — “corrects a completed wrong-destination transfer with a linked compensating transfer”; exact SQL assertions retain both documents and produce 5/0/3 balances. See [exact O09 execution and boundary](evidence/2026-09-11-f3-execution.md#o09).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#o09).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O10
Scenario ID(s): O10
Screen name(s) / walkthrough URL: Ship on delivery; Driver; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Self-delivery with failed stop, partial delivery, route return.
Expected outcome: Distinguish loaded/shipped/delivered; explicit invoice timing; returned goods and outstanding work remain accounted for.
Observed outcome and evidence: Historical evidence label: **Review question**. New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/delivery.test.ts` — “keeps a failed stop open and blocks return without creating delivery money or stock effects”. Partial/refusal stock handling is unimplemented. See [exact O10 execution and boundary](evidence/2026-09-11-f3-execution.md#o10).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#o10).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## O11
Scenario ID(s): O11
Screen name(s) / walkthrough URL: Driver; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Unassigned driver or another driver's route.
Expected outcome: Appropriate access restrictions; route assignment changes have visible consequences. Backend proof required.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/delivery.test.ts` — “walks a mixed route: the driver departs, Today names the next stop, a transfer stop confirms without an invoice, return waits for the last stop” The same test asserts another driver cannot depart/confirm and sees no Today stop. See [exact O11 execution and boundary](evidence/2026-09-11-f3-execution.md#o11).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#o11).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## O12
Scenario ID(s): O12
Screen name(s) / walkthrough URL: Pick sheet; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Print pick sheet with long names and multiple pages.
Expected outcome: Source/destination, order identity, quantities/units, grouping, and headers survive printing.
Observed outcome and evidence: Historical evidence label: **Review question**. Source inventory exists; multipage physical print inspection was not performed. See [exact O12 execution and boundary](evidence/2026-09-11-f3-execution.md#o12).
Design status: Not reviewed — the required physical or assistive-technology review was not performed.
Implementation status / proof link: **Not reviewed** — [durable proof index](evidence/2026-09-11-f3-execution.md#o12).
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: Perform the named manual review with the required equipment and record the result.
Owner / follow-up: Human QA with a physical print path.

## P01
Scenario ID(s): P01
Screen name(s) / walkthrough URL: Shop; Order detail; Review order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Save draft, sign out, return next day.
Expected outcome: Resume, edit, review, and submit the same draft.
Observed outcome and evidence: Historical evidence label: **Review question**. Reused browser artifacts from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`: `f3-browser/portal-draft-saved.json`, `portal-draft-relogin.json`, and `portal-draft-continued.txt`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/portal-continuity.test.ts` — “restores only a validated exact attempt in the same actor/customer/brewery scope”. That same recovered browser draft was not submitted. See [exact P01 execution and boundary](evidence/2026-09-11-f3-execution.md#p01).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#p01).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## P02
Scenario ID(s): P02
Screen name(s) / walkthrough URL: Shop; Review order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Order creation commits but response is lost.
Expected outcome: Recover that action without producing a second order. Backend fault injection required.
Observed outcome and evidence: Historical evidence label: **Review question**. New fault-injection regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-portal.test.ts` — “injects committed response loss, reloads, and replays exact create/submit identities with one SQL effect”; it asserts exact request/order/event IDs and one order. See [exact P02 execution and boundary](evidence/2026-09-11-f3-execution.md#p02).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#p02).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P03
Scenario ID(s): P03
Screen name(s) / walkthrough URL: Shop; Review order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Submission fails after draft exists; change cart and retry.
Expected outcome: Persisted order matches reviewed values, or edits are explicitly prevented.
Observed outcome and evidence: Historical evidence label: **Review question**. New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-portal.test.ts` — “recovers a definitive submit failure by editing, reviewing, and retrying the exact saved draft”; exact ship-to, requested date, quantity, and submitted-state readback are asserted. See [exact P03 execution and boundary](evidence/2026-09-11-f3-execution.md#p03).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#p03).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P04
Scenario ID(s): P04
Screen name(s) / walkthrough URL: Review order; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Availability or price changes after cart review.
Expected outcome: Refresh/revalidation policy is visible; no silent substitution or surprise total.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-quote.test.ts` — “rejects price, ship-to, source, or deposit drift without writing an order” and “serializes a concurrent price change before drift validation and permits a safe retry”. No rendered cart-review comparison was exercised. See [exact P04 execution and boundary](evidence/2026-09-11-f3-execution.md#p04).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#p04).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## P05
Scenario ID(s): P05
Screen name(s) / walkthrough URL: Shop; Pick; Ship and invoice; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Decimal, negative, huge, blank, and pasted quantity.
Expected outcome: Consistent whole/fractional-unit rules across UI, command, and database; row-specific accessible errors.
Observed outcome and evidence: Historical evidence label: **Review question**. New RED/GREEN regressions at `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`: `tests/commands-portal.test.ts` — “rejects fractional packaged quantities at the command and direct RPC boundaries” and “keeps staff fractional edits for a user who also belongs to the order customer”. They preserve customer-only direct-RPC enforcement, staff fractional edits, exact replay, one event, and the explicit portal invocation boundary. A full browser decimal/negative/blank/huge/paste row-error matrix was not captured. See [exact P05 execution and boundary](evidence/2026-09-11-f3-execution.md#p05).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#p05).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## P06
Scenario ID(s): P06
Screen name(s) / walkthrough URL: Order detail; Invoice history; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Brewery short ships or changes order.
Expected outcome: Customer sees what changed, why, final amount, and whether anything remains due.
Observed outcome and evidence: Historical evidence label: **Review question**. New 1440×900 and 375×812 browser evidence at `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`: `f3-quality-browser/p06-corrected-1440.json`, `p06-corrected-1440.png`, `p06-corrected-375.json`, `p06-corrected-375.png`, and `p06-corrected-375.txt` show ordered 10, shipped 4, six cancelled with no units left to ship, and the separate `unpaid · $600.00` invoice. New regression at the same SHA: `tests/portal-orders-view.test.ts` — “separates cancelled fulfillment from the unpaid invoice balance”. See [exact P06 execution and boundary](evidence/2026-09-11-f3-execution.md#p06).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#p06).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P07
Scenario ID(s): P07
Screen name(s) / walkthrough URL: Pay invoice; Paid invoice; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Payment pending, failed, already paid elsewhere, or partially paid.
Expected outcome: Payment source and last update visible; avoid duplicate payment requests and premature “paid”.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun with deterministic provider fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-state.test.ts` — “tracks partial, paid, reopened and voided states without mistaking credits for cash” and `tests/qbo-ui.test.ts` — “distinguishes a partial payment from a merely pushed invoice”. No live-provider claim. See [exact P07 execution and boundary](evidence/2026-09-11-f3-execution.md#p07).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#p07).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## P08
Scenario ID(s): P08
Screen name(s) / walkthrough URL: Question invoice; Payment unavailable; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Customer disputes one line or cannot pay online.
Expected outcome: Useful next action with invoice context; no unsupported button or dead-end explanation.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/invoice-questions.test.ts` — “a buyer raises one on their own invoice only, and a missing invoice reads the same as a foreign one” and `tests/portal-invoices-view.test.ts` — “the unavailable drawing has no Pay and still offers Question”. See [exact P08 execution and boundary](evidence/2026-09-11-f3-execution.md#p08).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#p08).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## R01
Scenario ID(s): R01
Screen name(s) / walkthrough URL: Schedule batch; Brew day; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Recipe changes after a batch is scheduled.
Expected outcome: Batch retains the intended version; substitutions and recalculations are explicit.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/production.test.ts` — “creates a recipe, then two versions whose ingredients snapshot extract potential” and “schedules a batch with no brand, brews it into the fermenter, and refuses a second brew there”. No connected substitution/recalculation production walkthrough was exercised. See [exact R01 execution and boundary](evidence/2026-09-11-f3-execution.md#r01).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#r01).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## R02
Scenario ID(s): R02
Screen name(s) / walkthrough URL: Cellar transfer; Fermentation reading; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Vessel conflict, split/merge transfer, late fermentation reading.
Expected outcome: Capacity, occupancy, chronology, and source/destination are reconciled; invalid transitions explain the remedy.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/production.test.ts` — “moves part of a batch into an empty vessel, then closes the source when it empties”, “blends into an occupied vessel, leaving the target's batch identity alone”, and “records readings and lists them newest first”. No connected rendered split/merge/late-reading job was exercised. See [exact R02 execution and boundary](evidence/2026-09-11-f3-execution.md#r02).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#r02).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## R03
Scenario ID(s): R03
Screen name(s) / walkthrough URL: Close packaging run; Run closed; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Packaging closes with less beer or more material consumption than planned.
Expected outcome: Actual output, materials, lot identity, remaining beer, and loss reconcile in one reviewed outcome.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/packaging.test.ts` — “writes the lot, a production_in per package filled, the BOM consumptions, and draws the tank down”. No connected rendered plan-versus-actual production job was exercised. See [exact R03 execution and boundary](evidence/2026-09-11-f3-execution.md#r03).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#r03).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## R04
Scenario ID(s): R04
Screen name(s) / walkthrough URL: Run closed; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Batch completion loss later reclassified as samples/destruction.
Expected outcome: Original loss identity survives; exact compensation and classification are visible; named schema gate remains until supported.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/completion-loss-review.test.ts` — “posts signed corrections in their actual period, leaves occupancy unchanged, preserves filed snapshots, and gates cellar Taproom filing”. No connected rendered review was exercised, and the remaining schema gate stays explicit. See [exact R04 execution and boundary](evidence/2026-09-11-f3-execution.md#r04).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#r04).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## R05
Scenario ID(s): R05
Screen name(s) / walkthrough URL: Import; Purchase orders; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Partial PO receipt, damaged material, over-receipt, duplicate receipt.
Expected outcome: Remaining order quantity, actual usable stock, supplier disposition, and retry outcome are clear.
Observed outcome and evidence: Historical evidence label: **Review question**. New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/purchasing.test.ts` — “records an overreceipt once and makes the missing damage/disposition contract explicit”. Damage isolation and supplier disposition remain absent. See [exact R05 execution and boundary](evidence/2026-09-11-f3-execution.md#r05).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#r05).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## R06
Scenario ID(s): R06
Screen name(s) / walkthrough URL: Run closed; SKU detail; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Material substitution, lot recall, count correction.
Expected outcome: Trace source lots through batches and packages to affected recipients; demonstrate both forward and backward trace.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/compliance.test.ts` — “follows the lot to its run, tank, and batch, and lists every ledger movement tagged with it”; `tests/shipping-lots.test.ts` — “traces more than 1000 movements without combining incompatible package units”. Full material-lot forward/back recall remains absent. See [exact R06 execution and boundary](evidence/2026-09-11-f3-execution.md#r06).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#r06).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## R07
Scenario ID(s): R07
Screen name(s) / walkthrough URL: Schedule batch; Schedule packaging run; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Plan changes after production or purchasing starts.
Expected outcome: Separate suggestion from commitment; show dependencies and what cannot be undone.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/purchasing.test.ts` — “one draft per resolved vendor, gap rounded up to the purchase unit; a material with no vendor is skipped”. No connected undo/dependency walkthrough after work starts was exercised. See [exact R07 execution and boundary](evidence/2026-09-11-f3-execution.md#r07).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#r07).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## X01
Scenario ID(s): X01
Screen name(s) / walkthrough URL: Weekly count; Variance by brand; Taproom sale; Refund; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: POS sale, refund, physical count, and delayed sync overlap.
Expected outcome: One coherent inventory model; no double depletion; expected consumption and physical observation stay distinguishable.
Observed outcome and evidence: Historical evidence label: **Review question**. New connected fixture regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/pos-sales-sync.test.ts` — “keeps one physical count effect while a delayed sale and linked refund change expected only”; assertions preserve actual count, change expected consumption, and keep exactly one inventory movement. See [exact X01 execution and boundary](evidence/2026-09-11-f3-execution.md#x01).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#x01).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X02
Scenario ID(s): X02
Screen name(s) / walkthrough URL: Square locations; POS item; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: New/unmapped external location or product, later mapped.
Expected outcome: Held records remain visible and retryable; original event date retained; no silent default mapping.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun with deterministic Square fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/pos-sales-sync.test.ts` — “keeps a sale before catalog visible and reconciles it through a later deleted variation mapping” and `tests/pos-mapping.test.ts` — “keeps ignored and unavailable variations visible with their mapping history”. See [exact X02 execution and boundary](evidence/2026-09-11-f3-execution.md#x02).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#x02).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X03
Scenario ID(s): X03
Screen name(s) / walkthrough URL: Taproom; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Keg kick/swap, same beer replacement, guest keg, partial keg.
Expected outcome: Correct interval/custody and nominal size; duplicate swap conflict is understandable; guest stock excluded from owned inventory.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/tap-intervals.test.ts` — “atomically swaps, defaults own SKU, replays frozen identity after later close and rejects changed payload”, “guests require explicit label and finite size, and never fabricate a SKU”, and the competing swap/kick test. See [exact X03 execution and boundary](evidence/2026-09-11-f3-execution.md#x03).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#x03).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X04
Scenario ID(s): X04
Screen name(s) / walkthrough URL: Return and credit; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Keg return, deposit refund, ownership discrepancy.
Expected outcome: Physical return and financial credit reconcile without assuming they always occur together.
Observed outcome and evidence: Historical evidence label: **Review question**. Keg custody/deposit independence requires Product/Finance/Operations policy. No policy was inferred. See [exact X04 execution and boundary](evidence/2026-09-11-f3-execution.md#x04).
Design status: Gated — a product, finance, operations, compliance, or legal decision is required.
Implementation status / proof link: **Gated** — [durable proof index](evidence/2026-09-11-f3-execution.md#x04).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Settle the named policy boundary before implementation or release claims.
Owner / follow-up: Product, Finance, and Operations.

## X05
Scenario ID(s): X05
Screen name(s) / walkthrough URL: Pushed invoice; Push rejected; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: QBO POST succeeds, local acknowledgment fails.
Expected outcome: Retry reuses durable outbound identity/payload; no duplicate invoice. Backend/external-boundary proof required.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun with deterministic QBO transport at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-push.test.ts` — “persists the exact authoritative body and provider key before fetch, then replays both after a lost response” and “recovers a provider create whose first local finish is denied with the same remote identity”. See [exact X05 execution and boundary](evidence/2026-09-11-f3-execution.md#x05).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#x05).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X06
Scenario ID(s): X06
Screen name(s) / walkthrough URL: Mapping conflict; Fix mapping; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Accounting mapping conflict or edited external invoice.
Expected outcome: Show authority, drift, and explicit resolution; never silently overwrite the accounting book.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun with deterministic QBO fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-state.test.ts` — “distinguishes payment-only SyncToken changes from accountant total drift” and “renders a $105 synced edit over $100 frozen lines across staff and portal current views”. See [exact X06 execution and boundary](evidence/2026-09-11-f3-execution.md#x06).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#x06).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X07
Scenario ID(s): X07
Screen name(s) / walkthrough URL: Disconnect Slack; Disconnect Square; Disconnect QuickBooks; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Disconnect/reconnect Slack, Square, or QBO with pending work.
Expected outcome: Explain what stops, what is retained, who can reconnect, and how backlog resumes.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun with deterministic provider fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-push.test.ts` — “recovers an unknown push through a verified same-realm reconnect without changing its identity” and `tests/pos-lifecycle-sql.test.ts` — “purges locally before revoke and rejects a refresh response arriving after disconnect”. See [exact X07 execution and boundary](evidence/2026-09-11-f3-execution.md#x07).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#x07).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X08
Scenario ID(s): X08
Screen name(s) / walkthrough URL: Personal DM; Team digest; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Slack alert becomes resolved or user loses access before opening it.
Expected outcome: Current status and permissions govern the destination; private details are not exposed in notifications.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun with local Slack adapter fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/chat-jobs.test.ts` — “rechecks source resolution before sending or updating without a scan” and “rechecks membership and role before personal send/update”; `tests/chat-slack-renderer.test.ts` — “drops actions and marks the message resolved when the occurrence resolved”. See [exact X08 execution and boundary](evidence/2026-09-11-f3-execution.md#x08).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#x08).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## X09
Scenario ID(s): X09
Screen name(s) / walkthrough URL: Compliance months; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Compliance month crosses timezone boundary; late correction after filing.
Expected outcome: Define effective date and immutable filed snapshot/amendment policy. This is a product/data review, not verification of current legal requirements.
Observed outcome and evidence: Historical evidence label: **Review question**. Backend timezone/snapshot tests ran; current legal and amendment policy still requires Compliance/Product review. See [exact X09 execution and boundary](evidence/2026-09-11-f3-execution.md#x09).
Design status: Gated — a product, finance, operations, compliance, or legal decision is required.
Implementation status / proof link: **Gated** — [durable proof index](evidence/2026-09-11-f3-execution.md#x09).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Settle the named policy boundary before implementation or release claims.
Owner / follow-up: Compliance and Product.

## X10
Scenario ID(s): X10
Screen name(s) / walkthrough URL: Sale channels; Channel; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: New sale channel or destination lacks reporting setup.
Expected outcome: Missing configuration is discoverable before reporting; no “compliant” claim inferred from collecting a state code.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-inventory.test.ts` — “record_movement surfaces CHECK failure for unclassified sale_removal” and `tests/sale-channels.test.ts` — “a new brewery has four channels and Export is untaxpaid”. No pre-reporting configuration workflow exists. See [exact X10 execution and boundary](evidence/2026-09-11-f3-execution.md#x10).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#x10).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## U01
Scenario ID(s): U01
Screen name(s) / walkthrough URL: Permission denied; Session expired; Today empty; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Empty, loading, unavailable, forbidden, not found, and server error.
Expected outcome: Distinct meaning and next action; not every failure is an empty list or generic Retry.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/not-found.test.ts` — “unknown uuid → 404 not_found” and “surfaces a membership-query database failure as 500 db_error, not 403 not_member”. No connected rendered loading/unavailable/forbidden/not-found/server-error action matrix was exercised. See [exact U01 execution and boundary](evidence/2026-09-11-f3-execution.md#u01).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#u01).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## U02
Scenario ID(s): U02
Screen name(s) / walkthrough URL: Record movement; Shop; Offline outbox; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Double click, slow request, offline, reload during save.
Expected outcome: Clear saving/unknown/confirmed states; no duplicate effects; inputs survive recoverable failures.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/portal-continuity.test.ts` — “reload retries the persisted submit directly after a lost response”; `tests/taproom-count.test.ts` — “replays the exact request after a committed count response is treated as an inner 500”. Double-click, slow, offline, reload-during-save UI states and input survival were not captured. See [exact U02 execution and boundary](evidence/2026-09-11-f3-execution.md#u02).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#u02).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## U03
Scenario ID(s): U03
Screen name(s) / walkthrough URL: Composer proposal; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: AI proposal becomes stale before confirmation.
Expected outcome: Canonical effects and warnings shown; revalidation blocks stale execution; proposal never auto-commits.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/composer.test.ts` — “derives the signed registered input, invalidates edited previews, and emits one explicit commit” and `tests/chat-history.test.ts` — “binds confirmation to its author, conversation, and canonical input and records one replay-safe result”. See [exact U03 execution and boundary](evidence/2026-09-11-f3-execution.md#u03).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#u03).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U04
Scenario ID(s): U04
Screen name(s) / walkthrough URL: Search; Orders; Finished goods; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Old open record beyond first 50; large catalog/history.
Expected outcome: Paging/search reaches the record; counts indicate scope; latency remains usable with realistic data.
Observed outcome and evidence: Historical evidence label: **Review question**. New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/u04-search-result.json`, `u04-search-open.txt`, `u04-old-order.txt`, and `u04-open-url.txt`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/search.test.ts` — “reaches an old open order after it falls beyond the newest fifty”. Old invoice and portal history, visible scope counts, and realistic latency were not exercised. See [exact U04 execution and boundary](evidence/2026-09-11-f3-execution.md#u04).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#u04).
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## U05
Scenario ID(s): U05
Screen name(s) / walkthrough URL: Format; Package BOM; Pars and allocation; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Keyboard-only, 200% zoom, narrow phone, long names.
Expected outcome: Reachable actions, visible focus, correct dialog focus return, no trapped or clipped critical controls.
Observed outcome and evidence: Historical evidence label: **Review question**. Reused browser artifacts from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`: `f3-browser/composer-phone-after.json`, `movement-close-phone.json`, `weekly-count-keyboard.json`, and `admin-today-720-css-equivalent.png`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/mgr-screens.test.ts` — “keeps phone tables contained and avoids duplicate page titles”. The CSS-sized 720×450 canvas is not true 200% browser zoom. See [exact U05 execution and boundary](evidence/2026-09-11-f3-execution.md#u05).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#u05).
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## U06
Scenario ID(s): U06
Screen name(s) / walkthrough URL: Shop; Ship and invoice; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Screen reader on repeated quantities and inline errors.
Expected outcome: Unique accessible names, units, error association, and announced progress/result.
Observed outcome and evidence: Historical evidence label: **Review question**. Automated accessible-name assertions exist; no screen-reader/assistive-technology session was performed. See [exact U06 execution and boundary](evidence/2026-09-11-f3-execution.md#u06).
Design status: Not reviewed — the required physical or assistive-technology review was not performed.
Implementation status / proof link: **Not reviewed** — [durable proof index](evidence/2026-09-11-f3-execution.md#u06).
Impact / priority: Medium — reachability, accessibility or scale.
Smallest recommendation or product decision: Perform the named manual review with the required equipment and record the result.
Owner / follow-up: Accessibility QA with assistive technology.

## U07
Scenario ID(s): U07
Screen name(s) / walkthrough URL: Today; Order; Compliance months; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Browser/device timezone differs from brewery.
Expected outcome: Dates, due work, timeline, and reporting periods use an explicit coherent policy.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/date-format.test.ts` — “uses consistent user-facing date formats without timestamp seconds” and `tests/locations-view.test.ts` — “timezone without an IANA extra is the brewery default”. Cross-device rendered date consistency was not exercised. See [exact U07 execution and boundary](evidence/2026-09-11-f3-execution.md#u07).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#u07).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## U08
Scenario ID(s): U08
Screen name(s) / walkthrough URL: Record movement; Composer proposal; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Same write from form, API, and future AI.
Expected outcome: Same command-owned validation, authorization, transaction, and error meaning.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/rls-command-boundary.test.ts` — “keeps warehouse movement and sales order lifecycle RPCs role-bound” and `tests/commands-portal.test.ts` — “update_draft_order enforces the portal invariants at the RPC, not only in zod”. See [exact U08 execution and boundary](evidence/2026-09-11-f3-execution.md#u08).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#u08).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U09
Scenario ID(s): U09
Screen name(s) / walkthrough URL: Permission denied; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Tampered tenant/customer ID or direct RPC invocation.
Expected outcome: Database independently rejects unauthorized access. No walkthrough can prove this; link real backend tests.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/rls-tenancy.test.ts` — “staff of A cannot see brewery B” and “customer user sees only their own customer record”; `tests/rls-command-boundary.test.ts` — “no authenticated user can call next_no directly, for their own or another brewery”. See [exact U09 execution and boundary](evidence/2026-09-11-f3-execution.md#u09).
Design status: Pass — the complete stated outcome was exercised.
Implementation status / proof link: **Proven** — [durable proof index](evidence/2026-09-11-f3-execution.md#u09).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Retain the cited regression and connected proof.
Owner / follow-up: No follow-up from this audit.

## U10
Scenario ID(s): U10
Screen name(s) / walkthrough URL: Session expired; Movement recorded; inventory `/docs/screens-explore` (no recorded scenario URL).
Walkthrough commit: `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` (base `5f8743915a44dd8e63039e99c3162befdd14a40d`; exact scenario evidence cites its observed source revision).
Persona / account / viewport: Isolated local fixture for the scenario roles; browser at 1440×900 and/or 375×812 where rendered evidence is cited; backend-only cases used isolated API 54351 / Postgres 54352.
Starting state and action: Support needs to investigate uncertain save.
Expected outcome: User can supply an action/record reference and correlation information without exposing credentials.
Observed outcome and evidence: Historical evidence label: **Review question**. Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/api-command.test.ts` — “runs a query without a request id and returns a correlation id”. No connected uncertain-save UI demonstrates an actionable support reference. See [exact U10 execution and boundary](evidence/2026-09-11-f3-execution.md#u10).
Design status: Partial — executable portions were exercised; the complete connected outcome was not established.
Implementation status / proof link: **Source only** — [durable proof index](evidence/2026-09-11-f3-execution.md#u10).
Impact / priority: High — stock, money, access or recovery correctness.
Smallest recommendation or product decision: Complete the missing connected boundary named in the evidence row before promotion to Proven.
Owner / follow-up: Owning product/domain team; retain as release evidence debt.

## Baseline findings crosswalk

The historical label is copied from the authoritative review and remains separate from the current disposition.

| Finding | Historical evidence | Current disposition | Scenario rows | Proof / remaining boundary |
| --- | --- | --- | --- | --- |
| B01 | Documented gap | Partial | A01/A02 | Cutover and complete recovery job remain partial. |
| B02 | Observed | Partial | A06/U01 | Navigation proven; the complete rendered error-state matrix is partial. |
| B03 | Observed | Proven | A03 | Fresh six-role same-record browser batch. |
| B04 | Observed | Proven | I04 | Fresh complete movement matrix and invalid combinations. |
| B05 | Documented gap | Partial | P01 | Draft resumed and edited; same recovered browser draft was not submitted. |
| B06 | Observed | Proven | P03 | Injected definitive failure → edit/review/retry with exact readback. |
| B07 | Observed | Partial | P02/U02 | Backend lost-response replay is proven; the complete user-facing uncertainty-state matrix is partial. |
| B08 | Observed | Partial | O04/O05 | 10→6→4 is proven; all-zero rendered meaning remains partial. |
| B09 | Observed | Proven | O06 | Staged cancellation/restock work has a durable completion. |
| B10 | Observed | Gated | O08 | Independent stock/credit disposition policy is unsettled. |
| B11 | Documented gap | Proven | I05/I07 | Linked corrections and stale-count recovery are exercised. |
| B12 | Observed | Partial | O12/U07 | Backend timezone proof exists; physical print review does not. |
| B13 | Observed | Proven | I06/O03 | Source zero versus brewery ATP ten is shown and actionable. |
| B14 | Observed | Partial | U04 | Old order search is proven; old invoice/portal history, scope counts, and latency remain partial. |
| B15 | Observed | Partial | A04 | Dirty account/brewery switching lacks an explicit UI decision. |
| B16 | Documented gap | Partial | I09 | SKU deactivation/history is proven; product and location/bin retirement capability is absent. |
| B17 | Documented gap | Proven | P07/P08 | Fixture-backed payment authority and invoice-context actions are explicit. |
| B18 | Observed | Not reviewed | U06 | Automated semantics exist; assistive technology was not run. |
| B19 | Observed | Proven | X01 | One delayed POS/refund/count fixture proves separate expected/actual facts. |
| B20 | Observed | Partial | U02/U03 | Stale proposal refusal is proven; complete user-facing save/reload uncertainty remains partial. |

## Connected jobs crosswalk

| Job | Current disposition | Rows | Proof / retained boundary |
| --- | --- | --- | --- |
| J01 | Partial | A01, O01–O08, P01–P08 | Ordering core works; empty cutover, adjacent remedies, buyer notification, recovered-draft submit, and price-change review remain incomplete. |
| J02 | Proven | O04/O06/O07 | Exact 10→6→4 arithmetic, put-back, allocation/invoice results, and a real concurrent fulfillment race. |
| J03 | Source only | R01–R06 | Production pieces are tested separately; complete source-material-to-recipient recall is absent. |
| J04 | Proven (local fixtures) | I07/X01–X03 | One connected delayed-sale/refund/count case plus deterministic tap behavior; no live Square claim. |
| J05 | Partial | O10/X04 | Successful delivery is the accepted subset; failed/partial stop inventory and independent keg/deposit policy remain open. |
| J06 | Partial | I05/P02/P03/U02/U10 | Exact replay/correction paths work; complete user-visible support/export/restore recovery does not. |
| J07 | Gated review question | X03/X07 | Tap-board destination, publication ownership, and failure/correction acceptance remain undecided. |

## Capability proposal crosswalk

Historical wording remains separate from design disposition and implementation evidence. No proposal is converted into release scope by this table.

| Capability | Historical label | Design disposition | Implementation evidence | Rows / proof | Owner / boundary |
| --- | --- | --- | --- | --- | --- |
| F01 | Incomplete | Partial | Source only | A01, A02 | Product/Operations: complete reconciled cutover and first order. |
| F02 | Incomplete | Partial | Source only | A01, A02, A05 | Product/Auth: departing employee, replacement admin, last-admin recovery. |
| F03 | Planned, unbuilt | Not accepted | Source only | P06 | Product: buyer notification channel and failure semantics. |
| F04 | Incomplete | Partial | Fixture-proven subset | P07, X05–X07 | Finance/Integrations: live authority and reconciliation remain outside this run. |
| F05 | Incomplete | Gated | Supported coupled subset | O08 | Product/Finance: decouple physical return, credit, refund, and keg asset. |
| F06 | Incomplete | Partial | Source only | O06, O10, U01 | Product: enumerate durable owners/completion for all exceptions. |
| F07 | Proposed | Not accepted | Source only | O01, P04 | Product/Finance: decide hold/release and override boundary. |
| F08 | Incomplete | Partial | Source only | U04, U10 | Product/Operations: full scoped export/statements remain absent. |
| F09 | Review question | Partial | Source only | R05 | Purchasing: damage isolation and supplier disposition are absent. |
| F10 | Review question | Partial | Source only | R01 | Production/Finance: planned/actual cost basis and unknown costs are absent. |
| F11 | Review question | Partial | Source only | R02, R04 | Production: connected additions/occupancy/split/blend/late-actual job is absent. |
| F12 | Review question | Pass for atomic backend | Proven subset | R03 | Production: atomic packaging outputs/materials/lots/loss are tested; rendered job remains partial. |
| F13 | Review question | Partial | Proven local-fixture subset | I07, X01–X03 | Taproom/Product: late data/partial-keg policy remains open. |
| F14 | Review question | Gated | Source only | X03, X04 | Product/Finance/Operations: custody and deposits must vary independently. |
| F15 | Review question | Partial | Proven successful-delivery subset | O10, O11 | Delivery/Product: failed/partial/refusal return-to-truck path is absent. |
| F16 | Review question | Gated | Proven calculation subset | X09, U07 | Compliance/Product: legal rules and amendment policy require review. |
| F17 | Review question | Partial | Proven shortage subset; replenishment source only | I06, I08, R07 | Product/Production: dated proposal-to-commit job remains partial. |
| F18 | Observed contract gap | Pass for delivered lot path | Proven finished-goods subset | I04, R06 | Product/Quality: full material-to-recipient recall remains absent. |
| F19 | Proposed | Not accepted | Source only | R06 | Product/Quality: hold/release/disposition contract is absent. |
| F20 | Proposed, with schema support | Not accepted | Source only | I09, R06 | Product/Quality: rotation policy and override semantics are absent. |
| F21 | Proposed | Not accepted | Source only | O08, P08 | Product/Support: complaint ownership and escalation are absent. |
| F22 | Proposed | Not accepted | Source only | R02 | Production: readiness/cleaning ownership is absent. |
| F23 | Proposed | Not accepted | Source only | R05, O10 | Product/Security: record-scoped evidence lifecycle is absent. |
| F24 | Proposed | Partial | Proven resumable-draft subset | P01, P03, P04 | Product: reorder/date/minimum/substitution policy remains unaccepted. |
| F25 | Proposed operational requirement | Gated operations work | Source only | U04, U10 | Operations/Security: backup drill, tenant export, retention/offboarding are absent. |

## Verification

- Isolated database reset applied `00001_baseline.sql` and `20260910120847_deploy_current_schema.sql`; no third migration was created.
- At `34af080bd65e147a607aba1e83d06f5361b8faca`, `bun run test` passed 203 files / 1,930 tests after generated API docs were refreshed.
- At `662979b991d41d133a647bf6039e97ae8dd7894a`, focused inventory/bin tests passed 16/16 and taproom-count tests passed 29/29 after the final fixes.
- At exact code revision `662979b991d41d133a647bf6039e97ae8dd7894a`, `bun run test` passed 203 files / 1,932 tests in 250.64 seconds.
- At `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`, `tests/portal-orders-view.test.ts` passed 13/13 and the portal command, order lifecycle, and RLS boundary batch passed 92/92 after a fresh isolated reset.
- With the final audit content present, the documentation/API suite passed 46/46, `bunx tsc --noEmit` passed, and `bun run lint` passed with one pre-existing `_request` unused-parameter warning.
- Browser: 1440×900 and 375×812, pointer, keyboard, six roles, source/global stock, old-record search, short-shipment portal result; session/server closed. True 200% zoom, print, and assistive technology remain unclaimed.
