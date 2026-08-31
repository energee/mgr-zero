# MGR — UI layout plan (all slices, mobile-first, chat-assisted input)

Date: 2026-08-31
Status: Draft for Ted; rev 3 incorporates the fresh-eyes product, architecture, schema,
navigation, state, build-order, and wet-phone review. Nothing in this plan is built yet;
the current shell (`app/(app)/layout.tsx`, a 208px left rail with five links and Geist) is
the placeholder it replaces.
Wireframes: `2026-08-31-mgr-wireframes.html` — 50 frames tagged with tab, slice, build
step, registered reads, and registered writes; the phone/desk toggle re-renders every
frame from the same body (desk = rail/top-nav shell, dialog sheets, 32 px
cursor-density controls). Update it in the same commit as any change
to §3 or §4. The repository HTML is the canonical rev-3 artifact; republish that exact
source before sharing an external artifact URL.
Inputs: `2026-08-30-mgr-slice1-core-orders-design.md` (roles, slices, interaction budget,
AI-first command registry), `2026-08-31-mgr-schema-design.md` (what exists to show), and
`brewing-domain.md` (units and compliance semantics).

## 1. Who is holding the device, and where

| Person | Device and conditions | Most frequent task |
|---|---|---|
| Cellar / brewer | Phone, one hand, wet gloves, tank-side, wifi drops behind stainless | Log a gravity/temp reading |
| Warehouse | Phone in a cooler; sometimes a wall tablet | Pick an order |
| Taproom lead | Phone, end of shift | Record the weekly count |
| Sales / admin | Laptop; phone when out | Confirm an order |
| Wholesale customer | Phone, at their bar, ordering for the week | Repeat or place an order |
| Delivery driver | Phone, in the truck | Confirm a delivery |

Anything done standing is phone-first; anything done sitting is desk-first but remains
usable on a phone. The split is posture, not role. An admin at a festival still gets the
phone movement flow; a warehouse wall tablet gets the desk layout with coarse-pointer
targets.

### Literal tap audit

Counts start with the signed-in app open on the person's role landing page. Every tap,
keypad key, and final write button counts; spoken words and signature/name strokes are
called out separately. The product's “≤2 interactions” promise applies only to an
unambiguous, prefilled role-landing action or to the composer after intent entry. It is
not a claim that arbitrary numeric or multi-line data takes two literal taps.

| Person and task | Fastest safe path from app open | Form fallback | Result |
|---|---|---|---|
| Cellar / brewer — gravity reading | Today `Reading` (1) → `1 . 0 1 9` on the SG pad (5) → **Record** (1) = **7 taps**. A future voice transport can make this mic (1) → **Record** (1), but voice is not in the current build. | Beer → vessel → Reading → five pad keys → Record = **9 taps**. | Over 3 by necessity; do not advertise a current two-tap path. The Reading screen exists and defaults the overdue vessel and last-used unit. |
| Warehouse — pick a three-line order | Today **Pick** (1) → prefilled **Done picking** (1) = **2 taps**. | Today order (1) → Edit quantities (1) → three single-digit counts (3) → **Done picking** (1) = **6 taps minimum**; a short line adds reason/restock choices. | The two-tap path is only for all-as-ordered. `record_pick` is one atomic write for every line plus picked status. |
| Taproom lead — weekly three-SKU count | Today `Weekly count` (1) → three single-digit counts (3) → **Record count** (1) = **5 taps minimum**. | Beer (1) → Taproom (1) → Weekly count (1) → three counts (3) → Record count (1) = **7 taps minimum**. | Over 3. This is a target-state screen; its Today row and commit stay disabled until the durable count occurrence/lines SCHEMA-GATE is resolved. |
| Sales / admin — confirm order | Today **Confirm** (1) → **Confirm order** (1) = **2 taps** when blocking review is absent. | Work (1) → order (1) → Confirm order (1) = **3 taps**. | Meets the ≤2 landing-page promise. Any ATP/registration warning inserts a review step rather than hiding risk. |
| Wholesale customer — repeat last order | Portal Order → **Same as last week** (1) → proposal **Place order** (1) = **2 taps**. | For a three-line new order: three `+` taps (3) → Review (1) → Place order (1) = **5 taps minimum**. | Meets the promise only when the prior fulfillment source, ship-to, prices, and active SKUs revalidate unchanged. Portal submit stays gated until a customer-safe source allowlist/default and RLS read exist. |
| Delivery driver — confirm drop | Driver landing shows the next stop: known signer chip (1) → **Delivered** (1) = **2 taps**. | Route (1) → stop (1) → signer field (1) → name keystrokes → Delivered (1) = **4 + name length**. | Meets the happy path. The schema stores `signed_by` text, not a signature asset; the UI must not imply an image signature is retained. |

The composer can still be the fastest path for a fully entered sentence, but typed
characters count as taps in usability testing. No team may “pass” this audit by treating a
sentence, a signature, or several numeric entries as one tap.

## 2. Input model: say it, check it, commit it

Every domain read and write is a typed registry operation. The UI has three entrances to
the same Zod-backed command contract:

