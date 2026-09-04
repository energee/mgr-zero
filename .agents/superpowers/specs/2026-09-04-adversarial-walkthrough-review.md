# MGR adversarial walkthrough review

Date: 2026-09-04. Baseline: `main` at `2ccce28`.

This document is for the people building and reviewing the parallel screen walkthrough. Its job is to expose incomplete workflows, misleading states, and unresolved product decisions before implementation. Compare the completed walkthrough against it; it is not an instruction to change application code.

The central review question is: **Can each user finish the real task, understand what changed, and recover when reality differs from the happy path?** A complete collection of screens does not by itself answer that question.

## Evidence and comparison rules

This is a source-based adversarial assessment and walkthrough acceptance checklist. The baseline application, guides, architecture, and screen inventory were inspected. No browser walkthrough, database probes, security penetration tests, performance measurements, or test suites were run for this document. Backend and runtime scenarios below are checks to perform later, not claimed failures or passes. The parallel worktree has not been inspected. The expanded capability review below uses this same baseline; proposed additions are not approved release commitments.

Sources, relative to this document:

- [Architecture and implementation gates](../../ARCHITECTURE.md)
- [Staff guide](../../../content/docs/staff-guide.mdx) and [portal guide](../../../content/docs/portal-guide.mdx)
- [Screen inventory](../../../components/mgr/screens.tsx): names, jobs, reads, writes, states, and design notes
- [Product intent](2026-08-30-mgr-slice1-core-orders-design.md)
- [UI layout plan](2026-08-31-mgr-ui-layout-plan.md)
- [Schema](../../../supabase/migrations/00001_baseline.sql)
- [README](../../../README.md): current slices and local verification workflow
- [Registered command modules](../../../lib/commands/all.ts), [order contracts](../../../lib/commands/orders.ts), and [Today projection](../../../lib/commands/today.ts): current application operations
- [Schema design](2026-08-31-mgr-schema-design.md): future data coverage and revision-2 decisions, especially §16.15 on count-owned depletion

Use exactly one of these three evidence labels for each baseline finding:

- **Observed:** visible in inspected source; not necessarily reproduced at runtime.
- **Documented gap:** explicitly unavailable or gated in current guides/architecture.
- **Review question:** a proposed scenario or decision; not a confirmed defect.

Use **Observed** when inspected source establishes the concern, including contradictory design text; use **Documented gap** when the concern rests on an explicit statement that a capability is unavailable or gated. Supporting documentation can accompany an observed finding without creating a combined label. Describe ambiguity or documentation drift in the concern, not as another evidence label. The baseline table need not use all three labels: the walkthrough scenario matrix and connected walkthroughs are **Review question** cases unless separately backed by an observed finding. Capability statuses below (Incomplete, Planned/unbuilt, Proposed) describe delivery scope, not additional evidence labels.

Give every screen two independent statuses:

| Design status | Meaning |
| --- | --- |
| Pass | The walkthrough demonstrates the scenario and its outcome. |
| Gap | A required step, consequence, or recovery is missing or contradictory. |
| Decision needed | Product policy is unresolved. |
| Deferred | Explicitly outside the selected release, with an honest unavailable state. |
| Not reviewed | No evidence yet. |

| Implementation status | Meaning |
| --- | --- |
| Proven | Linked runtime/backend evidence establishes the behavior. |
| Source only | Code exists; behavior has not been exercised for this review. |
| Mock only | The walkthrough demonstrates an interaction without working persistence. |
| Gated | A named schema, authorization, or integration prerequisite blocks implementation. |
| Absent | No implementation has been identified. |

Do not mark a scenario implemented because a mock shows a success toast. Do not mark intentionally future work defective merely because it is absent today. Do mark a future screen incomplete if it hides the prerequisite or has no viable recovery design.

## Review areas

| Area | Adversarial lens |
| --- | --- |
| Feature coverage | Entire jobs, prerequisites, handoffs, and terminal states—not just forms. |
| UX and information architecture | Entry points, next action, context, discoverability, consistent vocabulary. |
| Brewery operations | Physical quantities, units, locations, lots, loss, and actual work completion. |
| Orders and fulfillment | Reservations, shortages, staging, shipping, delivery, and cancellation. |
| Customer portal | Account boundaries, order continuity, price changes, billing visibility. |
| Financial behavior | Credits, physical returns, invoice timing, payment authority, reconciliation. |
| Integrity and concurrency | Duplicate actions, stale data, atomicity, historical truth. |
| Permissions and tenancy | Each role, direct links, multiple accounts, revoked access. |
| Corrections and audit | Original event, reason, compensating effect, actor, and durable completion. |
| Integrations and AI | Mapping, retries, external failure, proposals, disconnects, responsibility. |
| Accessibility and mobile | Keyboard, focus, names, touch, zoom, long content, warehouse conditions. |
| Maintainability | Shared business rules, contract drift, type safety, testable ownership. |
| Reliability and launch | Recovery, scale, support, onboarding, imports, backups, and release scope. |

## Baseline findings and recommendations

Priority indicates what deserves review first, not a security severity rating. **High** means an ordinary task can become blocked, misleading, or materially incorrect. **Medium** means operational friction or incomplete visibility.

