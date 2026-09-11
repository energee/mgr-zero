# F3 adversarial walkthrough execution evidence

This is the durable evidence index for the 2026-09-11 F3 walkthrough. The
walkthrough started from `5f8743915a44dd8e63039e99c3162befdd14a40d`.
The initial browser/layout and audit commits were `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`
and `02d6c40586547d3f694cb3894cabbd1b561dfd34`. The remediation code was proved
at `662979b991d41d133a647bf6039e97ae8dd7894a` after the earlier
`34af080bd65e147a607aba1e83d06f5361b8faca` product/test wave. The final audit
commit changes only this evidence file and the audit; its verification delta is
stated in the audit and does not change runtime behavior.

The run used the isolated local Supabase API/Postgres ports 54351/54352 and one
reset/fixture owner. Browser work used Next port 3219 and the named
`agent-browser` session `adversarial-completion`. No hosted system, real email,
real Slack/Square/QBO provider, deployed credentials, legal review, printer, or
assistive technology was used.

## Verification ledger

- At code commit `34af080bd65e147a607aba1e83d06f5361b8faca`, `bun run test` passed 203 files and 1,930 tests in
  251.06 seconds after `bun run docs:api` corrected the only prior generated-doc
  mismatch. This run is suite health, not a substitute for scenario evidence.
- At code commit `662979b991d41d133a647bf6039e97ae8dd7894a`, `tests/commands-inventory.test.ts` and
  `tests/bins.test.ts` passed 16 tests after a fresh database reset. The RED run
  first demonstrated that lower-case destination state and a new movement on an
  inactive SKU were accepted; the GREEN run proves both are rejected and no row
  is appended.
- At code commit `662979b991d41d133a647bf6039e97ae8dd7894a`, `tests/taproom-count.test.ts` passed 29 tests. Its
  real lock-contention case now continues from stale rejection through refresh,
  variance save, one exact depletion, and durable receipt reopen.
- At code commit `662979b991d41d133a647bf6039e97ae8dd7894a`, after the second fresh reset, `bun run test` passed
  203 files and 1,932 tests in 250.64 seconds. The local raw log is
  `.local/mgr-private/f3-review-final-code-full.log`.
- With the final audit content present, the documentation/API suite passed 46/46,
  `bunx tsc --noEmit` passed, and `bun run lint` passed with the pre-existing
  `_request` unused-parameter warning in the public-menu route. Raw command logs remain local
  under `.local/mgr-private`; they are intentionally not linked as durable proof.
  The earlier `.local/mgr-private/f3-full-test.log` predates both remediation
  waves and is retained only as historical suite health.

## Fresh browser evidence

The connected remediation fixture is
`/private/tmp/mgr-remainder-evidence/f3-review-fixture.json`; the browser bundle
is `/private/tmp/mgr-remainder-evidence/f3-review-browser`. These local artifacts
were captured against the remediation source and are summarized here so the
audit does not depend on a broken private-log link.

- **A03:** one order, `8b6707a2-56c1-45f5-915a-04ac6735fca8`, was opened as
  Admin, Sales, Warehouse, Brewer, Taproom, and Customer. Admin/Sales/Warehouse
  saw their permitted order surface. Brewer and Taproom reached the useful
  `/denied?for=order&needs=admin%2Csales%2Cwarehouse` exit. Customer was sent to
  `/portal`; no staff record was rendered. Files are prefixed `a03-`.
- **I06/O03:** order `c285f69b-3895-41f4-9a03-fe9753270926` showed
  `4 · 0 at QA Warehouse · brewery ATP 10` and an actionable warning to move
  stock or intentionally confirm the consequence. Files are prefixed
  `i06-admin-confirm`.
- **U04/B14:** exact search found old open draft ORD-0005,
  `f492c88d-eac6-497c-b727-c21031b6218e`, after 55 newer orders and opened its
  detail. Files are prefixed `u04-`.
