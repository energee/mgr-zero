# MGR adversarial walkthrough review

Date: 2026-09-04. Baseline: `main` at `2ccce28`.

This document is for the people building and reviewing the parallel screen walkthrough. Its job is to expose incomplete workflows, misleading states, and unresolved product decisions before implementation. Compare the completed walkthrough against it; it is not an instruction to change application code.

The central review question is: **Can each user finish the real task, understand what changed, and recover when reality differs from the happy path?** A complete collection of screens does not by itself answer that question.

## Evidence and comparison rules

This is a source-based adversarial assessment and walkthrough acceptance checklist. The baseline application, guides, architecture, and screen inventory were inspected. No browser walkthrough, database probes, security penetration tests, performance measurements, or test suites were run for this document. Backend and runtime scenarios below are checks to perform later, not claimed failures or passes. The parallel worktree has not been inspected.

Sources, relative to this document:

- [Architecture and implementation gates](../../ARCHITECTURE.md)
- [Staff guide](../../../content/docs/staff-guide.mdx) and [portal guide](../../../content/docs/portal-guide.mdx)
- [Screen inventory](../../../components/mgr/screens.tsx): names, jobs, reads, writes, states, and design notes
- [Product intent](2026-08-30-mgr-slice1-core-orders-design.md)
- [UI layout plan](2026-08-31-mgr-ui-layout-plan.md)
- [Schema](../../../supabase/migrations/00001_baseline.sql)
- [README](../../../README.md): current slices and local verification workflow

Use three evidence labels:

