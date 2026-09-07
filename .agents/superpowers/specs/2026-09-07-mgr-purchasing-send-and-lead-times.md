# MGR — Sending purchase orders, vendor lead times, and contract drawdown

Date: 2026-09-07
Status: Decided with Ted; not yet implemented. Screen-level items are current-focus
work; column and view changes wait for the backend push.
Amends: `2026-08-31-mgr-schema-design.md` — `lead_time_days` moves from `materials`
to `vendors`, `purchase_orders` gains send transport and delivery state.
`2026-08-31-mgr-ui-layout-plan.md` — `send_purchase_order` stays Mutable / hop green,
but a new `transmit_purchase_order` is External / copper.

## Problem

`send_purchase_order` is spec'd as a single row `draft → sent` with `ordered_on`. It
records that a human asserts a PO went out; nothing leaves the process. There is no
email transport anywhere in the repo — the only SMTP is mailpit, the local sink for
Supabase Auth invites.

That is a defensible v1, but it leaves four questions unanswerable:

1. Did the vendor actually receive it?
2. How long does this vendor really take?
3. How much of a hop contract have we already spent, counting orders in flight?
4. What is still owed on a partially received PO?

Three of the four are already derivable from columns that exist. This spec says how.

## 1. Sending — one transition, three transports

`draft → sent` stays a **single** transition regardless of how the PO left the
building. Transport is a property of the send, never a fork in `po_status`.

    sent_via ∈ { direct, mailto, external }

- `direct` — MGR sends the email; provider webhooks return delivery state.
- `mailto` — MGR renders the link; a human sends from their own client.
- `external` — phoned, faxed, or ordered through a vendor portal; marked sent.

Forking the status enum per transport would multiply every downstream query by three
for no gain: receiving behaves identically in all three cases.

### Honesty rule

Only `direct` earns delivery language. The others are attestations and must read as
attestations:

| `sent_via` | Screen copy |
| --- | --- |
| `direct` | "Delivered to orders@countrymalt.com · 9/7 2:14pm" |
| `mailto` | "Marked sent by Dana · 9/7" |
| `external` | "Marked sent by Dana · 9/7" |

A `mailto:` link yields no delivery signal whatsoever — the browser hands off to the
OS mail client and the trail ends. Rendering "Sent" for it is a lie the buyer will
believe for ten days of lead time.

### Sending identity

**Default (no customer DNS):** `From: po@<mgr domain>`, display name the brewery,
`Reply-To` the brewery's own address. Works the day a brewery signs up; MGR owns
deliverability for every tenant at once. Cost: DMARC alignment means some clients show
"via", and the brewery's own domain does not vouch for the mail.

**Upgrade (per brewery):** a verified sending domain, so mail is `From:
logistics@lolev.beer`. Requires the brewery to add DKIM CNAMEs and an SPF include to
their own DNS. Offered in settings, never required.

**No MX record is needed for either.** MX governs inbound mail. Sending needs SPF,
DKIM and DMARC — three DNS TXT records, not a mail server.

The fallback is the load-bearing part: **a half-configured or failing custom domain
must fall back to the default sender, never block a PO from going out.**

Assumption, revisit before building: provider is **Resend** (Vercel-native, clean
domain-verification API, webhooks). The brewery reply address lives in
`breweries.settings` jsonb rather than typed columns, and is promoted to columns when
the purchasing backend lands. `breweries` already carries `settings jsonb`
(`00001_baseline.sql:68`); nothing else about this needs storage today.

### `transmit_purchase_order` is copper, not green

`send_purchase_order` (the status flip) stays Mutable / hop green. Actual transmission
is a separate External / copper command with the same treatment as
`push_invoice_to_qbo`: persist the exact rendered payload and a stable request ID
before the POST, and reconcile by that ID before any retry. An uncertain response must
never produce two POs at the vendor.

Delivery state arrives asynchronously by webhook:

    accepted → delivered → (bounced)

`delivered` is the real signal — the vendor's mail server accepted it. `bounced` is
the one the buyer most needs and must surface as work, because today that failure is
silent and costs a full lead time. Open tracking is unreliable (image blocking) and is
not modelled.

### Deferred: inbound

An MX record plus a threaded reply address (`po+0142@…`) would land vendor replies back
on the PO and give a true `acknowledged_on` — the only thing that confirms a human
received it. Genuinely valuable, but it is inbound parsing, spam filtering and a
threading scheme. Not v1.

## 2. Receiving — the delta that already exists, and the one that does not

Two different deltas. Only one is built.

