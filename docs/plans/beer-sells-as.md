# Beer page: "Sells as"

**Goal.** One place to say what a beer sells, without the word SKU. Today a
new beer takes the Brand page, the SKU list, and one **New SKU** sheet per
package. Pours live on the price group, and 4-packs come from Case's package
contents. The guide also calls pours "poured SKUs", which they are not.

**Decided with the owner (2026-10-21).**

- The Brand page gets a **Sells as** list: one switch per packaged format.
  Switching one on creates the SKU, or turns it back on. Switching it off
  turns it off and never deletes it.
- The same section shows, read-only, the packages that come out of a format
  (Case → Four Pack × 6), the price group's pours, and each line's prices.
  Pours and prices are still edited on the price group, and the section
  links there.
- UPC, keg pool and batch share stay on the SKU sheet, now opened from the
  switch's row.
- Formats, price groups, the price grid and package contents stay as they
  are.

**Reuse.**

| Need | Existing piece |
| --- | --- |
| Switch on / off | `create_sku`, `update_sku` (`active`) — no new command, no migration |
| Optimistic switch with rollback | `reconcileBooleanChange` (`lib/mgr/pos-view.ts`) |
| Switch control | `E.sw` |
| Formats and their contents | `list_formats({ basis: "packaged" })`, which already returns `components` |
| Beer's SKUs and pours | `list_brands` (`skus`, `pours`) |
| Prices | `list_channel_prices` |
| SKU details sheet | `SkuEditForm` (`app/(app)/catalog/sku-form.tsx`) |

## Tasks

Every task starts with its named failing test. The adapter logic is TDD'd,
and the screen render is checked by eye in step 4.

1. **Sells-as model.** New `lib/mgr/brand-sells-view.ts`:
   `toBrandSellsModel({ brand, formats, prices, channels })` returns
   - `packages`: one row per packaged format, with `formatId`, `name`,
     `on`, `skuId?` and `prices` (for example "DTC $22 · Wholesale $18").
   - `contents`: one read-only line per composed format the beer has switched
     on, for example "Four Pack · 6 per Case · DTC $22".
   - `pours`: the brand's group's pours, each with its size and prices.
   - `priceGroupHref`.

   A beer with no price group shows "Unpriced" and no pours.
   Test: `tests/brand-sells-view.test.ts`.
2. **Switch → command.** In the same module, `sellsAsCommand(row, on)`
   returns one of:
   - `create_sku { brandId, formatId }` when there is no SKU yet;
   - `update_sku { skuId, active }` otherwise. `update_sku` replaces `upc` on
     every save, so the call sends the row's current `upc`.

   Test: the same file. It covers new on, re-on, off, and that the UPC is
   kept.
3. **Shared view.** In `components/mgr/views/brand.tsx`, the right column's
   "SKU list" link becomes a **Sells as** section: an `E.sw` row per package
   with its prices, then the contents lines, then the pours. The details
   sheet is a slot. Update the `components/mgr/screens.tsx` "Brand" record
   and its fixture so the inventory draws it, and repoint the "SKU list"
   record's links. Follow the screen-parity skill.
   Proof: the screen test list in AGENTS.md, plus browse.
4. **Live binding.** `app/(app)/catalog/brands/[id]/page.tsx` also reads
   `list_formats` (packaged) and `list_channel_prices`. `brand-page.tsx`
   binds each switch through `reconcileBooleanChange` → `sellsAsCommand` and
   slots `SkuEditForm` per switched-on row. A role that cannot run
   `create_sku` sees the switches disabled.
   Proof: `tsc`, lint, and a browse of Hanno on dev (switch Sixtel (one-way)
   on, then off).
5. **SKU list page.** `/catalog/brands/[id]/skus` stays reachable for old
   links but loses **New SKU**; its back link and empty text point to
   **Sells as**. Test: update `tests/sku-list-view.test.ts` if it asserts
   the old empty text.
6. **Wording and docs.** In `content/docs/staff-guide.mdx` Catalog
   (164–249), replace "poured SKU" with "pour (a serving from the tap)", and
   replace the New SKU walkthrough with **Sells as**. Update the screen text
   to match. `API: none`, since no command changes.

**Order.** 1 → 2 → 3 → 4; 5 and 6 after 3.

**Out of scope (ask).**
- Formats a new beer starts with switched on. That needs a stored brewery
  setting.
- Editing prices or pours from the beer page.
- Removing the SKU list route.
