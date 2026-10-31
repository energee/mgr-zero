# History without tanks: readings and brew records belong to the batch

Status: plan, awaiting approval. Branch `feat/readings-on-batch`, PR to `main`.

## Why

Two tables need a tank stay before they can hold a row:
- `fermentation_readings.occupancy_id` is `not null` (`00001_baseline.sql:1125`).
- `brew_records.occupancy_id` is `not null` (`20260928090000_brew_records.sql:5`).

`complete_batch` also refuses a batch with no stay (`'batch has no authoritative
occupancy'`, `20261012120100…:13`). It writes leftover beer off as a loss and
closes at `now()`.

Example Brewing history (`docs/plans/lolev-history.md`) has batches but no reliable tanks
(decision: tank history is not imported). It also has no packaged lots
(decision 2026-10-13: finished goods start in MGR at the packaging-run
cutover). Pushing history through today's path would therefore need a
placeholder vessel, and it would mark every past batch as dumped.

Change (option b2, chosen 2026-10-13):

1. A reading and a brew record each get a required `batch_id` and an optional
   `occupancy_id`. When both are set, the database guarantees that the
   occupancy holds that batch. `brew_records` already has `batch_id`, so only
   its occupancy becomes optional.
2. A new `record_historical_batch` RPC writes a brew record with no tank and
   closes the batch on a past date with no loss row. It is allowed only
   **before `books_opened_on`**.

Live brewing is unchanged: `record_brew_day`, `complete_batch` and the cellar
form still always work through tanks.

## What reads these tables today (all of it)

Searched `fermentation_readings`, `record_fermentation_reading`,
`latest_reading`, `readings` and `brew_records` across `supabase/migrations`,
`lib`, `app`, `components` and `tests`.

### Readings

| Reader | Where | Keyed by | Changes? |
|---|---|---|---|
| Table + index `readings_occ_idx (occupancy_id, at)` | `00001_baseline.sql:1122` | occupancy | yes: column, FKs, index |
| `record_fermentation_reading` RPC | `00001_baseline.sql:5288` | occupancy, must be open | yes: new signature |
| Today `fermentation_reading_overdue` | `20261012100900_undated_confirmed_pick_due.sql:59` | `fr.occupancy_id = vo.id` | no: due is per open tank; live readings still carry it |
| `list_batches({ readings })` → Batches list, Cellar map | `lib/commands/production.ts:367` (embed `vessel_occupancies → fermentation_readings`) | occupancy | no code change; embed must stay unambiguous (see FKs) |
| `list_fermentation_readings` → reading page, vessel page | `lib/commands/production.ts:498` | occupancy | no |
| Offline outbox | `lib/composer/offline-policy.ts` | `occupancyId` | yes: gains `batchId`; old queued payloads still parse |
| RLS read policy, grants | `00001_baseline.sql:6403`, `:7516` | table | no |

### Brew records

| Reader | Where | Keyed by | Changes? |
|---|---|---|---|
| Table | `20260928090000_brew_records.sql:2` | batch + occupancy | yes: occupancy nullable, composite FK |
| `record_brew_day` (writer) | `20261012100400_brew_turns.sql:6` | always passes a tank | no |
| `correct_brew_record` | `20261012100400_brew_turns.sql:82` | locks the record's vessel and occupancy | yes: refuse a tankless record (`'historical brew records are corrected by re-import'`); a tankless record has no vessel to lock |
| `private.append_brew_actuals` | `20260928090000_brew_records.sql:32` | copies `r.occupancy_id` into `batch_additions` (nullable already) | no; history passes no actuals anyway |
| `get_brew_record` → batch detail page | `20260928090000_brew_records.sql:195`; `app/(app)/batches/[id]/page.tsx:33` | batch | no (`to_jsonb(r)` carries a null occupancy) |
| Knockout in `close_packaging_run` (cost) | `20261012101300_finished_goods_cost.sql:225` | batch | no (history has no runs) |
| RLS read policy | `20260928090000_brew_records.sql:21` | table | no |

### Named in the brief but not readers