- **Observed:** visible in inspected source; not necessarily reproduced at runtime.
- **Documented gap:** explicitly unavailable or gated in current guides/architecture.
- **Review question:** a proposed scenario or decision; not a confirmed defect.

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
| B01 | High · documented gap | Invitations, public provisioning, password reset, imports, and several setup controls are unavailable. A seeded demo conceals the path from a new brewery to a usable account. | Walk a fresh brewery through staff access, location, catalog, pricing, customer, ship-to, and portal source. Give every missing prerequisite an owner and next action. Decide which must ship before a real pilot. |
| B02 | High · observed | `lib/mgr/nav.ts` links future areas to anchors on current parent pages. The inspected Inventory page has no corresponding cellar/taps/materials sections. The home page only renders “Dashboard,” despite a Today navigation label. | Every navigation item must open its named job or an honest unavailable state. Demonstrate Today as an actionable work queue, including completion and empty states. |
| B03 | High · observed | Inventory always renders Record Movement; order lifecycle controls check status but do not receive a role; replenishment always renders its form. Command permissions are narrower. | Review every action as Sales and Warehouse, not just Admin. Hide unauthorized actions or explain a meaningful access path before opening a form. Preserve server enforcement. Sources: inventory page, lifecycle-buttons, replenishment page, command modules. |
| B04 | High · observed / documented | The movement form offers sample/festival removal without sending destination state. Depletion offers channel choices the guide says are rejected. | Show only valid choices, reveal required fields by movement type, and give an understandable pre-submit summary. Demonstrate each offered type, not just opening balance. Source: `app/(app)/inventory/movement-form.tsx`. |
| B05 | High · documented gap | Save draft navigates portal users to a read-only order page with no edit or submit controls, although corresponding commands exist. | A saved draft must reopen, allow review/edit, and reach submission; otherwise remove the promise of resumable drafting. Demonstrate leaving the app and returning. |
| B06 | High · observed | After portal creation succeeds and submission fails, Cart retains `draftId`. `ensureDraft()` then returns that ID without applying subsequent visible cart edits. Inputs remain editable. | Demonstrate create-success/submit-failure, edit quantities or address, retry. Freeze the saved proposal or explicitly update it; the final order must match what the user confirmed. Source: `app/(portal)/portal/cart.tsx`. |
| B07 | High · observed | `command()` creates a new UUID on every invocation. After a committed movement loses its response, submitting the form again uses a new identity, so server replay protection does not recognize the same action. | Specify recovery for an unknown outcome, including creation failures before an order ID reaches the client. Preserve the action identity or resolve its status before another write. Sources: command client and use-command-form. This is a source-traced risk, not a fault-injection result. |
| B08 | High · observed | Short shipping closes the order and clears restock state. The ship form has no shortage reason or explicit remainder-cancellation explanation; even all-zero shipping can close an order without an invoice. | Show ordered, picked, shipping, cancelled remainder, and physically staged remainder before confirmation. Explain zero shipment. Require the documented shortage reason or explicitly revise that policy. Sources: ship form, orders command, `private.ship_order_impl`, product intent §4. |
| B09 | High · observed | Cancelling a picked order sets `needs_restock`, but lifecycle controls have no put-back completion action for cancelled orders. | Demonstrate cancellation → physical put-back → durable acknowledgment → removal from work queue. Merely leaving a badge is not a completed correction workflow. |
| B10 | High · observed | Every credit memo line also adds sellable inventory through `return_in`. The current operation cannot represent a price-only credit or beer refunded but destroyed/off-site. | Decide which credit reasons the release supports. Keep monetary correction separate from physical disposition in the interaction; unsupported cases must not invite false stock entries. Source: `private.create_credit_memo_impl`. |
| B11 | High · documented gap | Exact movement reversal and durable weekly counts are gated. A zero-variance count cannot be represented by movement deltas alone. | Keep those gates visible in review records. Demonstrate correction identity and a completed zero-variance count before claiming those workflows work. Do not substitute an unexplained adjustment. |
| B12 | Medium · observed | Order detail omits transfer destination and source from its rendered header. Its event timeline formats only time of day and abbreviated actor IDs. | Show full operational context before picking/shipping. A multi-day history must answer which date, which person, what changed, and why. Source: `app/(app)/orders/[id]/page.tsx`. |
| B13 | Medium · observed | Inventory displays brewery-wide ATP beside each location's on-hand quantity. This can be read as availability at that location. | Label scope explicitly. Test a source warehouse with zero units while another location has stock; never imply locally pickable stock from a global figure. |
| B14 | Medium · observed | Staff order/invoice queries default to 50 with no cursor/offset contract. Inventory requests the newest 50 movements. Portal list queries have no explicit pagination contract. | Demonstrate finding an old open order and an old movement outside the initial page. Add paging/search requirements before claiming list completeness; do not silently equate first-page results with all records. |
| B15 | High · observed / documented | Staff resolution uses a selected cookie or first membership; customer resolution always selects the first membership. Visible switching is unavailable. | Walk one person with two breweries, two customer accounts, and staff/customer access. Keep the active identity visible and make switching explicit. Verify API and detail scopes independently. |
| B16 | Medium · documented gap | Product/SKU editing, retirement controls, price removal, and team changes are incomplete or unavailable in the guide. | Distinguish correcting a typo, retiring future use, and altering historical quantities/prices. Prefer archive/deactivate where history exists; do not solve cleanup with destructive deletion. |
| B17 | Medium · documented gap | Portal invoices have no detail or payment action; paid dates are display-only. | State the payment authority and next step. The planned payment screens must handle unavailable payment, pending settlement, partial payment, credit, and disputed invoice without falsely marking money received. |
| B18 | Medium · observed | Several repeated quantity inputs have no programmatic label association in Cart and ShipForm. Table proximity does not name the input. | Require each field to announce product, package/unit, and purpose. Verify actual keyboard and screen-reader behavior later; a visually adjacent label is insufficient evidence. |
| B19 | High · observed design ambiguity | The POS mapping screen's spec contains both depletion-posting language and a later “INVERTED” statement that counts post depletion while POS supplies expected consumption only. | Resolve which event owns physical depletion across POS, counts, refunds, variance, and reports. One sale must never reduce stock twice. Reconcile the written spec as well as the drawing. Source: screen inventory, “POS mapping.” |
| B20 | High · observed design ambiguity | Today/default screen annotations discuss queued writes and cached offline state, while architecture requires explicit command eligibility and preview/version contracts before outbox or AI writes ship. | Make offline promises action-specific. Distinguish server replay protection from safe offline queueing. Show unsupported actions as unavailable offline and stale queued actions as conflicts requiring review. |

These findings are an initial source-backed baseline, not an exhaustive application audit. The scenario matrix below expands the review to planned screens whose implementation has not been assessed.

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
2. Map every screen to its user, entry point, primary action, success destination, and relevant scenario IDs above. Record screens with no scenario and scenarios with no screen.
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

- Which release is the walkthrough evaluating: the current ordering foundation, or the complete brewery product? Mark later slices without treating every future screen as a launch blocker.
- Does a short shipment always cancel the remainder? Current product intent says yes. Show that consequence explicitly, including staged stock.
- Which financial corrections are supported without a physical return? Current credit behavior couples the two.
- Does the physical count or POS transaction own depletion? The current screen spec contains conflicting descriptions.
- Which actions can safely queue offline, and which require fresh confirmation? Server idempotency alone does not decide this.
- What constitutes an operationally complete correction: ledger effect only, or physical acknowledgment and removal from the work queue?
- Who owns onboarding, payment reconciliation, and recovery while the corresponding self-service features remain unavailable?

The walkthrough is ready for sign-off when every in-scope screen is mapped, every high-priority scenario has evidence or an accepted decision, and every gate is recorded honestly. Product-design sign-off is separate from production-readiness approval.