1. **Composer — primary assistance on phone.** Text produces a candidate command; the
   server, not the model, canonicalizes it through `preview_command`. The proposal shows
   product and package, source/destination location or direction, positive entered amount
   and unit, signed ledger effect, barrel conversion, warnings, and every other field that
   will be written. A document number is labelled “assigned on commit”; a pre-commit
   preview never invents `ORD-`, `INV-`, `PO-`, `B-`, or run numbers. Every AI write
   waits for an explicit click on its verb. There is no auto-commit setting.
2. **Forms — required and first-class.** Every proposal has **Open as form** and every
   owning area has a direct action that opens the same fields cold. The direct form's verb
   button is explicit confirmation; an additional `AlertDialog` appears only where a
   destructive/external write has no dedicated review screen.
3. **Quick actions — the role landing page.** Large, role-ordered actions such as
   `Reading`, `Pick as ordered`, `Weekly count`, and `Next stop` carry only defensible
   defaults. Missing identity, quantity, direction, or destination opens the form; the
   application never fills a risky blank by guessing.

### Proposal safety

The language model emits only `{ name, input }` candidates. `preview_command` is an
internal registered query, not an AI-exposed tool. It runs the target command's
server-side preview/canonicalization hook and returns canonical fields, exact effects,
warnings, and a current-version token. Commit sends the target command, stable
`requestId`, and token; the command re-reads authoritative rows and rejects a stale
proposal. A visual proposal is never evidence that a write is still valid.

Ambiguity asks a short question and produces no Commit button:

- “Blew a half of Hazy” must resolve exact product + package SKU and taproom location;
  “half” may mean a half-barrel keg, half a keg, or 0.5 bbl.
- “We're out of Pils” must distinguish counted on-hand zero from subtracting one keg.
- “Return a keg” must distinguish beer return + credit, empty-fleet keg return, and
  deposit refund.
- “Received 40 bags of 2-row” must resolve PO/vendor, purchase-unit factor, counted
  quantity, and required lot.
- “Gravity 1.012 FV3” must resolve the open occupancy and show SG → °Plato conversion.
- “Ship it” and “same as last week” must re-check order identity, ship-to, price, active
  SKU/package, permission, and current order state.

People enter positive amounts. Movement type and explicit Increase/Decrease or From/To
give direction; the server derives stored sign. Count commands accept an observed
positive count and derive the delta. The proposal renders the signed effect
(`−1 × Hazy IPA · ½ bbl keg · Taproom · depletion · −0.5 bbl`) before an append-only
write. Numeric pads show valid units and live canonical conversions; pickers show valid
recents before grouped search. The server stores the fixed back-of-house units from
`brewing-domain.md`.

Every append-only or immutable commit echoes the immutable row/document into the ledger
tape. There is no generic **Undo**. When a lawful, schema-backed correction exists, the tape names it:
**Record inventory correction**, **Return shipment**, **Record a new count**, or **Create
recipe version**. Mutable saves use the same verb in the button and success feedback.

Composer history is device-local until a server-owned history schema exists and opens
through a visible **History** button. Swipe-up may enhance it but is never the only path.
Voice remains a future transport as the product spec states.

### Registry, risk, confirmation, compensation, and replay contract

Every query and mutation, including canonical previews and report generation, passes
through `lib/commands/registry.ts` and the single endpoint. Supabase Auth's pre-context
operations (sign in/magic link, password reset, invite-token password update) are the
explicit platform boundary, not pseudo registry IDs. `provision_brewery` will be a
registered pre-membership boundary backed by one security-invoker Postgres function;
it stays blocked until the registry and RLS have a narrow pre-tenant context because
normal `Ctx` cannot exist before the brewery/admin membership pair does.

| Contract field | Required meaning |
|---|---|
| `risk` | `mutable`, `append_only`, `immutable`, `filed`, `external`, or `destructive_local`; drives semantic color/review, never permission. |
| `requiresConfirmation` | True for every AI-targeted mutation; false for queries. A direct form confirms through its verb. |
| `preview` | Server-canonical effects/warnings; required for AI writes and copper direct-form writes. |
| `compensation` | Exact registered command/named workflow, or null when no lawful automatic correction exists. |
| `idempotency` | `dedupe` or `online_only`; every mutation gets a stable `requestId`, and dedupe returns the persisted prior result. |
| `offlineReplay` | True only after request ID reaches client → endpoint → handler/RPC → durable dedupe. A draft is not a queued command. |
| `atomicity` | `single_row`, one `rpc`, `atomic_exempt_csv`, or durable external-intent workflow. The client never loops a multi-row write. |

The current `{ breweryId, name, input }` endpoint is insufficient. Step 1 adds
`requestId`, optional `previewToken`, and durable server dedupe. Until then, no command is
replayable. A lost response resolves by request ID and displays the prior result; it never
sends a fresh logical write.

