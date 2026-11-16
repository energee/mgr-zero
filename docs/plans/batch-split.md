# Batch split: part of a batch becomes another batch

Status: approved 2026-11-16 and built. Branch `feat/batch-split`, PR to `main`.

## Why

Monarch is Edo II with a dry hop: part of batch B-0189 became a different beer.
MGR could not record that. A cellar transfer into an empty tank keeps the
source's batch, and a tank's beer can only be packaged as its batch's brand
(`enforce_packaging_run_brand`, `00001_baseline.sql:1251`). So Monarch was
entered as its own brew (B-0220), which counts the same beer as two brews and
leaves Edo's ingredients off Monarch's lot trace.

## What already exists (nothing here is rebuilt)

| Need | Already there |
| --- | --- |
| Beer moving between two batches | `record_cellar_transfer` into a tank that holds another batch (a blend); `transfers` rows join the two occupancies |
| Volume accounting across batches | `private.batch_volume_balance` adds transfers in from another batch and subtracts transfers out (`20260925152847_transfer_loss_adjustments.sql`) |
| Lot trace across batches | `private.lot_lineage`, `trace_lot_sources`, `trace_batch_lots`, `private.lot_ingredients` follow recorded transfers |
| A batch for the new beer | `schedule_batch`: brand, recipe, planned barrels, date |
| Packaging the new beer under its own brand | `schedule_packaging_run` / `close_packaging_run`; the brand check reads the tank's batch |
| Completing either batch | `complete_batch`, on the same balance |

The one gap: a transfer into an **empty** tank always opens the new occupancy
for the **source's** batch. A planned batch only gets a tank through
`record_brew_day`, which records a brew.

## The change

`record_cellar_transfer` takes one new optional input, `toBatchId`: a planned,
unbrewed batch. When it is given, the destination tank must be empty, and the
occupancy the transfer opens belongs to that batch instead of the source's.
The batch's `brewed_on` is set to the transfer's date in the brewery's time
zone, so it lists as Active. It has no brew record: its volume is the transfer
in, which the balance already counts.

The user's steps: plan the new batch (**New batch**, brand Monarch), then
**Transfer** from the Edo tank into an empty tank and pick the planned batch
under **Start a planned batch**. From there the tank is Monarch's: readings,
additions (the dry hop), packaging and completion are the existing flows.

Not in scope, by decision:

- No new table, no parent/child column: the `transfers` row is the link.
- No batch created inside the transfer; `schedule_batch` already does that.
- No changing the brand of an existing batch.
- No backdating. A transfer is dated now, like every transfer today.

## Limits to know before approving

- **It does not fix Monarch and Edo retroactively.** B-0189 is closed history
  with no tank, and transfers cannot be backdated. Monarch stays as B-0220 with
  its note unless the owner asks for a one-off data correction.
- Splitting into a tank that already holds beer is still a blend into that
  tank's batch, as today.

## Tasks

Sequential unless marked. Each starts with its failing test.

1. **RPC: `toBatchId` on `record_cellar_transfer`.**
   - Test first: `tests/batch-split.test.ts` (database suite).
     - A transfer with `toBatchId` into an empty tank opens the occupancy for
       that batch and sets its `brewed_on`.
     - The source batch's `get_batch_volume_balance` baseline drops by the
       volume; the new batch's baseline equals it.
     - Refusals: destination tank not empty; batch already brewed, closed or
       cancelled; batch of another brewery; batch equal to the source's.
     - Without `toBatchId` the behavior is unchanged (existing suites).
   - Files: `supabase/migrations/20261116120000_batch_split.sql` (new;
     `create or replace` of the function from
     `20260925152847_transfer_loss_adjustments.sql` with a seventh parameter
     `p_to_batch uuid default null`, dropping the six-argument signature and
     re-granting), `supabase/migrations.lock.json` (`bun run migrations:lock`),
     `lib/supabase/database.generated.ts` (`scripts/generate-db-types.sh`).
   - Types: none new.
   - Accept: `bunx vitest run tests/batch-split.test.ts tests/production.test.ts tests/batch-completion.test.ts tests/cellar-workflow-locks.test.ts`.

2. **Command input.** Depends on 1.
   - Test first: `tests/batch-split.test.ts` runs through `runCommand`, so the
     same file covers it.
   - Files: `lib/commands/production.ts` (`record_cellar_transfer`: add
     `toBatchId: z.string().uuid().optional()`, pass `p_to_batch`, extend the
     description).
   - Accept: `bunx tsc --noEmit`, the task 1 command.

3. **Trace and packaging proof.** Depends on 2. No product code expected.
   - Test first: in `tests/batch-split.test.ts`: package the split batch under
     its own brand, then `trace_lot_sources` lists both batches and
     `trace_batch_lots` of the source batch lists the new lot.
   - If either fails, the fix goes in a second migration and this plan is
     updated before continuing.
   - Accept: the file passes.

