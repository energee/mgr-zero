# Program 12 T4 — accepted implementation contract

Status: accepted/reviewed implementation contract. The user accepted all three proposals on 2026-09-09: the completion/removal-class model, the narrow Taproom print projection, and latest-count-only Admin correction. The contract is approved for implementation.

Source basis: committed tree `f94944328676151cdf876bd5f86cb28519fd5e7c` (`fix(inventory): resolve on-hand labels outside safe view`), whose only change after `b08cae722abc1501cb92411a6fc1a04d3ea6d080` is the get-on-hand label fix. This branch also inherits the `71bfa75501a11aa7489ffdbafc620726c4256753` repack stock-check serialization guard. Neither change alters the reviewed cellar/count writer ownership.

## Existing behavior to preserve

- `private.taproom_count_snapshot`, `get_taproom_count_snapshot`, `get_taproom_count`, `list_taproom_counts`, `record_taproom_count`, and `get_taproom_draft_projection` own count preparation, durable observations, exact bucket depletion, current expected comparison, chronology, stale revisions, and replay.
- `taproom_counts.created_at` is currently both audit time and the POS comparison boundary. Correction requires separating those meanings without moving existing observations.
- Counts post only shortage `depletion` to the exact bin/SKU/lot bucket. The Taproom channel is selected by immutable `sale_channels.system_code = 'taproom'`, not its editable name, and tax treatment and BBL freeze on the movement.
- Taproom may read scoped movement/stock facts and opaque lot UUIDs, but RLS denies `lots`, packaging runs, compliance history, customers, and recipients. Admin/Warehouse currently get lot codes indirectly through `get_bin_move_stock`; Taproom gets numbered worksheet rows.
- `reverse_inventory_movement` remains a standalone Admin/Warehouse command for unowned `adjustment` and `loss` only. It must not become a count-correction entry point.
- `volume_adjustments` is append-only physical cellar history. `occupancy_volumes` currently includes every adjustment and subtracts physical packaging `bbl_drawn`. The compliance report currently classifies only finished-goods `inventory_movements`.
- A transfer into an occupied vessel keeps the receiving occupancy's batch identity. An empty target gets an occupancy with the source batch and `initial_bbl = 0`. That existing identity rule controls cross-batch completion accounting.

## Shared schema and security rules

All schema work edits `supabase/migrations/00001_baseline.sql`; there is no second migration. New tenant references use composite brewery-safe foreign keys, and every referenced `(id, brewery_id)` candidate key is declared before its FK. New ledger and correction rows are append-only; authenticated and service roles receive no direct insert/update/delete privilege. Because the baseline later grants `service_role` all tables, the explicit DML revokes for each new table and new append-only surface must appear after that blanket grant. Public entry points are `security definer`, use `search_path = ''`, derive actor, brewery, current role, tax, volume, and provenance in SQL, and are granted only to `authenticated`. Private helpers receive no application or service execute grant, including the effective-count and cellar-workflow helpers.

Every command authenticates before `private.claim_command_request`. A completed exact replay returns before lifecycle/staleness refusal; reuse of a request ID with changed input remains `MG409`. Validation finishes before the first durable write. Tenant, role, source identity, uniqueness, and signed-volume invariants are database-enforced, not trusted to registry validation or UI.

No approved path adds a generic adjustment, mutable ledger classification, note parsing, raw `lots` access, provider action, dependency, or external filing-line guess.

## A. Narrow Taproom print projection

### API and data exposure

Add query `get_taproom_print_labels({ locationId, revision })` in `lib/commands/taproom.ts`, roles Admin, Warehouse, Taproom. Its SQL RPC accepts brewery, location, and the exact revision returned by `get_taproom_count_snapshot`.

After current-role authorization and owned `kind = 'taproom'` location validation, the RPC obtains one current `private.taproom_count_snapshot`. A different revision returns `MG409`. It then returns only snapshot buckets with `qty_before > 0`, ordered exactly as the snapshot, with:

- stable worksheet row number;
- bin ID/name;
- SKU ID/name, brand ID/name, and package-volume label already safe for Taproom;
- lot UUID and lot code for tracked stock;
- quantity on hand;
- `Untracked` for a null lot.