| ID | Priority / evidence | Baseline concern | Recommendation and walkthrough proof |
| --- | --- | --- | --- |
| B01 | High · Documented gap | Invitations, public provisioning, password reset, imports, and several setup controls are unavailable. A seeded demo conceals the path from a new brewery to a usable account. | Walk a fresh brewery through staff access, location, catalog, pricing, customer, ship-to, and portal source. Give every missing prerequisite an owner and next action. Decide which must ship before a real pilot. |
| B02 | High · Observed | `lib/mgr/nav.ts` links future areas to anchors on current parent pages. The inspected Inventory page has no corresponding cellar/taps/materials sections. The home page only renders “Dashboard,” despite a Today navigation label. | Every navigation item must open its named job or an honest unavailable state. Demonstrate Today as an actionable work queue, including completion and empty states. |
| B03 | High · Observed | Inventory always renders Record Movement; order lifecycle controls check status but do not receive a role; replenishment always renders its form. Command permissions are narrower. | Review every action as Sales and Warehouse, not just Admin. Hide unauthorized actions or explain a meaningful access path before opening a form. Preserve server enforcement. Sources: inventory page, lifecycle-buttons, replenishment page, command modules. |
| B04 | High · Observed | The movement form offers sample/festival removal without sending destination state. Depletion offers channel choices the guide says are rejected. | Show only valid choices, reveal required fields by movement type, and give an understandable pre-submit summary. Demonstrate each offered type, not just opening balance. Source: `app/(app)/inventory/movement-form.tsx`. |
| B05 | High · Documented gap | Save draft navigates portal users to a read-only order page with no edit or submit controls, although corresponding commands exist. | A saved draft must reopen, allow review/edit, and reach submission; otherwise remove the promise of resumable drafting. Demonstrate leaving the app and returning. |
| B06 | High · Observed | After portal creation succeeds and submission fails, Cart retains `draftId`. `ensureDraft()` then returns that ID without applying subsequent visible cart edits. Inputs remain editable. | Demonstrate create-success/submit-failure, edit quantities or address, retry. Freeze the saved proposal or explicitly update it; the final order must match what the user confirmed. Source: `app/(portal)/portal/cart.tsx`. |
| B07 | High · Observed | `command()` creates a new UUID on every invocation. After a committed movement loses its response, submitting the form again uses a new identity, so server replay protection does not recognize the same action. | Specify recovery for an unknown outcome, including creation failures before an order ID reaches the client. Preserve the action identity or resolve its status before another write. Sources: command client and use-command-form. This is a source-traced risk, not a fault-injection result. |
| B08 | High · Observed | Short shipping closes the order and clears restock state. The ship form has no shortage reason or explicit remainder-cancellation explanation; even all-zero shipping can close an order without an invoice. | Show ordered, picked, shipping, cancelled remainder, and physically staged remainder before confirmation. Explain zero shipment. Require the documented shortage reason or explicitly revise that policy. Sources: ship form, orders command, `private.ship_order_impl`, product intent §4. |
| B09 | High · Observed | Cancelling a picked order sets `needs_restock`, but lifecycle controls have no put-back completion action for cancelled orders. | Demonstrate cancellation → physical put-back → durable acknowledgment → removal from work queue. Merely leaving a badge is not a completed correction workflow. |
| B10 | High · Observed | Every credit memo line also adds sellable inventory through `return_in`. The current operation cannot represent a price-only credit or beer refunded but destroyed/off-site. | Decide which credit reasons the release supports. Keep monetary correction separate from physical disposition in the interaction; unsupported cases must not invite false stock entries. Source: `private.create_credit_memo_impl`. |
| B11 | High · Documented gap | Exact movement reversal and durable weekly counts are gated. A zero-variance count cannot be represented by movement deltas alone. | Keep those gates visible in review records. Demonstrate correction identity and a completed zero-variance count before claiming those workflows work. Do not substitute an unexplained adjustment. |
| B12 | Medium · Observed | Order detail omits transfer destination and source from its rendered header. Its event timeline formats only time of day and abbreviated actor IDs. | Show full operational context before picking/shipping. A multi-day history must answer which date, which person, what changed, and why. Source: `app/(app)/orders/[id]/page.tsx`. |
| B13 | Medium · Observed | Inventory displays brewery-wide ATP beside each location's on-hand quantity. This can be read as availability at that location. | Label scope explicitly. Test a source warehouse with zero units while another location has stock; never imply locally pickable stock from a global figure. |
| B14 | Medium · Observed | Staff order/invoice queries default to 50 with no cursor/offset contract. Inventory requests the newest 50 movements. Portal list queries have no explicit pagination contract. | Demonstrate finding an old open order and an old movement outside the initial page. Add paging/search requirements before claiming list completeness; do not silently equate first-page results with all records. |
| B15 | High · Observed | Staff resolution uses a selected cookie or first membership; customer resolution always selects the first membership. Visible switching is unavailable. | Walk one person with two breweries, two customer accounts, and staff/customer access. Keep the active identity visible and make switching explicit. Verify API and detail scopes independently. |
| B16 | Medium · Documented gap | Product/SKU editing, retirement controls, price removal, and team changes are incomplete or unavailable in the guide. | Distinguish correcting a typo, retiring future use, and altering historical quantities/prices. Prefer archive/deactivate where history exists; do not solve cleanup with destructive deletion. |
| B17 | Medium · Documented gap | Portal invoices have no detail or payment action; paid dates are display-only. | State the payment authority and next step. The planned payment screens must handle unavailable payment, pending settlement, partial payment, credit, and disputed invoice without falsely marking money received. |
| B18 | Medium · Observed | Several repeated quantity inputs have no programmatic label association in Cart and ShipForm. Table proximity does not name the input. | Require each field to announce product, package/unit, and purpose. Verify actual keyboard and screen-reader behavior later; a visually adjacent label is insufficient evidence. |
| B19 | High · Observed | The POS mapping screen mixes depletion-posting language with a later “INVERTED” statement. Schema design §16.15 already decides that counts post depletion and POS supplies expected consumption only; the “Taproom sale” state annotation also conflicts with its own spec. | Apply the recorded count-owned policy consistently across screens, states, older product text, and eventual commands. Demonstrate counts, refunds, late sales, and reporting without double depletion. Do not reopen the settled ownership decision merely because older annotations remain. |
| B20 | High · Observed | Today/default screen annotations discuss queued writes and cached offline state, while architecture requires explicit command eligibility and preview/version contracts before outbox or AI writes ship. | Make offline promises action-specific. Distinguish server replay protection from safe offline queueing. Show unsupported actions as unavailable offline and stale queued actions as conflicts requiring review. |

