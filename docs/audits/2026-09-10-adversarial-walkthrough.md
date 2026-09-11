# Ordering-pilot adversarial walkthrough — 2026-09-10

Walkthrough revision: `e29f9e9` on `docs/310-adversarial-walkthrough`.
Baseline: `.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md`.

## Scope and result

This pass evaluates the confirmed ordering pilot: access, catalog/pricing,
customers, finished-goods inventory, staff order fulfillment, portal ordering,
invoices, and payment handoff. Production, purchasing, taproom, delivery,
compliance, POS, chat, and Composer retain their own program proof and are not
silently promoted into the pilot.

The inventory-to-route gate is complete for the pilot. The customer happy path
passed in Chrome against the isolated test stack after repairing the stale E2E
seed and selectors. Backend tests cover authorization, idempotency, stale state,
stock, credits, and tenant isolation. Two existing interaction defects remain
launch blockers: #304 (Record Movement Close) and #305 (sidebar collapse).

## Screen crosswalk

Every in-scope inventory name is listed below. `SCREEN_ROUTES` owns the exact
live file mapping; this table records the connected job rather than duplicating
that source map.

| Inventory screen(s) | User and entry | Primary action → success | Scenarios | Evidence |
| --- | --- | --- | --- | --- |
| Sign in; Session expired; No membership | Staff, `/login` | authenticate or recover → Today / useful exit | A02, A03, A05 | auth routes + command-context tests |
| Portal sign in; Portal forgot password; Portal set password | Customer, `/portal/login` | authenticate/recover → Order | A02, A03 | Chrome portal smoke |
| Reset password; Expired reset; Set new password | Invited user, auth link | replace credential → sign in | A02 | auth route tests |
| Create brewery; Accept invite; Expired invite | New admin/invitee, auth entry | establish membership → first run / recovery | A01, A02 | provisioning and invite tests |
| Team; Invite staff; Team member | Admin, More → Team | invite/change/revoke → updated Team | A01, A03, A05, F02 | invite and role-boundary tests |
| Search; Entity picker | Staff, header/form picker | find permitted entity → selected detail/form | A03, A06, U04 | search tests + route map |
| Catalog; Brand; SKU; Formats; Format; Package BOM; SKU list | Admin, More → Catalog | maintain sellable identity → updated catalog | I01–I03, I09, O01 | catalog/pricing tests |
| Customers; Customer detail; Ship-to form; Invite portal user | Sales/Admin, Work/More → Customers | configure buyer and access → customer detail | A01, O01, O02 | customer/invite tests |
| Finished goods; SKU detail | Staff, Beer → Finished goods | inspect scoped stock/history → SKU detail | I01, I05, I06, U04 | inventory and bin tests |
| Record movement; Movement recorded | Admin/Warehouse, Finished goods | post classified quantity → updated ledger | I04, U02, U08 | request/idempotency/ledger tests; #304 open |
| Reverse movement | Admin, SKU detail | compensate eligible movement → linked history | I05, U02 | inventory-reversal tests |
| Orders; New order | Staff, Work → Orders | create draft/transfer → Order | O01–O03, U02 | order/pricing tests |
| Order; Adjust lines; Confirm order | Sales/Admin, Order | review/change/confirm → updated Order | O02, O03, O06, O07 | fulfillment/concurrency tests |
| Pick; Short pick | Warehouse, Order | record staged quantity/shortage → Order work state | O03–O07 | fulfillment tests |
| Ship and invoice; Ship on delivery; Shipment done | Warehouse, Order | ship reviewed quantities → invoice/delivery state | O04, O05, O07, O10 | fulfillment and invoice tests |
| Put back | Warehouse, cancelled picked Order | acknowledge physical restock → cleared work item | O04, O06 | fulfillment tests |
| Return and credit | Sales/Admin, shipped Order | record supported return/credit → Invoice and stock history | O08, F05 | credit and ledger tests |
| Complete transfer | Warehouse, transfer Order | receive stock → completed transfer | O09 | transfer tests |
| Invoices; Invoice; Fix mapping | Staff, Work → Invoices | inspect/push/reconcile → current invoice state | P06–P08, X05, X06 | QBO tests merged in #306 |
| Shop; Review order | Customer, Order tab | choose quantity/destination and confirm → Order detail | P01–P05, U02 | Chrome portal smoke + portal tests |
| Order history; Order detail | Customer, Orders tab | find/resume/reorder/inspect → current order | P01–P06, U04 | portal continuity tests |
| Invoice history; Pay invoice; Question invoice; Payment unavailable; Paid invoice | Customer, Invoices tab | inspect/pay/question → provider or current invoice state | P06–P08, X05–X07 | QBO/portal tests merged in #306 |
| Account; Portal Me | Customer, Account/header | inspect account/session → portal destination | A03–A05 | portal tenancy tests |

## Adverse-path disposition

| Scenario | Status | Evidence or owner |
| --- | --- | --- |
| A01–A03 | Test-backed | provisioning, invitation, auth-entry, registry-role, and RLS suites |
| A04–A05 | Test-backed backend; UI recovery review remains | request-context binding and session-expiry behavior |
| A06 | Blocked | #305 must prove stable desktop collapse and usable phone navigation |
| I01–I09 | Test-backed where shipped | catalog, pricing, bins, ledger, reversal, count, and transfer suites; recipe/water remainder is outside pilot and owned by #278 |
| O01–O11 | Test-backed where supported | order, fulfillment, credit, transfer, delivery, concurrency, and RLS suites |
| O12 | Deferred | print pagination needs a dedicated physical-output acceptance run |
| P01–P08 | Browser + test-backed | portal smoke, continuity, cart, command, QBO payment, and tenant-isolation suites |
| U01–U04, U07–U10 | Test-backed where applicable | error envelopes, replay, context binding, time policy, RLS, and correlation IDs |
| U05 | Blocked | #304 and #305; rerun keyboard/narrow-width checks after both merge |
| U06 | Partially test-backed | quantity labels are present in the Chrome accessibility tree; full assistive-technology testing remains a release check |

## Explicit deferrals

- #278 owns recipe/water, cellar-map, keg-report, portal-schedule, and honest
  gate decisions. They are not ordering-pilot blockers unless product scope is
  widened.
- POS, QBO, chat, and Composer program tests remain their integration proof;
  this pass does not repeat external-provider sandbox testing.
- Performance with records beyond the first page and physical print output
  require production-like data/output and remain release checks.

## Commands run

- `bun run test:e2e` — PASS, Chrome, isolated Supabase test stack.
- Targeted inventory, portal, fulfillment, replay, tenancy, reversal, and docs
  Vitest files — 12 files / 127 tests passed.
- `bunx tsc --noEmit` — passed.
- `bun run lint` — passed with one pre-existing unused-parameter warning in
  the public-menu route.

## Sign-off gate

Merge #304 and #305, rerun the ordering smoke at desktop and phone widths, and
record the hosted smoke in #311. Until then the walkthrough is a completed
baseline with two named launch blockers, not production-readiness approval.