Worksheet ordinality is assigned against the complete ordinary snapshot before positive rows are filtered, so a printed row number matches the same row on the count worksheet. Revision and positive rows come from that one snapshot invocation. The projection includes no zero or history-only bucket, packaging run ID/date, packaged date, best-by date, movement history, compliance trace, customer, recipient, or other lot metadata. It does not grant `SELECT` on `lots` or add `lots` to `taproom_can`. The existing exhaustive Taproom RLS test must continue to observe no raw lot rows.

### UI and docs

`app/(app)/taproom/page.tsx` prepares the ordinary count snapshot first, then requests the print projection with that revision. It should use this one projection for all three permitted roles instead of widening the existing `get_bin_move_stock` workaround. `app/(app)/taproom/count-form.tsx` renders a print-only worksheet and a plain button calling native `window.print()`. It adds no PDF/label library and sends nothing externally. Normal on-screen count rows retain their existing role presentation unless the reviewed UI chooses to show the approved projected code there; the approved minimum is printable output.

Update the Weekly count record in `components/mgr/screens.tsx`, generated API metadata/reference, and the Taproom section of `content/docs/staff-guide.mdx`. Customer copy must say that only current positive Taproom stock is printable and that full lot history remains Admin/Sales compliance data.

### Meaningful red proof

Before implementation, prove the absent query. Then prove a Taproom user receives a positive tracked code and positive untracked row, zero/history-only and foreign-location rows are absent, stale revision is refused, editable channel/location names do not affect identity, and Sales/Brewer are denied. Re-run the exhaustive Taproom table/RPC matrices to prove raw `lots` remains denied. Browser proof must inspect the worksheet at desktop and 375 px and exercise the native print button without adding a provider flow.

## B. Latest-count Admin correction

### Minimum representation

Add to `taproom_counts`:

- `observed_at timestamptz not null default now()`; existing/root inserts set it to their observation time. POS bounds and effective count chronology move from `created_at` to `observed_at`. `created_at` remains the immutable database audit time.
- `corrects_count_id uuid null`, with a composite `(corrects_count_id, location_id, brewery_id)` FK to `taproom_counts` and a unique non-null correction target. A correction can point only to a root count; one root has at most one replacement.
- `correction_reason text null`; roots require null and corrections require a nonempty trimmed value. This is the durable Admin explanation. Movement notes may repeat it for display but are not its owner.

Replace the current one-row-per-date constraint with a partial unique index for roots only: `(brewery_id, location_id, counted_on) where corrects_count_id is null`. A correction copies its root's `location_id`, `counted_on`, `observed_at`, and `prior_count_id`, while `created_at` and `counted_by` record the actual Admin correction.

Add `taproom_count_lines.corrects_line_id` as a unique tenant-safe FK to the exact root line. Every replacement occurrence has one line for every root line; the source and replacement line must have identical location/bin/SKU/lot and `qty_before`. This line link is required so unchanged movement attribution remains explicit.

Add `inventory_movements.correction_source_id` as a unique tenant-safe self-FK used only by the replacement depletion leg. Do not reuse shipment `source_movement_id`. Extend the existing `compensates_id` integrity trigger narrowly so an exact positive compensation of a count-owned depletion is valid only when its `ref` is the linked correction count. `reverse_inventory_movement` and `canReverseMovement` remain restricted to standalone adjustment/loss.

For a replacement depletion, database integrity requires:

- source is the root line's count-owned `depletion` movement;
- correction header and replacement line structurally point to that root count/line;
- identical brewery, location, bin, SKU, lot, movement type, channel, tax treatment, destination state, and package class;
- negative quantity equal to `corrected_qty - original.qty_before`;
- frozen BBL proportional to the original movement's frozen unit rate, never today's format;
- `ref` equal to the correction count.

The existing line shape constraint must distinguish roots from corrections. Root behavior is unchanged. A correction line may have no new movement when it is unchanged or corrected back to `qty_before`; effective BBL is then derived from the linked root line as described below, not inferred from a missing row. Narrowly change `inventory_movements.removal_shape` so positive `depletion` is legal only when `compensates_id is not null`; the immediate integrity trigger and deferred correction-graph proof must establish the exact authorized count compensation. Positive standalone depletion remains impossible.

### Command

Add `correct_taproom_count({ countId, corrections: [{ lineId, qtyCounted }], reason })` to `lib/commands/taproom.ts`, Admin only. `reason` is nonempty audit text. Callers send only changed root-line IDs and new quantities; SQL copies the full replacement occurrence.

