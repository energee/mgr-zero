# Square menu: 4-packs from taproom cases

**Goal.** A Square location's menu publishes what its taproom bin can sell:
draft pours (shipped) **and 4-packs**. Cases that arrive in a menu bin become
4-packs in MGR inventory, so the 4-pack stock Square offers is real stock.

**Decided with the owner (2026-10-21).**

- A case is broken into four-packs **when it moves into a menu bin** (transfer
  receive or bin move), not at count time and not implicitly.
- Creating a brand's Case SKU **auto-creates its Four Pack SKU**. Existing
  brands are not backfilled.
- MGR → Square stays the direction for products; the Square → MGR catalog pull
  remains only for attributing sales of items MGR did not publish.

**Reuse.**

| Need | Existing piece |
| --- | --- |
| Case holds 6 four-packs | `format_components` + `replace_format_components` / "Package contents" form |
| Break a case | `private.record_repack_impl` (`20260927040000_repack_keeps_lot.sql:16`) |
| Bin stock | `private.assert_bin_stock`, menu's inline `inventory_movements` sum |
| Pricing | `channel_prices (sale channel × price group × format)` |
| Publish | `begin_square_publication` / `finish_square_publication`, `prepareSquareCatalogPublication` |

## Open decision (blocks Task 2)

Lolev's `Case` format has a typed volume (0.09677419 bbl = 6 × Four Pack's
0.01612903). `replace_format_components` only composes a parent with **no**
typed volume. Choose:

- **(a) Recommended:** let `replace_format_components` accept a typed-volume
  parent when it equals the children's total; nothing else changes.
- (b) Clear the Case volume by hand per brewery, then compose it in the UI.

## Tasks

Migrations: `20261021140000_case_four_pack.sql` (Tasks 1–3) and
`20261021140100_square_packaged_menu.sql` (Tasks 4–6), then
`bun run migrations:lock`. Every task starts with its named failing test.

1. **Child SKUs with the parent.** `public.create_sku` (latest
   `20261012100600_sku_keg_pool_legacy_replay.sql`) also inserts the brand's
   SKU for each `format_components` child (`on conflict do nothing`). Covers the
   catalog form and CSV import, which both call it.
   Test: `tests/sku-child-formats.test.ts` — creating Hanno · Case creates
   Hanno · Four Pack; a second Case create does not duplicate it.
2. **Compose a typed Case** (per the open decision).
   Test: `tests/format-components.test.ts` — Case 0.09677419 = 6 × 0.01612903
   composes; 5 × is refused.
3. **Repack on arrival in a menu bin.** New `private.repack_into_menu_bin(...)`
   called at the end of `private.receive_stock_transfer_impl` and
   `move_stock_bin` (and the `taproom_transfer` leg of `private.ship_order_impl`):
   when the destination bin is a `pos_menus.bin_id` and the SKU's format has a
   `format_components` row, call `record_repack_impl` for the arrived qty.
   A repack that cannot run (missing BOM packaging, lot-tracked BOM) fails
   the whole move with its message — no silent partial state.
   Test: `tests/menu-bin-repack.test.ts` — 2 cases received into the taproom bin
   leave 0 cases + 12 four-packs there; into a non-menu bin, stay cases.
4. **Menu lists 4-packs.** Redefine `private.pos_menu_snapshot`: add packaged
   non-keg SKUs with positive stock in the menu bin, priced from
   `channel_prices` for the brand's price group and the SKU's format; unpriced
   rows go to `excluded`. `PosMenuSnapshot` in `lib/mgr/pos-view.ts` gains the
   row kind.
   Test: `tests/pos-menu.test.ts` — four-packs in bin appear priced; none in bin
   → absent; keg rows unchanged.
5. **Publish a packaged item.** Widen `catalog_group` checks on
   `square_publication_events`, `square_publications`, `pos_catalog_items`,
   `pos_catalog_ownership` to `poured | packaged`; manifest and
   `begin_square_publication` emit one "<Brand> Four Pack" item per brand;
   `SquarePublicationSource.catalogGroup` becomes `"poured" | "packaged"`.
   Test: `tests/pos-publication-spec-fixes.test.ts` — the manifest has a
   separate packaged item with one Four Pack variation at the channel price.
6. **Sales attribute to the SKU.** `finish_square_publication` writes
   `sku_id` (not `format_id`) for packaged variations; `reconcile_pos_sale`
   records a packaged non-keg sale with no expected keg draw (§16.14).
   Test: `tests/pos-sales-sync.test.ts` — a Four Pack sale maps without manual
   mapping and adds no keg expectation.
7. **Menu screen.** `/menu` shows four-pack rows beside pours (screen-parity
   skill; `components/mgr/screens.tsx` fixture). Proof: screen tests + browse.
8. **Docs.** Staff guide Menu, Transfers (auto-repack), Catalog (child SKUs);
   command descriptions in `lib/commands/pos.ts`; `bun run docs:api`.
9. **Sandbox acceptance.** Seed sales (scratchpad script), compose Case, create
   a four-pack via transfer, publish to the sandbox, sync sales; screenshots on
   the PR.

**Order.** 1, 2 and 4 can run in parallel; 3 needs 2; 5 needs 4; 6 needs 5;
7 needs 4; 8 and 9 last.

**Out of scope (ask).** Website feed (`get_published_pos_menu`) stays
pours-only; backfilling Four Pack SKUs for existing brands; selling whole
cases on Square.