These findings are an initial source-backed baseline, not an exhaustive application audit. The scenario matrix below expands the review to planned screens whose implementation has not been assessed.

## What this review still needs to establish

The original checklist is strongest on failure paths. It is weaker on the absence of entire jobs, the dependencies between them, and how a brewery operates while a feature is unavailable. A screen inventory can be complete while a brewery still needs separate spreadsheets to run the business.

Three distinctions matter when reading the findings:

- **A missing screen is not necessarily a missing capability.** B02 is partly a surface gap: `get_today` already exists. B05 has registered portal draft-update and submit commands. Review the last missing connection before recommending a new backend.
- **A table is not an operational feature.** The baseline contains materials, production, lots, deliveries, and compliance records, but the registered modules do not provide those complete workflows. Schema coverage must not be counted as implementation coverage.
- **A future feature is not automatically a launch requirement.** Judge the current ordering pilot separately from a brewery using MGR as its operational system of record. Identify which external system or named person owns each deferred job.

For every gap, record the user task, current workaround, owner, consequence if forgotten, smallest usable outcome, and release trigger. “Handled manually” needs a concrete procedure and reconciliation point; it is not an acceptance result by itself.

## Missing functionality: capability inventory

The following is an expanded source-based inventory, not an exhaustive absence proof. **Planned, unbuilt** means the product/schema/screen design names the job but the inspected registered modules do not implement its complete path. **Incomplete** means part exists. **Proposed** means this review recommends evaluating a capability without asserting that it was previously promised. New proposals below are product questions, not legal requirements.

### Closing the current ordering foundation

| ID / status | Missing job and why it matters | Smallest usable outcome / acceptance trigger |
| --- | --- | --- |
| F01 · Incomplete | **Bring a real brewery into service.** B01 covers setup controls, but migration also needs products, customers, prices, opening quantities, and outstanding work to agree at a cutover date. Import and invitations fail closed; a seed script is not a customer onboarding process. Evidence: architecture gates, import/invite modules, staff guide. | One named operator can reconcile opening stock and active orders with the old system, provision both audiences, and complete a real first order. Define what happens to pre-cutover invoices and historical records. An assisted pilot can use an explicit runbook before self-service ships; no untracked database fixes. |
| F02 · Incomplete | **Maintain access after onboarding.** Invite is only the first step: resend/expiry, role changes, removal, account recovery, and transfer of administration are also needed. Team listing and fixed roles do not establish those workflows. Evidence: guides and invite module. | Demonstrate a departing employee and a replacement administrator without losing brewery access. Resolve pending invites and existing sessions. A last-admin rule and recovery owner need an explicit decision before independent customers rely on the app. |
| F03 · Planned, unbuilt | **Tell buyers what happened without requiring them to poll the portal.** Product intent puts transactional order confirmations in slice 1; current chat modules target staff Slack. Buyer acknowledgment, accepted changes, short shipment, and invoice availability need a delivery path. | Start with one durable order-confirmation message containing a secure order link; distinguish request received from brewery accepted. Failed notification must not undo or duplicate an order. Add change/shipment messages as those pilot handoffs require them. |
| F04 · Incomplete | **Finish the money lifecycle.** Invoice creation is present; the registered modules do not implement QBO invoice push/payment reconciliation. `paid_at` and QBO balance fields are storage, not evidence of money received. Evidence: README, order module, invoice schema. | Assign QBO or another explicitly chosen system as payment authority. Show last successful synchronization, current known balance, and unresolved failures. Exercise partial payment, credit application, payment reversal, and an invoice paid while disconnected before relying on MGR for collection decisions. |
| F05 · Incomplete | **Separate returns, credits, and refunds.** B10 describes the stock coupling; a credit document also does not establish that cash was refunded or that a returned keg asset arrived. | Name the supported dispositions: sellable return, damaged return, no physical return, empty keg only. Preserve original price and return eligibility; record where refund execution occurs. Reject unsupported combinations rather than manufacturing sellable inventory. |
| F06 · Incomplete | **Find and hand off outstanding exceptions.** A Today query exists, but its typed reasons cover submitted orders, picks, deliveries, and fermentation readings; that is not a complete list of put-backs, failed imports, overdue money, or unresolved integration work. | Add each exception to its owning workflow with a responsible role, actionable link, and durable completion condition. Reuse Today where appropriate. A task should disappear because the underlying work finished, not because someone dismissed a message. Start with B09 put-back work. |
| F07 · Proposed | **Control a customer's ability to place new orders.** Customer contracts include price list, license text, and payment terms; no complete account-hold/release workflow was identified. A business may need to suspend new orders while retaining access to history and unpaid invoices. | Decide whether a pilot needs manual account holds, who can override them, and whether the restriction applies at submit, confirm, or ship. Keep a credit hold distinct from lack of stock and from revoked login access. Automated credit scoring is unnecessary. |
| F08 · Incomplete | **Obtain usable business records outside the current screen.** B14 identifies limited history access. A printable pick sheet exists, but no complete tenant export or customer statement workflow was identified in the registered modules. | A staff member can retrieve the full selected period of orders, movements, invoices, and credits with stable IDs, units, dates, and scope. Decide separately whether the pilot needs invoice downloads and customer statements. Never label a first-page download a full export. |

