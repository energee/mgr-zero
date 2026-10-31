# Square menu: 4-packs from taproom cases

**Goal.** A Square location's menu publishes what its taproom bin can sell:
draft pours (shipped) **and 4-packs**. A case *is* six 4-packs: stock stays on
the Case SKU, and the menu exposes it as 4-packs.

**Decided with the owner (2026-10-21).**

- One stock: the Case SKU. A 4-pack is 1/6 case. No Four Pack SKUs, no repack
  on arrival. `inventory_movements.qty` is numeric, so 2.5 cases = 15 4-packs.
- The ratio is the existing package-contents link: Case = 6 × Four Pack,
  set once per brewery in the "Package contents" form.
- MGR → Square is the direction for products; the Square → MGR catalog pull
  remains only for attributing sales of items MGR did not publish.

**Reuse.**

| Need | Existing piece |
| --- | --- |
| Case holds 6 four-packs | `format_components` + `replace_format_components` / "Package contents" form |
| Bin stock | the menu snapshot's inline `inventory_movements` sum |
| Pricing | `channel_prices (sale channel × price group × format)` |
| Publish | `begin_square_publication` / `finish_square_publication`, `prepareSquareCatalogPublication` |

## Tasks

One migration, `20261022060000_square_four_pack_menu.sql`, then
`bun run migrations:lock`. Every task starts with its named failing test.

1. **Compose a Case that has its own volume.** Example Brewing's Case is typed at
   0.09677419 bbl = 6 × Four Pack's 0.01612903; `replace_format_components`
   only composes an untyped parent. Accept a typed parent when its volume
   equals the children's total.
   Test: format-components test — 6 × composes; 5 × is refused.
2. **Menu lists 4-packs.** Redefine `private.pos_menu_snapshot`: a packaged
   non-keg SKU with stock in the menu bin and a component child (Case → Four
   Pack) gives one row for (brand, child format); available =
   `floor(cases × qty)`; price from `channel_prices` for the brand's price
   group and the child format; unpriced → `excluded`. `PosMenuSnapshot`
   (`lib/mgr/pos-view.ts`) gains the row kind.
   Test: `tests/pos-menu.test.ts` — 2.5 cases → 15 four-packs priced; no cases
   → absent; pours unchanged.
3. **Publish a packaged item.** Widen `catalog_group` checks on
   `square_publication_events`, `square_publications`, `pos_catalog_items`,
   `pos_catalog_ownership` to `poured | packaged`; manifest and
   `begin_square_publication` emit one "<Brand> Four Pack" item per brand;
   `SquarePublicationSource.catalogGroup` becomes `"poured" | "packaged"`.
   Test: `tests/pos-publication-spec-fixes.test.ts` — separate packaged item,
   one Four Pack variation at the channel price.
4. **Sales attribute to the Case SKU.** `finish_square_publication` maps a
   packaged variation to the Case SKU (`sku_id`); `reconcile_pos_sale` records
   it with no expected keg draw (§16.14).
   Test: `tests/pos-sales-sync.test.ts` — a Four Pack sale maps without manual
   mapping and adds no keg expectation.
4b. **Archive, never delete (owner, 2026-10-22).** A beer keeps one Square
   item and one sale entry for life. When a publish leaves an owned item
   present at no location, MGR also sets `item_data.is_archived = true`; when
   a variation becomes present again it sets `is_archived = false` on the same
   item. Square keeps an archived item's ID and order references; a delete
   does not. Catalog sync must keep an archived owned item available (not
   "missing"). The guide tells staff to archive in Square, never delete.
   Test: `tests/pos-publication-spec-fixes.test.ts` — runs out → upsert has
   `is_archived: true`; returns → same item id with `is_archived: false`;
   poured and packaged alike.
5. **Menu screen.** `/menu` shows four-pack rows beside pours (screen-parity
   skill; `components/mgr/screens.tsx` fixture). Proof: screen tests + browse.
6. **Docs.** Staff guide Menu and Catalog (Package contents); command
   descriptions in `lib/commands/pos.ts`; `bun run docs:api`.
7. **Sandbox acceptance.** Compose Case, put cases in the taproom bin,
   publish to the sandbox, seed and sync sales; screenshots on the PR.

**Order.** 1 and 2 in parallel; 3 needs 2; 4 needs 3; 5 needs 2; 6, 7 last.

**Out of scope (ask).** Counting the taproom in 4-packs (counts stay in
cases, fractions allowed); website feed (`get_published_pos_menu`) stays
pours-only; selling whole cases on Square.