Under the existing location count advisory lock followed by the existing global inventory ledger lock, the RPC locks the root header and all root lines. It accepts only an uncorrected root that is the effective latest count at its location. It refuses when any later root or correction lineage exists, when the root already has a replacement, or when the count/location/line belongs elsewhere.

This command corrects mistaken-low observations only. At least one quantity must increase. Every quantity is a finite whole number greater than the root `qty_counted` and no greater than root `qty_before`; duplicate, unchanged-only, decreased, extra, or foreign line inputs fail atomically. Every changed line must have an original count-owned depletion.

The runnable insert order is fixed:

1. Validate the complete root graph under the count advisory and ledger locks, then insert the replacement header first with copied date/observation/prior/location facts and the durable reason.
2. Insert each exact compensation and optional smaller replacement depletion. The immediate BBL trigger may inspect the already-existing correction header, root count, root line, and root movement; it must not require a replacement line that has not been inserted yet.
3. Insert every replacement line with its `corrects_line_id`; unchanged lines own no new movement.
4. At transaction commit, an initially deferred correction-graph constraint trigger verifies the reciprocal graph as a whole.

That deferred proof runs for relevant inserts on `taproom_counts`, `taproom_count_lines`, and `inventory_movements`, so a header-only correction or orphan movement cannot escape by omitting the final table. It requires exactly one replacement line for every root line and no extras; identical frozen bucket and `qty_before`; copied header provenance; no movement on unchanged lines; exactly one compensation for every increased line; the correct smaller replacement or none when corrected to `qty_before`; and no correction-owned movement without its matching changed line. It validates `corrects_count_id`, `corrects_line_id`, `compensates_id`, `correction_source_id`, `ref`, quantities, BBL, package class, channel, tax, state, and exclusive source-link use. Ordinary FKs remain immediate. No session flag or disabled-trigger path is allowed.

Original header, lines, and movements never change.

### Effective-count reads and time

Use one private SQL helper/view for effective count headers and effective line BBL; all count consumers reuse it.

- A root with no correction is effective as-is. A corrected root resolves to its one replacement.
- Snapshot prior identity, `list_taproom_counts`, saved receipt rendering, completed variance, and current draft projection use the effective ID.
- `list_taproom_counts` returns one logical occurrence per root date, with root ID, effective ID, and corrected-at/by metadata; it does not show the replacement as a second weekly count.
- POS interval boundaries use `observed_at`. The replacement copies the root observation timestamp, so correction never expands or shortens the POS interval.
- For an unchanged replacement line, effective actual BBL is the root line's original movement once. For a changed line, it is the replacement depletion BBL, or zero when corrected back to `qty_before`. Original plus compensation must never also enter count-derived variance.
- The next ordinary count uses the replacement as `prior_count_id`, reads stock after compensation/replacement, and binds that effective ID in its revision.
- Inventory/compliance ledgers date the compensation and replacement by their actual `created_at`. A later correction therefore appears as signed entries in the correction period. Existing filed snapshots are never regenerated or changed.

### UI, docs, and proof

On the saved-count receipt in `app/(app)/taproom/page.tsx`, only Admin sees **Correct count**, and only for an eligible latest root. Reuse the existing count form/state patterns in `app/(app)/taproom/count-form.tsx` and `lib/mgr/taproom-count-state.ts`; do not create a generic correction framework. The correction surface shows frozen recorded/before quantities, accepts only increases, requires a reason, and preserves uncertain-request retry behavior. Warehouse and Taproom see correction history but no correction action.

Update the Weekly count screen contract, API docs, and staff guide. Remove the current “cannot be corrected” copy only when the live path is proven; retain the latest-only and Admin-only limits in user language.

First reds must include:

- `7 -> 2`, then correction to `4`: original `-5`, exact frozen `+5`, replacement `-3`, current stock `4`, effective count actual `3` units;
- format and Taproom channel edited after the root count: replacement keeps original BBL, channel ID, tax treatment, bucket, lot, and package class;
- a multi-line count where one line changes and one does not: completed and draft variance count each effective line exactly once;
- POS `(prior.observed_at, current.observed_at]` bounds unchanged by a later correction;
- next count points to the correction and starts from corrected stock;
- later root count, already-corrected root, decreased/over/foreign/duplicate input, non-Admin, and insufficient structural provenance all refuse with no partial rows;
- exact replay and two concurrent corrections converge to one replacement; changed request reuse conflicts;
- original rows remain unchanged, direct DML remains denied, correction entries appear only in their actual compliance period, and an existing filed snapshot byte-for-byte does not change.
- privileged transaction tests for header-only correction, missing/extra line, orphan compensation/replacement, unchanged-line movement, wrong root/bucket/rate, or replacement without its exact compensation fail at commit with constraints enabled.