| Commands (exact registry IDs) | Risk / color | Atomicity, correction, and replay |
|---|---|---|
| `create_product`*, `create_sku`*, `create_location`*, `update_product`, `update_sku`, `update_location`, `create_price_list`, `update_price_list`, `set_price_list_item`, `create_customer`, `update_customer`, `create_ship_to`, `update_ship_to`, `update_brewery` | Mutable / hop green | Single row; explicit re-edit; dedupe, online commit. |
| `provision_brewery` | Mutable / hop green | One RPC for brewery + admin membership; no automatic compensation; online only. |
| `invite_staff`*, `invite_customer_user`* | **IMPLEMENTATION-GATE** / copper | Current handlers are not UI-ready: Auth invite precedes membership without durable intent/compensation. Step 1 must make retries reuse one request identity and recover or compensate Auth success + DB failure; online only. |
| `connect_qbo`, `connect_square` | External / copper | Durable OAuth workflow after admin permission check; connection/health reads precede downstream actions. `compensation: null` until exact disconnect commands exist; online only. |
| `import_csv`* | **IMPLEMENTATION-GATE**; opening balances copper, mutable entity rows green | Existing ID, unsafe current implementation. Before UI: each dependent logical row uses one RPC; independence only between rows; every row persists a stable `requestId` + result so reruns—including opening balances—dedupe. Online only. |
| `record_movement`* | Append-only / copper | One ledger row; outbox eligible only after durable dedupe and stale revalidation. |
| `reverse_inventory_movement` | **SCHEMA-GATE** | Disabled until an auditable original/compensation link, legal opposite effect, and TTB report semantics exist. Never substitute an unlinked generic `adjustment`. |
| `record_taproom_count` | **SCHEMA-GATE** | Disabled until a durable count occurrence + expected/observed lines exist. Then one RPC writes the complete snapshot and only the required movement deltas, including a zero-variance count with no movement rows. |
| `set_taproom_par`*, `set_taproom_standing_allocation`, `release_allocation` | Mutable / hop green | Single row or one replacement RPC; re-edit/release; dedupe, online. |
| `create_order`, `submit_order`, `confirm_order`, `record_pick`, `resolve_short_pick`, `adjust_order_line`, `create_taproom_transfer` | Mutable / hop green | One RPC whenever order + lines/allocations/status change together. Staff `create_order` and `create_taproom_transfer` require explicit source (and destination for transfer); neither guesses “Warehouse.” Portal `submit_order` is **SCHEMA/RLS-GATE** until it receives a customer-safe allowed/default source; then it creates order + all lines + submitted status in one RPC, never parent-then-lines. `record_pick` takes every entered line, sets picked status atomically, and is outbox eligible after dedupe/stale revalidation; the others commit online. |
| `cancel_order` | Destructive local / copper | One RPC for terminal status + allocation release; staged-restock is derived from picked quantities. `compensation: null`; online only. |
| `ship_order` | **SCHEMA-GATE** / copper | Requires explicit persisted invoice timing on the shipment; then one RPC writes shipment + intent + movements + allocation fulfillment + shipped status and invoices now unless self-delivery. Once slice 9 lands, owned-fleet keg SKUs append their shipment-linked keg events in this same RPC. Never infer mode from carrier/route. `return_shipment` is the named correction. |
| `return_shipment` | Append-only/financial / copper | Explicitly shows the return destination (default may be the original fulfillment source); one RPC for destination-bound return movements + credit memo/lines and, after slice 9, matching owned-fleet returned-keg events. No generic reversal; online only. |
| `set_qbo_customer_mapping`, `set_qbo_item_mapping` | Mutable / hop green | Single-row explicit remap; dedupe, online only. |
| `push_invoice_to_qbo` | External / copper | Persist exact payload + stable request ID before POST, then remote result. Credit memo corrects money; uncertain response reconciles by the same ID before retry; online only. |
| `receive_purchase_order`, `record_material_count` | Append-only / copper | One RPC each. A new `record_material_count` corrects a count; receipt `compensation: null` until an exact correction command exists. Only drafts work offline. |
| `create_material`, `update_material`, `replace_sku_bom`, `create_purchase_order`, `upsert_vendor`, `upsert_material_contract`, `draft_purchase_order_from_requirements` | Mutable / hop green | Material/vendor rows re-edit explicitly; BOM replacement and any draft PO + lines use one RPC. Online. |
| `create_recipe`, `create_recipe_version` | Mutable parent / immutable version | Recipe parent is a single mutable row. Version + ingredients use one immutable RPC; correction creates a newer version. Online. The version stores brewing assumptions (mash temp, brewhouse efficiency, yeast attenuation); the server derives OG/FG/ABV from the grain bill + assumptions and stores them with the version — typed targets never disagree with the math. **SCHEMA-GATE:** assumption columns on `recipe_versions` and extract potential on fermentable `materials`. |
| `create_vessel`, `update_vessel`, `schedule_batch`, `record_fermentation_reading` | Mutable / hop green | Single-row explicit edit; reading is outbox eligible after dedupe. Vessel state is still derived from occupancy, never a status field. |
| `record_brew_day` | Append-only/finalizing / copper | One RPC for brewed timestamp + additions/material movements + knockout occupancy; `compensation: null`; online only. |
| `record_cellar_transfer` | Append-only / copper | One RPC creates a zero-baseline target occupancy when the vessel is empty, appends the transfer with `loss_bbl`, and closes the source occupancy iff fully emptied; never writes a duplicate loss adjustment or vessel status. `compensation: null` until an exact append-only correction command exists; replay requires dedupe + occupancy revalidation. |
| `complete_batch` | **SCHEMA-GATE** | Disabled until structured completion-reconciliation identity/classification exists. Then one RPC owns `batches.closed_at`, the remaining occupancy close, and any threshold-qualified reconciliation after rejecting open packaging runs. |
| `reattribute_loss` | **SCHEMA-GATE** | Disabled until `volume_adjustments` has structured reconciliation origin/identity and cellar-removal classification. Never identify rows from free-text `note`. |
| `schedule_packaging_run` | Mutable / hop green | Requires one exact open source occupancy; one RPC creates the run + all planned output rows. Explicit re-edit while open; online. |
| `close_packaging_run` | Append-only/finalizing / copper | Revalidates and shows the run's exact source occupancy and requires explicit FG destination; one RPC for close + lot + destination-bound FG movements + actual outputs + material movements. `compensation: null` and correction UI disabled until an exact command exists; online. |
| `file_compliance_report` | Filed / copper | One generated snapshot write; `compensation: null` and amendment disabled until its schema workflow exists; online. |
| `upsert_product_approval`, `upsert_state_registration`, `upsert_brewery_state_license` | Mutable / hop green | Single-row explicit re-edit; online. |
| `set_pos_location_mapping`, `set_pos_item_mapping` | Mutable / hop green | Single-row explicit remap; item mapping requires exact package SKU + positive `qty_per_sale` and shows canonical bbl-per-sale before save. Online. |
| `sync_square_sales` | External / copper | Online fetch uses the same requestId on retry; each fetched page is inserted by one security-invoker batch RPC and dedupes on the unique Square line ID. No durable cursor is claimed by the current schema; raw facts are never deleted. |
| `reconcile_pos_sales` | Append-only / copper | One RPC for selected sales: all depletion rows + every `pos_sales.movement_id` link. Never a client loop; online. |
| `create_keg_pool`, `update_keg_pool` | Mutable / hop green | Single-row pool setup; explicit re-edit; online. |
| `record_keg_event` | Append-only / copper | Append the specific correcting event; outbox eligible after dedupe. |
| `save_route`, `depart_route`, `return_route` | Mutable / hop green | Route + delivery assignments use one RPC; timestamps single-row. No persisted loaded state; online. |
| `confirm_delivery` | Finalizing/financial / copper | One RPC for existing delivery `delivered_at`/`signed_by` + deferred invoice/lines. It never ships or writes inventory; `compensation: null`; online. |

