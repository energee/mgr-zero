# Historical packaging runs: lots without stock

Status: plan, awaiting approval. Branch `feat/historical-packaging`, PR to `main`.

## Why

Lolev history (`docs/plans/lolev-history.md`, `docs/plans/readings-on-batch.md`)
gives MGR 183 historical batches with no tank. The user wants their packaging
for the record (2026-10-14: "just for historical purposes", no depletion).

The live path cannot carry it:

- A started or closed run needs a tank: `check ((started_at is null and
  closed_at is null) or occupancy_id is not null)` (`00001_baseline.sql:1236`).
- `close_packaging_run` writes a `production_in` movement per output. That would
  put stock on hand which would then have to be depleted, and the user does not
  want that.

Change: a run may name its batch directly, and a new
`record_historical_packaging_run` writes a **closed** run with actual quantities
and a lot. It writes **no stock movement** and has no tank. It is allowed only
before `books_opened_on`, for a batch closed by `record_historical_batch`.

## Source (2026-10-13 dump)

- 164 finished goods, 138 naming a batch: 131 on historical batches, 6 on
  active ones, 1 on a deleted batch.
- Grouping by (batch, production date) gives about 72 runs.
- Formats: all 164 reference Lolev `formats`. Case 39, Kegfleet Half 37,
  Microstar Half 28, Kegfleet Sixtel 20, Microstar Sixtel 18, Half 15,
  Lolev Half 7. Each maps to an imported MGR format (Case, Half, Sixtel). The
  keg owner (Lolev, Kegfleet, Microstar) maps to the keg pool on the SKU.

## What reads runs and lots today

Mapped by a read-only explorer and spot-checked
(`lot_lineage`, `trace_lot`, the check, and the absence of `batch_id`). A run
reaches its batch **only** through `occupancy_id → vessel_occupancies.batch_id`.

| Reader | Where | Tankless closed run, no movements | Change? |
|---|---|---|---|
| check on `packaging_runs` | `00001_baseline.sql:1236` | refuses the row | **yes** |
| `trace_lot_sources` | `20261012100300…:20` | `batches: []` (lineage seeds from `occupancy_id`) | **yes**: add `packaging_runs.batch_id` |
| `trace_batch_lots` (forward recall) | `20261012100300…:52` | the batch's own lot is missing | **yes**: same fallback |
| `private.lot_ingredients` → `trace_lot_ingredients` | `20261012101200…:24` | no ingredients | **yes**: member batch from `batch_id` |
| `trace_lot` command | `lib/commands/compliance.ts:197` | `batch` null, vessel "" | **yes**: embed `batches` via `batch_id` as a fallback |
| `packaging_run_yields` view | `00001_baseline.sql:2439` | the whole `bbl_drawn` reads as loss | avoided: write `bbl_drawn` null |
| `list_packaging_runs`, run detail, run status | `lib/commands/packaging.ts:293`, `lib/mgr/packaging-runs-view.ts:42` | closed, vessel blank | no |
| `occupancy_volumes`, `batch_volume_balance`, completion | `transfer_loss_adjustments.sql` | null occupancy never matched; the batch is already closed | no |
| plan/requirement views, cancel, reschedule, update, close | `unstarted_plans*.sql`, `packaging_actuals.sql` | filtered by `closed_at is null` or refuse a closed run | no |
| inventory value, order COGS, `report_movements` | `finished_goods_cost.sql`, `order_cogs.sql`, `report_books_opened_on.sql` | no movement names the lot, and the run predates the books | no |
| `correct_packaging_material_record` | `packaging_actuals.sql:313` | skips its batch guard, but unreachable (no material records) | no |
| trigger `packaging_runs_brand` | `00001_baseline.sql:1251` | returns early with a null occupancy | no; the RPC checks the brand itself |

## Schema — `20261014100400_historical_packaging.sql`

(Re-check the max migration across branches when writing.)

```sql
alter table public.packaging_runs add column batch_id uuid,
  add foreign key (batch_id, brewery_id) references public.batches (id, brewery_id);
-- A started or closed run needs a tank, or (history only) its batch.
alter table public.packaging_runs drop constraint <the check at :1236>,
  add check ((started_at is null and closed_at is null) or occupancy_id is not null or batch_id is not null);
create index packaging_runs_batch_idx on public.packaging_runs (batch_id) where batch_id is not null;
```

- `batch_id` is set only by the new RPC. Live runs keep their batch through the
  tank, and no backfill is needed.
- Find the check's real name with `\d packaging_runs` when writing. It is
  unnamed in the baseline.

## RPC — `record_historical_packaging_run` (new, admin only)

`(p_brewery, p_batch, p_packaged_on date, p_outputs jsonb [{sku_id, qty}], p_lot_code text, p_request_id)`

- **Batch:** locked `for update`. It must be historical: closed, and with no
  occupancy.
- **Dates:** `books_opened_on` must be set, and `p_packaged_on < books_opened_on`
  and `>= brewed_on`. No filed report may cover the date.
- **Outputs:** each SKU must be this brewery's, of the batch's brand, with
  `qty > 0`. The brand is the batch's `intended_brand_id`; refuse a batch with none.
- **Lot code:** unique per brewery. Refuse a duplicate, the same message as
  `close_packaging_run`.
- **Writes:** one `packaging_runs` row with `occupancy_id` null, `batch_id`,
  `brand_id`, `planned_on = started_at = closed_at = p_packaged_on`, and
  `bbl_drawn` null. Then `packaging_run_outputs` with `qty_planned = qty_actual = qty`
  and `movement_id` null, then one `lots` row. **No `inventory_movements`.**
