# Spec / screens / plans drift — working checklist

Review of `main` at `b3f6a91`. Decisions 2026-09-07 (screens-drift). Durable
items still belong in `.agents/DRIFT.md` via dreaming — do not merge this into
those logs from a feature PR.

## Decisions (locked)

1. **Poured is never a SKU.** Square push is brand × format from the bin (§16.7).
   A pint publishes as a variation; depletion maps onto the keg SKU (§16.5).
2. **Barcode.** Optional UPC on the SKU until `price_group_barcodes` exists.
   Price group stays without UPC.
3. **POS override** is a register price, not a wholesale grid cell.
4. **Shop / Review** draw the configured path (source set, Review/Place on).
   No ATP badges. `no source` remains a state.
5. **Pay invoice** stays the designed QuickBooks frames; live portal copy stays
   parked until Program 13.
6. **Schedule packaging run** occupancy-at-plan stays until Program 5.
7. **Recipe default price group:** add `recipes.default_price_group_id`
   nullable FK, `on delete set null` (#189 D6). Picker stays.
8. **Order Adjust** opens Adjust lines, not Short pick.
9. **Locations** is a More rail child (`/locations`, admin).
10. **Transfers** are three records (list, new sheet, detail). Complete
    transfer stays as the replenishment-order ship.

## Still open in `.agents/DRIFT.md`

Guest keg identity · taproom TTB types · Taproom role RLS · pick/ship lots ·
UI-plan §2 missing verbs · Review order Tax $0.00.

Invoice timing self-disagreement is closed on the screen (Ship on delivery
ungated).