## C. Batch completion and typed reconciliation

### Minimum representation

Add enum `cellar_removal_class = loss | sample | taproom | destruction`. Widen `volume_adjustments.bbl` from `numeric(10,3)` to unconstrained `numeric`. Enforce `bbl <> 0`, `bbl not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`, and `bbl = round(bbl, 8)`. Unconstrained storage retains at least the old seven-integer-digit range and all eight fractional digits of frozen `inventory_movements.bbl`; the equality check rejects a nonzero ninth fractional digit instead of letting a typmod silently quantize it. Add `unique (id, brewery_id)` before any new composite FK, plus these columns:

- `removal_class cellar_removal_class null`;
- `tax_treatment tax_treatment null` and `dest_state text null`, frozen only where the class requires them;
- `affects_occupancy boolean not null default true`.

The last column resolves an existing representation mismatch. Physical packaging removes `bbl_drawn` from `occupancy_volumes`, while completion accountability uses frozen packaged output. A completion reconciliation includes packaging yield loss and therefore must not also reduce vessel volume. Manual physical gain/measurement/loss/dump rows keep `affects_occupancy = true`; completion and reclassification legs use `false`. Update `occupancy_volumes` to sum only adjustments that affect occupancy. A deferred structural constraint fires for adjustment, batch-pointer, and reclassification-leg changes and permits `affects_occupancy = false` only for a generic-loss root referenced by exactly one same-tenant batch completion or for a complete reciprocal reclassification pair sourced from such a root. A standalone or manually manufactured nonphysical adjustment fails at commit.

Add nullable `batches.completion_adjustment_id` with a tenant-safe unique FK to `volume_adjustments`. It points only to the optional root generated by that batch's completion, and the deferred structural constraint proves that root has the same brewery and an occupancy belonging to that batch's scope, is negative generic loss, is nonphysical, and is not a reclassification leg. This pointer is the system origin; `Completion Reconciliation` is derived display text and never parsed from `note`.

Existing negative `reason = loss` rows classify as `loss`, negative `dump` rows as `destruction`, and signed `gain`/`measurement` rows remain non-removal baseline adjustments. Constraints reject tax/state/class combinations outside the accepted model. A direct cellar `taproom` row freezes the tax treatment from `sale_channels.system_code = 'taproom'`; editable name is irrelevant. A `sample` row requires a two-letter destination state, matching finished-goods sample input. Loss/destruction have neither tax nor destination state.

### Exact calculation

The completion scope is every occupancy whose stored `batch_id` is the selected batch. Because the current blend model keeps the receiving occupancy's batch identity, cross-batch transfer volume changes accountability at the transfer boundary:

```text
baseline = sum(scoped occupancy.initial_bbl)
         + sum(transfer.bbl entering scope from another batch)
         - sum(transfer.bbl leaving scope for another batch)
         + sum(signed physical gain/measurement adjustment BBL in scope)

packaged = sum(frozen positive inventory_movements.bbl)
           for production_in movements linked to outputs of closed packaging runs in scope

attributed = sum(transfer.loss_bbl leaving scoped occupancies)
           - sum(signed BBL of all classified cellar-removal rows in scope,
                 including completion roots and reclassification legs)

residual = baseline - packaged - attributed
threshold = greatest(0.05 BBL, baseline * 0.005)
```

Same-batch transfers affect neither baseline nor packaged totals. Cross-batch inbound is owned by the receiving batch; outbound leaves the source batch before packaging. Frozen output movements, not current format volume, planned output, or `bbl_drawn`, own packaged BBL. Numeric arithmetic remains exact; rounding is display-only.

### Completion command and locks

Add `get_batch_completion_preview({ batchId })` and `complete_batch({ batchId })` in `lib/commands/production.ts`, both Admin/Brewer. A single private SQL calculation helper owns the formula and blocker list. The preview is advisory and side-effect free; the command reruns the same helper under its locks. The command accepts no caller-supplied loss amount or cause/classification.