`*` marks an implemented ID; spelling stays unchanged. `record_movement` keeps its ID but
its design-target input becomes positive amount + type/explicit direction, with sign
derived server-side.

| Domain | Exact registered query IDs |
|---|---|
| Existing | `list_products`, `get_on_hand`, `get_atp`, `list_movements`, `list_skus`, `list_locations`, `list_team_members` |
| Shell/global | `preview_command`, `get_first_run_state`, `get_today`, `get_beer_overview`, `list_work`, `search_entities` |
| Orders/customers | `get_inventory_detail`, `list_orders`, `get_order`, `get_daily_pick_sheet`, `get_taproom_replenishment`, `get_shortfalls`, `get_standing_allocations`, `list_customers`, `get_customer`, `list_invoices`, `get_qbo_mapping_candidates`; `get_taproom_count_snapshot` is **SCHEMA-GATE** with `record_taproom_count` |
| Portal | `get_portal_catalog`, `list_portal_orders`, `list_portal_invoices`, `get_portal_account` |
| Materials/production | `get_purchase_order`, `get_material_on_hand`, `list_materials`, `list_vendors_and_contracts`, `list_recipes`, `get_recipe`, `get_recipe_outcomes` (per-batch actual OG/FG/ABV + realized efficiency/attenuation, derived from readings — never stored), `get_cellar_map`, `get_brew_day`, `get_packaging_run`, `trace_lot` |
| Compliance/integrations | `generate_compliance_report`, `get_compliance_registry`, `get_qbo_connection` (health only, never tokens), `get_pos_setup`, `get_keg_fleet`; `get_loss_review` is **SCHEMA-GATE** with `reattribute_loss` |
| Delivery/planning | `get_route_load`, `get_route_builder`, `get_delivery_stop`, `get_planning_shortfalls` |

Report screens call `generate_compliance_report`; there is no `v_bro`. Search/Lot trace
are global registered queries. Notification history does not appear because no schema or
query owns it.

## 3. Navigation shells

### Staff phone (≤ 768px)

```
┌─────────────────────────────┐
│ ◐ Demo Brewing   Search  Me │
│                             │
│  Today                      │
│  [role-filtered action rows]│
│                             │
│  [large quick actions]      │
│                             │
├─────────────────────────────┤
│ Say what happened…  History │
├───────┬───────┬──────┬──────┤
│ Today │ Beer  │ Work │ More │
└───────┴───────┴──────┴──────┘
```

- **Today** is the role-filtered inbox: picks due, submitted orders, overdue readings,
  weekly taproom count (after its schema gate), PO arrivals, negative ATP, QBO failures, delivery next stop, and
  compliance deadlines. Standing work stays here, not in More. Each row either performs
  a fully explicit safe action or opens its owning form prefilled.
- **Beer** is physical truth: FG on-hand/ATP, taproom replenishment/count, cellar
  occupancies, materials, and keg fleet. There is no vessel status column; occupancy and
  timestamps derive presentation.
- **Work** is in-motion work: new/existing orders, picks, shipments, transfer-order
  completion, batches, packaging runs, POs, routes, and deliveries.
