# Material price and recipe cost

## Problem

Recipe cost read only the cost of each ingredient's last purchase-order
receipt. A brewery with no receipts had no recipe cost at all. Lolev's history
was imported without purchase orders, so none of its 195 recipe copies had a cost.

The previous system kept one typed price per ingredient and totalled recipes
from it.

## Decision

A material holds an optional typed price for one purchase unit:
`materials.purchase_unit_cost_cents`.

An ingredient costs its last receipt cost when the material has ever been
received. Otherwise it costs the typed price divided by the purchase-unit factor.

The cost is derived on read and never stored: in `recipe_version_costs` for a
saved copy (the Brand page), and in the recipe editor for the sheet as typed.
A price edit or a new receipt changes every recipe cost at once.

A recipe has no cost while any ingredient has neither a receipt cost nor a
typed price, and the Brand page never bands on a partial sum. The recipe page
does show the priced part, in a table that marks each unpriced row, and says
"at least".

`material_last_cost` is unchanged. Finished-goods cost and inventory value are
what was paid, so they never read a typed price.

## What the screens say

| Screen | What it shows |
| --- | --- |
| Edit material | **Price per purchase unit ($)**, optional. |
| Recipe | **Ingredient cost** under the sheet: one row per ingredient (amount, price per unit, cost), then the total, for the batch or per barrel. Its summary line gives the cost per barrel and for the batch. It changes with every edit, before a save. |
| Recipe | An ingredient with no price reads **No price**; the total covers the priced rows and the summary says "at least". |
| Recipe | *Typed price, no receipt cost:* the ingredients no purchase order backs. |
| Recipe | *None in stock:* the ingredients with nothing on hand now. |
| Brand | The price-group suggestion names the ingredients costed at a typed price. |

## Not done

- A typed price cannot be cleared, only changed. `upsert_material` keeps the
  saved price when none is sent, as it does for Sold by.
- Water salts are not costed. They are `recipe_water_additions`, not recipe ingredients.
- An earlier copy read from As brewed shows no cost: the cost and stock are today's.
- A contract price is not a cost source.

## Live preview

The editor works the cost out from the lines as typed (`recipeCostTable`), so an
unsaved change shows its cost.

`material_unit_costs` is the one owner of what a material costs per base unit:
the last receipt cost, else the typed price over the purchase-unit factor, with
`from_receipt` saying which. `recipe_version_costs` reads it for saved copies.
`list_material_costs` returns it to the editor with whether any is in stock.

The sum (amount per barrel times cost) exists twice: in `recipe_version_costs`
for saved copies and in `recipeCostTable` for the sheet being edited, which
rounds the barrel and the batch once each from one unrounded sum, so the
summary line and the table total agree. The price rule exists once.

`get_recipe` does not return a cost. The recipe page costs the sheet itself,
and `get_brand_recipe_cost` serves the Brand page.

The editor reads prices and stock when the page opens. A receipt or price edit
made elsewhere shows after a reload.

## Files

- `supabase/migrations/20261128100000_material_price.sql`
- `supabase/migrations/20261128120000_material_unit_costs.sql`
- `lib/commands/recipe-cost.ts`, read by `get_brand_recipe_cost`
- `lib/mgr/recipe-cost-view.ts`
- Tests: `tests/brand-recipe-cost.test.ts`, `tests/recipe-cost-view.test.ts`, `tests/price-group-suggestion.test.ts`
