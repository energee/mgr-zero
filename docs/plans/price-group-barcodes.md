# Price group barcodes: a UPC per price group × format

Status: approved 2026-10-14; built on this branch. Branch `feat/price-group-barcodes`, PR to `main`.

## Why

Example Brewing's price sheet ("Pricing - Beer.csv", 2026-10-14) gives each price tier one
UPC. The can label carries it, and the buyer may use it for any format; kegs
may carry one later (user, 2026-10-14). MGR has nowhere to keep it.
`skus.upc` is the only UPC column, and its unique index (`skus_upc_uidx`) stops
two SKUs from sharing one, which is exactly what a tier UPC does.

MGR already decided where it goes. Spec `2026-09-07-mgr-price-groups.md`:

- **D2.** The group owns the barcode; every SKU on the group scans as the
  group's code for its format.
- **D3.** The barcode is per group × format, and nullable: a keg can stay empty.
- **D4.** An empty UPC is quiet; only an empty price is loud.

`2026-09-07-mgr-pricing-grid-naming.md` names the deferred table:
`price_group_barcodes (price_group_id, format_id, upc)`. This plan builds it.

## Decisions (user, 2026-10-14)

| Question | Answer |
|---|---|
| UPC per tier, or per tier × format? | Per tier on the sheet; stored per tier × format (D3), so a keg code can be added later without a schema change |
| Which formats get the sheet's UPC on import? | The can formats: Four Pack and Case. Kegs stay empty |
| Source of truth | The sheet. The import writes it as-is |

## SKU override (user, 2026-10-14: option b)

Spec D2 ("no SKU-level override") is amended. A SKU's barcode is its own
`skus.upc` when set, labelled "SKU override", and otherwise its group's code for
its format. `skus.upc` keeps its unique index, so an override stays one SKU's
own. This PR edits D2 in `2026-09-07-mgr-price-groups.md` to say so.

## Schema — `20261014120000_price_group_barcodes.sql`

(`…110000` is open on `feat/historical-batch-close`; re-check the max when writing.)

```sql
create table public.price_group_barcodes (
  brewery_id uuid not null references public.breweries(id),
  price_group_id uuid not null,
  format_id uuid not null,
  upc text not null check (upc ~ '^(\d{8}|\d{12,14})$'),
  primary key (price_group_id, format_id),
  foreign key (price_group_id, brewery_id) references public.price_groups (id, brewery_id) on delete cascade,
  foreign key (format_id, brewery_id) references public.formats (id, brewery_id) on delete restrict
);
-- No unique on upc: one tier's code covers several formats (the user's cans).
alter table public.price_group_barcodes enable row level security;
-- Same read as channel_prices (20261008170000_staff_role_business_reads.sql:42).
create policy staff_read on public.price_group_barcodes for select to authenticated
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin', 'sales']::public.staff_role[])));

-- set_price_group_barcode(p_brewery, p_group, p_format, p_upc, p_request_id):
--   admin|sales; null p_upc clears; normalize_upc like create_sku; packaged formats only.
```

`delete_price_group` already refuses a group with cells or pours; a group's
barcodes cascade with it, because a barcode alone keeps nothing alive.

## Resolution

`SKU → brand → price group → (group × format) UPC`, derived on read (spec
"Resolution chain"). One helper, `skuBarcode(sku, groupBarcodes)`, in
`lib/mgr/sku-list-view.ts`, its only caller; there is no second copy in SQL.

## Tasks

Each one starts by writing its failing test.

1. **Migration, RLS and `set_price_group_barcode`.**
   - Test first: `tests/price-group-barcodes.test.ts` (DB):
     - set, read back, replace and clear a barcode;
     - a bad UPC, a poured format and another brewery's group are refused;
     - admin and sales may set and read one, warehouse and brewer may not, and a portal customer reads none;
     - the request replays;
     - deleting the group removes its barcodes.
   - Write the migration, add the RPC to `tests/rpc-allowlist.test.ts` and the table to
     `tests/schema-rls-indexes.test.ts` where it lists tables, then
     run `bun run migrations:lock`.
   - Deps: none.