- **P06/O04/J02:** portal order ORD-0061,
  `46e85c1a-a859-48e7-b687-2503c7602b00`, showed ordered 10, shipped 4,
  “Two cases damaged during picking”, six cancelled/nothing due, and invoice
  `814977bb-2d54-4bd8-b0ea-a65764bcbe9b` for $600. Files are prefixed
  `p06-short-shipment`.
- Browser console and page-error captures were empty. The browser session and
  Next server were closed after capture.

The first F3 browser bundle at `/private/tmp/mgr-remainder-evidence/f3-browser`
is reused only for the exact paths named below: expired invite/reset/no-membership,
desktop/375 px navigation, order and SKU identities, draft save/relogin, portal
quantity validation, movement close/focus behavior, two-lot shipment, count
receipt, history paging, and disconnected integration screens. Its source
lineage was `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` on base
`5f8743915a44dd8e63039e99c3162befdd14a40d`; the later source delta changes portal
quantity enforcement, fulfillment explanations, local-stock warning text, and
inactive-movement guards. Rows affected by that delta use the fresh remediation
bundle or fresh backend tests instead.

## Scenario evidence index

Every locally runnable row received a fresh targeted source/test/artifact audit. Every Proven row below names an exact test title or artifact, its exact source SHA, and whether it was rerun, new, or reused.
“Proven” means the row's expected outcome was exercised. “Source only” means
some executable behavior was exercised but the complete connected acceptance
was absent or the required capability does not exist.

