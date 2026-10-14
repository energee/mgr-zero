# Historical brewing records — books-opened date and history import

Status: draft, awaiting approval. Branch `feat/lolev-history`, worktree
`.agents/worktrees/feat-lolev-history`, base `origin/main` (`e6773cf5`).

## Goal

Bring about 183 finished Lolev batches (2024-08 → 2026-10) into MGR as real
batch records — brew day, readings, packaged lots — without changing current
on-hand stock, current "in process" volume, or any TTB report period the
brewery will file. Tank history is not imported (it was not accurate in
Lolev). Lolev orders are not imported.

Two parts:

1. **MGR product change (committed, PR to `main`):** a per-brewery
   `books_opened_on` date. Every compliance report ignores ledger rows dated
   before it; periods before it cannot be generated or filed.
2. **Import (local only, git-ignored like pass 1):** extend
   `scripts/import-lolev.ts` to write the history, every row dated before
   `books_opened_on`.

## Why a books-opened date, not opening balances (verified)

MGR already has `opening_balance` movements and an `opening_balances` CSV
import (`00001_baseline.sql:670`). They seed *stock on hand* at go-live; they
cannot carry history. History has to stay in the ledger, lot trace and batch
screens, yet be invisible to reports. A date bound hides it without netting
anything out; an opening balance would have to be hand-computed to cancel it.
v1 (`~/Repos/mgr`) had no anchor or period lock at all.

- The report's beginning balance is every `inventory_movements` row before the
  period (`private.generate_compliance_report`,
  `20261013100000_file_cellar_taproom_removals.sql:21`), reached through
  `private.report_movements` (`20261012110000_movement_occurred_on.sql:45`,
  `occurred_on <= p_end`, no lower bound). Imported history would enter every
  future opening balance.
- Cellar removals are dated by `volume_adjustments.created_at`
  (`20260928236000…:36-40`).
- "In process" is open occupancies now (`20261013100000…:71`), so closed or
  absent historical occupancies never count.

One predicate, `occurred_on >= books_opened_on`, in `report_movements` (and the
same bound on the cellar and invoice reads) makes history invisible to every
report, while it stays in the ledger, lot trace and batch screens.

## Decision needed: readings and lots without a tank

The schema ties both to a tank stay:

- `fermentation_readings.occupancy_id` is `not null`.
- `lots` require a `packaging_runs` row, and a started or closed run requires
  `occupancy_id` (`check` on `packaging_runs`).

Tank history is out, so pick one:

| | Choice | Effect |
|---|---|---|
| **R1 (recommended)** | One synthetic occupancy per historical batch in a single "Historical" vessel, brewed-on → closed-on, laid end to end so they never overlap | No schema change for readings or lots. The batch screens show a stay in "Historical", not a real tank. Overlapping Lolev batches are made sequential by shrinking each stay to fit; dates on readings stay true. The "Historical" vessel never carries a capacity or an open stay, so it never counts as in process. |
| **R2** | Make `occupancy_id` nullable on readings and runs, adding `batch_id` | Honest data, but touches every reader of those tables (cellar, Today, lot trace, completion) — a larger change. |

The plan below assumes **R1**. If R2, tasks 5–7 grow and a schema task is added.

## Source facts (2026-10-13 dump)

- batches 202 (114 `packaged`, 19 `active`, 69 with no state — older schema);
  `date` on all; `initialVolume` on 164; `beer` on 200; `recipe` on 199.
- brew-logs 128 (`brewDate`, `actualOG` on 124, knockout volume, boil times).
- tests 804 (`time`, `temperature` 759, `ph` 465, `plato` 453; `batch` on 803).
- packaging-sessions 149 (91 completed); products are
  `{packagingFormat, quantity}` with no batch link.
- finished-goods 164 (`batch` on 138, `packagingFormat`, `quantity`,
  `productionDate`); **all at 0 remaining**.

## Scope rules

- **Historical** = finished batches (`packaged`, or no state and not active).
  The 19 `active` batches are current work: import them later through the
  normal commands into real tanks (their own short pass), not here.
- Readings attach only to historical batches.
- Packaging comes from **finished-goods** rows (they carry the batch); a
  finished good with no batch is skipped and reported. v1's Lolev sync found
  the packaging-sessions module unused (`~/Repos/mgr/PROGRESS.md`, 2026-08-12),
  which backs finished goods as the source.
- One bad row never aborts the run: each batch imports on its own and a
  failure lands in the skipped list (v1 learned this, PROGRESS.md 2026-08-18).
