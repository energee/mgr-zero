# MGR v1 completeness audit

Audited revision `be1079352a06`. Reviewed and amended 2026-09-27; the amendments are listed first and override the body where they conflict.

## Review amendments (2026-09-27)

- **F01 severity raised: repack is an oversell path, not only a trace gap. Verified on `mgr_test`.** After packaging 10 cases into AUDIT-LOT and repacking 1, `bin_on_hand` shows 9 cases, but `lot_on_hand` and the ship picker (`get_bin_move_stock`) still offer 10 cases of AUDIT-LOT. The −1 row has no lot and is hidden. `assert_bin_stock` checks the selected lot, so a 10-case ship would pass and leave the bin at −1 (traced from source, not executed). The fix's test must assert that the lot balance drops after repack and that a ship above the physical count is refused.
- **F12 narrowed.** The short-pick reason is already persisted (`resolve_short_pick` → `order_lines.short_reason`) and shown to the buyer (`lib/mgr/portal-order-view.ts`). The remaining gaps: (1) the ship-time reason when shipped < picked (the Ship and invoice SCHEMA-GATE), and (2) showing `short_reason` on staff order screens.
- **D8 deferred to post-v1.** Live water-salt suggestions are no longer a v1 blocker. Recipes keep recording salt additions (`recipe_water_additions`). No screen may present fixture-only suggestions as live.
- **D7, D9–D14 and the adopted-defaults table confirmed by the user.** The shortage row is amended as in F12.
- **First implementation wave:** F01, F02, F05 — independent data-correctness fixes, one migration and one regression test each.
- **Issues:** F01 #613 · F02 #614 · F03 #615 · F04 #616 · F05 #617 · F06 #618 · F07 #619 · F08 #620 · F09 #621 · F10 #622 · F11 #623 · F12 #624 · F13 #625 · F14 #626 · F15 #580.

27 September 2026. **Verdict: no, the full ten-slice product is not feature complete.** The ordering happy path works, and much of the underlying transactional machinery is substantial. However, production recording, exception recovery, access offboarding, and several stock/money facts remain incomplete or incorrect. A pilot is a separate decision and cannot establish full-v1 completeness.

The highest-priority blockers are lot identity lost during repacking; recipe quantities whose meaning changes after a material-unit edit; uncertain command outcomes that users can inadvertently resubmit as new work; missing buyer offboarding; permanently refused delivery recovery; incomplete brew-day/material accounting; and misleading deposit balances. These are concrete workflow/data problems, not requests for a larger ERP.

**Agreed scope:** Full ten-slice v1; pilot assessed separately. Decisions D1–D16 below now distinguish required functionality from explicit deferrals. These decisions set the completion target; they do not mark unfinished implementation complete or authorize code changes.

