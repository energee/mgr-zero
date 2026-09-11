# F3 adversarial walkthrough execution evidence

This is the durable evidence index for the 2026-09-11 F3 walkthrough. The
walkthrough started from `5f8743915a44dd8e63039e99c3162befdd14a40d`.
The latest product proof is exact code revision
`a5c2b30e6aa06e88a2aac5e07e0ee17a50cd0006`. Its behavior was introduced at
`924cf294f5084443bfa97d213c3642054d1bb166`: bounded, tenant/location scoped
confirmation-stock reads and removal of an unsupported other-location stock
assertion. The follow-up normalizes a nullable empty line response before the
same exact-SKU read and changes no nonempty-order behavior. Earlier browser and regression evidence was created before the #318
integration rebase. The map below records patch identity between those historical
objects and the integrated ancestry; those old SHAs are evidence lineage, not
exact-head labels.

The run used the isolated local Supabase API/Postgres ports 54351/54352 and one
reset/fixture owner. Browser work used Next port 3219 and the named
`agent-browser` session `adversarial-completion`. No hosted system, real email,
real Slack/Square/QBO provider, deployed credentials, legal review, printer, or
assistive technology was used.

## Historical-to-integrated commit map

`git patch-id --stable` produced the same patch ID for every pair below. Tree
hashes differ because the commits were replayed on the #318 integration ancestry.

| Historical SHA | Integrated SHA | Stable patch ID |
| --- | --- | --- |
| `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` | `579aad6186fb7575356e95a1133a11efe4963ea1` | `e704bc7af46caa209c179768c5ae1ddf6bf2f940` |
| `02d6c40586547d3f694cb3894cabbd1b561dfd34` | `daec91899f231e26b0ce7ce47163c835da051a21` | `782edc379b5adde9ab8d02943c68f2a02c75286b` |
| `34af080bd65e147a607aba1e83d06f5361b8faca` | `e62325f6a7c94b69d7badebb0fa300ff02c05746` | `d4334cdb4b6de9f7638baf729258a635ddbf43b6` |
| `662979b991d41d133a647bf6039e97ae8dd7894a` | `47231aed2678610fb13931424d0cc9174eeec035` | `e3b38d1d2a66bec0fed952b22a354e7fb3cbade2` |
| `dcefbfae15643866a15af152ef943ac9fa3bce52` | `f3607154e3519a1b3f07ee4fb5a549207cab1464` | `954caa0fb5817531c426566e27b61c7c51d7685d` |
| `9f061b0394cb98eabd0c5690b3d16f72a6baea86` | `70bb725d8941979aa725305dfb890ae11e8f0fec` | `2d1de11bf98a9aa4b1d6e3029f9448b357458c12` |
| `61df1d55e7b8060e2846b51d7650dbda2125404a` | `45fea192207b748d8c0c34dee83be3382cd4a73b` | `bc1a0132a3c9aa749cafac6a8e5846390fda90c5` |
| `2a6bdd019f884156d9d782a49c0f989dfa5db1ce` | `70c044f38377dfc3d198df7ec73cc19dd881380d` | `4843b976deb531fa7b954f58ad84b22616141d69` |
| `881468a8029d9a015d7ee0f3abdfb611ee0153f4` | `c5e00d803152511732db5d105e5f81ef10176f6f` | `aef4cdedc75e2acfd722d781cd8e228ca9f0bba9` |

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
- At code commit `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`, `tests/portal-orders-view.test.ts`
  passed 13/13 and `tests/commands-portal.test.ts`, `tests/orders-lifecycle.test.ts`,
  and `tests/rls-command-boundary.test.ts` passed 92/92 after a fresh isolated reset.
- At exact code commit `924cf294f5084443bfa97d213c3642054d1bb166`,
  the focused RED first returned 1,000 source rows for an order whose SKU was
  beyond the response cap and failed three false-other-location assertions.
  After the fix, `tests/inventory-read-completeness.test.ts` and
  `tests/orders-review-view.test.ts` passed 14/14: the target order receives
  source quantity 508 and ATP 505, while two-location, single-location-short,
  and never-stocked cases make no unsupported other-location claim.