2. **Commands: `set_price_group_barcode`, and `list_price_group_barcodes`.**
   - Test in the same file, through `runCommand`; add an `API_AREAS` rule.
   - Search for a list query to extend first. `list_price_groups` could embed
     the barcodes instead of a new query.
   - Deps: 1.
3. **Price group screen: one UPC row per packaged format.**
   - TDD `lib/mgr/price-group-view.ts`: the model lists every packaged format
     with its UPC, and an empty one reads "none" (D4).
   - Draw the rows with `E.edit` (registry input, like the SKU UPC) in
     `components/mgr/views/price-group.tsx`; live saves through
     `set_price_group_barcode`.
   - Update `screens.tsx` "Price group" (`writes`, `spec`) and
     `lib/mgr/fixtures/pricing.ts`.
   - Deps: 2.
4. **The SKU shows its barcode.**
   - TDD `skuBarcode` and `lib/mgr/sku-view.ts`: the SKU's own UPC when set
     ("SKU override"), otherwise the group code ("price group"), otherwise none.
   - The SKU page shows it read-only beside the existing optional UPC field.
   - Deps: 2.
5. **Types and docs.**
   - Run `bash scripts/generate-db-types.sh` and `bun run docs:api`.
   - Schema design: the new table. Mark the specs' follow-on as built, and
     amend D2 for the SKU override.
   - Staff guide, Pricing / Price group: one code per group and format, kegs
     may stay empty, and the SKU override.
   - Deps: 3, 4.

The group code is staff-only. It must never join into a portal projection
(`portal_sku_price_rows`), just as `skus.upc` is hidden from the portal
(`20261009100000_portal_hide_internal_columns.sql:13`). Task 1's test proves a
customer reads nothing.

Then the full proof, an eyeball check of /pricing, a price group page and a SKU
page, `/simplify`, and the PR.

Parallelism: 1 → 2 → {3, 4} → 5.

## Import (local only, git-ignored; after merge)

The `--prices` pass sets each tier's sheet UPC on Four Pack and Case. That is
16 barcodes, written through `set_price_group_barcode`, and idempotent like the
rest of the pass.

## v1 cross-check (2026-10-14)

No conflict, no repeated mistake.

- v1 had a bare `pricing_tiers.default_upc` (`00077_pricing_tiers_redesign.sql`,
  nullable, no check, no unique), and nothing read it: not labels, POS,
  QuickBooks, the portal or exports. The "group code reaches labels, POS and
  QuickBooks" path is new ground; this plan only stores the code and shows it.
- v1's column comment says "overridden by brand UPC if set", but the override
  never shipped. v2 now adopts it per SKU (option b above).
- v1 left pricing tiers readable to every signed-in user (`00198`
  RLS-EXCEPTION). v2's staff-only policy and its customer test avoid that.
- Neither version checks the check digit. The format check accepts 8 or 12–14
  digits and keeps leading zeros, so a mistyped code on the sheet imports as-is.

## Deviations while building

- **The key is `(price_group_id, format_id)`,** the shape `channel_prices` uses,
  with a brewery guard on the upsert. A key holding both foreign keys' columns
  made PostgREST read the table as a formats↔price_groups link, so every plain
  `formats → price_groups(name)` embed failed with PGRST201. This shape avoids
  that at the root instead of naming the foreign key in each embed.
- **One barcode read, `list_price_group_barcodes`** (admin, sales; the #770
  role-matched read). The pricing page and a brand's SKU list call it; for any
  other role the SKU page skips it (as it does keg pools) and shows only a
  SKU's own UPC. `list_price_groups` and `list_brands` stay as they were, so
  their ~15 callers pay nothing.
- **Barcodes edit one row at a time.** Each format's UPC has its own sheet
  (`BarcodeForm`) inside the group dialog, instead of saving with the group
  form, so one bad code never blocks the group save.
- **Not done: a `sku_barcodes` view** that would give every staff role the
  effective code. Warehouse and brewers see only a SKU's own UPC today, since
  group codes are an admin/sales read. Widening that read is a product decision.