- Batch completion and lot trace never read readings.
- Lot trace (`trace_lot_sources`, `20261012100300…:20`) walks occupancies. A
  tankless historical batch has no lots, so it never appears there. That is
  correct now that finished goods are not imported.
- Blends are a transfer into the surviving occupancy (`00001_baseline.sql:884`).
  They are unchanged.

### Batch screens with a tankless closed batch

- `batches_view` sorts it into Completed by `closed_at` (`lib/mgr/batches-view.ts:73`).
- The batch detail page reads `get_brew_day`, which returns `occupancy: null`
  for a closed batch with no open stay (`production.ts:432`). The page already
  handles null (`app/(app)/batches/[id]/page.tsx:36,42`): `recorded` is true
  via `brewed_on`.

The DB test checks both, and step 4 eyeballs one imported batch.

## Schema — `20261014100300_history_without_tanks.sql`

(Re-check the max migration across branches when writing.)

```sql
alter table public.vessel_occupancies
  add constraint vessel_occupancies_id_batch_brewery_key unique (id, batch_id, brewery_id);

-- readings: required batch, optional tank that must hold it
alter table public.fermentation_readings add column batch_id uuid;
update public.fermentation_readings fr set batch_id = vo.batch_id
  from public.vessel_occupancies vo where vo.id = fr.occupancy_id;
alter table public.fermentation_readings
  alter column batch_id set not null,
  alter column occupancy_id drop not null,
  add foreign key (batch_id, brewery_id) references public.batches (id, brewery_id),
  -- MATCH SIMPLE: a null occupancy skips the check; a set one must hold this batch
  add foreign key (occupancy_id, batch_id, brewery_id)
    references public.vessel_occupancies (id, batch_id, brewery_id),
  drop constraint fermentation_readings_occupancy_id_brewery_id_fkey;
create index readings_batch_idx on public.fermentation_readings (batch_id, at);

-- brew records: batch already required; tank becomes optional, must match
alter table public.brew_records
  alter column occupancy_id drop not null,
  add foreign key (occupancy_id, batch_id, brewery_id)
    references public.vessel_occupancies (id, batch_id, brewery_id),
  drop constraint brew_records_occupancy_id_brewery_id_fkey;
```

- Each old `(occupancy_id, brewery_id)` FK is dropped. The composite covers it,
  and two FKs to `vessel_occupancies` would make PostgREST embeds ambiguous.
- The readings backfill is one `update`. Every existing row has an occupancy, so
  `set not null` cannot fail. Existing brew records already satisfy the
  composite FK, since `record_brew_day` writes the batch's own occupancy. The
  migration fails loudly if any row doesn't.
- No code changes `vessel_occupancies.batch_id` after insert. The composite FKs
  make that impossible while children exist, which is the intended outcome.

## RPCs

### `record_fermentation_reading` (signature changes; old one dropped)

`(p_brewery, p_batch, p_occupancy, p_at, p_temp_f, p_gravity_plato, p_ph, p_note, p_request_id)`

- **Tank given:** it must be open (`private.assert_open_occupancy`, unchanged).
  A null `p_batch` is derived from the tank. A different `p_batch` raises
  `'occupancy does not hold this batch'`.
- **No tank:** `p_batch` is required. The batch must be brewed, not cancelled,
  and either not closed or closed as historical (see below). All refusals are
  plain `raise exception`.
- The request hash gains `'batch'`.

### `record_historical_batch` (new)

`(p_brewery, p_batch, p_brewed_on date, p_closed_on date, p_knockout_bbl numeric, p_process jsonb, p_request_id)`, admin only.

- **Batch:** locked `for update` first. It must exist, be unbrewed, not
  cancelled, have no occupancy, and have no brew record.
- **Dates:**
  - `p_brewed_on <= p_closed_on`.
  - `books_opened_on` must be set, and `p_closed_on < books_opened_on`.
  - No filed report may cover either date. Reuse the guard pattern in
    `record_brew_day:40`.