- At final code commit `a5c2b30e6aa06e88a2aac5e07e0ee17a50cd0006`,
  the same focused stock/view batch passed 14/14 after nullable empty-line
  normalization; `bunx tsc --noEmit` passed and `bun run lint` passed with the
  one pre-existing `_request` warning in the public-menu route.
- With the final audit content present at the documentation commit following
  `a5c2b30e6aa06e88a2aac5e07e0ee17a50cd0006`, the seven-file pure
  screen/documentation suite passed 121/121,
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

The final connected portal fixture is
`/private/tmp/mgr-remainder-evidence/f3-astra-fixture.json`; its browser/SQL
bundle is `/private/tmp/mgr-remainder-evidence/f3-astra-browser`. It was created
after one isolated reset against exact code revision
`924cf294f5084443bfa97d213c3642054d1bb166`.

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
- **P06/O04/J02:** new evidence at `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`
  used order `8f9f4d5e-1cc7-47e1-a4c6-eb88e5070856` and invoice
  `04527971-6f4f-49a6-a339-1ad52855b3e4`. At 1440×900 and 375×812, the order
  showed ordered 10, shipped 4, “Two cases damaged during picking”, six cancelled
  with no units remaining to ship, and a separately unpaid $600 invoice. Files
  are prefixed `f3-quality-browser/p06-corrected-`.
- **P01/B05:** customer `1c57e3fd-a645-48c2-ba8b-440e2bc1e7b9` saved draft
  `bae43e13-73f3-41e5-bde7-83ccabdb32ec` with quantity 2 and note “Before
  recovery”, signed out, signed back in, reopened the same ID through **Continue
  / edit**, changed quantity to 4 and the note to “Edited after recovery”,
  reviewed $168.00, and submitted that same ID. `p01-edit-submitted-sql.txt`
  records the exact customer, ship-to, source, SKU, final fields, one target
  order row, exact create/quote/submit request IDs, and created→updated→submitted
  events. Files are prefixed `f3-astra-browser/p01-edit-`. Fresh final-head
  375×812 and 1440×900 reloads at
  `a5c2b30e6aa06e88a2aac5e07e0ee17a50cd0006` are recorded as
  `p01-final-head-smoke-375.*` and `p01-final-head-smoke-1440.*`; both retain
  the placed order's quantity 4, PO, edited note, and $168 total.
- **P05:** at 1440×900 and 375×812, blank, decimal `1.5`, negative `-1`, huge
  `9007199254740992`, and an `insertFromPaste` decimal `2.5` all disabled Save
  draft/Review order; every nonblank invalid value stayed visible with “Enter
  whole quantities of zero or more.” `p05-sql-counts.txt` records zero orders
  after every pre-submit invalid case. A valid integer paste event set `3` and
  enabled both actions. This completes the runnable input matrix, but the
  message remains global rather than row-specific/announced, so P05 stays
  Source only. Files are prefixed `f3-astra-browser/p05-`.
- Browser page-error captures were empty. The final console contained only
  React DevTools development notices. The browser session and Next server were
  closed after capture.

The first F3 browser bundle at `/private/tmp/mgr-remainder-evidence/f3-browser`
is reused only for the exact paths named below: expired invite/reset/no-membership,
desktop/375 px navigation, order and SKU identities, draft save/relogin, portal
quantity validation, movement close/focus behavior, two-lot shipment, count
receipt, history paging, and disconnected integration screens. Its source
lineage was `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec` on base
`5f8743915a44dd8e63039e99c3162befdd14a40d`; the later source delta changes portal
quantity enforcement, fulfillment explanations, local-stock warning text, and
inactive-movement guards. The final delta further separates fulfillment completion
from invoice balance and preserves staff fractional edits for dual-membership users.
Rows affected by those deltas use the fresh remediation/final bundles or focused tests.

## Scenario evidence index

Every locally runnable row received a fresh targeted source/test/artifact audit. Every Proven row below names an exact test title or artifact, its exact source SHA, and whether it was rerun, new, or reused.
“Proven” means the row's expected outcome was exercised. “Source only” means
some executable behavior was exercised but the complete connected acceptance
was absent or the required capability does not exist.

