# F3 adversarial walkthrough execution evidence

This is the durable evidence index for the 2026-09-11 F3 walkthrough. The
walkthrough started from `5f8743915a44dd8e63039e99c3162befdd14a40d`.
The initial browser/layout and audit commits were `95ca6c09b0aa7f263641a434db20fd1ed2ab1aec`
and `02d6c40586547d3f694cb3894cabbd1b561dfd34`. The remediation code was proved
at `662979b` after the earlier `34af080` product/test wave. The final audit
commit changes only this evidence file and the audit; its verification delta is
stated in the audit and does not change runtime behavior.

The run used the isolated local Supabase API/Postgres ports 54351/54352 and one
reset/fixture owner. Browser work used Next port 3219 and the named
`agent-browser` session `adversarial-completion`. No hosted system, real email,
real Slack/Square/QBO provider, deployed credentials, legal review, printer, or
assistive technology was used.

## Verification ledger

- At code commit `34af080`, `bun run test` passed 203 files and 1,930 tests in
  251.06 seconds after `bun run docs:api` corrected the only prior generated-doc
  mismatch. This run is suite health, not a substitute for scenario evidence.
- At code commit `662979b`, `tests/commands-inventory.test.ts` and
  `tests/bins.test.ts` passed 16 tests after a fresh database reset. The RED run
  first demonstrated that lower-case destination state and a new movement on an
  inactive SKU were accepted; the GREEN run proves both are rejected and no row
  is appended.
- At code commit `662979b`, `tests/taproom-count.test.ts` passed 29 tests. Its
  real lock-contention case now continues from stale rejection through refresh,
  variance save, one exact depletion, and durable receipt reopen.
- At code commit `662979b`, after the second fresh reset, `bun run test` passed
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
  “Two cases damaged during picking,” six cancelled/nothing due, and invoice
  `814977bb-2d54-4bd8-b0ea-a65764bcbe9b` for $600. Files are prefixed
  `p06-short-shipment`.
- Browser console and page-error captures were empty. The browser session and
  Next server were closed after capture.

The first F3 browser bundle at `/private/tmp/mgr-remainder-evidence/f3-browser`
is reused only for the exact paths named below: expired invite/reset/no-membership,
desktop/375 px navigation, order and SKU identities, draft save/relogin, portal
quantity validation, movement close/focus behavior, two-lot shipment, count
receipt, history paging, and disconnected integration screens. Its source
lineage was `95ca6c0` on base `5f87439`; the later source delta changes portal
quantity enforcement, fulfillment explanations, local-stock warning text, and
inactive-movement guards. Rows affected by that delta use the fresh remediation
bundle or fresh backend tests instead.

## Scenario evidence index

Every locally runnable row received a fresh targeted source/test/artifact audit.
“Proven” means the row's expected outcome was exercised. “Source only” means
some executable behavior was exercised but the complete connected acceptance
was absent or the required capability does not exist.

