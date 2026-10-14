# Readings belong to the batch

Status: plan, awaiting approval. Branch `feat/readings-on-batch`, PR to `main`.

## Why

`fermentation_readings.occupancy_id` is `not null`, so a reading cannot exist
without a tank stay. A reading describes beer, and beer is a batch. History
(the Lolev import, `docs/plans/lolev-history.md`) has batches but no reliable
tanks, and needs readings without a placeholder occupancy.

Change: a reading gets a required `batch_id` and an optional `occupancy_id`.
When both are set, the database guarantees that the occupancy holds that batch.

## What reads readings today (all of it)

Searched `fermentation_readings`, `record_fermentation_reading`,
`latest_reading` and `readings` across `supabase/migrations`, `lib`, `app`,
`components` and `tests`.

| Reader | Where | Keyed by | Changes? |
|---|---|---|---|
| Table + index `readings_occ_idx (occupancy_id, at)` | `00001_baseline.sql:1122` | occupancy | yes: new column, FKs, index |
| `record_fermentation_reading` RPC | `00001_baseline.sql:5288` | occupancy, must be open | yes: new signature |
| Today `fermentation_reading_overdue` (in `today_items`) | `20261012100900_undated_confirmed_pick_due.sql:59` | `fr.occupancy_id = vo.id` | **no**: due is per open tank, and live readings still carry the tank |
| `list_batches({ readings })` → Batches list and Cellar map | `lib/commands/production.ts:367` embeds `vessel_occupancies → fermentation_readings` | occupancy | no code change, but the embed must stay unambiguous (see FKs) |
| `list_fermentation_readings` → reading page, vessel page | `lib/commands/production.ts:498`; `app/(app)/cellar/[occupancyId]/reading/page.tsx`, `app/(app)/cellar/vessels/[id]/page.tsx` | occupancy | no |
| Offline outbox replay | `lib/composer/offline-policy.ts` (`fermentationReadingInput`) | `occupancyId` | yes: input gains `batchId`, old queued payloads must still parse |
| Staff read policy + grants | `00001_baseline.sql:6403`, `:7516` | table | no |

Named in the brief but **not** readers: batch completion (`complete_batch`,
`get_batch_completion_preview`) and lot trace never touch readings. The batch
detail page (`app/(app)/batches/[id]/page.tsx`) shows no readings today.
`get_recipe_outcomes` is a design note in `screens.tsx:2021`, not code.

Blends: a blend is a transfer into the surviving occupancy
(`00001_baseline.sql:884`). Readings after it hang off that occupancy and its
batch, so nothing changes.

## Schema

Precedent: `batch_additions` already has `batch_id not null` +
`occupancy_id` nullable (`00001_baseline.sql:1187`). It does not enforce the
match in the database. Readings will, with a composite FK rather than a trigger:

```sql
-- 20261014100300_readings_on_batch.sql
alter table public.vessel_occupancies
  add constraint vessel_occupancies_id_batch_brewery_key unique (id, batch_id, brewery_id);

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
```

- The old `(occupancy_id, brewery_id)` FK is dropped. The composite covers it,
  and two FKs to `vessel_occupancies` would make the PostgREST embed in
  `openVessels` ambiguous (an error at read time).