### Planned brewery modules that are still not complete application workflows

These jobs already belong to the ten-slice product map. They are missing from the current operating application, not newly invented scope. Evidence: product intent capability map, schema sections for each area, screen inventory, and registered module list.

| ID | Missing end-to-end capability | Completion evidence beyond a form |
| --- | --- | --- |
| F09 | **Materials purchasing and receiving:** vendors, POs, partial receipts, contracts, lot inventory, counts, and unit conversions. | Requirement → PO → counted receipt → usable lot → consumption/return. Damaged receipt stays distinguishable from usable material, open supply is not counted twice, and duplicate receiving does not add stock. |
| F10 | **Recipe development and actual costing:** versions, scaling, ingredient substitutions, and comparison with real batch outcomes. | A batch keeps its recipe assumptions after a recipe edit. Planned and actual ingredient costs have an explicit basis; missing costs display as unknown. Do not call ingredient cost full product margin without packaging and other chosen cost components. |
| F11 | **Brewday and cellar execution:** schedule, materials additions, occupancy, readings, transfers, and completion. | Trace one batch through occupied vessels, a split or blend, and leftover volume. A cancelled plan has no invented physical effect; recording late actual work preserves both event and entry chronology. Respect the existing completion-loss gate. |
| F12 | **Packaging into saleable stock:** source occupancy, packaging materials, actual outputs, lot codes, yield, loss, and leftovers. | One reviewed completion reconciles beer, packaging materials, and destination stock. A failed close cannot leave only half the effects. Lots remain associated with actual output, not merely the planned run. |
| F13 | **Taproom operating close:** durable physical counts, POS comparison, tap intervals, mixed formats, and meaningful variance investigation. | Reconcile opening count plus physical movements with closing observation over the same time window. Late POS data changes the expected comparison without posting stock again. Decide how partial kegs and uncounted locations are represented; a missing observation is not zero. |
| F14 | **Keg custody and deposits:** pool balances, customer-held empties, returns, losses, and rental/container costs. | Beer return, empty asset return, and deposit refund can occur independently with a reconcilable customer balance. A counts-based fleet is sufficient under the existing design; individual serial scanning is not implied. |
| F15 | **Self-delivery completion and failure:** assignment, route departure/return, recipient confirmation, refusal, and deferred invoicing. | The inventory and money outcomes of refusal, partial acceptance, and goods returning on the truck are explicit. The “Deliveries” screen spec currently says a refused delivery has no screen and leaves the stop open; reassigning it does not alone explain physical returned stock. |
| F16 | **Operational reporting and filing:** calculations, drill-down, review, export, recorded filing, and later correction. | Every total traces to source events and distinguishes draft calculation from what was filed. The app has a path for unclassified records and late corrections. Legal rules and filing formats require separate current authoritative verification; this review does not validate them. |
| F17 | **Demand-to-supply planning:** committed demand, projected brewing/packaging, material requirements, and orderable dates. | Show a dated shortfall and the specific production or purchasing proposal that addresses it. Distinguish on-hand, reserved, inbound, and uncommitted plans; negative ATP alone is not a delivery promise. Start with an explainable requirements calculation, not a forecasting platform. |

### Capabilities the existing screen checklist underrepresents

These are proposed additions or deeper acceptance requirements. Validate them with the pilot brewery before assigning new screens. Existing schema support is called out to avoid rebuilding concepts already present.