| Row | Status | Exact execution and boundary |
| --- | --- | --- |
| <a id="a01"></a>A01 | Source only | Fresh provisioning/import/invite tests; no customer-ready first-order cutover job. |
| <a id="a02"></a>A02 | Source only | Fresh auth/invite tests plus reused exact `invite-expired-375`, `password-no-session-375`, and `no-membership-375`; used-invite recovery was backend-only. |
| <a id="a03"></a>A03 | Proven | Fresh six-role same-order browser batch described above plus RLS/role tests. |
| <a id="a04"></a>A04 | Source only | Fresh request-auth/tenancy tests; no dirty-form account/brewery switch decision UI. |
| <a id="a05"></a>A05 | Source only | Fresh team/revocation tests; no open dirty page → revoked save → cache inspection browser chain. |
| <a id="a06"></a>A06 | Proven | Reused exact desktop/phone sidebar, browser Back, direct URL, and keyboard re-expand captures; current nav source unchanged. |
| <a id="i01"></a>I01 | Proven | Fresh order/fulfillment/search tests and reused exact order/SKU/invoice captures preserve brand, format, and unit. |
| <a id="i02"></a>I02 | Proven | Fresh format/volume tests prove later configuration edits do not rewrite frozen movement BBL. |
| <a id="i03"></a>I03 | Source only | Fresh format-component/BOM and repack tests prove volume-neutral source/destination legs; there is no single visible default/inheritance → mixed-pack → repack job. |
| <a id="i04"></a>I04 | Proven | Fresh `commands-inventory` movement-matrix test executes all nine supported manual types and invalid sign/channel/state combinations with exact BBL readback. |
| <a id="i05"></a>I05 | Proven | Fresh reversal tests and history readback prove linked compensation, reason, actor, immutable original, and blocked unsupported correction. |
| <a id="i06"></a>I06 | Proven | Fresh two-location backend/browser case described above distinguishes source on-hand zero from brewery ATP ten. |
| <a id="i07"></a>I07 | Proven | Fresh exact-match test plus the connected real-lock stale → refresh → variance → one depletion → reopen test. |
| <a id="i08"></a>I08 | Proven | Fresh replenishment tests prove inbound quantity is shown separately and prevents duplicate suggested demand. |
| <a id="i09"></a>I09 | Proven | Fresh `commands-inventory` history test deactivates a referenced SKU, renames location/bin, reopens intelligible history, rejects deletion/new use, and proves no appended row. |
| <a id="o01"></a>O01 | Source only | Fresh pricing/order tests exercise each refusal; no rendered adjacent remedy preserving the same dirty order. |
| <a id="o02"></a>O02 | Source only | Fresh snapshot tests preserve committed price/address; changed draft facts are not visibly compared before commitment. |
| <a id="o03"></a>O03 | Proven | Same fresh I06 browser case plus confirm tests quantify local/global shortage and preserve intentional confirm. |
| <a id="o04"></a>O04 | Proven | Fresh fulfillment regression executes exact 10 ordered → 6 picked → 4 shipped, 6 cancelled, 2 put back, 4 invoiced, and allocation release; P06 browser shows the customer result. |
| <a id="o05"></a>O05 | Source only | Fresh all-zero fulfillment test proves no invoice and allocation release; rendered explanation/closed-versus-cancelled naming is absent. |
| <a id="o06"></a>O06 | Proven | Fresh fulfillment adjustment/cancellation tests prove before/after, reason, staged restock work, and its completion. |
| <a id="o07"></a>O07 | Proven | Fresh distinct-request concurrent ship/adjust test proves one winner, stale loser, one shipment/invoice, and no stock overwrite. |
| <a id="o08"></a>O08 | Gated | Return tests cover currently coupled physical/financial returns; price-only and independent disposition policy remains Product/Finance-owned. |
| <a id="o09"></a>O09 | Proven | Fresh transfer regression completes to the wrong taproom then posts a linked compensating transfer; balances 5/0/3 and paired movement sums prove correction. |
| <a id="o10"></a>O10 | Source only | Fresh delivery regression proves failed/unconfirmed stops stay open, block return, remain on Today, and create no invoice; partial/refusal stock handling is unimplemented. |
| <a id="o11"></a>O11 | Proven | Fresh delivery tests prove unassigned/other-driver denial and reassignment effects. |
| <a id="o12"></a>O12 | Not reviewed | Source inventory exists; multipage physical print inspection was not performed. |
| <a id="p01"></a>P01 | Source only | Reused exact save/sign-out/relogin/edit browser flow plus fresh persistence tests; that same recovered browser draft was not submitted. |
| <a id="p02"></a>P02 | Proven | Fresh fault wrapper commits then throws, reconstructs auth, replays the exact request ID, and SQL asserts one order, two request ledgers, one created event, one submitted event. |
| <a id="p03"></a>P03 | Proven | Fresh injected definitive submit refusal, edit, review, exact retry, and persisted ship-to/date/quantity readback. |
| <a id="p04"></a>P04 | Source only | Fresh quote/snapshot tests reject stale facts; no rendered cart review comparison after a price/availability change. |
| <a id="p05"></a>P05 | Source only | RED/GREEN fixed command/database whole-unit inconsistency and fresh UI rules cover decimal/negative/blank/huge/paste; a full browser row-error matrix was not captured. |
| <a id="p06"></a>P06 | Proven | Fresh 375 px customer browser case described above shows what changed, why, $600 final amount, and nothing remaining due. |
| <a id="p07"></a>P07 | Proven | Fresh QBO/payment fixture tests cover pending, failed, partial, externally paid, authority, and timestamps without live-provider claims. |
| <a id="p08"></a>P08 | Proven | Fresh invoice/portal tests expose invoice-context question/contact actions and omit unsupported online payment controls. |
| <a id="r01"></a>R01 | Source only | Fresh recipe-version/scheduling tests retain the chosen version; no connected substitution/recalculation production walkthrough. |
| <a id="r02"></a>R02 | Source only | Fresh vessel/fermentation tests cover conflicts and chronology; connected rendered split/merge/late-reading design was not walked. |
| <a id="r03"></a>R03 | Source only | Fresh packaging tests prove atomic output/material/lot/loss reconciliation; connected rendered plan-versus-actual production job was not walked. |
| <a id="r04"></a>R04 | Source only | Fresh loss-reclassification tests prove immutable original and exact compensation; connected rendered review and remaining schema gate were not walked. |
| <a id="r05"></a>R05 | Source only | Fresh PO test records ordered 10/received 12, variance +2, exact retry and one receipt/movement; damage isolation and supplier disposition are absent. |
| <a id="r06"></a>R06 | Source only | Fresh trace tests cover finished-goods lots/recipients; full material-lot forward/back recall remains absent. |
| <a id="r07"></a>R07 | Source only | Fresh planning tests distinguish suggestion and commitment; no connected undo/dependency walkthrough after work starts. |
| <a id="x01"></a>X01 | Proven | Fresh one-fixture test runs physical count, delayed sale, linked refund, exact retry, expected 32/3968 → 16/3968, actual 1, and exactly one inventory movement. |
| <a id="x02"></a>X02 | Proven | Fresh deterministic Square tests retain unmapped facts, original event dates, later mapping, retry, and no default mapping. |
| <a id="x03"></a>X03 | Proven | Fresh deterministic tap/POS tests cover kick/swap/same beer/guest/partial and duplicate conflict without stock posting. |
| <a id="x04"></a>X04 | Gated | Keg custody/deposit independence requires Product/Finance/Operations policy. No policy was inferred. |
| <a id="x05"></a>X05 | Proven | Fresh QBO injected acknowledgment-loss tests reuse durable payload/idempotency identity and create no duplicate invoice. |
| <a id="x06"></a>X06 | Proven | Fresh QBO drift tests preserve external authority and require explicit conflict resolution. |
| <a id="x07"></a>X07 | Proven | Fresh deterministic disconnect/reconnect tests cover retained/superseded pending work and role ownership; no live provider was contacted. |
| <a id="x08"></a>X08 | Proven | Fresh Slack route/auth tests resolve current status at open time and prevent private record exposure after access loss. |
| <a id="x09"></a>X09 | Gated | Backend timezone/snapshot tests ran; current legal and amendment policy still requires Compliance/Product review. |
| <a id="x10"></a>X10 | Source only | Fresh compliance/channel tests expose unclassified data; there is no pre-reporting configuration workflow. |
| <a id="u01"></a>U01 | Source only | Fresh route/error tests cover empty, forbidden, not-found, and several failures; no connected rendered loading/unavailable/server-error action matrix. |
| <a id="u02"></a>U02 | Proven | Fresh portal committed-response-loss and movement/count exact-replay tests prove recoverable uncertainty and single effects. |
| <a id="u03"></a>U03 | Proven | Fresh composer/chat-history tests prove canonical effects, edit invalidation, stale-response suppression, and stale preview rejection. |
| <a id="u04"></a>U04 | Proven | Fresh backend/browser ORD-0005 case described above proves exact reachability beyond newest 50; large-catalog tests cover count/scale separately. |
| <a id="u05"></a>U05 | Source only | Reused exact keyboard/375 px/focus-return captures and composer overflow fix; the 720×450 CSS canvas is not true 200% browser zoom. |
| <a id="u06"></a>U06 | Not reviewed | Automated accessible-name assertions exist; no screen-reader/assistive-technology session was performed. |
| <a id="u07"></a>U07 | Source only | Fresh brewery-date/timezone tests pass; cross-device rendered date consistency was not exercised. |
| <a id="u08"></a>U08 | Proven | Fresh command/RPC/form boundary tests prove shared validation, authorization, transactions, and errors. |
| <a id="u09"></a>U09 | Proven | Fresh RLS/direct-RPC tenant/customer tampering matrix proves database refusal with nonempty controls. |
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