| Delta | Question | State |
| --- | --- | --- |
| Per-receipt variance | "The box said 4, I counted 3" | **Built** — `receipt_lines.variance` generated `(qty_counted − qty_expected)` |
| Open balance | "PO-0141 still owes 1 Citra box" | **Missing** — derivable, not surfaced |

`update_po_status()` (`00001_baseline.sql:760`) already computes `sum(qty_counted)` per
line against `qty_ordered` to decide `received` vs `partially_received` — then discards
the number. Expose it as a **view**, not a column: storing it needs a second trigger to
stay honest, and `receipt_lines (po_line_id)` is already indexed.

There is no `receiving` status to add. `sent` already means awaiting receipt — it is
the entire meaning of the state, and the Purchase orders list already renders `Receive`
as the action on it (`components/mgr/screens.tsx:2127`). A `receiving` value would be
either a manual flip nobody remembers or an automatic synonym for `sent`.

### Bug: empty PO lands in `partially_received`

`bool_and(...)` over a PO with zero lines returns NULL, and
`case when null then 'received' else 'partially_received'` sends it to
`partially_received`. Unreachable today because `create_purchase_order` writes PO and
lines in one RPC — but the first "add a line to an existing PO" path walks straight
into it. Guard the empty case when the trigger is next touched.

## 3. Lead time belongs to the vendor

**Decision (Ted, 2026-09-07): lead time is per vendor, not per material**, even where
vendors selling similar products share a lead time.

`materials.lead_time_days` (`00001_baseline.sql:191`) **moves to `vendors`**. It is
dead weight where it is — nothing in code reads it; it appears only in the baseline
and in the Planning screen's prose. Nothing is deployed, and AGENTS.md permits editing
the baseline migration in place, so this is a straight column move, not a second
migration.