| Required for v1 | Explicitly outside or deferred from v1 |
|---|---|
| Auditable distributor totals by destination state, supporting transaction export, returns and adjustments | State excise-tax calculation engines and filing-ready state forms; filing remains external |
| Returned/failed delivery outcomes with document-linked stock recovery and honest route completion | No added vendor-returns subsystem from the receipt-correction decision |
| Frozen brewed recipe/process records; actual ingredient lots/quantities; packaging usage, returns, losses and corrections | Acids, mash-pH prediction and per-stage water targets |
| Explicit invitation acceptance for existing accounts, including member restoration (#580) | Silent account attachment is not allowed |
| Reliable buyer order-confirmation email; operator-owned manual QuickBooks payment sync with last-success/error visibility | Automatic background payment reconciliation; invoice-email delivery status inside MGR |
| Receipt-linked corrections preserving history and reconciling stock/PO quantities, guarded against downstream consumption | Rewriting historical ledger facts |
| MGR-managed catalog published to Square; verified create/update/retire and retry behavior | Existing Square catalog adoption as a required onboarding flow |
| — | Live water-salt suggestions (D8, deferred post-v1 by review); fixture-only suggestions must not be presented as live |
| Base-unit material counts with per-lot adjustment preview before confirmation | Purchase-unit count conversion and recent-lot suggestions for PO receiving |
| Existing taproom variance report; latest reading and direct recording action on the Batches list | Historical brand-by-period variance trends |
| Verified Open in QuickBooks invoice link; Accounting missing-email count and review shortcut | Treating invoice push success as proof of email delivery |

The user adopted the remaining recommendations below as planning defaults. The planning defaults below resolve the remaining behavior choices while preserving every explicit decision. SQL/API design and verification still remain; no SCHEMA-GATE is considered implemented merely because its scope is approved.

## Audit boundary and confidence

- Worktree: the main checkout; branch `main`.
- Audited revision: `be1079352a06fa085b38ffefc0e204989663314a`, also `origin/main` at orientation. Main has no current PR/base branch of its own. Comparison `origin/main..HEAD` is empty.
- Tracked/untracked working-tree status was clean after the user-requested pull and during final verification. **No local application changes are included.** This is a whole-tree audit of that revision, not a diff-only review.
- Open PRs are described as pending work; their code is not credited to this revision. No issues, reviews, deployments, or hosted configuration changes were made.
- Local generated Next types, test environment, throwaway test fixtures, and local audit evidence files are verification artifacts, not application changes. Database execution used the approved `mgr_test` stack on ports 54351/54352. Browser used this checkout's separate Next server on port 3002 with test-stack environment.
- **Verified** means directly established in source or reproduced; entries distinguish the two. **Inferred** means a consequence supported by the traced flow but not exercised. **Blocked** means the relevant behavior could not be exercised. Capability status is separate from confidence: a source-confirmed implementation can still be unverified against a real provider.
- Coverage is broad source inventory plus domain traces and selected runtime journeys. It is **not** a claim that every rendered state, every historical SQL body, or every external provider combination was exercised. The ledger makes those gaps explicit.

## What “feature complete” means here

A supported role can perform the promised ten-slice work through the supported entry point, see the committed result, hand it to the next role, and recover from ordinary mistakes and partial failures without direct database editing. Quantities, frozen prices, units, lots, tenant boundaries, and permissions remain correct. A documented gate is either implemented or explicitly excluded by a product decision; merely rendering its fixture does not complete it.

Sources, in descending practical authority: decisions made in this audit; current accepted product/schema decisions; current screen inventory and customer guides; original product specifications interpreted alongside later decisions; TODO and release documents as evidence of outstanding work. Progress logs describe history, not acceptance proof.

Primary sources:

- [Architecture](../../../.agents/ARCHITECTURE.md), [core product specification](../../../.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md), [schema design](../../../.agents/superpowers/specs/2026-08-31-mgr-schema-design.md), [schema decisions](../../../.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md).
- [UI/slice plan](../../../.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md), [brewing rules](../../../.agents/superpowers/specs/brewing-domain.md), [screen inventory](../../../components/mgr/screens.tsx), [live route map](../../../lib/mgr/screen-routes.ts).
- [Staff guide](../../../content/docs/staff-guide.mdx), [portal guide](../../../content/docs/portal-guide.mdx), [TODO](../../../TODO.md), [release readiness](../../../docs/operations/release-readiness-2026-09-18.md), [adversarial review](../../../.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md).

Roles: admin, sales, warehouse/assigned driver, brewer, taproom, and customer buyer. Public menu/documentation visitors have read-only entry points. The role is not just navigation: command registration, request context, RPC authorization, and RLS are part of the capability.

## Capability matrix

“Complete” below applies to the narrowly named capability, not the entire surrounding domain. Shared recovery finding F03 applies to ordinary mutation forms even where their normal path is implemented.

| Capability / user | Intended scope/source | Implementation status | Evidence and confidence | Remaining work |
|---|---|---|---|---|
| Provision brewery; tenant selection; sign-in/password recovery / admin, staff, buyer | Core §1; auth guides | partial | Verified source: auth routes, `tenancy.ts`, `request-context`; local sign-in works | Existing-account consent/attachment (#580); provider email verification; F03 |
| Staff roles and removal / admin | Current Team screen, role decisions | complete | Verified source: `invites.ts` includes `revoke_staff`; registry/RPC roles; taproom role is live | Real email and recovery acceptance; do not retain stale “taproom gated” claim |
| Buyer membership administration / admin or sales | Portal invitations and ongoing customer access | partial | Verified source: customer detail exposes invitation only; F04 | List/revoke customer memberships |
| Catalog: brands, SKUs, formats, BOM, locations/bins / admin, sales | Catalog inventory; later location decisions | partial | Verified source: catalog and inventory command families, forms, constrained SQL | Unit-history defect F02; settle pour ownership separately (#612) |
| Pricing, price groups, customer terms / sales | Orders/core specifications; guides | complete | Verified source; browser order used stored $36 case price | Test edge tax/provider reconciliation with credentials; shared F03 |
| FG inventory, ATP, movements, lot/bin moves / warehouse | Core §§3–4b | partial | Verified source: ledger/RPC and frozen BBL; shipment source selection exercised | Repack F01, ordinary-form recovery F03 |
| Physical counts, count corrections / warehouse, taproom | Current inventory/count screens | partial | Verified source: count/reversal paths exist | Implement required lot-allocation preview D10; purchase-unit count conversion is outside v1 per D9. Base-unit counts remain required |
| Recipes, versions, gravity / brewer | Recipe-builder decision, current screens | partial | Verified source and targeted runtime F02 | Preserve units; historical brew sheet F10 (water-salt suggestions deferred, D8) |
| Brewing, occupancy, readings, additions, transfers, losses / brewer | Brewing rules; slices 2–3 | partial | Verified source: production commands and volume accounting | Brew-day consumption/frozen sheet F10; abandoned-plan recovery F07; required Batches reading summary/action D13 |
| Schedule, close, repack packaging / brewer, warehouse | Packaging screens; product material-accounting promise | partial | Verified browser/source F01/F11 | Shared schedule model; actual material/loss accounting; lot-preserving repack |
| Plan production and material requirements / brewer, warehouse | Planning slice; requirements views | partial | Verified source: requirements and PO drafting | Cancel/reschedule unstarted work F07 |
| Customers, ship-tos, order placement / sales, buyer | Core orders; portal guide | complete | Verified source and buyer→sales browser journey | Buyer offboarding separate; required confirmation email F13/D5 |
| Confirm, adjust, cancel, short pick, restock / sales, warehouse | Orders exception design | partial | Verified source, confirm/pick exercised | Persist ship-time shortage reason and show `short_reason` to staff F12; general recovery F03; Adjust surface PR #611 |
| Ship, invoice now/on delivery, returns / warehouse, sales | Core orders; shipment/credit design | partial | Verified source, invoice-now browser path passed | Permanent-refusal F06; deferred-invoice return path; F03 |
| Delivery routes and assigned-driver handoff / warehouse | Delivery slice and guide | partial | Verified source and existing delivery test bodies | Honest terminal state for refused stops and returned stock F06 |
| Keg pools, handoffs, returns, deposits / warehouse, sales | Keg slice and current deposit decisions | partial | Verified source: physical events separate from invoice deposit lines | Deposit balance F05; test entire physical/money reconciliation |
| Vendors, contracts, POs, partial/over receiving / warehouse, brewer | Purchasing slice; guide | partial | Verified source: receive RPC writes receipt/lots/stock | New PO PR #609; implement approved receipt-linked correction D6; recent-lot suggestions deferred by D12 |
| QBO mappings, invoice push, payment sync / admin, sales | QBO boundary/core §5 | partial | Verified source: durable push/manual sync; provider exercise blocked | Recovery disconnect F08; verify manual sync D5; implement QBO link D15 and missing-email review D16 |
| Buyer invoices, pay, questions, reorder / buyer | Portal guide | partial | Verified source and order path; QBO pay blocked | Provider success/failure acceptance, accessible history F09 |
| Taproom stock, counts, taps, pars, variance / taproom, warehouse | Count-authoritative POS decision; current screens | partial | Verified source and pure view tests | Historical brand-by-period trends deferred by D11; Square acceptance blocked |
| Square connection, mapping, expected sales, menu publication / admin, taproom | Current POS/menu decision | partial | Verified source: OAuth/transport/commands, count owns physical depletion | Recovery F08; verify MGR-to-Square create/update/retire publishing (D7); adoption UI not required |
| Public menu / visitor | Current menu screens/API | complete | Verified source: public route/projection exists | Hosted publication/cache/integration acceptance remains unverified |
| Compliance registries and immutable filing snapshots / sales, admin | Compliance slice | partial | Verified source: approvals, registrations, filing guards | Current-only in-process boundary F14; mapping gate; implement agreed D1 output |
| Sales volume by destination state / admin, sales | User-confirmed distributor requirement | partial | Verified source and existing test: `byState` contains taxable sale-removal BBL | Implement agreed D1 totals/export with returns, adjustments and supporting transactions; not an absent feature |
| Filing-ready state tax calculations/forms | Explicit user decision D1 supersedes original PA/OH filing-output intent | outside v1 scope | Filing remains external; no state calculation engine claimed | Keep reports and guides explicit about this boundary |
| Lot trace and recall recipients / admin, sales | Trace screen and current query | partial | Verified source: trace query has recipient path | Repacked stock breaks chain F01; guides lag implementation |
| CSV migration/import / admin | Current import screen/guide | partial | Verified source: staged import exists | Durable reload/retry recovery F03 |
| Ask MGR and confirmed tool actions / staff | Revised AI spec: role-filtered allowlist, not every command | unverified | Registry/confirmation/admission source inspected; local composer stayed in setup | Diagnose local initialization; hosted #329, provider/tool journey verification |
| Slack install, link, notify; scan/deliver/cleanup jobs / admin, staff | Chat notification specification | unverified | Entry points, auth/retry boundaries inspected | Exercise real Slack, scheduler, rate/retry and delivery outcomes with authorized credentials |
| Settings, team, channels, units, imports / admin, staff | Current guides/screens | partial | Source inspected, browser shell roles work | Water profile discoverability/parity; access/recovery issues above |
| DTC store, other POS/chat providers, voice, multicurrency, automatic QBO entity creation, serial-keg tracking | Explicit exclusions/later provider choices | outside v1 scope | Product/decision evidence | Do not add to completion plan |

## Ranked findings: confirmed defects and recovery gaps

All fixes are proposals only. Where there is no exact existing issue, that is stated; no new issue was created. “Blocks both” means feature completeness and release of the affected workflow, not necessarily an explicitly narrower pilot that excludes it.

### F01 — Repacking drops finished-goods lot identity

**Verified by runtime and source. High impact; blocks both.** A warehouse user repacks a tracked case into smaller packs. Expected: deduction and outputs preserve traceable source identity while conserving volume. Actual: repack aggregates stock at SKU/location/bin and inserts both movements without a lot.

Evidence: [latest repack SQL](../../../supabase/migrations/20260926010000_packaging_bom_fefo.sql:249), [command](../../../lib/commands/packaging.ts:102), [lot trace](../../../lib/commands/compliance.ts:196). Local registered-command chain scheduled a batch, recorded brew day, packaged ten cases into lot `266db4e5-546d-4880-9d19-3d7ee40874c4`, and repacked one case into six four-packs. Result: production +10 with lot; parent -1 with null lot; child +6 with null lot. Total beer is conserved, but lot balance/recall provenance is not.

Smallest fix: require/select the source finished-goods lot at the same stock grain used by shipping, deduct it, and preserve trace identity on outputs. Test package→repack→ship→trace and insufficient quantity for one lot. No new generic inventory layer. Existing FEFO/BOM work (#599) does not fix this; no exact open issue found. Reproduction: a registered-command script on `mgr_test` (schedule → brew day → package → repack), kept locally.

### F02 — Editing a material unit changes an existing recipe version

**Verified by runtime and source. High impact; blocks both.** A brewer creates a recipe using a material before its first receipt, then changes that material from lb to kg. Expected: the saved recipe keeps its meaning or the unit change is refused. Actual: the unit guard only checks material movements; recipe reads combine frozen quantity/extract with the current material unit.

Evidence: [unit guard](../../../supabase/migrations/20260927020000_material_keep_uom_factor.sql:30), [recipe read](../../../lib/commands/production.ts:192). Local recipe: 60 lb/BBL, extract 1.037, efficiency .75, attenuation .78. Without changing the version, changing the material to kg moved predicted OG from **13.2655 to 27.7254 °P** and ABV from **5.4985% to 12.1222%**.

Smallest fix: refuse unit/conversion edits once dependent recipe/BOM/PO facts exist, or snapshot units where approved. Start with the guard, then check every stored quantity dependency. #606 preserves an omitted conversion factor; it does not protect recipe history. No exact open issue found. Requires a new migration, never editing the committed one.

### F03 — Recovery identity is not durable across ordinary form edits/reloads

**Verified source; lost-response scenario inferred, not network-fault reproduced. High impact; blocks both for consequential writes.** An inventory adjustment commits but its response is lost. The user changes a note/quantity or reloads and retries. Expected: resolve or replay the original command before accepting a new mutation. Actual: the shared hook assigns a new request ID when payload changes, and ordinary forms discard its failure classification. Reload loses the in-memory request identity.

Evidence: [shared hook](../../../lib/commands/use-command-form.ts:24), payload key/replacement at lines 35–38, failure at 43–46, form wrapper at 74–100; movement form uses this hook. Server same-ID idempotency is present and is not the defect. Specialized portal/composer/count/completion recovery paths must not be replaced with a weaker generic path.

Related manifestations of the same recovery issue: invitation request identity is a ref ([invite-form](<../../../lib/invite-form.ts:19>); after Auth succeeds and membership persistence fails, a reload can strand the pending membership. `tests/commands-invites.test.ts` exercises the partial boundary. CSV batch identity is component state ([import wizard](<../../../app/(app)/settings/import/import-wizard.tsx:17>); the staff guide explicitly warns that re-upload can double opening stock.

Smallest fix: freeze input/context/request ID after an unknown outcome; expose an unchanged retry/reconciliation action; persist/resume only the consequential pending operation or existing import/invite batch. Do not build a universal workflow engine. Verify commit+lost response, edit, close/reopen, reload, changed tenant, and duplicate retry. #603 handles expired pending Auth invitations, not this entire recovery problem; #580 is related existing-account consent, not a substitute.

### F04 — A brewery cannot revoke a customer's portal membership

**Verified source. High impact; blocks both.** A buyer leaves a customer or receives access in error. Expected: authorized staff remove that customer's access while preserving account/history. Actual: customer detail offers Invite; the command family has staff revocation but no corresponding portal membership administration.

Evidence: [customer detail](<../../../app/(app)/customers/[id]/page.tsx:31>), [staff revoke](../../../lib/commands/invites.ts:40), baseline `customer_users` membership and helper. Searches included revoke/remove/membership/customer_users, registry and callers, not just one missing button.

Smallest fix: list and revoke same-tenant customer memberships with server authorization and retained audit/history; avoid deleting the global Auth identity. Test revoked user with an existing session. No exact open issue found; #580 concerns consent/attachment and is adjacent, not the same capability.

### F05 — Voided/written-off deposit invoices still count as money held

**Verified source and acknowledged TODO. High impact; blocks both for keg deposits.** Sales voids/writes off a deposit invoice. Expected: deposit balance follows agreed invoice/refund state. Actual: the view sums deposit and refund lines regardless of invoice state, leaving held dollars/counts and mismatch flags misleading.

Evidence: [view](../../../supabase/migrations/00001_baseline.sql:2247), portal/taproom consumers, TODO “Exclude voided and written-off invoices from keg_deposit_balances.” Existing [#605](https://github.com/energee/mgr-zero/pull/605) follow-up; its mismatch fix does not close this.

Smallest fix: new view migration implementing the agreed void/write-off/refund inclusion rule; test deposit→partial refund→void/write-off and physical keg balance independently. Confirm how a credit/refund against a voided source is represented; do not merely hide a mismatch.

### F06 — A permanently refused invoice-on-delivery shipment has no honest recovery

**Verified source; complete refusal journey not browser-exercised. High impact; blocks full delivery completeness and release of that path.** Driver cannot deliver and brings beer back permanently. Shipping already removed stock; no invoice exists until delivery. Cancel refuses shipped orders; return requires an invoice; an unresolved stop prevents normal completion. “Deliver later” handles delay, not permanent refusal.

Evidence: latest shipping [SQL](../../../supabase/migrations/20260913110000_hosted_schema_catchup.sql:969); deferred invoice [SQL](../../../supabase/migrations/20260910120847_deploy_current_schema.sql:326); baseline cancel at 2670 and return at 4924/4938; `tests/delivery.test.ts:187` and staff guide delivery section.

Approved scope (D2): an explicit failed/returned stop outcome with a document-linked stock return and an honest route terminal state, preserving returned quantities, source lots and tax facts. Invoice-on-delivery fulfillment remains in v1. Detailed partial-return and reconciliation rules still need to be specified before implementation. Never require falsely confirming delivery or a generic stock adjustment. No exact open issue found.

### F07 — Unstarted production plans cannot be cancelled cleanly

**Verified source; impact inferred. Medium/high impact; feature blocker.** A brewer schedules the wrong batch/run or abandons a plan. Expected: cancel/reschedule unstarted work without pretending to brew/package it. Actual: command searches find schedule/record/update outputs, but no batch cancellation or packaging-run cancellation; requirements continue to include unbrewed/unclosed plans. An open packaging run can also block batch completion.

Evidence: [requirements](../../../supabase/migrations/20260926010000_packaging_bom_fefo.sql:301), [packaging command inputs](../../../lib/commands/packaging.ts:46), [completion guards](../../../supabase/migrations/20260925113742_close_run_batch_residual.sql:74). Searches covered cancel/delete/close/update and registered operations.

Smallest fix: cancel/reschedule only unstarted batches/runs; exclude cancelled records from requirements and completion blockers; retain the record. Started production keeps explicit physical correction rules. No exact open issue found; depends on a narrow lifecycle decision, not scheduling optimization.

### F08 — Recovery-required integrations hide their disconnect action

**Verified source; real token-revocation exercise blocked. Medium/high impact; feature and affected-integration release blocker.** An admin's Square/QBO connection enters recovery_required. Expected: reconnect or deliberately purge/disconnect through a supported action. Actual: disconnect surfaces require `connected && connectionId`, conflating healthy connectivity with the existence of a connection to clean up. Square can display “disconnected” despite retained recovery state.

Evidence: [Square health](<../../../lib/supabase/integration-tokens.ts:530), [Square disconnect route](<../../../app/(app)/settings/pos/disconnect/page.tsx:11>), [QBO disconnect route](<../../../app/(app)/settings/accounting/disconnect/page.tsx:12>), inventory gate at `screens.tsx:1216`. Square's underlying disconnect accepts the connection identity and tracks remote revocation uncertainty.

Smallest fix: separate connection existence from health, expose supported cleanup for recovery state, and display local purge versus remote revocation truthfully. QBO backend constraints must be addressed with its gate. Existing TODO Accounting recovery-disconnect item; do not claim provider revocation succeeded without evidence.

### F09 — History has silent boundaries without continuation

**Verified source. Medium impact; feature blocker once history exceeds the boundary.** Sales needs an older unpaid invoice or a buyer needs older orders. Expected: discoverable complete history or an explicit bounded view with continuation/search. Actual: staff list defaults to 50, max 200, no offset; portal lists depend on the service row cap without a paging UI.

Evidence: [orders list](../../../lib/commands/orders.ts:222), invoices at 295, [portal lists](../../../lib/commands/portal.ts:151). Staff exact-document search mitigates retrieval when a number is already known; it does not make browsing complete.

Smallest fix: page these histories with stable ordering and an honest more-results affordance. Do not retrofit every small catalog read into a new query framework. Related recent unpaged-read fixes (#571) do not prove these lists complete. No exact open issue found.

## Promised functionality, gated work, and product choices

### F10 — Brew day records knockout, not the promised complete production record

**Verified source. Feature blocker under full production scope.** Brewer expects actual ingredient lots/quantities and a frozen process sheet for the brewed version. `record_brew_day` records date, vessel, and volume; the screen explicitly gates ingredient-lot consumption and the frozen sheet. Later cellar additions exist but do not replace brew-time ingredient consumption.

Evidence: [screen gate](../../../components/mgr/screens.tsx:1644), [production command](../../../lib/commands/production.ts:265), recipe latest-version read at 183 and brew-day read around 352; staff guide brewing section. TODO names the same gate.

Smallest fix: use D19 and the adopted production defaults below, then wire one atomic brew-day record and its historical read. Preserve planned-vs-actual distinction and units. Depends on F02 and D3; no silent schema choice.

### F11 — Packaging has fixture-only review and incomplete actual-material accounting

**Verified browser and source. Feature blocker for the retained packaging promise.** The explorer shows planned outputs/material shortages and close review; live scheduling uses an alternate controlled tree with an empty model. Close adapters suppress review data. The RPC posts theoretical BOM quantities, without the complete actual usage/return/damage inputs promised by the product.

Evidence: [shared schedule view](../../../components/mgr/views/schedule-packaging-run.tsx:20), live `app/(app)/packaging/schedule-run-form.tsx`; `app/(app)/packaging/[id]/close/page.tsx` and `lib/mgr/close-packaging-run-view.ts`; [FEFO/BOM SQL](../../../supabase/migrations/20260926010000_packaging_bom_fefo.sql). Live and explorer were opened in the browser.

Smallest fix: land shared schedule model work [#610](https://github.com/energee/mgr-zero/pull/610), then implement actual material usage/return/loss accounting and committed close results using the adopted packaging defaults below. #610 does not implement all shortfall/material gates. Do not invent a wholesale-release command flag because a fixture drew a switch. Dependencies F01, F02, F07, and approved material-accounting schema.

### F12 — Ship-time shortage explanations cannot be saved (narrowed by review)

**Verified source. Medium impact; feature blocker if retained as specified.** Warehouse ships less than picked. Quantities and restock handling exist, but the ship-time reason does not persist. The short-pick reason already persists and reaches the buyer (see amendments); staff order screens do not show it.

Evidence: core specification shortage requirement; [screen gates](../../../components/mgr/screens.tsx:995), [ship command](../../../lib/commands/orders.ts:112), ship view/form. Smallest fix: attach the reason to the short-pick resolution or short-shipment event where staff confirms the shortage, persist it with that transaction, and expose it to sales/buyer without requiring duplicate entry of an unchanged reason. Existing TODO item. No separate backorder engine required.

### F13 — Notifications and accounting automation promises exceed current demonstrated behavior

**Verified source gaps; provider outcomes blocked.** Original scope includes customer order-confirmation email; current confirmation has no demonstrated buyer notification outbox. Auth invitation email and staff Slack do not fulfill that promise. Original QBO scope describes polling/webhooks and entity pickers; current payment reconciliation is an explicit manual sync, with exact external-ID mapping inputs.

Evidence: core specification lines 122 and 237–243, `lib/commands/orders.ts` confirm operation, `lib/commands/qbo.ts`, inspected API/job inventory. Searches covered confirmation, email, notification, webhook, payment sync, scheduled entry points and callers.

Approved D5 scope: reliable buyer order-confirmation email and explicit manual QuickBooks payment sync with an accountable operator, last-success visibility and error feedback. Automatic scheduled payment reconciliation/webhooks are outside v1; amend the older automation promise. Implement durable confirmation delivery and safe retry handling, and verify the manual reconciliation workflow against real provider outcomes. Retain exact-ID QuickBooks mapping for v1 under the accepted recommendation; a new entity-picker workflow is not required. These gaps do not imply Slack is missing. No exact open issue found.

### F14 — Historical in-process volume is explicitly outside the current report

**Verified source; product boundary, not a confirmed misleading-UI defect.** The report calculates packaged balances for the requested period but reads current open occupancy for `inProcess`. Crucially, the live view explicitly labels this **“tanks now, not at period end.”** That invalidates treating the current display as an undisclosed historical calculation bug.

Evidence: [report SQL](../../../supabase/migrations/20260925152847_transfer_loss_adjustments.sql:436), [visible qualification](../../../components/mgr/views/monthly-compliance.tsx:25). Filed snapshots retain the figures, so external consumers must preserve the same meaning.

The agreed D1 distributor totals do not add a historical tank-inventory requirement. For other retained compliance outputs: if period-end in-process inventory is required, derive it from dated volume facts and test periods before/after transfers and closure. Otherwise retain the honest label and explicitly exclude it from historical filing calculations. **Do not add this as an unconditional defect fix.** Separately, `byState` currently aggregates taxable `sale_removal` only (lines 420–421); The approved D1 scope requires auditable state totals/export including returns and adjustments; extend and reconcile this projection accordingly. No exact open issue found.

### F15 — Existing identities cannot complete normal attach/reinvite journeys

**Verified source and approved v1 scope (D4). Feature-completeness blocker for existing-account onboarding and restoration.** Admin invites an email that already has an account or restores a removed member. The system refuses implicit attachment. This is an intentional consent boundary, not a reason to grant access silently.

Existing [#580](https://github.com/energee/mgr-zero/issues/580). #603 expires pending Auth attempts after 15 minutes but does not implement attach/consent. Approved scope: explicit invitation acceptance by the existing identity, preserving the current access checks, including restoration after membership removal. Global account deletion is not an acceptable recovery procedure. Acceptance and membership validation must complete before access is granted.

## Secondary gaps and contradictions

These are not all release blockers. Resolve behavioral promises before spending effort on cosmetic cleanup.

| Artifact conflict / gap | Evidence | Classification and sufficient action |
|---|---|---|
| “174 screens, 173 mapped” can be mistaken for completion | TODO, screen routes/composition tests, F11 | Verified: mapping proves entrypoint presence, not matching controls, data, or recovery. Keep semantic parity checks for affected screens |
| Water chemistry was deferred in Sept 7 recipe scope, then specified Sept 14 | `2026-09-14-water-salt-suggestions-design.md`; #396 split work; WaterSheet `chemistryKnown=false` | Deferred post-v1 by D8 (review amendment): calculator/fixtures and profile CRUD exist; live binding waits. Keep acids/mash-pH/per-stage expansion out |
| Water profiles exist but Settings labels them unavailable | `app/(app)/settings/page.tsx`, `lib/mgr/settings-view.ts`, `/catalog/water-profiles` | Verified discoverability defect; link existing feature rather than inventing another |
| Adjust lines is a dialog with a full-page back header | TODO; [#611](https://github.com/energee/mgr-zero/pull/611) | Decision already made: full route. Pending PR, not a new decision |
| New PO cannot remove a partially entered row; view/form disagree on whether row counts | TODO; [#609](https://github.com/energee/mgr-zero/pull/609) | Confirmed validation dead end. Decision already made: shared row predicate and Remove |
| Settings portal-source/customer edit/Units controls diverge from inventory surfaces | Settings/Customer view adapters; standalone gravity and portal forms | Verified source parity gaps. Match existing view/control/surface; do not treat every visual mismatch as a new domain feature |
| Order lists label confirmed sales rows “Pick”, then open a detail with no pick action for sales | `orders-list-view.ts`, `nextAction`; local sales versus warehouse browser | Verified misleading role verb, authorization holds. Use role-appropriate “Open”/handoff wording; neither a data nor tenant leak |
| QBO link/email status, missing-email count; recent PO lots; batch reading shortcut; brand trend; material count preview/conversion | Nine partial gates in screen inventory/TODO | Source-confirmed gaps. D9/D11/D12/D14 defer purchase-unit count conversion, historical trends, recent-lot suggestions and invoice-email status. D10/D13/D15/D16 require lot preview, Batches readings/action, verified QBO links and the missing-email review. Accurate facts must never be fabricated |
| Portal pay failures render a separate raw error response; Square OAuth error parameter lacks clear displayed feedback | Portal pay route; Square OAuth/settings adapters | Source-confirmed UX recovery limitations; preserve a clear retry/back path, then verify with provider errors |
| Portal guide says no draft resume despite implemented resume; staff guide contradicts unused-item deletion and trace-recipient support | portal guide around 56/112; staff around 305/317 and 512/857 | Verified documentation drift. Correct guides after behavior baseline is agreed |
| Mash temperature wording implies predictions use it; gravity model does not | staff recipe section; recipe gravity inputs | Correct claim or decide model requirement; do not add brewing science solely for prose |
| README describes old disabled imports/invites and older Node requirements; DRIFT includes already-resolved work | README vs current commands/package; merged history | Documentation maintenance; not evidence those features are absent |
| Old POS depletion prose conflicts with count-authoritative design | Current screen explicitly records inversion | Follow latest decision: counts move stock; POS provides expected consumption. Do not reintroduce double depletion |
| Pour ownership change is in open #612 | [#612](https://github.com/energee/mgr-zero/pull/612) | Pending design/migration, not audited implementation. Review migration of existing pours and references before crediting completion |

Optional improvements, **not feature-completeness blockers**: batch Cellar's N+1 reading lookup absent demonstrated scale failure; fixture-state cleanup; E.row flat variant; explorer marker consolidation; lint-rule cleanup; catalog query simplification; recurring brand-by-period trend, explicitly deferred by D11. These already have TODO context; no new architecture program is justified.

## Verification and coverage ledger

The entry-point inventory (a local ledger, not committed; regenerate from `screens.tsx`, `app/**/page.tsx`, `app/**/route.ts` and the command registry) lists every enumerated route, screen and operation. Enumeration is not runtime proof.

| Area | Inspected | Runtime / remaining limits |
|---|---|---|
| Repository/product | AGENTS, four project skills, architecture, core/schema/UI/brewing/recipe/water/chat decisions, current guides, TODO, progress/memory/drift, release/adversarial documents | Contradictions resolved only where later evidence or your answer is clear |
| Route surface | 108 `page.tsx`; 14 `route.ts`; 197 app TSX files enumerated | Product route/form source distributed across three read-only domain reviews and root follow-up; every descendant render branch not independently exercised |
| Screen inventory | 191 total: 174 MGR, 17 external venue exemplars; 173 MGR mapped, Schedule packaging run gated/unmapped; nine partial-gate screen records | Browser compared schedule explorer/live. Remaining screen states source inspected/indexed, not all clicked |
| Commands/API | 246 registered operations: 107 queries, 139 commands; 23 domain modules; input/role/RPC edges, shared registry/context/admission | 100 production-family handlers fully read by reviewer; other domains traced by capability. Not every transport/internal helper exhaustively read |
| Production UI | 57 TSX / 29 pages across catalog, recipes, batches, cellar, inventory, packaging, taproom, compliance, kegs | Two targeted DB reproductions; six pure view/logic suites: 50 tests passed |
| Commerce UI | 75 route/form files; four initially indexed portal/order wrappers subsequently read by root | Buyer→sales→warehouse chain passed; delivery refusal, all return variants and QBO real payments not browser exercised |
| Platform UI | Auth, settings/team/import/channels/units/chat, POS/menu, integration routes | Admin/empty setup, staff role shells and buyer sign-in exercised; email, real provider OAuth and mobile/offline permutations blocked/unverified |
| SQL/storage | Baseline schema, relevant later definitions, latest material/repack/FEFO/report/volume/invoice/deposit/delivery functions; constraints, locks, request-id paths, tenant checks and RLS patterns | Not a line-by-line re-audit of every historical migration; concurrency interleavings not stress-tested |
| Integrations/jobs | QBO/Square OAuth and command boundaries; public menus; chat; Slack webhook/install/OAuth; scan/deliver/cleanup authorization and retry boundaries | No real provider mutations, hosted scheduler inspection or delivery test; partial transport internals sampled |
| Browser | Required `agent-browser --session main`, localhost:3002; admin empty state, schedule dialog/explorer; buyer checkout; sales confirm; warehouse pick, explicit bin source, ship, invoice link | One order: 2 cases × $36, $72 before provider tax; sale removal −2 PA, INV-0001. Staff composer repeatedly stayed “Opening your conversation…”; cause unverified |
| Local checks | Test-stack reset succeeded; Next type generation, tsc and lint; full suite result recorded in final verification supplement | Initial tsc failure was stale generated Next route types, cleared by `next typegen`; no application edit. Lint: 0 errors, 2 existing warnings |
| CI | Exact audited SHA's [run](https://github.com/energee/mgr-zero/actions/runs/36295065794) succeeded, including quality/build and test shards | Passing CI is evidence of existing checks, not completeness |
| GitHub | Open issues #580/#329/#311; open PRs #608–#612; 45 recently merged PR metadata and relevant bodies/comments | #609–#611 address known subsets; #608 docs only; #612 not credited. Recently merged fixes were checked against code before reusing old findings |
| Hosted release | Release document and issue history | Current hosted secrets, SMTP, AI credits, backups, advisors, scheduler, OAuth allowlists, branch restrictions were not verified or changed |

Existing failure versus environment distinction: stale `.next` type output was local generated-state failure; SQL rejection messages from negative tests are not failed tests by themselves; local composer setup is an observed blocked journey with unproven cause; F01/F02 are confirmed application defects even if the test suite passes. Hosted #329 remains a separate tracked retest/credits issue.

## Dependency-aware completion plan

1. **Apply the agreed product boundaries.** Use D1–D19 and the adopted workflow defaults. Deferred features are not blockers. Turn the retained consumption, correction, snapshot and return contracts into reviewable schema/API designs before implementation; preserve the existing ledgers and permissions.
2. **Protect existing facts and retries.** F01 lot-preserving repack; F02 dependent-unit guard; F03 uncertain-outcome/import/invite recovery; F04 buyer revocation; F05 deposit view. These can proceed independently of cosmetic parity work. Add one meaningful regression journey per root cause.
3. **Complete production records and corrections.** F07 cancellation/rescheduling before work begins; F10 frozen brew record and actual lot consumption; F11 actual packaging accounting and committed results. Reuse current ledgers/commands and shared screens. Resolve gates before schema changes.
4. **Finish commerce exceptions.** F06 failed delivery/return; F12 shortage reason; F09 accessible history; approved D6 receipt-linked correction; land/review #609 and #611. Demonstrate buyer→sales→warehouse→driver→sales/buyer correction handoffs.
5. **Complete reporting from corrected facts.** D1 state output and transaction reconciliation, plus historical in-process only if required; lot trace through repack; deposit and return reporting. Reporting acceptance follows ledger fixes, not the reverse.
6. **Close integrations within explicit scope.** F08 recovery cleanup; D5 notification/payment-sync policy; D7 MGR-owned Square publishing; verify actual QBO, Square and Slack behavior on approved accounts. Resolve #580 and #329 as applicable.
7. **Reconcile product surfaces and claims.** Finish #610 without claiming its gate is solved; wire supported water profiles; remove or label deferred controls; update staff/portal/API docs. Rerun representative roles and exception states on the resulting revision.

Do not block these steps on serial keg tracking, generalized accounting, new integrations, scheduling optimization, or generic abstraction cleanup.

## Separate release-readiness work

Feature complete and releasable are separate assertions. [#311](https://github.com/energee/mgr-zero/issues/311) remains the release umbrella.

- Complete the connected adversarial walkthrough on the candidate revision. Pilot covers J01 ordering, J02 adjustment and J06 recovery; full v1 also needs production, taproom, delivery and public-menu journeys. A pilot may defer unused domains, not stock/money/access recovery inside its active paths.
- Verify #329 Ask MGR end to end with usable AI Gateway credentials/credits and persisted conversations; do not equate a rendered composer with operation.
- Verify real invitation, password reset and order-notification delivery and approved redirect URLs; SMTP sending domain is historically parked, not verified complete.
- Verify hosted environment isolation and applied migration/hash parity. The September 18 document contains older states later changed by merged work; do not repeat its initial shared-environment concern as a current defect without inspection.
- Verify leaked-password protection, main-only production deployments, backup before migration and a tested restore. Document evidence/owner/date.
- Verify scheduler authentication and actual scan/deliver/cleanup execution, Slack retry behavior, QBO/Square expired/revoked credentials, duplicate deliveries, token cleanup and recovery messages.
- Run production build, type/lint/full tests, approved local DB checks and browser acceptance on the final SHA. Existing CI success is not a future release sign-off.
- Check phone/touch layouts and accessibility for the key staff/driver/buyer journeys; this audit did not complete a device matrix.

No hosted action in this list was performed. Future deployments and hosted changes remain ask-first.

## Acceptance checklist

- [ ] Every retained v1 capability has a supported role, discoverable entry, real read/write, visible result, and correction route; no promise depends on fixtures.
- [ ] All retained SCHEMA-GATE decisions are explicit and implemented; deferred convenience features are removed from the completeness claim and guides.
- [ ] Lots, units, quantities, volume and money survive package/repack/ship/return/deposit/count/correction journeys; historical reports reconcile to immutable facts.
- [ ] Unknown outcomes, duplicate submissions, reloads and provider failures recover without duplicate stock/money or direct database editing.
- [ ] Tenant/role and buyer-offboarding checks hold with existing sessions; cross-role handoffs and denied actions are understandable.
- [ ] Distributor state reporting meets the agreed D1 contract, including correction treatment and inspectable supporting facts.
- [ ] Full role journeys pass on the exact candidate SHA; unexercised external paths have named owners and evidence before release.
- [ ] Separate hosted release checklist is signed off. Pilot readiness is reported separately from full-v1 completion.

## Decisions to walk through one at a time

**D1 — Distributor state reporting: decided, Option A.** V1 requires auditable destination-state totals and supporting transaction export, including volume, sales, returns and adjustments. Supporting facts must reconcile to the totals and cover every destination actually served, not a hard-coded PA/OH pair. State excise-tax calculations and filing-ready state forms are outside v1; filing remains external. Existing taxable sale-removal BBL totals are partial implementation, not completion. This decision does not defer other retained TTB/compliance capabilities.

**D2 — Permanently refused delivery: decided, Option A.** V1 retains invoice-on-delivery fulfillment and must support an explicit returned/failed delivery outcome. Record actual returned quantities and lots, restore stock correctly through a document-linked return, and let the route finish honestly. Do not require false delivery confirmation or direct database edits. This scope decision does not silently choose the detailed schema or partial-return rules.

**D3 — Production record boundary: decided, Option A.** V1 requires a frozen record of the recipe/process version actually brewed, actual ingredient lots and quantities, and packaging material usage, returns and losses, with explicit corrections that preserve history. Planning and volume tracking alone are insufficient. This scope decision does not approve an implicit schema design: consumption timing, correction constraints and snapshot contents still need specification before the affected SCHEMA-GATEs close. Water-chemistry suggestions are deferred by D8; no mash-pH or acid-modeling expansion is implied.

**D4 — Existing-account access: decided, Option A.** V1 must support invitation acceptance while signed in as the existing identity, with explicit consent and membership validation before access is granted. This includes restoring a removed member through a new accepted invitation. Do not silently attach an identity or require deleting its account. Existing #580 owns the implementation; the scope decision does not mark it complete.

**D5 — Notification/reconciliation service level: decided, Option A.** V1 requires reliable buyer order-confirmation email and operator-owned manual QuickBooks payment sync. Show the last successful sync and errors so users understand when payment status may be stale. Automatic background payment reconciliation is outside v1; update the older automation promise accordingly. Provider failures and duplicate/retry handling still require verification. This decision does not mark the email or sync acceptance work complete.

**D6 — Receipt correction: decided, Option A.** V1 requires a correction workflow tied to the original purchase receipt and PO. Correct both stock and PO quantities while preserving the original history, with guards that prevent reversals conflicting with subsequent material consumption. A stock count alone is insufficient. This covers recording mistakes, not a vendor-returns subsystem. Detailed correction inputs and downstream-consumption rules still need specification; this decision does not authorize rewriting historical ledger facts or mark the capability complete.

**D7 — Square catalog direction: clarified.** Create and manage the catalog in MGR, then publish items and variations to Square. Existing-catalog adoption is not a required v1 onboarding flow, so its missing UI is not a completeness blocker. Existing `publish_pos_menu` and `publish_pos_item` commands (`lib/commands/pos.ts:287` and `:297`) already wire to provider publishing, and `components/mgr/views/pos-controls.tsx:100` and `:114` expose publication controls. Verify first publish, subsequent updates/retirement, duplicate retry, conflicts and recovery against Square. This decision does not authorize modifying or deleting unrelated pre-existing Square items, and does not remove inbound sales reconciliation needed for variance.

**D8 — Water-salt suggestions: deferred post-v1 (review amendment 2026-09-27; originally Option A).** V1 requires working suggestions using source-water ion concentrations, a target water profile, mash/sparge water volumes and identified salt materials. The six values are calcium, magnesium, sodium, sulfate, chloride and bicarbonate in ppm. Use the existing shared calculator; display predicted resulting concentrations and differences from target, and let the brewer adjust additions. Complete live profile/material binding and brewery source-water defaults. Acids, mash-pH prediction and per-stage targets remain outside scope. Existing calculation code is not proof that the live workflow is complete.

**D9 — Material count units: decided, Option A.** Base-unit counting is sufficient for v1, with clear unit labels and instructions. Automatic conversion from counted sacks, boxes or rolls using purchase-unit factors is deferred. This does not change purchase-order receiving conversions or decide lot allocation during a count.

**D10 — Material count lot preview: decided, Option A.** V1 must show each affected lot and its adjustment quantity before count confirmation. Preserve the existing allocation rule: shortages use earliest-best-by lots first; overages go to the newest lot. The preview must agree with the committed adjustment; changed stock must not silently produce a different allocation. This decision does not introduce manual lot-allocation editing.

**D11 — Taproom variance trends: decided, Option A.** The existing comparison of physical depletion with expected POS consumption is sufficient for v1. Historical brand-by-period trend comparisons are deferred and must not remain a feature-completeness blocker or an unqualified v1 promise. This does not defer accurate underlying counts, POS expectations or discrepancy investigation.

**D12 — PO receiving lot suggestions: decided, Option A.** Entering the lot code from the actual package is sufficient for v1. Recent-lot suggestions are deferred. Retain required lot validation, expected-lot prefilling where supported, best-by entry, receipt history and stock provenance. Do not describe suggestions as a v1 completeness blocker.

**D13 — Readings on the Batches list: decided, Option B.** V1 must show the latest fermentation reading for an applicable active batch on the Batches list and offer a direct action to record a reading. Reuse the existing reading records, validation, permissions and recording workflow. Return authoritative occupancy/reading facts from the list query; do not infer a vessel or fabricate a reading. Preserve explicit empty/unavailable states and the existing Cellar route.

**D14 — QuickBooks invoice-email delivery status: decided, Option A.** For v1, staff check invoice-email delivery in QuickBooks; displaying verified delivery status in MGR is deferred. MGR must not treat a successful invoice push as proof of email delivery. This does not defer the buyer order-confirmation email required by D5. D15 separately requires a verified Open in QuickBooks link to the corresponding invoice.

**D15 — Open in QuickBooks: decided, Option B.** V1 must provide a verified link from an MGR invoice to its corresponding QuickBooks invoice in the connected company. Show it only when the remote identity and supported destination are known; do not fabricate a URL or imply an unpushed invoice exists in QuickBooks. Unavailable/deleted/disconnected states need an honest explanation. This supports the external email-delivery check selected in D14; it does not require importing email-delivery status into MGR.

**D16 — Customers missing email: decided, Option A.** V1 must show the Accounting screen's missing-email count and a review shortcut to the affected customers so authorized staff can correct their addresses. The count and review must use the same customer predicate and tenant/role boundary. This is a readiness check, not proof that an address is deliverable or that an email was sent.

**D17 — Partial delivery acceptance: decided, Option A.** An invoice-on-delivery stop may record partial acceptance. For 10 cases shipped and 8 accepted, invoice the accepted 8 at the shipment's captured prices and track the refused 2 until physically received back. Preserve source-lot provenance and prevent duplicate invoicing or stock restoration on retry. Recording refusal alone must not restore warehouse stock. This does not yet decide who records the physical return or how damaged returned quantities are disposed of; those are separate workflow contracts.

**D18 — Remaining demand after refusal: decided, Option A.** Refused quantities close on the original order. Sales creates a new order if the customer requests replacement or redelivery; v1 does not automatically backorder that refused quantity. Preserve original ordered, shipped, accepted and refused quantities in history. Physical return tracking remains open independently until the stock is received back or otherwise explicitly resolved. Closing customer demand is not a stock receipt.

**D19 — Brew-day consumption timing: adopted recommendation, Option A.** Record actual ingredient quantities and lots atomically with the completed brew-day record. Recipe quantities may prefill the form but require confirmation; only that commit changes inventory. Incremental recording during the brew is outside v1. On-hand inventory therefore continues to include material physically used during an unrecorded brew; make that timing explicit. Planning requirements are separate from on-hand stock. Later corrections preserve history under D3.

**Remaining recommendations adopted by user instruction.** Preserve D1–D18, including choices that differed from the original recommendation. Do not continue routine interactive product prompts. These defaults complete the current planning pass:

| Area | Adopted behavior | Completion evidence |
|---|---|---|
| Frozen brew record | Use the recipe version pinned to the scheduled batch and snapshot the process values, material quantities and units actually confirmed when brew day is recorded. Later master-data edits cannot alter that record | Edit recipe/material definitions afterward; historical brew record and interpretation stay unchanged |
| Production corrections | Record a linked correction with a reason and compensating stock/volume entries. Preserve original facts; reject corrections that would invalidate downstream stock or provenance, with a specific explanation | Correct an unused quantity; refuse an incompatible downstream correction without partial writes |
| Packaging actuals | Review planned BOM versus actual usage, unused quantities returned and damage/loss at close. Commit outputs and actual consumption together; do not deduct an unused return twice or treat theoretical BOM as confirmed actuals | Lot-specific material balance reconciles before/after close, including loss and unused material; retry does not duplicate |
| Failed-delivery return | Reuse warehouse/admin receiving permissions; no new role or mandatory second-person approval. Check in actual quantities, source lots and destination bin when physically back. Good stock becomes available; damage uses the existing explicit loss/return treatment | Refusal alone adds no warehouse stock; partial/damaged check-in reconciles and duplicate retry is harmless |
| Route versus stock return | Record an honest terminal delivery outcome, but keep return exceptions visible. Physical route return does not itself imply that every refused item has been checked into stock | A returned route can retain a visible outstanding stock-return task without marking it delivered or restoring stock prematurely |
| Receipt corrections | Offer one linked correction of receipt quantities/lot facts that atomically reconciles PO balances and stock. Preserve original receipt; refuse any affected reversal that conflicts with subsequent consumption or stock provenance | Correct an unused receipt and see both PO and stock change; consumed material produces a recoverable refusal with no partial change |
| Shortage explanation | Short pick already captures its reason. Add the ship-time reason when shipped < picked, and show `short_reason` on staff screens. Reuse an unchanged reason through the handoff | Short ship retains a visible reason for staff and buyer, with correct quantities and restock state |
| Unstarted plans | Allow cancel/reschedule before physical work is recorded; retain history and remove cancelled demand from requirements | Cancel a mistaken plan without stock movement, false production or a permanent completion blocker |
| QuickBooks setup | Keep supported exact-ID mapping; add the already-required verified invoice link and missing-email review | Correct mapping, clear errors, and successful provider push/reconciliation; no fabricated provider URL |
| Compliance boundary | Deliver agreed destination-state totals/export with return and adjustment reconciliation. Keep current in-process volume labeled as current; do not expand it into historical tank reconstruction solely to satisfy an old label | Export totals reconcile to supporting facts; current tank values are never represented as period-end facts. Any retained filing output that actually needs period-end tank inventory must identify that dependency explicitly |
| Documentation | Correct unsupported prediction claims and remove deferred conveniences from v1 promises; do not implement a new model solely to match stale prose | Guides, live screens and retained capability matrix agree |

Implementation must translate these contracts into the existing command, ledger and shared-view patterns. Concrete schema/RPC designs still need review and local proof; this instruction does not waive SCHEMA-GATEs, permit speculative architecture, or authorize implementation, issue creation, deployment or hosted changes. Escalate only a newly discovered material contradiction that cannot be resolved within these recorded choices.


## Final verification supplement

`bun run test` exited **0**: **284 test files passed; 3,144 tests passed and 19 skipped (3,163 total)**, duration 833.66 seconds. Full output kept locally (not committed). The skipped cases remain unverified; a passing suite does not supersede the reproduced defects. `next typegen` and `tsc --noEmit` completed successfully; lint reported zero errors and two existing unused-variable warnings. Lint output kept locally (not committed). Browser shipment capture kept locally (not committed).

Final repository recheck: clean `main`, HEAD and origin/main both `be1079352a06fa085b38ffefc0e204989663314a`; empty `origin/main..HEAD`. Open PRs #608–#612 still target main and remain outside this audit revision.