| Row | Status | Exact execution and boundary |
| --- | --- | --- |
| <a id="a01"></a>A01 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/provision-brewery.test.ts` — “provisions without membership via Bearer and replays concurrently without duplicate breweries”; `tests/commands-import.test.ts` — “imports ship-tos and channel price cells and reports duplicate creates explicitly”. No customer-ready first-order cutover job was exercised. |
| <a id="a02"></a>A02 | Source only | Reused browser artifacts from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`: `f3-browser/invite-expired-375.json`, `password-no-session-375.json`, and `no-membership-375.json`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/auth-confirm.test.ts` — “sets a session cookie once, then rejects replay” and `tests/invite-auth.test.ts` — “derives the displayed destination from membership”. Used-invite recovery was backend-only. |
| <a id="a03"></a>A03 | Proven | New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/a03-admin-order.txt`, `a03-admin-url.txt`, `a03-sales-order.txt`, `a03-sales-url.txt`, `a03-warehouse-order.txt`, `a03-warehouse-url.txt`, `a03-brewer-order.txt`, `a03-brewer-url.txt`, `a03-taproom-order.txt`, `a03-taproom-url.txt`, `a03-customer-order.txt`, and `a03-customer-url.txt` on order `8b6707a2-56c1-45f5-915a-04ac6735fca8`; the six exact role outcomes are recorded above. |
| <a id="a04"></a>A04 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/request-context-binding.test.ts` — “limits selected-context reads across detail families while preserving explicit switching”. No dirty-form account/brewery switch decision UI was exercised. |
| <a id="a05"></a>A05 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/team.test.ts` — “revokes a membership but never self or the last admin, and keeps the Auth user”. No open dirty page → revoked save → cache inspection browser chain was exercised. |
| <a id="a06"></a>A06 | Proven | Reused browser evidence from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`: `f3-browser/sidebar-collapsed.json`, `sidebar-reexpanded.json`, `admin-today-375-after.png`, and `phone-beer-url.txt`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/screen-links.test.ts` — “walks the main flows end to end”. Navigation source was unchanged by the later remediation. |
| <a id="i01"></a>I01 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/catalog-view.test.ts` — “maps list_skus through formatVolume of ½ / ⅙ / case” and `tests/compliance-view.test.ts` — “formats every date as a short calendar day and owns every movement SKU”; reused exact order/SKU/invoice browser captures from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`. |
| <a id="i02"></a>I02 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/formats.test.ts` — “a case of six four-packs derives 6 × child bbl; a movement freezes that volume; cycles and second levels are rejected” and `tests/inventory-reversal.test.ts` — “freezes report package class when the format definition is corrected”. |
| <a id="i03"></a>I03 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/formats.test.ts` — “replace_format_bom writes the format's bill with on_break; sku_bom is gone” and `tests/packaging.test.ts` — “breaks one case into six four-packs, volume-neutral, and returns the tray to stock”. No single visible default/inheritance → mixed-pack → repack job was exercised. |
| <a id="i04"></a>I04 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-inventory.test.ts` — “records every supported manual movement with exact signs, classification, and barrel volume”; its SQL readback covers all nine types and invalid sign/channel/state combinations. |
| <a id="i05"></a>I05 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/inventory-reversal.test.ts` — “appends the exact frozen opposite and replays before lifecycle checks”, “restricts roles, foreign resources, unsupported types and compensation chains”, and “reads scoped inventory metadata, names, and linked history even at zero stock”. |
| <a id="i06"></a>I06 | Proven | New browser evidence at historical `34af080bd65e147a607aba1e83d06f5361b8faca` / patch-identical integrated `e62325f6a7c94b69d7badebb0fa300ff02c05746`: `f3-review-browser/i06-admin-confirm-1440.json`, `.png`, and `.txt` on order `c285f69b-3895-41f4-9a03-fe9753270926`. Fresh RED/GREEN at exact code revision `924cf294f5084443bfa97d213c3642054d1bb166`: `tests/inventory-read-completeness.test.ts` — “assembles every owned stock row beyond the PostgREST row cap” proves ordered SKU 1,001 receives source 508 and ATP 505; `tests/orders-review-view.test.ts` — “distinguishes source stock from brewery ATP without inventing another stocked location”, “does not claim other-location stock for a single-location shortage”, and “does not claim other-location stock for a never-stocked SKU”. |
| <a id="i07"></a>I07 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/taproom-count.test.ts` — “persists a matching count and every explicit line without posting” and “waits for a real concurrent bin transfer, then refuses its stale observation”; the latter continues through refresh, one variance movement, and `get_taproom_count` reopen. |
| <a id="i08"></a>I08 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/replenishment-form.test.ts` — “requires a SKU and a finite nonnegative quantity, allowing explicit zero to release” and `tests/purchasing.test.ts` — “one draft per resolved vendor, gap rounded up to the purchase unit; a material with no vendor is skipped”. No connected existing-inbound-transfer effect on suggestions or duplicate-demand result was exercised. |
| <a id="i09"></a>I09 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-inventory.test.ts` — “keeps a referenced SKU, location, and bin legible after edits and blocks new movement on the inactive SKU”. Product and location/bin retirement do not exist, so the complete three-entity archive scenario remains absent. |
| <a id="o01"></a>O01 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/pricing.test.ts` — “create_order copies the customer's channel and prices lines from it; an unpriced sku is refused” and `tests/commands-portal.test.ts` — “rejects a ship-to that belongs to another customer”. No rendered adjacent remedy preserving the dirty order was exercised. |
| <a id="o02"></a>O02 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-quote.test.ts` — “freezes the selected customer's price, deposit, addresses, and honest pending tax” and “rejects price, ship-to, source, or deposit drift without writing an order”. Changed facts were not visibly compared before commitment. |
| <a id="o03"></a>O03 | Proven | Browser evidence at historical `34af080bd65e147a607aba1e83d06f5361b8faca` / patch-identical integrated `e62325f6a7c94b69d7badebb0fa300ff02c05746`: `f3-review-browser/i06-admin-confirm-1440.json` shows source zero versus brewery ATP ten and the intentional-confirm consequence. Fresh RED/GREEN at exact code revision `924cf294f5084443bfa97d213c3642054d1bb166`: `tests/inventory-read-completeness.test.ts` proves source 508/ATP 505 for ordered SKU 1,001; the three exact `tests/orders-review-view.test.ts` titles named in I06 prove truthful local-shortage text. Integrated `tests/orders-lifecycle.test.ts` at `47231aed2678610fb13931424d0cc9174eeec035` — “confirm warns (but does not block) when overselling” preserves the intentional choice. |
| <a id="o04"></a>O04 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “connects ordered 10 → picked 6 → shipped 4 → put back 2 with six cancelled and demand released”; corrected portal readback at `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`: `f3-quality-browser/p06-corrected-375.json`. |
| <a id="o05"></a>O05 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “ship with all lines qty_shipped 0 creates no invoice and releases allocations”. No rendered explanation of closed-versus-cancelled meaning was exercised. |
| <a id="o06"></a>O06 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “adjust after pick sets needs_restock; re-pick clears it” and “clears needs_restock and writes an order event; no movement”. |
| <a id="o07"></a>O07 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/orders-fulfillment.test.ts` — “serializes distinct workers racing shipment and adjustment so only one transition wins”; assertions require one successful transition, one stale conflict, and one shipment/invoice effect. |
| <a id="o08"></a>O08 | Gated | Return tests cover currently coupled physical/financial returns; price-only and independent disposition policy remains Product/Finance-owned. |
| <a id="o09"></a>O09 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/stock-transfers.test.ts` — “corrects a completed wrong-destination transfer with a linked compensating transfer”; exact SQL assertions retain both documents and produce 5/0/3 balances. |
| <a id="o10"></a>O10 | Source only | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/delivery.test.ts` — “keeps a failed stop open and blocks return without creating delivery money or stock effects”. Partial/refusal stock handling is unimplemented. |
| <a id="o11"></a>O11 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/delivery.test.ts` — “walks a mixed route: the driver departs, Today names the next stop, a transfer stop confirms without an invoice, return waits for the last stop” The same test asserts another driver cannot depart/confirm and sees no Today stop. |
| <a id="o12"></a>O12 | Not reviewed | Source inventory exists; multipage physical print inspection was not performed. |
| <a id="p01"></a>P01 | Proven | Newly observed at exact code revision `924cf294f5084443bfa97d213c3642054d1bb166`: `f3-astra-browser/p01-edit-draft-saved-375.json`, `p01-edit-relogin-orders-375.json`, `p01-edit-recovered-fields-375.json`, `p01-edit-recovered-review-375.json`, and `p01-edit-submitted-375.json` show draft `bae43e13-73f3-41e5-bde7-83ccabdb32ec` saved at quantity 2, recovered after sign-out/relogin, edited to quantity 4/note “Edited after recovery”, reviewed at $168, and submitted under the same ID. `p01-edit-submitted-sql.txt` records exact final IDs/fields, created→updated→submitted events, create/quote/submit request IDs, and exactly one target row. New final-head reload artifacts `p01-final-head-smoke-375.*` and `p01-final-head-smoke-1440.*` at `a5c2b30e6aa06e88a2aac5e07e0ee17a50cd0006` preserve quantity 4, PO, edited note, and $168 total. |
| <a id="p02"></a>P02 | Proven | New fault-injection regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-portal.test.ts` — “injects committed response loss, reloads, and replays exact create/submit identities with one SQL effect”; it asserts exact request/order/event IDs and one order. |
| <a id="p03"></a>P03 | Proven | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-portal.test.ts` — “recovers a definitive submit failure by editing, reviewing, and retrying the exact saved draft”; exact ship-to, requested date, quantity, and submitted-state readback are asserted. |
| <a id="p04"></a>P04 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-quote.test.ts` — “rejects price, ship-to, source, or deposit drift without writing an order” and “serializes a concurrent price change before drift validation and permits a safe retry”. No rendered cart-review comparison was exercised. |
| <a id="p05"></a>P05 | Source only | Newly rerun at exact code revision `924cf294f5084443bfa97d213c3642054d1bb166`: `f3-astra-browser/p05-blank-desktop.json`, `p05-decimal.json`, `p05-negative.json`, `p05-huge.json`, `p05-paste-decimal-375.json`, and `p05-sql-counts.txt` cover blank, typed decimal/negative/huge, and browser `insertFromPaste` decimal behavior at 1440×900/375×812. Invalid values stayed visible, showed the whole-quantity message, disabled Save/Review, and wrote no order; a valid integer paste enabled both actions. Patch-identical integrated `tests/commands-portal.test.ts` at `70c044f38377dfc3d198df7ec73cc19dd881380d` — “rejects fractional packaged quantities at the command and direct RPC boundaries” and “keeps staff fractional edits for a user who also belongs to the order customer” preserves database/command agreement. The message is global rather than row-specific/announced, so the complete accessible-error outcome remains absent. |
| <a id="p06"></a>P06 | Proven | New browser evidence at `2a6bdd019f884156d9d782a49c0f989dfa5db1ce`: `f3-quality-browser/p06-corrected-1440.json`, `p06-corrected-1440.png`, `p06-corrected-375.json`, `p06-corrected-375.png`, and `p06-corrected-375.txt` show ordered 10, shipped 4, six cancelled with no units remaining to ship, and the separate `unpaid · $600.00` invoice. New regression at the same SHA: `tests/portal-orders-view.test.ts` — “separates cancelled fulfillment from the unpaid invoice balance”. |
| <a id="p07"></a>P07 | Proven | Rerun with deterministic provider fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-state.test.ts` — “tracks partial, paid, reopened and voided states without mistaking credits for cash” and `tests/qbo-ui.test.ts` — “distinguishes a partial payment from a merely pushed invoice”. No live-provider claim. |
| <a id="p08"></a>P08 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/invoice-questions.test.ts` — “a buyer raises one on their own invoice only, and a missing invoice reads the same as a foreign one” and `tests/portal-invoices-view.test.ts` — “the unavailable drawing has no Pay and still offers Question”. |
| <a id="r01"></a>R01 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/production.test.ts` — “creates a recipe, then two versions whose ingredients snapshot extract potential” and “schedules a batch with no brand, brews it into the fermenter, and refuses a second brew there”. No connected substitution/recalculation production walkthrough was exercised. |
| <a id="r02"></a>R02 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/production.test.ts` — “moves part of a batch into an empty vessel, then closes the source when it empties”, “blends into an occupied vessel, leaving the target's batch identity alone”, and “records readings and lists them newest first”. No connected rendered split/merge/late-reading job was exercised. |
| <a id="r03"></a>R03 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/packaging.test.ts` — “writes the lot, a production_in per package filled, the BOM consumptions, and draws the tank down”. No connected rendered plan-versus-actual production job was exercised. |
| <a id="r04"></a>R04 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/completion-loss-review.test.ts` — “posts signed corrections in their actual period, leaves occupancy unchanged, preserves filed snapshots, and gates cellar Taproom filing”. No connected rendered review was exercised, and the remaining schema gate stays explicit. |
| <a id="r05"></a>R05 | Source only | New regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/purchasing.test.ts` — “records an overreceipt once and makes the missing damage/disposition contract explicit”. Damage isolation and supplier disposition remain absent. |
| <a id="r06"></a>R06 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/compliance.test.ts` — “follows the lot to its run, tank, and batch, and lists every ledger movement tagged with it”; `tests/shipping-lots.test.ts` — “traces more than 1000 movements without combining incompatible package units”. Full material-lot forward/back recall remains absent. |
| <a id="r07"></a>R07 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/purchasing.test.ts` — “one draft per resolved vendor, gap rounded up to the purchase unit; a material with no vendor is skipped”. No connected undo/dependency walkthrough after work starts was exercised. |
| <a id="x01"></a>X01 | Proven | New connected fixture regression, rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/pos-sales-sync.test.ts` — “keeps one physical count effect while a delayed sale and linked refund change expected only”; assertions preserve actual count, change expected consumption, and keep exactly one inventory movement. |
| <a id="x02"></a>X02 | Proven | Rerun with deterministic Square fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/pos-sales-sync.test.ts` — “keeps a sale before catalog visible and reconciles it through a later deleted variation mapping” and `tests/pos-mapping.test.ts` — “keeps ignored and unavailable variations visible with their mapping history”. |
| <a id="x03"></a>X03 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/tap-intervals.test.ts` — “atomically swaps, defaults own SKU, replays frozen identity after later close and rejects changed payload”, “guests require explicit label and finite size, and never fabricate a SKU”, and the competing swap/kick test. |
| <a id="x04"></a>X04 | Gated | Keg custody/deposit independence requires Product/Finance/Operations policy. No policy was inferred. |
| <a id="x05"></a>X05 | Proven | Rerun with deterministic QBO transport at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-push.test.ts` — “persists the exact authoritative body and provider key before fetch, then replays both after a lost response” and “recovers a provider create whose first local finish is denied with the same remote identity”. |
| <a id="x06"></a>X06 | Proven | Rerun with deterministic QBO fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-state.test.ts` — “distinguishes payment-only SyncToken changes from accountant total drift” and “renders a $105 synced edit over $100 frozen lines across staff and portal current views”. |
| <a id="x07"></a>X07 | Proven | Rerun with deterministic provider fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/qbo-push.test.ts` — “recovers an unknown push through a verified same-realm reconnect without changing its identity” and `tests/pos-lifecycle-sql.test.ts` — “purges locally before revoke and rejects a refresh response arriving after disconnect”. |
| <a id="x08"></a>X08 | Proven | Rerun with local Slack adapter fixtures at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/chat-jobs.test.ts` — “rechecks source resolution before sending or updating without a scan” and “rechecks membership and role before personal send/update”; `tests/chat-slack-renderer.test.ts` — “drops actions and marks the message resolved when the occurrence resolved”. |
| <a id="x09"></a>X09 | Gated | Backend timezone/snapshot tests ran; current legal and amendment policy still requires Compliance/Product review. |
| <a id="x10"></a>X10 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/commands-inventory.test.ts` — “record_movement surfaces CHECK failure for unclassified sale_removal” and `tests/sale-channels.test.ts` — “a new brewery has four channels and Export is untaxpaid”. No pre-reporting configuration workflow exists. |
| <a id="u01"></a>U01 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/not-found.test.ts` — “unknown uuid → 404 not_found” and “surfaces a membership-query database failure as 500 db_error, not 403 not_member”. No connected rendered loading/unavailable/forbidden/not-found/server-error action matrix was exercised. |
| <a id="u02"></a>U02 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/portal-continuity.test.ts` — “reload retries the persisted submit directly after a lost response”; `tests/taproom-count.test.ts` — “replays the exact request after a committed count response is treated as an inner 500”. Double-click, slow, offline, reload-during-save UI states and input survival were not captured. |
| <a id="u03"></a>U03 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/composer.test.ts` — “derives the signed registered input, invalidates edited previews, and emits one explicit commit” and `tests/chat-history.test.ts` — “binds confirmation to its author, conversation, and canonical input and records one replay-safe result”. |
| <a id="u04"></a>U04 | Source only | New browser evidence at `34af080bd65e147a607aba1e83d06f5361b8faca`: `f3-review-browser/u04-search-result.json`, `u04-search-open.txt`, `u04-old-order.txt`, and `u04-open-url.txt`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/search.test.ts` — “reaches an old open order after it falls beyond the newest fifty”. Old invoice and portal history, visible scope counts, and realistic latency were not exercised. |
| <a id="u05"></a>U05 | Source only | Reused browser artifacts from `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`: `f3-browser/composer-phone-after.json`, `movement-close-phone.json`, `weekly-count-keyboard.json`, and `admin-today-720-css-equivalent.png`; rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/mgr-screens.test.ts` — “keeps phone tables contained and avoids duplicate page titles”. The CSS-sized 720×450 canvas is not true 200% browser zoom. |
| <a id="u06"></a>U06 | Not reviewed | Automated accessible-name assertions exist; no screen-reader/assistive-technology session was performed. |
| <a id="u07"></a>U07 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/date-format.test.ts` — “uses consistent user-facing date formats without timestamp seconds” and `tests/locations-view.test.ts` — “timezone without an IANA extra is the brewery default”. Cross-device rendered date consistency was not exercised. |
| <a id="u08"></a>U08 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/rls-command-boundary.test.ts` — “keeps warehouse movement and sales order lifecycle RPCs role-bound” and `tests/commands-portal.test.ts` — “update_draft_order enforces the portal invariants at the RPC, not only in zod”. |
| <a id="u09"></a>U09 | Proven | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/rls-tenancy.test.ts` — “staff of A cannot see brewery B” and “customer user sees only their own customer record”; `tests/rls-command-boundary.test.ts` — “no authenticated user can call next_no directly, for their own or another brewery”. |
| <a id="u10"></a>U10 | Source only | Rerun at `662979b991d41d133a647bf6039e97ae8dd7894a`: `tests/api-command.test.ts` — “runs a query without a request id and returns a correlation id”. No connected uncertain-save UI demonstrates an actionable support reference. |

## Fixes found by the walkthrough

1. The phone composer flex child could expand the 375 px document to 388 px.
   `min-w-0` at the shared composer owner fixed it; focused rendering measured a
   375 px body afterward.
2. Portal create/update accepted fractional quantities while cart/quote required
   whole units. Command and database validation now agree.
3. Order confirmation showed only brewery-wide availability. It now presents
   source-location on-hand next to brewery ATP and gives the operator an
   actionable shortage decision.
4. The portal short-shipment result omitted the recorded reason and cancellation
  consequence. It now says why the quantity changed, what was cancelled, the
   final amount, and that no units remain to ship.
5. A direct staff movement could append to an inactive SKU and accept lower-case
   sample/festival state. Both baseline and deploy migration definitions now
   reject those inputs after idempotent replay recovery.
6. Short-shipment copy conflated fulfillment completion with invoice balance.
   It now describes cancelled units separately from the linked invoice's payment state.
7. The portal whole-unit guard treated a dual-membership Admin/Sales user as a
   customer during staff edits. Explicit portal scope now selects the portal contract;
   customer-only direct calls remain restricted, while staff fractional edits retain
   request identity, atomicity, and one effect.
8. Confirmation loaded every brewery ATP row and every source-location balance
   through uncapped requests. It now derives the exact order SKU set and loads
   both projections in tenant/location-scoped batches of at most 100; the
   >1,000-stocked-SKU regression returns source 508 and ATP 505 for SKU 1,001.
9. Confirmation inferred stock at another location from nonnegative or absent
   ATP. It now states only the observed source shortage and directs the operator
   to replenish that source; two-location, single-location-short, and
   never-stocked regressions reject the unsupported assertion.

## Evidence limits

The run proves local behavior against injected provider fixtures. It does not
verify hosted configuration, deliver real email, contact Slack/Square/QBO,
validate law or filing rules, inspect physical printouts, run true 200% browser
zoom, or use assistive technology. Gated and Not reviewed rows stay explicit;
Source only rows are not promoted by the aggregate full suite.
