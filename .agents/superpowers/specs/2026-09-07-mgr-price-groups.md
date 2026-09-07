# Price groups: one band that owns price and barcode

Date: 2026-09-07
Status: design, approved
Supersedes naming: "Price lists" / "Price tiers" (see Decisions)

## Problem

v2 draws price as a per-customer tier (`Price lists` → `Price tiers` →
`Override`) and leaves barcode unowned: the SKU screen's spec sentence claims
the SKU owns "UPC/provider mappings", but no UPC control is drawn anywhere.
So a brewery can price a format and still have nothing that scans.

v1 (`~/Repos/mgr`) had the missing half. Its `pricing_tiers` row is
`{ name, default_upc, cogs_max }` — one row doing three jobs: banding products
by cost, dictating a shared barcode, and anchoring the price matrix
(`pricing_tier_prices`, keyed `(pricing_tier_id, format_id, sales_channel_id)`).
That bundling is right. The scalar `default_upc` is not: price varies by format
in the same table, so a ½ bbl keg and a 24-pack in one tier would share one
barcode, which no distributor accepts.

## Decisions

**D1 — Rename to price group.** `Price lists` → `Price groups`,
`Price tiers` → `Price group`. Now that the row owns a barcode and a cost band,
"list" describes neither. One name replaces three.

**D2 — The group owns the barcode outright.** No SKU-level override. Every SKU
in a group scans as that group's code for its format. This is the shelf-UPC
pattern: a rotating series rings up identically and the retailer never re-keys.
Considered and rejected: group-defaults-with-SKU-override (a second inheritance
rule to learn, for a case nobody named) and barcode-on-Format (honest only if
barcode never varies by band, which defeats the purpose).

**D3 — Barcode is per group × format, and nullable.** A Format already *is*
package + volume + BOM, so a 12 oz can and a 16 oz can are two Formats and get
two codes by construction — multiple can sizes needs no new mechanism. Null is
a permanent legitimate state, not incomplete setup: kegs move on lot numbers
and SCC labels, not retail scans.