| Row | Status | Exact execution and boundary |
| --- | --- | --- |
| <a id="a01"></a>A01 | Source only | Fresh provisioning/import/invite tests; no customer-ready first-order cutover job. |
| <a id="a02"></a>A02 | Source only | Fresh auth/invite tests plus reused exact `invite-expired-375`, `password-no-session-375`, and `no-membership-375`; used-invite recovery was backend-only. |
| <a id="a03"></a>A03 | Proven | New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/a03-admin-order.txt`, `a03-admin-url.txt`, `a03-sales-order.txt`, `a03-sales-url.txt`, `a03-warehouse-order.txt`, `a03-warehouse-url.txt`, `a03-brewer-order.txt`, `a03-brewer-url.txt`, `a03-taproom-order.txt`, `a03-taproom-url.txt`, `a03-customer-order.txt`, and `a03-customer-url.txt` on order `8b6707a2-56c1-45f5-915a-04ac6735fca8`; the six exact role outcomes are recorded above. |
| <a id="a04"></a>A04 | Source only | Fresh request-auth/tenancy tests; no dirty-form account/brewery switch decision UI. |
| <a id="a05"></a>A05 | Source only | Fresh team/revocation tests; no open dirty page → revoked save → cache inspection browser chain. |
| <a id="a06"></a>A06 | Proven | Reused browser evidence from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`: `f3-browser/sidebar-collapsed.json`, `sidebar-reexpanded.json`, `admin-today-375-after.png`, and `phone-beer-url.txt`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/screen-links.test.ts` — “walks the main flows end to end”. Navigation source was unchanged by the later remediation. |
| <a id="i01"></a>I01 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/catalog-view.test.ts` — “maps list_skus through formatVolume of ½ / ⅙ / case” and `tests/compliance-view.test.ts` — “formats every date as a short calendar day and owns every movement SKU”; reused exact order/SKU/invoice browser captures from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`. |
| <a id="i02"></a>I02 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/formats.test.ts` — “a case of six four-packs derives 6 × child bbl; a movement freezes that volume; cycles and second levels are rejected” and `tests/inventory-reversal.test.ts` — “freezes report package class when the format definition is corrected”. |
| <a id="i03"></a>I03 | Source only | Fresh format-component/BOM and repack tests prove volume-neutral source/destination legs; there is no single visible default/inheritance → mixed-pack → repack job. |
| <a id="i04"></a>I04 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-inventory.test.ts` — “records every supported manual movement with exact signs, classification, and barrel volume”; its SQL readback covers all nine types and invalid sign/channel/state combinations. |
| <a id="i05"></a>I05 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/inventory-reversal.test.ts` — “appends the exact frozen opposite and replays before lifecycle checks”, “restricts roles, foreign resources, unsupported types and compensation chains”, and “reads scoped inventory metadata, names, and linked history even at zero stock”. |
| <a id="i06"></a>I06 | Proven | New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/i06-admin-confirm-1440.json`, `i06-admin-confirm-1440.png`, and `i06-admin-confirm.txt` on order `c285f69b-3895-41f4-9a03-fe9753270926`; new regression rerun at `662979b991d41d133a647bf6039e97ae8dd7894a` in `tests/order-sheets-view.test.ts` — “maps picked-below-ordered as a warning stepper”. |
| <a id="i07"></a>I07 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/taproom-count.test.ts` — “persists a matching count and every explicit line without posting” and “waits for a real concurrent bin transfer, then refuses its stale observation”; the latter continues through refresh, one variance movement, and `get_taproom_count` reopen. |
| <a id="i08"></a>I08 | Source only | Rerun at the tested code SHA covers par/standing controls and ordinary replenishment creation, but no connected existing-inbound-transfer effect on suggestions or duplicate-demand result was captured. |
| <a id="i09"></a>I09 | Source only | Rerun at the tested code SHA deactivates one referenced SKU, renames the location/bin, preserves legible history, and blocks bin deletion/new SKU movement. Product and location/bin retirement do not exist, so the complete three-entity archive scenario is absent. |
| <a id="o01"></a>O01 | Source only | Fresh pricing/order tests exercise each refusal; no rendered adjacent remedy preserving the same dirty order. |
| <a id="o02"></a>O02 | Source only | Fresh snapshot tests preserve committed price/address; changed draft facts are not visibly compared before commitment. |
| <a id="o03"></a>O03 | Proven | New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/i06-admin-confirm-1440.json` shows source zero versus brewery ATP ten and the intentional-confirm consequence; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-lifecycle.test.ts` — “confirm warns (but does not block) when overselling”. |
| <a id="o04"></a>O04 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “connects ordered 10 → picked 6 → shipped 4 → put back 2 with six cancelled and demand released”; new portal readback at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/p06-short-shipment-375.json`. |
| <a id="o05"></a>O05 | Source only | Fresh all-zero fulfillment test proves no invoice and allocation release; rendered explanation/closed-versus-cancelled naming is absent. |
| <a id="o06"></a>O06 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “adjust after pick sets needs_restock; re-pick clears it” and “clears needs_restock and writes an order event; no movement”. |
| <a id="o07"></a>O07 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “serializes distinct workers racing shipment and adjustment so only one transition wins”; assertions require one successful transition, one stale conflict, and one shipment/invoice effect. |
| <a id="o08"></a>O08 | Gated | Return tests cover currently coupled physical/financial returns; price-only and independent disposition policy remains Product/Finance-owned. |
| <a id="o09"></a>O09 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/stock-transfers.test.ts` — “corrects a completed wrong-destination transfer with a linked compensating transfer”; exact SQL assertions retain both documents and produce 5/0/3 balances. |
| <a id="o10"></a>O10 | Source only | Fresh delivery regression proves failed/unconfirmed stops stay open, block return, remain on Today, and create no invoice; partial/refusal stock handling is unimplemented. |
| <a id="o11"></a>O11 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/delivery.test.ts` — “walks a mixed route: the driver departs, Today names the next stop, a transfer stop confirms without an invoice, return waits for the last stop” The same test asserts another driver cannot depart/confirm and sees no Today stop. |
| <a id="o12"></a>O12 | Not reviewed | Source inventory exists; multipage physical print inspection was not performed. |
| <a id="p01"></a>P01 | Source only | Reused exact save/sign-out/relogin/edit browser flow plus fresh persistence tests; that same recovered browser draft was not submitted. |
| <a id="p02"></a>P02 | Proven | New fault-injection regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-portal.test.ts` — “injects committed response loss, reloads, and replays exact create/submit identities with one SQL effect”; it asserts exact request/order/event IDs and one order. |
| <a id="p03"></a>P03 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-portal.test.ts` — “recovers a definitive submit failure by editing, reviewing, and retrying the exact saved draft”; exact ship-to, requested date, quantity, and submitted-state readback are asserted. |
| <a id="p04"></a>P04 | Source only | Fresh quote/snapshot tests reject stale facts; no rendered cart review comparison after a price/availability change. |
| <a id="p05"></a>P05 | Source only | RED/GREEN fixed command/database whole-unit inconsistency and fresh UI rules cover decimal/negative/blank/huge/paste; a full browser row-error matrix was not captured. |
| <a id="p06"></a>P06 | Proven | New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/p06-short-shipment-375.json`, `p06-short-shipment-375.png`, and `p06-short-shipment.txt` on ORD-0061/invoice `814977bb-2d54-4bd8-b0ea-a65764bcbe9b`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/portal-orders-view.test.ts` — “explains a short shipment, its recorded reason, and that no remainder stays due”. |
| <a id="p07"></a>P07 | Proven | Rerun with deterministic provider fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-state.test.ts` — “tracks partial, paid, reopened and voided states without mistaking credits for cash” and `tests/qbo-ui.test.ts` — “distinguishes a partial payment from a merely pushed invoice”. No live-provider claim. |
| <a id="p08"></a>P08 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/invoice-questions.test.ts` — “a buyer raises one on their own invoice only, and a missing invoice reads the same as a foreign one” and `tests/portal-invoices-view.test.ts` — “the unavailable drawing has no Pay and still offers Question”. |
| <a id="r01"></a>R01 | Source only | Fresh recipe-version/scheduling tests retain the chosen version; no connected substitution/recalculation production walkthrough. |
| <a id="r02"></a>R02 | Source only | Fresh vessel/fermentation tests cover conflicts and chronology; connected rendered split/merge/late-reading design was not walked. |
| <a id="r03"></a>R03 | Source only | Fresh packaging tests prove atomic output/material/lot/loss reconciliation; connected rendered plan-versus-actual production job was not walked. |
| <a id="r04"></a>R04 | Source only | Fresh loss-reclassification tests prove immutable original and exact compensation; connected rendered review and remaining schema gate were not walked. |
| <a id="r05"></a>R05 | Source only | Fresh PO test records ordered 10/received 12, variance +2, exact retry and one receipt/movement; damage isolation and supplier disposition are absent. |
| <a id="r06"></a>R06 | Source only | Fresh trace tests cover finished-goods lots/recipients; full material-lot forward/back recall remains absent. |
| <a id="r07"></a>R07 | Source only | Fresh planning tests distinguish suggestion and commitment; no connected undo/dependency walkthrough after work starts. |
| <a id="x01"></a>X01 | Proven | New connected fixture regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/pos-sales-sync.test.ts` — “keeps one physical count effect while a delayed sale and linked refund change expected only”; assertions preserve actual count, change expected consumption, and keep exactly one inventory movement. |
| <a id="x02"></a>X02 | Proven | Rerun with deterministic Square fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/pos-sales-sync.test.ts` — “keeps a sale before catalog visible and reconciles it through a later deleted variation mapping” and `tests/pos-mapping.test.ts` — “keeps ignored and unavailable variations visible with their mapping history”. |
| <a id="x03"></a>X03 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/tap-intervals.test.ts` — “atomically swaps, defaults own SKU, replays frozen identity after later close and rejects changed payload”, “guests require explicit label and finite size, and never fabricate a SKU”, and the competing swap/kick test. |
| <a id="x04"></a>X04 | Gated | Keg custody/deposit independence requires Product/Finance/Operations policy. No policy was inferred. |
| <a id="x05"></a>X05 | Proven | Rerun with deterministic QBO transport at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-push.test.ts` — “persists the exact authoritative body and provider key before fetch, then replays both after a lost response” and “recovers a provider create whose first local finish is denied with the same remote identity”. |
| <a id="x06"></a>X06 | Proven | Rerun with deterministic QBO fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-state.test.ts` — “distinguishes payment-only SyncToken changes from accountant total drift” and “renders a $105 synced edit over $100 frozen lines across staff and portal current views”. |
| <a id="x07"></a>X07 | Proven | Rerun with deterministic provider fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-push.test.ts` — “recovers an unknown push through a verified same-realm reconnect without changing its identity” and `tests/pos-lifecycle-sql.test.ts` — “purges locally before revoke and rejects a refresh response arriving after disconnect”. |
| <a id="x08"></a>X08 | Proven | Rerun with local Slack adapter fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/chat-jobs.test.ts` — “rechecks source resolution before sending or updating without a scan” and “rechecks membership and role before personal send/update”; `tests/chat-slack-renderer.test.ts` — “drops actions and marks the message resolved when the occurrence resolved”. |
| <a id="x09"></a>X09 | Gated | Backend timezone/snapshot tests ran; current legal and amendment policy still requires Compliance/Product review. |
| <a id="x10"></a>X10 | Source only | Fresh compliance/channel tests expose unclassified data; there is no pre-reporting configuration workflow. |
| <a id="u01"></a>U01 | Source only | Fresh route/error tests cover empty, forbidden, not-found, and several failures; no connected rendered loading/unavailable/server-error action matrix. |
| <a id="u02"></a>U02 | Source only | Rerun at the tested code SHA proves portal/movement/count exact replay and single effects. Double-click, slow, offline, reload-during-save UI states and input survival were not captured. |
| <a id="u03"></a>U03 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/composer.test.ts` — “derives the signed registered input, invalidates edited previews, and emits one explicit commit” and `tests/chat-history.test.ts` — “binds confirmation to its author, conversation, and canonical input and records one replay-safe result”. |
| <a id="u04"></a>U04 | Source only | New order search/browser proof at the remediation SHA reaches ORD-0005 beyond 55 newer orders. Old invoice and portal history, visible scope counts, and realistic latency were not exercised. |
| <a id="u05"></a>U05 | Source only | Reused exact keyboard/375 px/focus-return captures and composer overflow fix; the 720×450 CSS canvas is not true 200% browser zoom. |
| <a id="u06"></a>U06 | Not reviewed | Automated accessible-name assertions exist; no screen-reader/assistive-technology session was performed. |
| <a id="u07"></a>U07 | Source only | Fresh brewery-date/timezone tests pass; cross-device rendered date consistency was not exercised. |
| <a id="u08"></a>U08 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/rls-command-boundary.test.ts` — “keeps warehouse movement and sales order lifecycle RPCs role-bound” and `tests/commands-portal.test.ts` — “update_draft_order enforces the portal invariants at the RPC, not only in zod”. |
| <a id="u09"></a>U09 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/rls-tenancy.test.ts` — “staff of A cannot see brewery B” and “customer user sees only their own customer record”; `tests/rls-command-boundary.test.ts` — “no authenticated user can call next_no directly, for their own or another brewery”. |
| <a id="u10"></a>U10 | Source only | Fresh uncertain-save results expose record/request IDs; no connected UI demonstrates an actionable support reference. |

## Fixes found by the walkthrough

1. The phone composer flex child could expand the 375 px document to 388 px.
   `min-w-0` at the shared composer owner fixed it; focused rendering measured a
   375 px body afterward.
2. Portal create/update accepted fractional quantities while cart/quote required
   whole units. Command and database validation now agree; staff-created
   fractional order lines remain supported by their separate contract.
3. Order confirmation showed only brewery-wide availability. It now presents
   source-location on-hand next to brewery ATP and gives the operator an
   actionable shortage decision.
4. The portal short-shipment result omitted the recorded reason and cancellation
   consequence. It now says why the quantity changed, what was cancelled, the
   final amount, and that nothing remains due.
5. A direct staff movement could append to an inactive SKU and accept lower-case
   sample/festival state. Both baseline and deploy migration definitions now
   reject those inputs after idempotent replay recovery.

## Evidence limits

The run proves local behavior against injected provider fixtures. It does not
verify hosted configuration, deliver real email, contact Slack/Square/QBO,
validate law or filing rules, inspect physical printouts, run true 200% browser
zoom, or use assistive technology. Gated and Not reviewed rows stay explicit;
Source only rows are not promoted by the aggregate full suite.