Add one private transaction-scoped `private.lock_cellar_workflow(p_brewery)` advisory-lock helper, keyed by brewery. Exactly these public writers must call it after authorization and successful claim/replay, but before any vessel, batch, occupancy, adjustment, or run row lock; lifecycle/source check; or source-table write. The committed `f949443` insertion points are explicit:

- `record_brew_day` (`00001_baseline.sql:4517`): after replay at `:4526`, before the vessel `FOR UPDATE` at `:4528`;
- `record_cellar_transfer` (`:4563`): after replay at `:4577`, before the target-vessel `FOR UPDATE` at `:4579`;
- `record_fermentation_reading` (`:4619`): after replay at `:4629`, before `private.assert_open_occupancy` at `:4631`;
- `schedule_packaging_run` (`:4695`): after replay at `:4704`, before the brand/open-occupancy checks at `:4706` and `:4709`;
- `update_packaging_run` (`:4722`): after replay at `:4731`, before the run `FOR UPDATE` at `:4733`;
- `close_packaging_run` (`:4775`): after replay at `:4792`, before the run `FOR UPDATE` at `:4794`;
- new `complete_batch`: after replay, before its calculation, inventory-ledger table lock, or batch/occupancy locks;
- new `reattribute_loss`: after replay, before its source-root/allocation locks or remaining-amount check.

The only current callers that can mutate or validate these cellar workflow facts are the six committed public writers above: `private.assert_open_occupancy` is called by fermentation/schedule/update, and `private.replace_packaging_run_outputs` by schedule/update; close writes settled outputs directly. Those internal helpers, plus completion/reclassification calculation helpers, run beneath the public caller's gate and never acquire it after a lower lock. There is no current public physical `volume_adjustments` writer in `f949443`; if T4 adds one, that exact public entry point must join the gate after replay and before its first source check or write. Inventory-only commands do not join the cellar gate, and completion never acquires their document/count advisory locks.

Under the cellar gate, `complete_batch` acquires the existing global inventory-ledger table lock first, then locks its batch and scoped occupancies in stable ID order, reruns the shared calculation, and commits. It takes no coarse lock on `transfers`, packaging tables, outputs, or `volume_adjustments`: every application writer of those mutable formula sources is already serialized by the cellar gate, and linked output movements are immutable. Existing writers retain their lower row-lock orders after acquiring the gate. Add the required comment: `ponytail: one cellar writer per brewery; replace with narrower shared workflow locks if cellar throughput requires it.`

Refuse atomically when the batch is absent/foreign, unbrewed, already completed by a different request, has no authoritative occupancy, has a non-positive baseline, has any open packaging run on a scoped occupancy, or produces a negative residual at full numeric precision. A negative residual is a data conflict and never silently becomes gain, loss, or zero. Open occupancies owned by the batch are locked and closed by this transaction; they are not an excuse to omit their facts.

When residual is at least the threshold, append exactly one `bbl = -residual`, `reason = loss`, `removal_class = loss`, `affects_occupancy = false` root against a deterministic scoped occupancy and set `batches.completion_adjustment_id`. Below threshold, append no row and leave that pointer null. Use one close time equal to `greatest(now(), max(scoped started_at))`, then set it on the batch and every still-open scoped occupancy so every supported future `started_at` produces a valid range. Return batch ID, close time, baseline, packaged, attributed, residual, threshold, and optional adjustment ID. Exact replay returns the frozen result; a fresh request against the closed batch refuses.

The deterministic occupancy is the latest scoped occupancy by `(started_at, id)`, preferring one open at lock time. It is only the existing tenant/batch anchor; it does not change the batch-level formula.

### UI, docs, and proof

Implement the live action from `app/(app)/cellar/page.tsx` with the existing `CommandForm` pattern. Its review shows server-derived baseline, frozen packaged, prior attributed, threshold, and predicted residual; final submit calls the same authoritative RPC and handles stale/uncertain responses. Update `components/mgr/screens.tsx`, the production/schema specs, generated API docs, and the staff guide.

First reds must prove open-run refusal; exact-at-threshold and below-threshold behavior; negative residual refusal; frozen packaged BBL after format edit; same-batch split cancellation; cross-batch inbound/outbound ownership; transfer losses and signed prior adjustments; multiple occupancies; `bbl_drawn` differing from packaged BBL without double-changing `occupancy_volumes`; future-started occupancy closure; all open scoped occupancies closing atomically; one completion under replay/concurrency; role/tenant denial; and unchanged rows after every refusal.