**D4 — Empty UPC is quiet; empty price is loud.** The group already has a
`no price` blocking state ("neither a format default nor an override · the line
cannot be sold"). Barcode gets no equivalent. Two nullable columns side by side
invite one empty-state treatment; that would nag forever about a keg that is
correct as drawn. The empty cell reads "none", not a blank and not an em dash:
blank reads as not-yet-filled-in, and the inventory forbids em dashes in
customer copy (tests/mgr-screens.test.ts).

**D5 — The group binds on the brand, not the SKU.** The group is a cost band,
and cost is a property of the beer, not the package. Per-SKU binding would make
representable a brand whose keg is in one group and case in another, which is
incoherent. Brand-level makes that state unrepresentable rather than merely
discouraged.

**D6 — Nothing priced on the recipe version.** A version is a process spec. The
same formula packaged under two brands can carry two prices, and hanging a
price group off the version would cut a new immutable version every time a band
changed. The recipe *parent* carries an optional default: a pre-fill hint, never
a commitment, so it may dangle without corrupting anything downstream.

**D7 — Bands suggest, humans confirm.** Groups sort by cost ceiling; the lower
bound is implicitly the previous group's ceiling. Cost proposes a group, a
person accepts it. Never auto-assigned: costing lives on desk and does not exist
yet, and a suggestion degrades to a plain picker until it does.

**D8 — "Tier" is retired vocabulary.** A distributor uses "tier" for the landed
product type (an IPA); v1 used it for a COGS band; v2's screens use it for a
customer price list. Three live meanings, none wrong in its own context, so the
word cannot carry ours. "Price group" is unclaimed. The rename is cheap: "tier"
appears nowhere in the customer guides, and its four hits in `content/docs/api.mdx`
are generated screen names that `bun run docs:api` regenerates.

**D9 — The band is its own axis; Style and Category are not it.** The Brand
screen already draws three pickers, and only one of them prices:

| Field | Drawn values | What it is |
| --- | --- | --- |
| `Style` | Hazy IPA, IPA, Pils | product type — what a distributor calls a "tier" |
| `Category` | Core, Seasonal, One-off, Barrel-aged | release cadence |
| `Price group` | Standard, Specialty, Barrel-aged | the cost band |

Style is discrete and declared; a price group is a band a cost falls into.
Confirmed 2026-09-07: price follows cost, not product type. IPAs cluster in one
band because they cost alike, which is coincidence rather than mechanism, so the
axes stay separate and only the group prices. This is what keeps D7 alive: had
price followed style, the ceiling would never be consulted and the band
mechanism would be dead weight.

"Barrel-aged" appearing as both a Category and a Price group value is not
duplication — it is a cadence that also genuinely costs more. If every Category
value came to mirror a Price group value, the band would have turned out not to
be independent and D7 should be revisited. One overlap of four is the
coincidence this decision predicts.

## Resolution chain

    SKU → brand → price group → (group × format) UPC

No override at any hop. Pure, and derived on read — never stored, matching how
the Recipe screen already treats predictions.

Price resolves as drawn today and is unchanged: group format-default, with a
brand × format override.

## Prior art already on `origin/backend`

The Brand screen's spec already reads: "price group is a label the price tier
prices by format, not a price on the brand (§16.4)". That is D5 and D3 arriving
independently — the group is a label carried by the brand, and the price hangs
off (group × format), never off the brand. This design keeps that sentence true
and adds the barcode to the same key.

§16.4 supplies the table shape:

    price_lists         + channel_id
    price_list_formats  (price_list_id, format_id, unit_price_cents)   -- group default
    price_list_items    (price_list_id, sku_id, unit_price_cents, ...)  -- brand x format override

The UPC of D3 belongs beside `unit_price_cents` in `price_list_formats`, and the
cost ceiling of D7 on `price_lists`. §16.4's OPEN question — whether format is
the default and SKU the override, or the reverse — is answered format-default
here, matching what Price tiers, Menu and POS item already draw.

## Screens

`components/mgr/screens.tsx`.

**Price group** (was `Price tiers`; the list screen `Price lists` becomes `Price groups`) — gains `Cost ceiling` and a UPC column in
Format defaults: `[Format, Price, UPC, Source]`. Behind `SCHEMA-GATE`.

**Brand** (named `Product` before `origin/backend`) — **already drawn.** The
`Price group` picker exists at `screens.tsx:1553`, gated by the brand screen's
own `[SCHEMA-GATE: nullable columns on the brand …]`. This design adds nothing
here; it only makes the group that picker names carry a barcode and a ceiling.
The recipe parent's default pre-fills it on brand creation.

**SKU** — spec sentence at the "SKU owns the stable sellable identity, active
state, UPC/provider mappings" line is corrected: the SKU keeps provider mappings
and price exceptions; the barcode resolves through the brand's group. The
resolved code shows read-only. No drawn control is removed, because none exists.

**Recipe** — the parent row gains an optional `Default price group`. Rendered as
a suggestion once costing exists ("cost $1.42/unit suggests Wholesale ·
standard"), a plain optional picker until then.

**Schedule packaging run / Close packaging run** — unchanged. Brand already
derives from what is in the vessel and planned outputs are already brand ×
format, so the barcode rides along with no new input.

## Out of scope

Costing itself (lives on desk, not built). Migrations and schema columns: every
field above is drawn gated, per the current screens focus. Provider mapping of
the resolved UPC to a Square variation GTIN — the Square item frame already
stores ids per variation and needs no change to read one more field.

## Testing

- A pure resolver in `lib/mgr/` for the chain in **Resolution chain**, TDD
  first: brand with a group and a format UPC resolves; missing group, missing
  format row, and null UPC each resolve to no code without throwing.
- `tests/mgr-screens.test.ts` and `tests/screen-links.test.ts` cover the
  inventory and the renamed labels.
- Rendered check at `/docs/screens` per AGENTS.md step 4.