- Each lot is sold through on its production date (`depletion`), so on-hand is
  never touched. A depletion needs a sale channel and a tax treatment
  (`removal_shape`, `00001_baseline.sql:665`): default the Taproom channel,
  `taxable` (the report's taxpaid removal). ponytail: same-day sell-through; real sell-out dates are unknown,
  and any pre-books date is invisible to reports.
- Brands: history needs `brand_id` on runs and lots, so Lolev beers become
  brands here (the deferred "beers → brands" pass folds in).
- SKUs: a lot moves a SKU (brand × format). Lolev packaging formats map to MGR
  formats by name; a missing format is a decision, not invented (see task 5).

## Tasks

1. **Migration: `breweries.books_opened_on`** —
   `supabase/migrations/20261014100000_books_opened_on.sql`. Nullable `date`
   (null = no anchor, today's behavior). Setter RPC
   `set_brewery_books_opened_on` following `set_brewery_operating_defaults`
   (`00001_baseline.sql:8139`): admin only, request replay, and it refuses a
   date after any filed period's start. `bun run migrations:lock`.
   Test first: `tests/books-opened-on.test.ts` — set, read, refuse non-admin,
   refuse a date that would move a filed period. Depends: none.
2. **Command `set_books_opened_on`** in `lib/commands/settings.ts`; API docs
   via `bun run docs:api`. Test: same file. Depends: 1.
3. **Report honors the date** — new migration
   `20261014100100_report_books_opened_on.sql` re-creating
   `private.report_movements` with `occurred_on >= books_opened_on`, the cellar
   and invoice reads with the same bound, and
   `generate_compliance_report`/`file_compliance_report` refusing a period
   that starts before it. Test first: `tests/compliance-books-opened.test.ts` —
   a movement before the date changes no line, balance or warning; a period
   before the date is refused; null date = unchanged output (regression); the
   month containing the date ends where it ended before the import; a
   completion loss dated before the date is hidden too.
   Depends: 1.
4. **Settings screen field** — the Settings brewery section gains "Books opened
   on" (`E.edit` date) through the shared view; staff guide entry in
   `content/docs/staff-guide.mdx`. TDD the view logic; eyeball the render.
   Depends: 2.
5. **Import: brands, formats, SKUs (local)** — `lib/import/lolev.ts`
   `mapBrands`, `mapSkus`; runner uses `upsert_brand`, `upsert_format` and
   `create_sku` (`lib/commands/catalog.ts`). Unmatched packaging formats are listed and
   stop the run until mapped (no invented formats). Test first in
   `tests/lolev-import.test.ts`. Depends: none (local).
6. **Import: batches and brew days (local)** — historical batches via
   `schedule_batch` + `record_brew_day` (`actuals: []`, `confirmEmpty: true`,
   real `brewedOn`) into the "Historical" vessel (R1), brew-log OG/volume into
   the brew record's process fields, then a past close — `complete_batch` has
   no date input, so this needs a `p_at` on `complete_batch` (a committed
   change, added to the PR) **or** a narrower path; resolved in this task's
   test, smallest change wins. Test first: `tests/lolev-history-db.test.ts`.
   Depends: 3, 5.
7. **Import: readings and lots (local)** — readings via
   `record_fermentation_reading` with the true `at`; one packaging run + lot
   per finished good, closed on its production date, then a `depletion` dated
   the same day. Test (DB): no change to `on_hand` / `atp`, no change to a
   report for a period after `books_opened_on`, lot trace shows the batch.
   Depends: 6.
8. **Run locally** — set `books_opened_on` on the dev "Lolev Beer" brewery,
   dry run, real run, rerun writes nothing; compare a report before and after.
   Hosted stays ask-first. Depends: 7.

Committed to `main` (one PR): tasks 1–4 and this plan. Local and git-ignored:
tasks 5–8 (`lib/import/lolev.ts`, `scripts/import-lolev.ts`, their tests).

Parallelism: 1 → 2 → 4 and 1 → 3 sequential; 5 parallel with 1–4; 6 → 7 → 8
after 3 and 5.

## Open questions (defaults chosen; say if wrong)

- **R1 vs R2** (above). Default R1.
- **Books-opened date for Lolev Beer.** Default: the day after the last
  historical batch closes, or the go-live date you give.
- **Sell-through date.** Default: same day as packaging.
- **Sell-through channel and tax treatment.** Default: Taproom, `taxable`.
- **Batches with no `initialVolume` (38).** Default: planned volume from the
  recipe's batch size; skipped and reported if neither exists.
