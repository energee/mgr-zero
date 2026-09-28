# Actual brew record and material corrections (#622)

Status: technically reviewed. User authorized stacking on #619 (PR #665).
Retain its cancelled-batch guard and regression in the expanded brew command.
Migration reservation: `20260928090000`–`20260928095959`.

This implements D3 and D19 from the v1 completeness audit. A completed brew-day
commit records actual ingredients and the process values the brewer confirmed.
Planning never consumes material. On-hand therefore includes ingredients used
physically during a brew until the brewer records its completion.

## Existing owners and v1 cross-check

`record_brew_day` in `lib/commands/production.ts` and its latest SQL definition
in `20260924060000_vessel_capacity.sql` own the batch date and first occupancy.
Keep the same vessel locks, same-day occupancy calculation, capacity check,
authenticated role check and command-request replay.

`batch_additions` already links a batch, optional recipe ingredient, stage and
exact consumption movement. `material_movements` already owns bin/lot stock.
Reuse both instead of creating a second ingredient-consumption ledger.
`recipe_versions`, `recipe_ingredients` and `recipe_water_additions` supply the
batch's pinned plan. The pinned version must not be replaced by the latest one.

The v1 `brew_logs` table stored timeline events with ingredient and measurement
fields (`mgr/supabase/migrations/00004_brew_logs.sql`). Its later
`00104_batch_centric_brew_logs.sql` derived recipes through linked batches.
`mgr/src/entities/brew-log/core.ts` validates the event ingredient shape.
The useful workflow is recording ingredients and process observations together.
Do not port v1's split/blend junction or editable historical event blob into
this batch-owned completion flow.

## Durable record

Add an append-only `brew_records` header with brewery, batch, first occupancy,
pinned recipe-version ID, brewed date, confirmed knockout BBL, process snapshot,
author, recorded time, optional corrected-record ID and correction reason.
A partial unique index permits one original per batch. A unique corrected-record
ID permits one successor to each revision. Every reference is tenant-bound.
The snapshot captures recipe name/version and these existing values:

| Value | Frozen interpretation |
| --- | --- |
| Mash steps | Name, kind, temperature in °F and duration in minutes |
| Boil and whirlpool | Boil minutes, whirlpool minutes, °F and rest minutes |
| Pre-boil and knockout | Pre-boil BBL, confirmed knockout BBL and knockout °F |
| Water | Mash/sparge gallons and target mash pH |
| Water profile | Source/target names and Ca, Mg, Na, sulfate, chloride and bicarbonate ppm |
| Water additions | Material identity/name, quantity, g/mL/oz unit and mash/sparge/kettle stage |
| Fermentation plan | Stage name/kind, °F and days, explicitly planned rather than observed |
| Recipe assumptions | Efficiency and attenuation fractions, target IBU and note |
| Ingredient plan | Material identity/name, base unit, quantity per BBL, stage, timing and extract snapshot |
| Actual material source | Material and lot identity, frozen names/lot code, location/bin identity, quantity and base unit |

The snapshot distinguishes
planned values from the actual values the brewer confirms. Missing observations
remain absent; no predicted measurement is presented as observed.

Extend `batch_additions` with an optional brew-record reference and frozen
material name, unit and confirmed quantity. An addition still points at its
exact `consumption` movement. Its bin and lot are the movement's identity.
Record the recipe-ingredient ID when the line comes from the pinned plan.
A substituted ingredient names the actual material explicitly rather than
silently retaining the planned material identity.

New records require explicit actual ingredient lines. The live form prefills
quantities from pinned mash, boil and whirlpool ingredients scaled to the
selected brew volume. Fermentation, dry-hop and packaging rows remain planned
for their later owners; `record_batch_addition` records post-knockout additions.
An `other` stage is not silently assigned to brew day: the brewer explicitly
adds it when it was actually used. Water additions retain their explicit plan
units and require an actual source/quantity in the material's compatible base
unit before they consume stock. No mass/volume conversion is invented.
The brewer reviews them and chooses the actual stock buckets. Include a deliberate
empty ingredient confirmation for recipe-free or genuinely empty plans.
Do not silently backfill ingredients onto historical batches. Historical
batches without a record show that ingredient usage was not captured.

## Atomic commands and reads

Extend `record_brew_day` with confirmed process values and actual material
sources. Each source names material, recipe ingredient when applicable, stage,
location, bin, lot (or null for untracked material), and quantity in base units.
The server validates finite precision, stock ownership, tracking mode, pinned
ingredient membership and sufficient stock under the material-ledger lock.
Duplicate buckets are aggregated for availability checks before any movement.
The existing batch stamp, occupancy, frozen record, consumption movements and
batch additions commit together. Failed validation writes none of them.

`get_brew_day_plan(batchId)` reads the pinned recipe and available source buckets
for the form. `get_brew_record(batchId)` returns immutable revisions and their
linked additions. Reads retain existing Admin/Brewer scope. All writes use
Admin/Brewer and a stable request ID.

## One correction pattern for #622, #623 and #647

Add nullable `material_movements.compensates_id`, with a unique same-tenant
reference to an original movement. Its trigger requires the exact opposite
quantity in the same material/location/bin/lot and preserves frozen cost facts.
The compensating movement uses existing type `adjustment`; it cannot use a
positive `consumption` or negative `receipt`, which violate existing sign rules.
Receipt-cost readers in #647 must exclude superseded receipt facts explicitly;
this change does not introduce a valuation model.
A compensation cannot compensate another compensation. Original ledger rows
remain immutable. Replacement movements link to their owning corrected
business record, so history explains both the reversal and replacement.

`correct_brew_record(recordId, reason, actuals, process, initialBbl)` appends a
successor record. It reverses that revision's ingredient movements and writes
the replacement actuals in one transaction. The server first takes `private.lock_cellar_workflow`, then uses the existing
vessel-before-batch/occupancy lock order, and takes the material-ledger lock
before validating stock. Corrected volume must also pass the existing vessel
capacity check. It validates
the resulting stock balances, including compensations, before committing.
A concurrent correction of the same revision fails with a reload instruction.

A changed knockout volume posts the delta as an existing `measurement` volume
adjustment linked to the correction. Never rewrite occupancy.initial_bbl.
Vessel and brew date remain those of the original physical event. A correction
cannot turn the original brew into a different physical brew.

Refuse correction if that batch has a cellar transfer, later addition,
packaging run started/closed, ended occupancy, completion or filed report
that depends on the facts being corrected. Explain which dependency blocks it.
The v1 correction boundary is intentionally conservative: correct an unused
record, never silently reinterpret downstream lots or a filed period.
A failed correction preserves the original and writes no compensation.

## Shared screens and proof

Record brew day and the frozen brew sheet use shared E fields and view bodies
for inventory and live adapters. Show planned versus actual ingredient quantities,
units and lots. The correction entry shows the original revision and reason.
Update the staff guide and generated API reference when the gate lifts.

Start with failing database tests for an actual ingredient commit, insufficient
stock atomicity, tracked-lot identity, recipe-free confirmation, changed master
data after recording, duplicate replay and cross-tenant/role refusal. Prove an
unused-record correction changes stock and volume once, preserves the original,
and rejects each downstream dependency without partial writes. Add shared-view
composition and real browser proof. Run the full repository suite, typecheck,
lint, simplify/explain review and independent review before delivery.