- **Writes, in one transaction:**
  - a `brew_records` row: `occupancy_id null`, `turn 1`,
    `plan_snapshot = private.brew_plan_snapshot(p_batch)`, the process run
    through `private.assert_brew_process`, and the knockout as `initial_bbl`;
  - `batches.brewed_on = p_brewed_on`;
  - `closed_at = p_closed_on` (start of day in the brewery's time zone);
  - `completion_adjustment_id` stays null, and no `volume_adjustments` row is
    written.
- **Completion graph:** the deferred trigger
  (`00001_baseline.sql:1017`) only checks batches whose
  `completion_adjustment_id` is set, so a null passes. The DB test proves it.
- **Readings:** while the batch is still open, history readings are recorded
  batch-only, before this call closes it. Simpler: the import calls this RPC
  after its readings. **Default:** batch-only readings stay allowed on a batch
  closed this way (`closed_at < books_opened_on` and no occupancy). That keeps
  the import order-free and replay-safe; a live closed batch still refuses.

## Commands

All of these live in `lib/commands/production.ts`.

- `record_fermentation_reading`: `fermentationReadingInput`
  (`lib/composer/offline-policy.ts`) gains `batchId: uuid optional`.
  `occupancyId` becomes optional, and a `.refine` requires at least one.
  `READING_BOUNDS` applies to both paths (the 25 °F floor, not v1's 32 °F).
- `record_historical_batch`: new `defineCommand`, roles `["admin"]`. Add an
  `API_AREAS` rule in `lib/mgr/api-operations.ts`, then `bun run docs:api`.
  Not offline-eligible.

No UI. History is written by the local import only.

## Tasks

Each one starts by writing its failing test.

1. **Schema + backfill.**
   - Test first: `tests/history-without-tanks.test.ts` (DB, `scripts/test-db.sh`). It asserts:
     - a backfilled reading carries its occupancy's batch;
     - a reading or brew record whose occupancy holds another batch fails (23503);
     - a tankless reading inserts;
     - `list_batches({ readings: true })` still embeds `latest_reading`.
   - Write the migration, then `bun run migrations:lock`.
   - Accept: the test and `tests/migrations-applied.test.ts` are green.
   - Deps: none.
2. **`record_fermentation_reading`.**
   - Same file. Tests:
     - tank-only derives the batch;
     - batch-only works on a brewed open batch;
     - batch-only is refused on a cancelled or unbrewed batch, and on a live closed one;
     - a mismatched pair is refused;
     - a replay returns the first row.
   - Update the signature at `tests/rpc-allowlist.test.ts:135` and the args at
     `tests/rls-taproom.test.ts:384`.
   - Deps: 1.
3. **`record_historical_batch`.**
   - Same file. Tests:
     - it writes a brew record with a null occupancy, `brewed_on`, and `closed_at`,
       with no `volume_adjustments` row and a null `completion_adjustment_id`;
     - the commit passes the deferred completion graph;
     - refused: closed on/after `books_opened_on`; `books_opened_on` unset;
       brewed after closed; a filed period; an already-brewed or occupied batch;
       a non-admin;
     - a replay returns the first result;
     - a later batch-only reading on it is accepted;
     - the batch lands in `list_batches` Completed and `get_brew_day` returns
       `occupancy: null`.
   - Add the RPC to `tests/rpc-allowlist.test.ts` and `tests/rls-taproom.test.ts`.
   - Deps: 1.
4. **`correct_brew_record` refuses a tankless record.**
   - Test first in `tests/brew-record.test.ts`.
   - Deps: 1.
5. **Commands + offline input.**
   - Test first in `tests/fermentation-reading-bounds.test.ts` (pure):
     `{ occupancyId }` alone parses, `{ batchId }` alone parses, and neither is rejected.
   - `tests/offline-outbox.test.ts` stays green.
   - `tests/production.test.ts:525` gains a batch-only case and a
     `record_historical_batch` command case.
   - Add the `API_AREAS` rule.
   - Deps: 2, 3.
6. **Direct-insert fixtures.** `tests/commands-today.test.ts:186` and
   `tests/rls-taproom.test.ts:108` insert readings without `batch_id`; add it.
   Deps: 1.
7. **Types + docs.**
   - Run `bash scripts/generate-db-types.sh` and `bun run docs:api`.
   - Update the `fermentation_readings` and `brew_records` sections of
     `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md`, and its
     decisions row (`2026-08-31-mgr-schema-decisions.md:24`).
   - Add a staff-guide line that historical batches show as Completed, with no
     tank and no loss.
   - Accept: `tsc`, `tests/api-docs.test.ts`, `tests/docs.test.ts`.
   - Deps: 5.

Then the full proof (`bun run test && bunx tsc --noEmit && bun run lint`), the
eyeball check on one imported batch, `/simplify`, and the PR.

Parallelism: 1 → {2, 3, 4, 6} in parallel → 5 → 7.

Dev stack (holds the Example Brewing import): apply with `psql` only, never `supabase db reset`.

## Effect on `docs/plans/lolev-history.md` (local import, not this PR)

- **Task 5:** brands only. Formats and SKUs drop (no finished goods).
- **Task 6:** `schedule_batch`, then readings batch-only, then
  `record_historical_batch`. There is no "Historical" vessel (R1 dropped), and
  the brew-log OG, volume and process go in `p_process` / `p_knockout_bbl`.
- **Task 7:** readings only. Each Example Brewing test gets a deterministic request id
  from its Mongo id, so a rerun replays. The packaging-run, lot and depletion
  half is gone.
- Active batches remain a separate pass into real tanks.

## v1 cross-check (2026-10-14)

No conflict or repeat. v1 keyed readings to the batch only (`batch_logs.batch_id
not null`, v1 `00001_initial_schema.sql:108`; "Readings recorded against BATCH",
`docs/data-model/production.md:397`), so the required batch matches v1. The
optional tank and the composite FK are new in v2. Lessons adopted:

- `READING_BOUNDS` applies to the batch-only path too. The 25 °F floor stays;
  v1's 32 °F floor rejected cold-crash readings.
- Sort by `at`, never insert order, because history sits beside live readings.
  The new index is `(batch_id, at)`.
- Import (lolev-history): use a deterministic request id per Example Brewing test and
  keep its `time`. Reject a reading with no `batch` rather than invent one (v1
  `src/integrations/mongodb/sync.ts:966`).

Second run (brew records and historical close): no conflict or repeat. v1's
Mongo sync also set history to completed with no loss, and invented no vessels
(v1 `src/integrations/mongodb/transformers.ts:210`). Lessons adopted:

- **Close date.** v1 left `completed_at` unset, so history fell into the import
  month's TTB period (v1 `PROGRESS.md:498`, migration 00237). v2 sets
  `closed_at` explicitly. Task 3 adds a test: a historical batch is in no
  report period on or after `books_opened_on`, and never in the beer-in-process
  snapshot (which counts open occupancies, and history has none).
- **Replay race.** v1 had a race: it read status and then upserted, clobbering
  a live change (v1 `sync.ts:821`, #855). `record_historical_batch` therefore
  locks the batch row `for update` before its "unbrewed, no brew record"
  checks. Replay is covered by the request ledger.
- **Unaccounted volume read as loss** (v1 `PROGRESS.md:373`). In v2,
  `private.batch_volume_balance` is called only by `complete_batch`,
  `close_packaging_run` and cancel-plan, and history passes through none of
  them. Reports read the movement ledger. So a historical knockout with no
  packaging never becomes a reported loss. The staff-guide line says
  historical batches carry a knockout and nothing after it.

## Open questions (defaults chosen; say if wrong)

- **Readings on the batch detail page.** Default: out of this PR. Imported
  readings exist but show nowhere until `list_fermentation_readings` takes
  `batchId` and the batch screen lists them. That is one more task (screen,
  `screens.tsx`, staff guide).
- **Knockout for the 38 batches without `initialVolume`.** Default: the
  planned volume (`planned_bbl`); skipped and reported if that is missing too.
  Decided in the import plan, not here.
- **Admin-only `record_historical_batch`.** Default: yes. It rewrites the
  record of a past period.