| ID / evidence | Missing job / proposed requirement | Adversarial acceptance case |
| --- | --- | --- |
| F18 · Observed contract gap | **Lot-specific fulfillment and recall execution.** `lots`, `best_by`, and nullable movement `lot_id` already exist. Current pick/ship inputs carry line IDs and quantities; `private.ship_order_impl` writes removals/transfers without a lot ID. The present path cannot establish which production lot reached which buyer. | Two lots of one SKU share a warehouse; an order contains units from both. Trace affected recipients and remaining stock for just one lot, including transfers and returns. Show unknown-lot stock honestly. Do not claim targeted recall readiness from a lot-code field alone. |
| F19 · Proposed | **Quality hold, release, and disposition.** A complete workflow for suspect materials, a batch awaiting results, or packaged beer withheld from sale was not identified. Physical stock and saleable stock need different meanings if the brewery uses holds. | Hold one lot while another lot of the same SKU stays sellable. Existing allocations are flagged; direct shipping cannot bypass the hold. Record who released or disposed of it and why. A note or hidden picker option cannot be the only enforcement. |
| F20 · Proposed, with schema support | **Freshness and stock rotation.** `lots.best_by` exists, but it is not a complete oldest/earliest-expiry picking policy or aging inventory view. | Show aging stock by lot/location, choose an eligible lot, and explain an override. Decide whether a best-by date warns or blocks. Do not infer a safety or legal expiration rule from the field name. |
| F21 · Proposed | **Customer complaint to resolution.** An order credit can finish a financial action while the underlying product complaint remains uninvestigated. No complete complaint workflow was identified. | Link a complaint to an order and known lot, assign an owner, record disposition and follow-up, and escalate to F18/F19 when appropriate. Start with a structured case linked to existing records or an agreed external support procedure; a full CRM is not required. |
| F22 · Proposed | **Equipment readiness and cleaning records.** Vessel occupancy answers where beer is, not whether empty equipment is ready for use. The inspected design does not establish a complete maintenance/cleaning workflow. | An empty but unavailable vessel cannot silently be treated as ready in scheduling. If MGR owns readiness, show the named reason, required work, completion, and override authority. Otherwise identify the external record the brewer must check. Evaluate before cellar scheduling becomes authoritative. |
| F23 · Proposed | **Evidence attached to operational decisions.** Notes do not necessarily capture a damaged-delivery photo, supplier document, laboratory result, or signed receipt. A general attachment lifecycle was not established by this source review. | Determine which jobs actually require evidence; provide record-scoped access and retention for those files. Replacing or deleting evidence must have a defined policy. Avoid adding unrestricted uploads to every screen by default. |
| F24 · Proposed | **Customer purchasing continuity.** Resumable drafts are essential under B05; reordering, requested delivery dates, pack minimums, substitution consent, and order-change requests are additional product choices. Current portal create/update inputs do not include a requested date. | Repeat an old order after pricing, products, or source availability changes. Build a fresh proposal using current rules and show the differences; never silently copy stale commitments. Confirm which purchasing constraints the pilot actually uses before adding them. |
| F25 · Proposed operational requirement | **Recover and leave the service.** README says nothing is deployed; an implemented backup/restore drill, tenant export, and customer offboarding workflow are not established by the inspected application sources. | Before a live system of record, restore a known dataset in isolation and reconcile record counts and stock/money totals. Demonstrate authorized tenant export and define retention/access on closure. Infrastructure recovery and correcting one brewery's records are different jobs; do not treat full-database rollback as ordinary Undo. |

## Connected walkthroughs to add

The matrix below forces capability gaps to surface between screens. Quantities are hypothetical acceptance fixtures, not measured results. These are review scripts, not claims that the flows currently run.

| ID / scope | Connected job | Evidence required at the end |
| --- | --- | --- |
| J01 · Ordering pilot | Start without seeded business data → establish access → import or enter opening records → buyer submits → staff confirms → warehouse short ships → buyer receives update → invoice reconciles. | Opening totals reconcile; each handoff has an owner; final quantity and amount agree across roles; any manual step is recorded. Covers F01–F06 and B05–B10. |
| J02 · Ordering pilot | Pick 6 of 10 → Sales reduces order to 4 → Warehouse puts 2 back → ship 4 → customer receives 4. | Ordered revision, staged quantity, physical put-back acknowledgment, released allocation, and invoice agree. No durable restock task is lost simply because order status advances. Covers B08/B09 and F06. |
| J03 · Production release | Receive a tracked material → consume it across batches → split/blend → package into lots → transfer and ship → investigate one suspect input. | Identify affected outputs, recipients, and remaining stock; retain unaffected stock; unresolved lot identity is visible. Adding lots only during packaging cannot reconstruct missing upstream lineage. Covers F09–F12 and F18/F19. |
| J04 · Taproom release | Observe opening stock → receive transfer → swap taps → record closing count → ingest delayed sale/refund → investigate variance. | Exactly one physical depletion effect for the count occurrence; comparison uses a stated window and measurement basis. Repeat count submission and later POS arrivals cannot remove the same beer again. Covers B11/B19 and F13. |
| J05 · Delivery release | Ship with explicit invoice timing → assign route → customer refuses part → truck returns → classify returned stock → resolve customer amount and empty kegs. | Physical destination, delivery outcome, invoice/credit, and asset custody reconcile. An open delivery stop is not sufficient evidence of where the returned beer went. Covers F05/F14/F15. |
| J06 · Live operational use | Lose a save response → reload and recover the action → discover a next-day mistake → apply supported correction → reconcile exported records. | One original effect, linked correction, stable historical amounts, useful support reference, and complete export. Covers B07/B11 and F08/F25. |

## Confirmed product direction

Ted confirmed the direction in this review conversation:

- **Next release:** a complete ordering pilot before treating the full brewery workflow as release scope.
- **Systems MGR should replace:** ordering spreadsheets; production records for batches, packaging, and finished goods; inventory management; and tap-board.

The ordering pilot is the first milestone, not the full product boundary. Production, inventory, and replacement of tap-board are confirmed product targets; their detailed acceptance criteria and implementation order still need to be settled. This confirmation does not approve every proposed capability in F01–F25. This document remains a review checklist; conversion into an implementation backlog has not been decided.