Add deterministic two-connection lock proofs with barriers and bounded timeouts. Hold a successful real `close_packaging_run` transaction open, start completion on connection two, observe it waiting on the shared gate, commit close, and require completion to see the committed outputs. Repeat with a successful transfer. Then hold successful completion open, start `schedule_packaging_run` and `update_packaging_run` attachment against the formerly open occupancy, commit completion, and require each waiting writer to recheck and refuse without run/output changes. In reverse order, a committed scheduled run makes completion refuse. Finally hold the inventory ledger lock in an inventory-only writer while completion waits and prove that writer finishes without requiring the cellar gate. Unordered `Promise.all` is not adequate evidence.

## D. Completion-loss review, reclassification, and compliance projection

### Structural reclassification

Add append-only `volume_adjustment_reclassifications` with tenant ID, source completion adjustment ID, positive unconstrained-numeric BBL, target class, optional destination state, frozen tax treatment, actor, and audit time. Its BBL check requires a positive value, excludes numeric `NaN` and infinities, and requires equality to `round(bbl, 8)`. Source may repeat for partial allocations; each row is one allocation. It must point to the `batches.completion_adjustment_id` root, whose class is generic loss.

Add nullable `reclassification_id` plus checked `reclassification_leg = reverse | replacement` to `volume_adjustments`, with one unique row per `(reclassification_id, leg)`. The reclassification row is inserted first, then exactly two immutable adjustment legs reference it:

- reverse: positive BBL, class `loss`, no tax/state, `affects_occupancy = false`;
- replacement: equal negative BBL, approved target class, frozen target tax/state, `affects_occupancy = false`.

A deferred database constraint trigger verifies at commit that both legs exist, match brewery/occupancy/amount to all eight decimal places, and have the required opposite signs/classes. It also proves that the source is the nonphysical generic-loss adjustment referenced by the same-tenant batch's `completion_adjustment_id`. The command locks the source and its prior allocations and rejects an allocation above `abs(root.bbl) - sum(existing allocation bbl)` at full stored precision. This preserves the original, supports multiple partial destinations, and keeps net total BBL unchanged.

Add `get_loss_review({ periodStart, periodEnd })` and `reattribute_loss({ adjustmentId, bbl, classification, destinationState? })` in `lib/commands/compliance.ts`, Admin/Sales. The read returns completion roots in the period, source batch, original generic loss, prior allocations, and remaining generic loss. Reattribution accepts only `sample`, `taproom`, or `destruction`; selecting `loss` is a no-op and is refused. Taproom resolves and freezes the current system Taproom channel tax treatment. Sample requires destination state. All other tax/state combinations fail.

`reattribute_loss` authenticates, claims/replays, takes the shared cellar gate, then locks the root and allocation rows, validates the remaining amount, and inserts the allocation plus both legs atomically. Before inserting into an eight-decimal ledger surface, it rejects a caller `p_bbl` that is nonpositive, numeric `NaN`/infinity, unequal to `round(p_bbl, 8)`, or above the exact remaining amount; it never casts through a rounding typmod. Both generated legs copy the accepted allocation exactly. Concurrent allocations cannot exceed the root. Exact replay returns the original allocation; changed payload reuse conflicts. No generic adjustment or standalone inventory reversal can manufacture this shape.

The baseline DDL order is fixed to avoid circular references: first widen and extend `volume_adjustments` and declare `unique (id, brewery_id)`; second create `volume_adjustment_reclassifications`, declare its own `(id, brewery_id)` candidate key, and add its source-adjustment FK; third add the adjustment-to-reclassification composite FK; fourth add the batches-to-completion-adjustment FK after both `batches` and `volume_adjustments` exist. Ordinary FKs are immediate; only the reciprocal whole-graph proof is deferred. Place explicit authenticated/service DML revokes for the append-only surfaces after the baseline's blanket service-role table grant, and grant no private helper directly.

### Compliance projection

Extend the existing report with a cellar-removal breakdown while keeping totals single-counted:

- `figures.removals` remains the additive filing total dimension. Cellar loss/sample/destruction contribute to their matching keys. A cellar Taproom row contributes once under its frozen tax-treatment key.
- `figures.cellarRemovals` is a non-additive explanatory breakdown by `loss | sample | taproom | destruction`. It must be labeled as a breakdown; callers must not add it to `removals`.
- Signed reclassification legs net the old class down and the new class up in the period where the correction is posted. Total removals across all time are unchanged.
- Filed `report_filings.figures` remain immutable snapshots. Re-running another period never updates one.