- **More** is desk-biased reference/admin work: Catalog, Customers, **Invoices & QBO**,
  Price lists, Recipes, Compliance/Reports, Planning, Import, Team, Integrations, and
  Brewery/Locations settings. Invoices appears here and in the desktop rail.

Global **Search** lives in the header on phone and rail/palette on desktop; it is not a
More destination. Lot trace is a Search result and can deep-link to printable detail.
Brewery switching (SaaS only) and account actions live in the header.

### Staff desktop (> 768px)

The same four groups become a left rail with listed subareas expanded. Content gets two
columns only where comparison matters. Composer is available from the visible top entry
and `⌘K`. Viewport chooses layout; `(pointer: coarse)` independently chooses larger
controls, so a wall tablet is desktop layout with glove-safe targets.

### Wholesale portal

`/portal` is a complete separate shell with **Order · Orders · Invoices · Account** on
phone and desktop. Order is the landing route; all four have selected, focus, loading,
empty, and error states. Composer is restricted to the current customer's orderable
catalog, own orders/invoices, repeat-order proposal, and draft/submit
commands. The portal does not expose ATP/on-hand: those views are staff-only under the
baseline RLS, while staff still receive the soft availability warning at confirm. It
cannot discover staff tools or other customers. Account is read-only under
current RLS: permitted ship-tos and only the signed-in portal user's own membership can
be viewed, not edited; peer portal users are not listed. Invite acceptance lands
inside this shell, never in the staff app.

### Roles and cross-cutting behavior

`admin` sees all staff areas; `sales` sees Orders, Customers, Invoices and read-only Beer;
`warehouse` sees Pick, Ship, Receive, Record, and Taproom count; `brewer` sees Cellar,
Brew day, Packaging and Record. The taproom-lead persona uses the `warehouse` permission
bundle (or `admin`). The driver persona also uses `warehouse`; route/stop reads and
writes additionally require `route.driver_user_id` to match the caller, with an admin
override. Neither persona implies another staff-role enum. Navigation/Today hide inapplicable actions, while registry
and RLS still deny direct URLs/commands. A role-hidden control leaves no blank gap. A
bookmarked forbidden route shows permission denied with a route back, not empty data.

- Locations and brewery profile live under Settings. Deployment mode is read-only.
- Printing covers pick lists, daily pick sheet, global lot trace, and measured thermal
  keg-collar/lot labels when packaging lands.
- Outbox count opens Retry/Discard detail. Only §2 `offlineReplay` commands appear.
- Document numbers render monospaced after commit; proposals say “assigned on commit”.
- No Notifications history is shown until schema and a registered query own it.

## 4. Area by area

Each row names one job and the owning behavior. Every read/write uses §2 registry IDs;
wireframes carry the exact subset. “Sheet” means titled Drawer on phone and titled
Dialog/Sheet on desk.