### Replacing tap-board needs its own acceptance path

The named replacement target is **tap-board**, not a generic board manager. Its existing behavior has not been inspected for this review. Inventory the tap-board workflows actually used before defining replacement acceptance; do not assume TV displays, website menus, or printing are required. The existing Menu, POS item, and tap-related designs provide starting points, but POS reconciliation and weekly counts alone do not establish replacement coverage.

**Review question — J07:** A taproom worker changes the beer on a tap or its availability, reviews the customer-visible name, serving sizes, and prices, and publishes the board update. Show the actual destination, successful publication, failed publication/retry, and correction of a mistaken update. Establish which values MGR owns, how changes made in another system are handled, and whether multiple taprooms have separate boards. Validate this proposed scenario against the actual tap-board workflow and publishing destinations before treating it as a requirement. Under the existing count-owned inventory policy, changing a board or tap assignment must not itself deplete stock.

## Suggested release priorities and explicit deferrals

The ordering-first milestone and replacement targets above are confirmed. The detailed sequence below remains a recommendation, not approval of every proposed addition.

1. **Make the ordering pilot complete.** Address draft continuity, recoverable saves, valid movement options, role-appropriate actions, short-shipment explanations, and physical put-back completion. Establish assisted onboarding/access recovery and the buyer/accounting handoff. These directly affect the jobs already offered.
2. **Establish stock and money truth before broadening operational ownership.** Decide supported credit dispositions, add the necessary lot/hold contracts for traceable production fulfillment, and prove payment reconciliation before displaying collection authority. Quality/recall requirements become release gates when MGR claims those capabilities, not merely because a future screen exists.
3. **Deliver the confirmed replacement targets as connected jobs.** After the ordering pilot, prioritize batch-to-packaging-to-finished-goods inventory and replacement of tap-board. Review purchasing, taproom-close, and delivery workflows as dependencies or separate scope decisions rather than automatically putting them ahead of those targets. Each job needs its correction and incomplete-work states.
4. **Defer convenience features until the core job is proven.** AI/voice entry, automatic demand forecasting, route optimization, barcode scanning, serialized keg tracking, broad CRM, and generalized attachments are not needed to resolve the current ordering gaps. Revisit only for a named user problem or an existing explicit commitment.

For each accepted deferral, name the outside system/person, the handoff artifact, the reconciliation frequency, and the condition that brings the work into MGR. Do not add a second ledger or accounting engine merely to avoid documenting an integration boundary.

## Walkthrough scenario matrix

Each row is a review case. Map it to one or more exact screen names from the inventory and record the walkthrough link when available. Sample quantities are hypothetical review fixtures, not measured application data.

### Access, shell, and first run

| ID | Challenge | Expected evidence |
| --- | --- | --- |
| A01 | New admin, no setup data. | Checklist follows actual dependencies; create first usable order without hidden database work. |
| A02 | Expired/used invitation, password reset, user without membership. | Clear destination, retry path, and responsible contact; no login loop. |
| A03 | Admin, Sales, Warehouse, Brewer, Customer open the same deep link. | Correct content and permitted actions; denial gives a useful exit without leaking records. |
| A04 | Switch brewery/account while a form is dirty. | Explicit discard/preserve decision; no draft crosses tenant boundaries. |
| A05 | Access revoked while a page remains open. | Failed save preserves understandable context; no success fiction or sensitive cached account bleed. |
| A06 | Phone tabs, desktop rail, browser Back, direct URL. | Same jobs remain reachable; active navigation and page title agree. |

### Catalog, configuration, and inventory

| ID | Challenge | Expected evidence |
| --- | --- | --- |
| I01 | Similar product names with several keg/case formats. | Every picker, confirmation, movement, and invoice identifies brand plus format and unit. |
| I02 | Wrong BBL-per-unit discovered after movements exist. | Explicit historical policy; correcting configuration cannot silently rewrite past volume. |
| I03 | Format defaults, SKU overrides, mixed packs, repack. | Inheritance is visible; changing a default has clear scope; repack accounts for source, destination, and volume. |
| I04 | Sample, festival, loss, destruction, depletion, opening stock. | Correct sign, unit, location, classification, and required destination fields; no invalid offered combinations. |
| I05 | Wrong movement posted yesterday. | Find original, inspect effects, choose supported correction, retain actor/reason/link; blocked corrections are honest. |
| I06 | Two warehouses; stock exists only at the other source. | Local stock and global ATP are distinct; intentional oversell warning has an actionable consequence. |
| I07 | Exact-match count, variance count, recount after another worker moves stock. | Count remains durable with zero variance; stale snapshot is handled; no duplicate depletion. |
| I08 | Existing inbound transfer when opening replenishment again. | Explain whether suggestions include in-flight supply; prevent accidental duplicate demand or clearly warn. |
| I09 | Archive product/location/bin still referenced by history. | Historical records remain intelligible; new use is constrained without destroying references. |

### Orders, picking, returns, and delivery