4. **View model.** Parallel with 3 after 2.
   - Test first: `tests/cellar-transfer-view.test.ts` (pure): with a planned
     batch chosen, `transferReason` asks for an empty destination; the
     chosen batch is cleared from the build when the destination is occupied.
   - Files: `lib/mgr/cellar-transfer-view.ts`.
   - Types: `CellarTransferViewModel` gains
     `plannedBatches: { id: string; label: string }[]` and `toBatchId: string`.
   - Accept: `bunx vitest run tests/cellar-transfer-view.test.ts`, `bunx tsc --noEmit`.

5. **Sheet and page.** Depends on 4. Screen-parity rules apply.
   - Test first: the fixture in `tests/mgr-screens.test.ts` (the Cellar
     transfer frame shows **Start a planned batch**). Rendering itself is
     checked in the browser.
   - Files: `components/mgr/views/cellar-transfer.tsx` (one `E.pick`, shown
     only when the destination is empty and a planned batch exists),
     `app/(app)/cellar/cellar-transfer-form.tsx` (send `toBatchId`),
     `app/(app)/cellar/page.tsx` (the planned batches come from the existing
     `list_batches({ open: false })`), `components/mgr/screens.tsx` and
     `lib/mgr/fixtures/production.ts` (fixture and the frame's `writes`).
   - Accept: `bunx tsc --noEmit && bun run lint`, the screen proof list in
     `AGENTS.md`, and a browser check of the sheet on desktop and phone.

6. **A split batch on its own pages.** Depends on 2. Parallel with 4 and 5.
   - A batch that is brewed but has no brew record is new. Open it on
     `/batches`, `/batches/[id]` (Brew day tab), `/cellar` and the recipe's
     Batch actuals, on the test stack.
   - Test first: for each page that breaks, a failing test in that page's
     existing view test, then the fix. If none breaks, no code.
   - Accept: the four pages render for a split batch.

7. **Docs.** After 5.
   - Files: `content/docs/staff-guide.mdx` (Cellar transfer: starting a
     planned batch from part of a tank; Batches: a batch started by a
     transfer), `content/docs/api/` (`bun run docs:api`, plus the
     `record_cellar_transfer` note in `index.mdx`),
     `.agents/superpowers/specs/brewing-domain.md` (loss accounting: a split
     batch's baseline is its transfer in).
   - Accept: `bunx vitest run tests/docs.test.ts tests/api-docs.test.ts tests/design-docs.test.ts`.

Final: `bun run test && bunx tsc --noEmit && bun run lint`, `/simplify`, the
Haiku check, then the PR. Merging deploys Production and applies the
migration, so the merge waits for the owner's go-ahead.

## Migration SQL (task 1, in outline)

```sql
drop function public.record_cellar_transfer(uuid, uuid, uuid, numeric, numeric, uuid);
create function public.record_cellar_transfer(
  p_brewery uuid, p_from_occupancy uuid, p_to_vessel uuid, p_volume_bbl numeric,
  p_loss_bbl numeric, p_request_id uuid, p_to_batch uuid default null
) returns jsonb ... as $$
  -- body as today, with p_to_batch in the request identity, and:
  --   if p_to_batch is not null:
  --     the destination must have no open occupancy
  --       ('a planned batch can only start in an empty vessel');
  --     the batch must be this brewery's, not the source's, and have
  --       brewed_on, closed_at and cancelled_at all null
  --       ('only an unstarted planned batch can start from a transfer');
  --     the new occupancy's batch_id is p_to_batch;
  --     update batches set brewed_on = (v_now at time zone <brewery tz>)::date.
$$;
-- revoke from public, anon, authenticated, service_role; grant execute to authenticated.
```

The timestamp `20261116120000` is later than main's newest migration
(`20261113051000_recipe_save_moves_batches.sql`); no open PR adds a migration
today. Re-check both when the migration is written.

## What changed while building

- Tasks 1 to 3 were built together by one agent: they share one test file.
- Task 6 found no failing read. It found that a batch started by a transfer read wrongly on two pages, so two display
  fixes were added, with no new migration:
  - The batch page says **Started from** with the source batch and the barrels transferred in, where a brewed batch
    says **Knockout**. `get_brew_day` returns `startedFrom` for it.
  - A recipe's Batch actuals leaves such a batch out. Its first reading is beer already fermenting, and it has no knockout.
- The transfer preview names the batch it starts.
- `toBatchId` was added to the field vocabulary, so an agent's proposal card names the batch.
- `tests/rpc-allowlist.test.ts` and `tests/rls-taproom.test.ts` pin the procedure's signature and were updated for the
  seventh parameter.
- Known and left as is: on a split batch's page the pre-filled brew-day actuals are still built, though **Add brew turn**
  is hidden for it and the database refuses the turn.