Rationale that survives the data model: lead time is a property of *fulfillment* — the
vendor's warehouse, carrier and queue. Every observation available (`ordered_on →
received_on`) is keyed by `vendor_id` on the PO header, so putting the estimate where
the evidence lives makes typed default and measured actual directly comparable. A
material-level estimate could never be checked against anything.

### Consequence: Planning's third resolution step dies

The Planning screen currently drafts to *"the vendor holding an active contract for
that material, and failing that the shortest lead time on the material"*
(`screens.tsx:2873`). With lead time on the vendor, that second clause cannot be
evaluated — there is no vendor-material catalog to enumerate candidates from.
`material_contracts` links a vendor to a material and `materials.default_vendor_id`
names one; that is everything the schema knows about who sells what.

Resolution collapses to two steps:

1. Active `material_contracts` row for that material
2. `materials.default_vendor_id`
3. Otherwise the row cannot draft — surface the existing `"no vendor"` state

`default_vendor_id` therefore becomes effectively **mandatory** for any material
Planning should be able to draft. The `"no vendor"` state copy changes from "no
contract and no lead time on the material" to "no contract and no default vendor".

### Observed lead time is a view, no new storage

Every date already exists:

| Date | Column | Meaning |
| --- | --- | --- |
| Sent | `purchase_orders.ordered_on` | set by `send_purchase_order` |
| Promised | `purchase_orders.expected_on` | what the vendor said |
| Arrived | `receipts.received_on` | defaults `current_date` |

A `vendor_lead_times` view gives per-PO observed (`received_on − ordered_on`), a
rolling average, `n`, and **variance against `expected_on`** — promise-versus-actual is
more actionable than raw lead time and tells you which vendors to stop believing.

Never store the average. The codebase already refuses to store recipe OG/FG/ABV
(*"computed by one shared formula and never stored"*) and derives vessel state from
occupancy rather than a status field. A denormalised rolling average would be the first
place this schema broke its own rule — and it must recompute when a correcting receipt
lands.

Two decisions the view forces:

- **Which receipt stops the clock.** Partial receipts mean several. **Last** receipt is
  the vendor's number (it is the promise they owed); **first** receipt feeds Planning's
  horizon, because partial arrival unblocks production.
- **Window.** Rolling last 5–10 received POs per vendor, never all-time — hop lead
  times blow out at harvest and a two-year mean hides it. Show `n`, so "14 days (n=3)"
  reads as the weak evidence it is.

**Caveat:** `ordered_on` is only as true as the send. For `sent_via = external` it is
an attestation, and someone marking a PO sent three days late makes the vendor look
fast. Tag observed values with their transport; do not treat `external` sends as equal
evidence.

## 4. Contracts are not orders

**Correction (Ted, 2026-09-07):** a hop contract is a forward commitment for a crop
year. Orders are placed *against* it throughout the year — you order even when
contracted. Contract and order are different objects.

The schema already models this correctly. `purchase_order_lines.contract_id →
material_contracts` is annotated *"(drawdown)"*, and the spec is explicit: *"the
ordinary order is placed against no contract at all, and a vendor may name a lot
without one. A contracted line is typed like any other."*

What follows, and should be stated so nothing implies otherwise:

- **A contract never gates ordering.** It supplies vendor, price and a drawdown target.
  Exceeding it is legal — those lines carry `contract_id = null` and spot price.
- **A single PO may mix contracted and spot lines for the same material.**
- **Price on a drafted line** comes from the contract while commitment remains, spot
  after. A draft that silently prices 200 lb at contract rate when 38 lb remain is
  wrong money.

### Remaining commitment needs three numbers, not two

**Contracts** currently shows *"400 lb committed · 138 lb remaining"*
(`screens.tsx:2350`), and the Contract sheet's `Received` field is read-only with the
note *"Receipts update progress."* So the drawdown clock starts when hops **arrive**.

Given that releases are placed repeatedly through a crop year, that is the wrong
denominator: place a 100 lb release against 138 lb remaining and the screen still says
138 until it lands. Place another and the contract is over-drawn with no warning at any
point.

    Citra 2026 · YCH — 400 committed · 262 received · 100 on order · 38 available

*Available* is what a buyer decides against; *received* is what accounting reconciles
against. Both are needed and they answer different questions. The screen today answers
only the second while carrying the button that needs the first.

Both are derivable — `sum(qty_ordered)` and `sum(qty_counted)` over lines carrying that
`contract_id`, already indexed `(contract_id)`.

This is the mirror image of the rule Planning already follows. An unreceived PO must
never inflate on-hand, because stock you do not have cannot be brewed with. An
unreceived release **must** deflate available commitment, because commitment already
spent cannot be released twice.

## 5. Drafting from requirements — consolidation and grouping

### The grouping key is the vendor, and it is not a choice

`purchase_orders` carries a single `vendor_id` (`00001_baseline.sql:695`). One PO, one
vendor. Consolidation is therefore forced by table shape, not policy. `expected_on` is
a header field too, so a split delivery date means a second PO.

### Pipeline

1. **Explode** each demand source through `sku_bom` into material quantities in
   `base_uom`.
2. **Sum per material** — across every source. This is the consolidation, and it
   happens *before* vendors are resolved.
3. **Subtract coverage** — on hand, and anything already on an open PO.
4. **Resolve vendor** per material (contract → `default_vendor_id`).
5. **Group by vendor** → one `purchase_orders` row each.
6. **Convert and round up** via `purchase_uom_factor`. You cannot buy 0.4 of a bag.
7. **Attach `contract_id`** where a contract covered it, with contract pricing up to
   remaining commitment and spot beyond.

Step 2 before step 4 matters: summing per material first means a material whose vendor
changes does not fragment the quantity. Resolving vendors first would give two
half-orders whenever a contract expires mid-horizon.

### Bug: open POs are not subtracted

Planning defines supply as *"on-hand ATP plus the planned outputs of packaging runs
already scheduled into that week"* (`screens.tsx:2870`). Open purchase orders appear
nowhere. Draft from the same gap twice and the material is ordered twice. Step 3 above
is a correction, not a restatement. `purchase_orders` is already indexed
`(brewery_id, status, expected_on)`, so the query is cheap.

### One gap, several vendors

The screen's singular `Draft purchase order` button cannot be right. A worked example —
a 200-case shortfall of Hazy IPA 16 oz, with cans, ends, quadpacks and trays from
Lindenmeyr Munroe (3 days) and labels from Blue Label (7 days):

| material | base | per case | 200 cases | vendor |
| --- | --- | --- | --- | --- |
| Can · 16 oz | each | 24 | 4,800 | Lindenmeyr |
| End · 202 | each | 24 | 4,800 | Lindenmeyr |
| PakTech quadpack | each | 6 | 1,200 | Lindenmeyr |
| Case tray · 24ct | each | 1 | 200 | Lindenmeyr |
| Label · Hazy IPA 16 oz | each | 24 | 4,800 | Blue Label |

Five materials, **two** draft POs, quantities rounded up to whole sleeves, bundles and
rolls. The button becomes `Draft 2 purchase orders`.

Note the structural asymmetry: cans, ends, quadpacks and trays are shared across every
16 oz SKU; **labels are per-SKU**, so `materials` grows one label row per SKU. The
per-SKU item is also the slowest and the least substitutable.

### The horizon is `max(lead_time)` across resolved vendors

*"A gap nobody can still buy for is a report, not a plan."* For the run above the
binding constraint is Blue Label's 7 days, not Lindenmeyr's 3. Past day 7 the row is
**partially unbuyable** — cans still orderable, labels not — and must draw that way
rather than as uniformly actionable.

This is the clearest argument for the per-vendor decision: the buyable date is not a
property of the shortfall but of the vendors a BOM resolves to. Two vendors, two
horizons, one run.

## 6. Leftover material at run close

### What exists

`material_movement_type` includes `return_to_stock` with sign check `qty > 0`
(`00001_baseline.sql:58,558`). `packaging_run_consumptions` carries one row per
movement, *"the movement's `type` says consumed / `return_to_stock` / `loss`"*.
`close_packaging_run` is spec'd as one RPC covering *"material consumption/return/
damage"*, and the Close packaging run screen already previews
`Labels returned / damaged · 24 / 6` in its movement tape.

### What is missing

That tape line is presentational. Every other actual on the screen has a control —
`Packaged` is a field, `Lot` and destination are pickers — but returned and damaged
quantities have nowhere to be typed. The ledger supports it, the command claims it, the
screen cannot collect it.

### Why it is narrower than it looks

Consumption is derived from **actual output**, not from the plan: the tape reads
`−2,832 cans + ends` for 118 cases × 24. Unused cans therefore never leave inventory —
there is nothing to return, because they were never consumed. This is the same
principle as receiving, where *"only counted qty posts"*.

`return_to_stock` matters only for material **issued in whole units** that comes back:
a part-roll of labels, a broken bundle of trays, a partial sleeve of ends.

### Labels cannot be counted — so never ask

**Constraint (Ted, 2026-09-07): counting labels is impractical.** Nobody counts 2,168
labels left on a roll.

The derived-consumption model already avoids this, and the spec must forbid
reintroducing it:

- **Do not add a "labels remaining" input.** Anywhere.
- **Add damage only** — optional, defaulting to zero. Ruined labels are physically in a
  bin and countable in seconds; leftover ones on a roll are not.
- **The return needs an explicit destination**, matching the finished-goods rule in
  `close_packaging_run`. A part-roll returned to the wrong bin is worse than untracked.
- **Match Repack's idiom.** Repack already sends a case tray to `return_to_stock` via
  `format_material_disposition as enum ('consumed','return_to_stock')`
  (`schema-design.md:755,1025`). Do not invent a second control for the same idea.
- **Ask only where issue is lumpy** — labels, ends. Prompting for returns on all five
  BOM rows at every close is friction nobody completes.

### Drift, and how to reconcile it without counting labels

Derived consumption assumes one label per can, perfectly. Real applicators waste a
percent or two on web breaks and misfeeds, so on-hand drifts high between counts — and
the correction, `record_material_count`, hits the same wall.

**Count rolls, not labels.** For label materials the cycle count counts *full rolls*,
excludes the open roll, and lets the same `count_adjustment` absorb the remainder.
Full rolls are countable in seconds; the error is bounded at one roll and self-corrects
at every count. No schema change — purely how the count screen presents the material.

Rejected for now: a per-material waste factor. Zero data entry, but it is a guess that
must be maintained per material and is wrong the moment label stock changes. Add it
only if counts show consistent one-directional drift. An applicator with a hardware
counter would beat both, but that is a per-brewery integration, not v1.

## Work split

**Current focus (screens, no database work):**

- Planning: `Draft N purchase orders`, per-vendor fan-out, partially-unbuyable state,
  resolution and horizon prose (`screens.tsx:2867`)
- Contracts / Contract: three-number remaining — committed / received / on order /
  available (`screens.tsx:2340`, `:2359`)
- Close packaging run: optional damage input with explicit destination; no
  labels-remaining field (`screens.tsx:2000`)
- Receive PO / Purchase orders: open-balance remainder on the row
- Cycle count: label materials counted in full rolls

**Backend push:**

- `vendors.lead_time_days` added, `materials.lead_time_days` dropped (baseline edited
  in place)
- `purchase_orders.sent_via`, `sent_by`; `delivery_state` for `direct` only
- Views: open balance per PO line, `vendor_lead_times`, contract available-to-release
- `transmit_purchase_order` as an External / copper command
- Guard the empty-PO `bool_and` NULL case in `update_po_status()`

**Deferred:** inbound MX and `acknowledged_on`; per-brewery verified sending domains;
waste factors; applicator counters.

## Open

- Email provider assumed **Resend**; not yet confirmed.
- Brewery reply address assumed in `breweries.settings` jsonb; promote to typed columns
  when the purchasing backend lands.
- Vendor minimum order value and freight breaks are unmodelled. `vendors` has terms and
  contact but no minimum, so consolidation will produce technically-correct orders a
  buyer hand-edits to clear a free-freight threshold. Not blocking; worth a column when
  it bites.