| ID | Challenge | Expected evidence |
| --- | --- | --- |
| O01 | Customer lacks price list, SKU price, or ship-to. | Block near the missing input and link the authorized person to the remedy; preserve order work. |
| O02 | Price/address changes while an order is drafted or open. | Explicit price and address snapshot policy; review shows any changes before commitment. |
| O03 | Confirm causes negative ATP. | Quantified warning identifies affected product, location scope, and competing demand; intentional oversell remains possible. |
| O04 | Ordered 10, picked 6, shipped 4. | Show 6 unshipped units cancelled under current policy, 2 staged units to put back, 4 billed, and released demand. Do not invent a backorder. |
| O05 | Pick all zero; then attempt shipment. | Deliberate explanation of whether this closes the order or should be cancellation; no misleading “delivered” implication. |
| O06 | Sales adjusts or cancels an order already staged by Warehouse. | Before/after quantities, reason, warehouse acknowledgment, and durable end to restock work. |
| O07 | Two workers pick/ship/adjust the same order. | Stale state is rejected or explicitly reconciled; neither overwrites silently. Backend proof required. |
| O08 | Full return, partial sellable return, damaged return, price-only credit. | Each supported case separates money from stock; credits cannot exceed remaining eligible amounts/quantities. |
| O09 | Transfer entered to wrong taproom, discovered after completion. | Named correction path moves the physical stock and preserves the original event. |
| O10 | Self-delivery with failed stop, partial delivery, route return. | Distinguish loaded/shipped/delivered; explicit invoice timing; returned goods and outstanding work remain accounted for. |
| O11 | Unassigned driver or another driver's route. | Appropriate access restrictions; route assignment changes have visible consequences. Backend proof required. |
| O12 | Print pick sheet with long names and multiple pages. | Source/destination, order identity, quantities/units, grouping, and headers survive printing. |

### Portal and billing

| ID | Challenge | Expected evidence |
| --- | --- | --- |
| P01 | Save draft, sign out, return next day. | Resume, edit, review, and submit the same draft. |
| P02 | Order creation commits but response is lost. | Recover that action without producing a second order. Backend fault injection required. |
| P03 | Submission fails after draft exists; change cart and retry. | Persisted order matches reviewed values, or edits are explicitly prevented. |
| P04 | Availability or price changes after cart review. | Refresh/revalidation policy is visible; no silent substitution or surprise total. |
| P05 | Decimal, negative, huge, blank, and pasted quantity. | Consistent whole/fractional-unit rules across UI, command, and database; row-specific accessible errors. |
| P06 | Brewery short ships or changes order. | Customer sees what changed, why, final amount, and whether anything remains due. |
| P07 | Payment pending, failed, already paid elsewhere, or partially paid. | Payment source and last update visible; avoid duplicate payment requests and premature “paid.” |
| P08 | Customer disputes one line or cannot pay online. | Useful next action with invoice context; no unsupported button or dead-end explanation. |

### Production and purchasing: planned coverage

These are review questions for future coverage, not claims that current slices implement production.

| ID | Challenge | Expected evidence |
| --- | --- | --- |
| R01 | Recipe changes after a batch is scheduled. | Batch retains the intended version; substitutions and recalculations are explicit. |
| R02 | Vessel conflict, split/merge transfer, late fermentation reading. | Capacity, occupancy, chronology, and source/destination are reconciled; invalid transitions explain the remedy. |
| R03 | Packaging closes with less beer or more material consumption than planned. | Actual output, materials, lot identity, remaining beer, and loss reconcile in one reviewed outcome. |
| R04 | Batch completion loss later reclassified as samples/destruction. | Original loss identity survives; exact compensation and classification are visible; named schema gate remains until supported. |
| R05 | Partial PO receipt, damaged material, over-receipt, duplicate receipt. | Remaining order quantity, actual usable stock, supplier disposition, and retry outcome are clear. |
| R06 | Material substitution, lot recall, count correction. | Trace source lots through batches and packages to affected recipients; demonstrate both forward and backward trace. |
| R07 | Plan changes after production or purchasing starts. | Separate suggestion from commitment; show dependencies and what cannot be undone. |

### POS, kegs, integrations, and compliance

| ID | Challenge | Expected evidence |
| --- | --- | --- |
| X01 | POS sale, refund, physical count, and delayed sync overlap. | One coherent inventory model; no double depletion; expected consumption and physical observation stay distinguishable. |
| X02 | New/unmapped external location or product, later mapped. | Held records remain visible and retryable; original event date retained; no silent default mapping. |
| X03 | Keg kick/swap, same beer replacement, guest keg, partial keg. | Correct interval/custody and nominal size; duplicate swap conflict is understandable; guest stock excluded from owned inventory. |
| X04 | Keg return, deposit refund, ownership discrepancy. | Physical return and financial credit reconcile without assuming they always occur together. |
| X05 | QBO POST succeeds, local acknowledgment fails. | Retry reuses durable outbound identity/payload; no duplicate invoice. Backend/external-boundary proof required. |
| X06 | Accounting mapping conflict or edited external invoice. | Show authority, drift, and explicit resolution; never silently overwrite the accounting book. |
| X07 | Disconnect/reconnect Slack, Square, or QBO with pending work. | Explain what stops, what is retained, who can reconnect, and how backlog resumes. |
| X08 | Slack alert becomes resolved or user loses access before opening it. | Current status and permissions govern the destination; private details are not exposed in notifications. |
| X09 | Compliance month crosses timezone boundary; late correction after filing. | Define effective date and immutable filed snapshot/amendment policy. This is a product/data review, not verification of current legal requirements. |
| X10 | New sale channel or destination lacks reporting setup. | Missing configuration is discoverable before reporting; no “compliant” claim inferred from collecting a state code. |