| Area (slice) | One job | Phone-first behavior and required folded flows | Desk extras |
|---|---|---|---|
| **Today** | Tell me what needs doing | Role-filtered actions/quick commits; first-run checklist replaces normal empty inbox | Week strip for ship, receipt, brew, packaging, compliance dates |
| **Beer / Inventory** (1) | Show physical and promiseable stock | SKU cards with on-hand, allocated, ATP; detail has per-location values + movement tape | Location table, filters, shortfall link |
| **Record movement** (1) | Append one correct FG event | Type `ToggleGroup`, SKU/location pickers, positive QtyPad, conditional channel/state/direction, canonical signed preview | Same form; keyboard entry secondary |
| **Orders** (1) | Create and advance an order | Work includes **New order** with an explicit fulfillment source; detail exposes only valid draft → submitted → confirmed → picked → shipped/cancelled actions | List/detail split, lines + ATP + ship-to; no priority/backorder state |
| **Pick / short pick** (1) | Record pallet quantities | Pick-as-ordered fast path; complete line set editor; shortage requires adjust-down reason or cancel/release remainder; concurrent/staged-restock states | Daily pick sheet, print, explicit restock queue |
| **Ship / transfer completion** (1) | Commit physical removal/move | Exact source/signed rows and explicit invoice timing, then copper **Ship order** or **Complete transfer**; `ship_order` waits for its persisted-timing SCHEMA-GATE | Wholesale invoice/QBO result; transfer has no invoice |
| **Taproom** (1, 7) | Keep taproom stock honest | Par/on-hand, request transfer with explicit source/destination, keg-blown/depletion. **SCHEMA-GATE:** weekly count waits for a durable observation/snapshot; its later one-RPC commit writes that snapshot plus only required movements | Replenishment and Square reconciliation |
| **Shortfalls / pars / standing allocation** (1) | Choose who gets scarce beer | Competing allocations, release/adjust actions, par and standing-allocation editors | Full table; no priority/reprioritize field |
| **Customers / ship-tos** (1) | Maintain buyer and destination | Search cards, customer/ship-to forms, portal invite | Table, price list, deposits, QBO customer map |
| **Catalog / price lists** (1) | Define what is sold | Read-first cards; create/edit remains usable | Product → SKU tree, package facts, prices, full `replace_sku_bom` editor |
| **Invoices / QBO** (1) | Connect, map, and push an invoice once | Connection/health precedes mapping; status/failure detail, picker, copper online-only push/retry | Invoice/credit detail, candidates, durable request result |
| **Materials / receiving** (2) | Receive counted material | Expected vs counted, over/short, conditional lot, one copper receipt commit | PO list, requirements → draft PO |
| **Material count / materials / vendors / contracts** (2) | Keep material/supply truth | Create/edit material facts; positive counts → adjustment preview; vendor picker | Material/vendor/contracts and committed/received/remaining |
| **Recipes** (3) | Create recipes and immutable versions; keep predictions honest | Create mutable recipe parent; read/scale; draft editor takes grain bill + mash temp + efficiency + attenuation and shows server-computed OG/FG/ABV; version view lists per-batch actuals (OG/FG/ABV from fermentation readings, realized efficiency/attenuation) with deltas vs predicted — one row per batch, amber when out of band | Version editor and costing; outcome table across batches |
| **Cellar / reading** (4) | Set up vessels, know occupancy, and log reading | Create/edit vessel facts without status; map derives contents; reading defaults current occupancy and unit; disabled `complete_batch` names its reconciliation schema gate | Timeline and lineage graph |
| **Brew day** (4) | Establish batch baseline | Schedule/record brew day, lots/additions, knockout volume → free vessel | Calendar and scaled recipe |
| **Transfer / loss** (4) | Move beer and account for remainder | From occupancy + target vessel/occupancy, positive bbl, `loss_bbl` in the same RPC; an empty target gets a zero-baseline occupancy and a fully emptied source closes | Lineage and named correction |
| **Packaging run / outputs** (5) | Plan and close real stock | Green schedule/edit selects one exact open source occupancy and writes run + planned outputs in one RPC; close revalidates source and reviews requirements, actual output, lot, explicit FG destination, consumption/return/loss, then commits copper | Run list, yield/loss, labels |
| **Lot trace / recall** (5) | Find where a lot went | Global lot search → material/batch/FG/shipment/customer tape | Printable trace; not hidden in More |
| **Compliance month / loss review** (6) | Generate, review, file | Registered generator and copper filing. **SCHEMA-GATE:** loss queue/reattribution stays disabled until structured reconciliation identity/classification exists | Tax/state tables, filed snapshot; never `v_bro` |
| **Compliance registry** (6) | Know where product may ship | Read approvals/registrations/licenses; order warning links here | Editors and expiry Today rows |
| **POS setup / mapping** (7) | Ingest and classify Square facts | Connection health; idempotent sales sync; exact package SKU + `qty_per_sale` conversion; reconciliation disabled until valid | Connect/sync/map/diff; one `reconcile_pos_sales` RPC |
| **Planning** (8) | Show demand/supply gap | Read shortfall cards | Calendar + draft PO; no planning status table |
| **Keg fleet / deposits** (9) | Configure pools and know who holds containers | Create/edit pool; customer/pool balance; explicit return/loss event | Pools, deposit history, loss rates |
| **Routes / truck loading** (10) | Build route and verify load | Route/load list; checks are local/session-only, then **Depart route** | **Route builder** saves route + existing shipments/stops atomically |
| **Driver delivery** (10) | Confirm existing shipment arrived | Next stop, shipment quantities, `signed_by`, copper **Delivered** | Route progress; `confirm_delivery` records delivery + deferred invoice, never ships |
| **Sign in / invite / reset** (1) | Enter correct shell | Auth forms; token chooses staff Today vs portal Order | Same |
| **Onboarding / first run** (1) | Make empty brewery usable | SaaS provision → Add location, Add/import catalog, Invite team; dedicated skips provision | Full forms and import handoff |
| **Import wizard** (1) | Map/validate launch data | Phone inspects/hands off; no cramped mapper | Upload → map → row errors → commit → mixed result → stable rerun |
| **Returns / credit memos** (1) | Take shipped beer back | Positive returned qty + reason → exact return rows + negative invoice preview | Same plus QBO credit status |
| **Settings** | Rare configuration | Brewery, Locations, Team, Integrations, Import; no Notifications history | Same, wider tables |

Portal frames are **Portal · Order**, **Portal · Orders**, **Portal · Invoices**, and
**Portal · Account**. Account is read-only under current RLS. Together with staff/auth
screens they make the 50-frame inventory.

## 5. Visual system

The subject is a working brewhouse: stainless, hop green, copper fittings, wort warnings,
chalk-marker utility. The one aesthetic risk is the **ledger tape**: append-only rows use
JetBrains Mono, a sturdy left rule, and chronological rhythm wherever physical truth is
recorded. It is an audit surface, not decoration, and never implies a row can be deleted.

| Product token | Light | Dark | Role / shadcn mapping |
|---|---|---|---|
| `--ground` | `#EEF0EE` | `#101713` | Stainless page → `--background` |
| `--surface` | `#FFFFFF` | `#18211C` | Cards/sheets → `--card`/`--popover` |
| `--ink` | `#16201B` | `#F2F5F2` | Text → `--foreground` |
| `--hop` | `#1F4D3A` | `#8AC5A6` | Mutable primary action/active nav → `--primary` |
| `--copper` | `#9A4E20` | `#E2A06F` | Append-only, immutable, filed, external, destructive-local action only → `--irreversible` |
| `--warning` | `#FFF5D8` | `#30260E` | Warning surface |
| `--warning-foreground` | `#7A5600` | `#F0C766` | Warning text; never yellow text on white |
| `--rule` | `#9EA8A1` | `#5C6B62` | Dividers and ledger rule |