- Refusals use plain `raise exception`.

## Trace readers

- `trace_lot_sources`, `trace_batch_lots` and `private.lot_ingredients`: when the
  lot's run has no `occupancy_id`, its member batch is `packaging_runs.batch_id`.
  These are `create or replace` copies of their latest definitions plus one
  `union`/`coalesce` branch. `lot_lineage` keeps its occupancy shape.
- `trace_lot` (`compliance.ts:202`): add `batches(id, batch_no, brewed_on)` on
  `packaging_runs` through `batch_id`, and fall back to it when
  `vessel_occupancies` is null.

## Command

`record_historical_packaging_run` (`lib/commands/packaging.ts`), roles `["admin"]`:
`{ batchId, packagedOn, lotCode, outputs: [{ skuId, qty }] }`. It matches the
existing API_AREAS packaging rule (to be confirmed), then `bun run docs:api`.
No UI; the local import writes these.

## Tasks

Each one starts by writing its failing test in
`tests/historical-packaging.test.ts` (DB).

1. **Schema.**
   - Test first:
     - a tankless closed run with `batch_id` inserts;
     - one with neither tank nor batch is refused;
     - `list_packaging_runs` shows it closed.
   - Write the migration, then `bun run migrations:lock`.
   - Deps: none.
2. **RPC.**
   - Tests:
     - writes run, outputs and lot, with **zero** `inventory_movements` and
       zero `on_hand` for the SKU, and a fractional quantity (4.5) kept exactly;
     - `bbl_drawn` is null;
     - refused: a live (tanked) batch, an open batch, on/after `books_opened_on`,
       before `brewed_on`, a filed period, a duplicate lot code, a SKU of
       another brand, `qty <= 0`, a non-admin;
     - a replay returns the first result.
   - Add the RPC to `tests/rpc-allowlist.test.ts` and `tests/rls-taproom.test.ts`.
   - Deps: 1.
3. **Trace.** In the same file:
   - `trace_lot_sources` returns the historical batch;
   - `trace_batch_lots(batch)` returns its lot;
   - `trace_lot` (command) shows the batch number.
   - Existing trace suites stay green (`tests/*trace*.test.ts`,
     `tests/blended-lot-lineage*.test.ts`).
   - Deps: 1.
4. **Command + API docs.**
   - Command test in `tests/historical-packaging.test.ts`.
   - Then `bun run docs:api`, and `tests/api-docs.test.ts` stays green.
   - Deps: 2.
5. **Types + docs.**
   - Run `bash scripts/generate-db-types.sh`.
   - Schema design: add `packaging_runs.batch_id`.
   - Staff guide, under the existing historical-batches paragraph: their
     packaging shows as closed runs and lots with no stock.
   - Deps: 4.

Then the full proof, `/simplify`, and the PR.

Parallelism: 1 → {2, 3} → 4 → 5.

## Import (local only, git-ignored; after merge)

1. **SKUs.** A brand × format SKU per pair the finished goods need, through
   `create_sku` with the keg pool (Lolev, Kegfleet, Microstar) for kegs.
   Deterministic request ids.
2. **Runs.** One `record_historical_packaging_run` per (historical batch,
   production date), with outputs summed per SKU and the generated lot code
   `L-<batch_no>-<yyyymmdd>`, which is unique by construction (one run per batch
   per day).
3. **Skips, reported:**
   - finished goods with no batch (26);
   - finished goods on an active batch (6), whose packaging is live work in MGR;
   - the deleted batch (1);
   - a batch with no brand.

## v1 cross-check (2026-10-14)

No conflict or repeat. v1's Lolev sync created **real** stock for packaging
sessions (`~/Repos/mgr/src/integrations/mongodb/sync.ts:1010`), then removed
that from the sync because the module was unused (`PROGRESS.md:307`). Lessons
adopted:

- **No movement for history.** v1 kegs "counted at packaging and never
  uncounted" over-reported stock (`PROGRESS.md:529`). That supports writing no
  movements here.
- **Lot codes collide.** v1 had to de-duplicate with `-dupN` (migration 00149).
  Checked in the 2026-10-13 dump: Lolev `lotNumber` has 6 distinct values over
  20 rows, so lot codes are generated (see the open question below).
- **Fractional quantities.** v1 made quantities numeric for values like 70.5
  (00288). The dump has 6 such (4.5, 2.5, 2.3…), and `qty_actual numeric(12,2)`
  takes them as is. The RPC test covers a fractional quantity.
- **Brand resolution failed most often in v1** (`sync.ts:1033`, 166 lines). The
  import reports no-brand skips by count, and falls back from the batch's
  `intended_brand_id` to its recipe's brand before skipping.
- **Keg owner on the SKU.** That is safe while these SKUs carry no movements.
  Lolev's per-owner SKUs stay historical-only. If live packaging later needs a
  Kegfleet/Microstar SKU, it uses the same SKU, which is intended.

## Open questions (defaults chosen; say if wrong)

- **One run per (batch, production date).** Default: yes. Lolev's
  packaging-session link is missing on some rows.
- **Lot code.** Default: **always generated**, `L-<batch_no>-<yyyymmdd>`. Lolev's
  `lotNumber` is on only 20 rows, and it has just 6 distinct values (one repeats
  5 times, per v1's lesson below), so it cannot be a unique lot code. It goes in
  the run note instead.
- **Keg pool per SKU.** Default: a separate SKU per owner (Kegfleet Half vs
  Microstar Half), because the pool lives on the SKU.
- **Finished goods with no batch (26).** Default: skipped. Without a batch there
  is nothing to attach the run to.