### Universal behavior and engineering proof

| ID | Challenge | Expected evidence |
| --- | --- | --- |
| U01 | Empty, loading, unavailable, forbidden, not found, and server error. | Distinct meaning and next action; not every failure is an empty list or generic Retry. |
| U02 | Double click, slow request, offline, reload during save. | Clear saving/unknown/confirmed states; no duplicate effects; inputs survive recoverable failures. |
| U03 | AI proposal becomes stale before confirmation. | Canonical effects and warnings shown; revalidation blocks stale execution; proposal never auto-commits. |
| U04 | Old open record beyond first 50; large catalog/history. | Paging/search reaches the record; counts indicate scope; latency remains usable with realistic data. |
| U05 | Keyboard-only, 200% zoom, narrow phone, long names. | Reachable actions, visible focus, correct dialog focus return, no trapped or clipped critical controls. |
| U06 | Screen reader on repeated quantities and inline errors. | Unique accessible names, units, error association, and announced progress/result. |
| U07 | Browser/device timezone differs from brewery. | Dates, due work, timeline, and reporting periods use an explicit coherent policy. |
| U08 | Same write from form, API, and future AI. | Same command-owned validation, authorization, transaction, and error meaning. |
| U09 | Tampered tenant/customer ID or direct RPC invocation. | Database independently rejects unauthorized access. No walkthrough can prove this; link real backend tests. |
| U10 | Support needs to investigate uncertain save. | User can supply an action/record reference and correlation information without exposing credentials. |

## Maintainability recommendations

Keep the existing command boundary and append-only ledger as the architectural center. The most useful simplification is to keep each behavior in one owner and make all surfaces consume that behavior.

| ID | Recommendation | Evidence needed later |
| --- | --- | --- |
| M01 | Compare screen `reads`, `writes`, and gates against actual registered operations; mark future contracts explicitly. | Every walkthrough write maps to a real operation or named missing contract. |
| M02 | Keep permission decisions consistent between navigation, action visibility, command registry, and database. | Role matrix exercises both visible controls and direct requests. |
| M03 | Preserve shared recovery semantics in the command client/form lifecycle rather than inventing a retry policy per screen. | One fault-injection scenario demonstrates committed-but-unacknowledged action recovery across representative forms. |
| M04 | Replace unsafe result-shape assumptions with verified contracts where they affect behavior. Portal command code explicitly notes manual casts caused by absent generated database types. | Nested relationship nullability and result shapes are checked; no claim of type safety based only on assertions. |
| M05 | Resolve contradictions at the source of truth, not by adding another explanatory note elsewhere. | POS depletion ownership, offline eligibility, invoice timing, and current/future status agree across screen spec and architecture. |
| M06 | Test behavior that drawings cannot establish. | Targeted proof for replay, concurrent fulfillment/credit, RLS, zero-variance counts, report correction, and integration uncertainty; rendered checks cover interaction and accessibility. |

## How to compare the completed walkthrough

1. Record the walkthrough worktree, branch, and commit separately from this baseline. Build a complete list from that revision's screen inventory; do not use screen counts from older progress notes.
2. Map every screen to its user, entry point, primary action, success destination, and relevant B/F/J and scenario IDs above. Record screens with no scenario, scenarios with no screen, and capabilities with no complete connected job. A capability can reuse several screens; do not require one new screen per finding.
3. Walk connected jobs as each role, on phone and desktop. Keep the same hypothetical order/customer/stock quantities across adjacent frames so contradictions are visible.
4. Review the adverse branch immediately after each happy path: interruption, invalid input, stale state, denied access, correction, and resume.
5. Record design and implementation statuses independently. Attach a frame/route reference and explain the observed consequence; “looks good” is not evidence.
6. Prioritize launch blockers and incorrect stock/money outcomes first, then workflow friction. Defer future slices explicitly rather than implying the walkthrough makes them shippable.

Use this repeatable result entry:

```text
Scenario ID(s):
Screen name(s) / walkthrough URL:
Walkthrough commit:
Persona / account / viewport:
Starting state and action:
Expected outcome:
Observed outcome and evidence:
Design status:
Implementation status / proof link:
Impact / priority:
Smallest recommendation or product decision:
Owner / follow-up:
```

## Decisions to settle first

- Evaluate the confirmed ordering pilot first. Mark production, inventory, and tap-board replacement coverage separately without treating every later capability as a pilot launch blocker.
- Does a short shipment always cancel the remainder? Current product intent says yes. Show that consequence explicitly, including staged stock.
- Which financial corrections are supported without a physical return? Current credit behavior couples the two.
- Apply the recorded count-owned depletion decision (schema design §16.15). Settle the remaining observation-window, partial-keg measurement, and late-data behavior; remove contradictory POS-posting annotations.
- Which actions can safely queue offline, and which require fresh confirmation? Server idempotency alone does not decide this.
- What constitutes an operationally complete correction: ledger effect only, or physical acknowledgment and removal from the work queue?
- Who owns onboarding, payment reconciliation, and recovery while the corresponding self-service features remain unavailable?

The walkthrough is ready for sign-off when every in-scope screen is mapped, every high-priority scenario has evidence or an accepted decision, and every gate is recorded honestly. Product-design sign-off is separate from production-readiness approval.