The exact external filing-line mapping for direct-from-cellar Taproom pours remains unresolved. When a generated period contains a nonzero cellar `taproom` class, return `externalMappingRequired: ['taproom']` and a clear warning. `file_compliance_report` refuses that generated period until a separately approved mapping exists; no acknowledgment bypass or inferred mapping is added in T4. This is the retained manual compliance gate, not a claim about law.

### UI, docs, and proof

Wire the loss review into `app/(app)/compliance/[month]/page.tsx` and its existing form/button owners. Show original generic loss, allocated rows, remaining amount, target class, destination state only for sample, and the unresolved external-mapping warning for direct cellar Taproom. Ungate only the implemented `get_loss_review` / `reattribute_loss` annotations in `components/mgr/screens.tsx`. Update schema/domain/program specs, generated API docs, and the staff guide; do not claim that MGR transmits or legally maps the filing.

First reds must prove a completion with baseline `1.00000000`, packaged `0.94258065`, and residual `0.05741935` returns and stores exactly `0.05741935` in the receipt, root, review, and report. Allocate `0.02000000` and `0.03741935`; remaining must be exactly zero, each reverse/replacement pair must net exactly zero, and the full signed reclassification must leave the all-class total unchanged. Also prove a tiny negative residual refuses at full precision, and caller `NaN`, infinities, and a ninth fractional digit refuse rather than round. Retain reds for target-specific frozen tax/state, editable Taproom channel name using `system_code`, missing system channel, excess/concurrent allocation, wrong source/tenant/role, invalid nonphysical-row structure, exact replay/conflict, direct DML denial, no occupancy-volume effect, no double addition between `removals` and `cellarRemovals`, signed corrections landing in the actual correction period, immutable prior filing snapshots, and refusal to file a period with unresolved cellar-Taproom mapping.

## Sequential implementation cards

### T4a — safe print projection

Owners: baseline RPC/grants; `lib/commands/taproom.ts`; Taproom page/form; Weekly count screen record; API/staff docs; Taproom/RPC/API/screen/browser tests. No schema table or RLS allow-list widening. Finish focused tests, typecheck, lint, browser print proof, then spec and quality review.

### T4b — latest-count correction

Depends on T4a only by shared Taproom files; land after it to avoid competing edits. Owners: baseline count/movement tables, the immediate movement proof, the deferred reciprocal-graph trigger, and private effective-count SQL; `lib/commands/taproom.ts`; existing count state/page/form; variance and draft projection consumers; API/staff docs; count, variance, compliance-period, RLS/RPC, UI/browser tests. Prove the correction core and all existing count invariants before moving on.

### T4c — completion reconciliation

Depends on no count schema semantics but follows T4b because both edit the baseline and generated docs. Owners: schema/program/domain contract text first; baseline volume/batch schema, occupancy view, formula and RPC; the shared gate helper and the six enumerated committed cellar writers; `lib/commands/production.ts`; Cellar page/form and screen record; production/compliance/RLS/RPC/API/browser tests, including the two-connection barriers. This card lands computed completion and the generic root only.

### T4d — loss review, reclassification, and report

Depends on T4c's typed completion root, candidate key, precision checks, and shared cellar gate. Owners: baseline reclassification ledger, deferred structural proof, `reattribute_loss`, report; `lib/commands/compliance.ts`; compliance month page/forms and screen; report types; API/staff docs; compliance/production/RLS/RPC/screen/browser tests. It closes the loss-review gate while retaining the explicit external mapping block for direct cellar Taproom pours.

At each card: write the meaningful red first; edit only the baseline migration; reset and use the isolated test database; run focused real-Postgres tests plus the applicable pure screen/API tests, `bunx tsc --noEmit`, and `bun run lint`; inspect the rendered desktop and 375 px page; review `git diff`; obtain fresh spec review then quality review. Run the grouped full suite and production build after the combined T4 stack, without claiming CI or merge that did not occur.

## Explicit exclusions

No historical count cascade, correction of a correction, mistaken-high count correction, mutable original rows, generic correction framework, extra loss-cause enum, raw lot/history access for Taproom, PDF/label dependency, provider action, legal filing-line mapping, hosted change, second migration, or schema work outside these accepted contracts.