- `readings_occ_idx` stays (Today's lateral `max(at)` and the per-tank lists use it).
- Backfill is one `update`. Every existing reading has an occupancy, so
  `set not null` cannot fail. Hosted is pre-release, and the same file applies there.
- No code updates `vessel_occupancies.batch_id` after insert. The composite FK
  makes that impossible while readings exist, which is the intended outcome.

## RPC

New signature, and the old one is dropped (only one caller, the command):

`record_fermentation_reading(p_brewery, p_batch, p_occupancy, p_at, p_temp_f, p_gravity_plato, p_ph, p_note, p_request_id)`

- `p_occupancy` given: it must be open (`private.assert_open_occupancy`,
  unchanged). `p_batch` null → taken from the occupancy. `p_batch` given and
  different → `raise exception 'occupancy does not hold this batch'`.
- `p_occupancy` null: `p_batch` required. The batch must be brewed and must
  not be cancelled or closed (plain `raise exception`, P0001).
- The request hash payload gains `'batch'`.

## Command

`fermentationReadingInput` (`lib/composer/offline-policy.ts`) gains
`batchId: uuid optional`, and `occupancyId` becomes optional. A `.refine`
requires at least one. An outbox entry queued before the deploy
(`{ occupancyId, … }`) still parses and replays.
`list_fermentation_readings` is unchanged.

## Tasks

Each one starts by writing its failing test.

1. **Migration + backfill.** Test first: `tests/readings-on-batch.test.ts`
   (DB, `scripts/test-db.sh`). It asserts:
   - a backfilled row carries its occupancy's batch;
   - an insert with an occupancy of batch A and `batch_id` B fails (23503);
   - a batch-only insert succeeds;
   - `list_batches({ readings: true })` still embeds `latest_reading`.

   File `supabase/migrations/20261014100300_readings_on_batch.sql` (re-check the
   max migration across branches when writing), then `bun run migrations:lock`.
   Accept: test green, `tests/migrations-applied.test.ts` green. Deps: none.
2. **RPC.** Same migration file, test file extended:
   - occupancy-only still works and derives the batch;
   - batch-only works on a brewed, open batch;
   - batch-only is refused on a closed, cancelled or unbrewed batch;
   - a mismatched pair is refused;
   - replay returns the first row.

   Update the signature in `tests/rpc-allowlist.test.ts:135` and the argument
   list in `tests/rls-taproom.test.ts:384`. Accept: those three tests green.
   Deps: 1.
3. **Command + offline input.** `lib/commands/production.ts:482` passes
   `p_batch`. Test first in `tests/fermentation-reading-bounds.test.ts` (pure):
   - `{ occupancyId }` alone parses;
   - `{ batchId }` alone parses;
   - neither is rejected.

   Then `tests/offline-outbox.test.ts` stays green, and
   `tests/production.test.ts:525` adds a batch-only command case.
   Accept: `tsc`, those tests. Deps: 2.
4. **Direct-insert fixtures.** `tests/commands-today.test.ts:186` and
   `tests/rls-taproom.test.ts:108` insert readings without `batch_id`. Add it.
   Accept: both green. Deps: 1.
5. **Types and docs.** `bash scripts/generate-db-types.sh`; `bun run docs:api`
   (input change on `record_fermentation_reading`); update
   `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` (`fermentation_readings`
   section) and the decisions row (`2026-08-31-mgr-schema-decisions.md:24`).
   No customer-visible change, so no guide edit. Accept: `tsc`,
   `tests/api-docs.test.ts`, `tests/docs.test.ts`. Deps: 2, 3.

Then the full proof (`bun run test && bunx tsc --noEmit && bun run lint`), `/simplify`, PR.

Parallelism: 1 → 2 → 3 → 5. Task 4 can run alongside 2–3.

Dev stack (holds the Lolev import): apply the migration with `psql` only, never
`supabase db reset`.

## v1 cross-check (2026-10-14)

No conflict or repeat. v1 keyed readings to the batch only (`batch_logs.batch_id
not null`, v1 `00001_initial_schema.sql:108`; "Readings recorded against BATCH",
`docs/data-model/production.md:397`), so the required `batch_id` matches v1.
The optional `occupancy_id` and the composite FK are new in v2. Lessons adopted:

- The batch-only path keeps `READING_BOUNDS` (same zod input), and the
  existing 25 °F floor stays. v1's 32 °F floor rejected cold-crash readings.
- Readers sort by `at`, never insert order. The new index is `(batch_id, at)`,
  because imported history sits beside live readings.
- For the history import (lolev-history task 7, not this PR): each Lolev `test`
  gets a deterministic request id from its Mongo id, so a rerun replays rather
  than duplicates, and keeps its original `time` as `at`. v1 rejected a reading
  with no `batch` rather than inventing one (v1
  `src/integrations/mongodb/sync.ts:966`), and so do we.

## Open questions (defaults chosen; say if wrong)

- **Batch-only on a closed batch.** Default: refused, mirroring "a closed
  occupancy takes no more readings". The history import then records readings
  before it closes each batch. If you'd rather allow it, say so.
- **Show readings on the batch detail page.** Default: out of this PR. Today,
  imported history readings would appear nowhere in the UI, because the vessel
  page shows only the current stay. Adding it means `list_fermentation_readings`
  takes `batchId`, a readings list on the batch screen, `screens.tsx` and the
  staff guide: one more task.
- **Live batch-only entry.** Default: none. The cellar form always sends the
  tank, so Today's "reading due" still clears per tank.