On-accent text is white on light hop/copper; dark mode uses `#0E241A` on hop and
`#2B1205` on copper. Those pairs, warning text/surface, and ground/ink pass WCAG AA.
Semantic pairs replace manual `dark:` overrides. Copper never decorates headings, tabs,
validation/errors, neutral selections, or mutable saves; risk metadata selects it only
for the five command classes named above.

- Display: **Familjen Grotesk**, restrained to headings and one large operational number.
- Body: **Instrument Sans**, 16px default on phone; 14px is supporting copy, never a wet-
  phone primary label.
- Data: **JetBrains Mono** for quantities, units, times, document numbers, tape rows; all
  numerals use `font-variant-numeric: tabular-nums`.
- Scale: 12 / 14 / 16 / 20 / 28 / 44; 16px phone gutter, 8px grid, 4px equipment-like
  radius rather than pill-heavy consumer styling.
- Every target is ≥48×48px. Under `(pointer: coarse)`, primary actions and QtyPad keys are
  ≥56px high, adjacent targets have ≥8px separation, rules are 2px, and icons use 2px
  stroke. Pointer type, not viewport, handles a cooler wall tablet.
- Bottom actions/composer/tabs include `env(safe-area-inset-bottom)` and content padding.
  No primary flow depends on hover, swipe, long press, double tap, or a hairline. Use
  `touch-action: manipulation`.
- One motion only: an accepted append-only proposal drops into the tape in 200ms;
  `prefers-reduced-motion` makes it instant. Mutable saves do not mimic ledger rows.

Copy uses sentence case and names the write: **Record reading**, **Done picking**, **Ship
order**, **Receive materials**, **Complete transfer**, **Delivered**. Success repeats the
verb; errors say what to change and preserve entered data.

## 5b. shadcn, icons, and required states

Every interactive/stateful element is shadcn/ui added through the CLI. Pages compose
those sources and semantic tokens, not bespoke controls. The project is Radix Nova, RSC,
Tailwind v4, with aliases from `components.json` and tokens in `app/globals.css`.

- Forms use `FieldGroup` + `Field`; invalid state uses `data-invalid` and `aria-invalid`.
  Related controls use `FieldSet`/`FieldLegend`; 2–7 choices use `ToggleGroup`. Phone
  fields set correct `inputmode` and `enterkeyhint`.
- Searchable choices use `Command`/Combobox. Input adornments use `InputGroup` with
  `InputGroupInput`/`InputGroupTextarea` and `InputGroupAddon`.
- Warnings/errors use `Alert`; empty lists use `Empty`; loading uses shaped `Skeleton`;
  destructive/external confirmation uses `AlertDialog`. No full-page spinner.
- Chat/history composes `MessageScrollerProvider` → scroller → viewport → content/items,
  then `Message`/`MessageGroup`/`Bubble`/`Marker`. Built-in jump-to-latest owns scrolling;
  no hand-built bubble or gesture-only history.
- Drawer/Sheet/Dialog/AlertDialog always has a title. Cards use Header/Content/Footer.
  Select/Menu/Command items live in their Group. Use variants/tokens, `gap-*`, `Separator`,
  `Badge`, and configured toast; the project Button's irreversible variant consumes
  `--irreversible` rather than page `className` color overrides. No raw status colors,
  manual z-index, or custom loader. Every control exposes focus-visible, pressed,
  disabled, and pointer-hover states without making hover necessary.
- Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`, stroke-rounded) is the one
  planned app icon set. Installing it requires the repository owner's explicit dependency
  approval and a separate dependency commit.
  Use it only for four tabs, search/mic when enabled, history, close/back, queue marks, and
  dense status. Buttons prefer words. Icon-only exceptions have accessible names; icons
  in buttons use `data-icon` and component sizing. Coarse pointers use 2px stroke.

Every one of the 50 screens implements this shared baseline:

| State | Required behavior |
|---|---|
| Empty | `Empty` names what is absent and offers only a permitted next action. |
| Loading | `Skeleton` matches eventual rows/cards; shell/navigation stays stable. |
| Error | `Alert` names failure and whether Retry is safe; entered data remains. |
| Offline | Persistent state + data age. Drafts are labelled; only `offlineReplay` commands enter outbox. |
| Permission denied | Distinguish permission loss from no records, remove write, link safely back. |
| Role hidden | Omit navigation/action; direct URL still gets server permission state. |
| Stale | Name changed data, refresh canonical values, require fresh confirmation; never silent rebase. |
| Deduplicated | Show prior result for same request ID as “Already recorded”; never add a second optimistic row. |

Draw variants, not prose alone, for:

- **Composer/Outbox:** ambiguous, preview pending, queued, response lost, dedup success,
  stale, permanent rejection, role changed, and copper discard `AlertDialog`.
- **Ship/Return/Receive/Packaging/File/QBO/Delivery:** preview, committing, accepted,
  rejected, stale, permission lost, and uncertain external result.
- **Pick:** partial, concurrent change, short + required resolution, staged restock,
  completed.
- **Portal Order:** empty catalog, missing price/ship-to, inactive prior SKU, stale repeat,
  submit error, duplicate receipt, no orders/invoices.
- **Import:** upload error, missing mapping, all invalid, mixed success, response-lost
  rerun, permission lost, phone-to-desk handoff.
- **Auth/onboarding:** expired invite, wrong audience, existing membership, dedicated-mode
  provisioning hidden, partial checklist.

## 6. Component inventory

- `AppShell` / `PortalShell`: shadcn navigation, safe-area frame, role-filtered routes.
- `Composer`: `MessageScroller`/`Message`/`Bubble` history, `InputGroupTextarea`, proposal
  `Card`; `Alert` owns ambiguity/warnings.
- `ProposalCard`: full `Card` composition with canonical effects, stale/version marker,
  **Open as form**, and exact command verb.
- `CommandForm`: titled `Drawer` on phone and titled `Dialog`/`Sheet` on desk, always
  `FieldGroup` + `Field`.
- `QtyPad`: `Button` grid + `ToggleGroup` units + monospaced conversion; 56px keys on
  coarse pointers.
- `EntityPicker`: recents + grouped `Command` search in titled Drawer/Dialog.
- `LedgerTape`: immutable rows from shadcn list/Card, `Badge`, `Separator`; named
  correction links only.
- `StatusStepper`: `Badge` + `Separator`, restricted to schema status/timestamp
  transitions. It never invents vessel, loaded-delivery, route, planning, or packaging
  status.
- `ActionCard`: full `Card` + explicit `Button` for Today and quick actions.
- `StateFrame`: shared `Empty`, shaped `Skeleton`, `Alert`, permission/offline surfaces.

Tables use shadcn `Table`; feedback uses Sonner for the Radix base. Domain components compose
shadcn primitives and Tailwind layout only. No page-specific form abstraction appears
until the rule of three proves a shared pattern.

## 7. Build order (each a small PR)

1. **Contracts and stable shells:** extend registry/transport with risk, confirmation,
   preview, compensation, request ID, durable dedupe, stale revalidation, and atomicity;
   resolve FG correction identity/report semantics, durable taproom count storage,
   and persisted shipment invoice timing in the baseline before their commands;
   harden both Auth invitation workflows
   against Auth-success/membership-failure; implement `preview_command`; establish semantic tokens, three fonts, safe areas,
   coarse-pointer sizing, shadcn state primitives, Hugeicons after dependency approval,
   auth/role guards, and both
   empty **staff and portal shells**. Navigation exists before content.
2. **Entry and first usable state:** sign-in, invite accept, reset, pre-membership SaaS
   provisioning, first-run checklist, location/catalog/team basic forms, shared empty/
   loading/error/offline/permission/role-hidden/stale/dedup states, and contract-backed
   Today placeholder. Portal invite acceptance already lands in its stable shell.
3. **Shared entry primitives on real data:** `CommandForm`, `QtyPad`, `EntityPicker`,
   `LedgerTape`, record movement, schema-backed named inventory correction, then
   harden `import_csv` at the per-logical-row RPC/dedupe boundary and build the full import wizard.
   Import is cut from entry because mapping/error UI depends on these primitives.
4. **Composer and safe outbox:** candidate intent → `preview_command` → explicit proposal
   → target command; visible History; only proven `offlineReplay` commands queue.
   Response-lost/dedup/stale/permanent-failure tests land before replay. Voice is deferred.
5. **Orders staff surface:** new order, confirm, atomic pick, short-pick/restock, ship,
   returns, schema-backed taproom weekly count/transfer completion, shortfalls, par/standing editors,
   Customers, Catalog, QBO connect/health, invoice mapping, and durable online-only push.
6. **Portal content:** Order, Orders, Invoices, read-only Account, restricted composer,
   customer-safe fulfillment-source config/RLS, complete portal state matrix, and
   end-to-end duplicate-submit smoke test.
7. **Later slices:** each adds registered queries/commands, owning forms, Today rows, and
   state variants without a new nav group. Each slice first lands its prerequisite setup:
   materials + BOM, recipe parent, vessels, packaging plan/output, Square sync, and keg
   pools. Batch completion/loss review waits for its SCHEMA-GATE; Delivery adds route
   builder/local load checks; packaging adds measured label printing.

Steps 1–2 intentionally exclude the full import mapper, populated cross-slice Today feed,
server chat persistence, and domain pages. They establish contracts, visual tokens, state
vocabulary, both audience shells, and access boundaries for every later screen.

## 8. Resolved implementation decisions

- Every AI write requires explicit proposal confirmation; there is no auto-commit.
- Portal composer is included but restricted to portal query/order allowlist.
- Dark-mode tokens ship with the visual foundation; light remains default.
- Viewport chooses phone/desktop layout; pointer accuracy chooses glove-safe sizing.
- Search/Lot trace are global; Invoices & QBO is listed in More.
- There is no Notifications history until schema and registered query own it.
- There is no generic Undo, persisted truck-loaded flag, allocation priority field,
  vessel status column, or report view standing in for generator code.
- `get_loss_review`/`reattribute_loss` remain disabled behind **SCHEMA-GATE** until typed
  reconciliation origin/identity and cellar-removal classification exist; free-text note
  matching is forbidden.
