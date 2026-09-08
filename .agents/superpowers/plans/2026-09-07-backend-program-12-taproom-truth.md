# Program 12 — Taproom counts, variance, and tap board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The weekly count is the inventory source (posts depletion); POS is expected-only. A zero-variance count still writes a durable snapshot. The tap board swap is one RPC. Nothing on the board posts to the FG ledger.

**Architecture:** New count header/lines; new `keg_taps` / tap intervals as §16.13; `reverse_inventory_movement` with a structured compensation link. `staff_role = taproom` is added with its per-role RLS as the first task, per `.agents/superpowers/specs/2026-09-08-mgr-taproom-role-rls.md` (§16.16 item 3): the enum value, a narrowed `is_staff_of`, the `taproom_can(brewery, table)` predicate every `staff_read` policy consults, and `tests/rls-taproom.test.ts` walking every table as a taproom user.

**Tech Stack:** Same as Program 1. `lib/commands/taproom.ts` (already from Program 7).

**Spec:** Schema §16.13–16.15. Weekly count / Variance / Tap board / Kick / Swap screens. Remainder index recommended defaults for q2/q4/guest keg. Parent plan. DRIFT.md tap identity — guest create stays gated until interval has label+size.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Programs 2 and 7 merged (bins, keg events). Program 4 channels (depletion tax).
- Count posts `depletion` movements (negative qty, channel = Taproom, dest_state null). POS does not post.
- Zero-variance: header+lines persist, **zero** movement rows.
- Swap closes interval A and opens B in one RPC; carries `open_interval_id` and requires `closed_at is null` (compare-and-swap).
- Remaining fill: chips only (`empty` | `quarter` | `half`). Stored as `closing_fill numeric` 0, 0.25, 0.5.
- Reverse: new movement with `compensates_id` FK to original; original unchanged. TTB reports include originals and compensations with signed net amounts. Sign must be exact opposite qty and same type/channel/dest_state.
- complete_batch / reattribute_loss: Task 6 remains gated pending the user's completion/loss decision; it is outside count-core implementation.
- TDD, docs:api, staff-guide, nav Taps + Taproom `planned` off.

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | `taproom_counts`, `taproom_count_lines`, `tap_intervals`, `compensates_id` on movements, RPCs |
| `lib/commands/taproom.ts` | count, variance, tap/swap/kick, list_open_taps |
| `lib/commands/inventory.ts` | `reverse_inventory_movement` |
| `lib/commands/production.ts` | `complete_batch` |
| `lib/commands/compliance.ts` | `reattribute_loss` |
| `app/(app)/taproom/` | Weekly count, variance, tap board |
| `tests/taproom-count.test.ts`, `tests/tap-board.test.ts`, `tests/inventory-reverse.test.ts` | Proof |

---

### Task 1: Durable explicit-bucket taproom count core

**Files:** baseline, `lib/commands/taproom.ts`, `tests/taproom-count.test.ts`, exhaustive RLS/RPC tests, command API and staff guide. No count page in this task.

**Interfaces:**
- `taproom_counts (id, brewery_id, location_id, counted_on, counted_by, created_at, prior_count_id)`; unique tenant/location/date; prior identity is constrained to the same tenant and location.
- `taproom_count_lines (id, brewery_id, count_id, location_id, bin_id, sku_id, lot_id nullable, qty_before, qty_counted, movement_id nullable)`; NULL-aware unique count/bin/SKU/lot grain and composite tenant-safe foreign keys. Both tables are append-only.
- `get_taproom_count_snapshot({ locationId })` returns all current movement buckets, including historical zero balances, safe bin/SKU labels, today's brewery-local date, prior count identity, and a revision binding relevant movement IDs and prior count. SQL aggregation reads beyond API row limits. No raw lots or printed lot codes are exposed.
- `record_taproom_count({ locationId, countedOn, revision, lines: [{ binId, skuId, lotId: UUID|null, qtyCounted }] })` permits Admin, Warehouse, and Taproom. Quantities mean remaining whole packaged units. A partly full keg counts as one until gone; fill chips never enter the ledger.
- Authenticate → claim/replay request → count-scope advisory lock → existing global inventory ledger lock → validate brewery-local current date, chronology, revision and complete exact bucket keys → save header/all lines and only negative per-bucket depletion → freeze result. Replays precede stale/same-day checks; changed payload reuse conflicts.
- `qty_before` is current ledger stock, **not POS expected consumption**. Depletion is `qty_before - qty_counted`, posted only when positive with exactly the supplied bucket's lot identity. NULL means untracked stock, never FIFO or aggregate allocation. Resolve the tenant's named Taproom channel in SQL and freeze its tax treatment; destination state stays null. Matching counts do not require a channel or POS connection.
- Reject omitted/extra/duplicate canonical keys, wrong tenant/location/bin/SKU/lot, negative/fractional/nonfinite quantities, overcounts, stale snapshots and historical/same-day counts atomically. A later chronological count is accepted only on today's brewery-local date.
- `get_taproom_count({ countId })` returns the durable occurrence, prior identity, every saved observation and linked frozen movement BBL.
- Printed-label access and Admin count correction remain pending domain decisions. Without a known physical lot identity, ask Warehouse; do not infer attribution. A mistaken low count cannot be fixed by another depletion-only count or generic adjustment.

- [ ] **Step 1:** Real-Postgres red against absent count RPC/tables. Cover matching header/all lines/no posting; 7→2 posts −5; A4/B2/NULL0→A3/B2/NULL0 changes only A; tracked and untracked coexist; invalid input leaves no partial rows; count/transfer concurrency and stale revisions; exact replay and changed-payload conflict; chronology with brewery-date fixtures; frozen alternate-channel tax/BBL; no POS; more than 1000 movements/buckets; exhaustive count-table RLS positive controls and role-safe writes.
- [ ] **Step 2–5:** Implement, reset only the isolated test stack, run focused tests/typecheck/lint, then fresh spec review followed by quality review. Parent runs grouped full proof. Commit `feat(taproom): durable explicit-bucket counts post only depletion` after focused proof. Program 12 stays incomplete until remaining tasks and gates are resolved.

---

### Brand-owned pours (before tap intervals)

Use existing `formats`, `upsert_format`, `list_formats`, and Catalog forms.
Poured rows require same-tenant `brand_id`, name and positive finite ounces;
all package facts are null. Names are unique per brand, while packaged names
remain unique per brewery. Pours cannot be SKUs, components or BOMs. Brand
filtering returns the complete pour vocabulary under RLS. Admin/Sales keep
catalog writes; Taproom only reads. Catalog creates/edits pours under their
brand; global New Format creates packages. No fixed keg-format ratio or
second format identity table (§16.16 decision 2).

### Task 2: Variance report

**Files:** view `taproom_variance` + query `get_taproom_variance`

**Interfaces:**
- Per brand, window 4 or 12 weeks: POS serving-volume expectations remain a separate projection/snapshot from physical count `qty_before` and `qty_counted`. Actual consumption comes from count-owned depletion, not summing remaining stock. Exclude guest/untracked intervals as specified by Task 3. Variance is expected consumption minus actual consumption (§16.15). Never writes movements. Without POS, the variance report is empty and the count's expected-consumption column is empty; physical counts still post depletion.

- [ ] **Step 1:** Two weeks Hazy expected consumption 3 and count-derived actual consumption 2 each → variance +2 over 4 weeks (6 expected − 4 actual). No POS → empty expected-consumption column and empty variance report; counts still post depletion. Test both.

- [ ] **Step 2–5:** Commit `feat(taproom): variance by brand is reported, never posted`

---

### Task 3: Tap intervals and `swap_keg` / `kick_keg` / `tap_keg`

**Files:** `tap_intervals` table, RPCs

**Interfaces:**
```sql
create table tap_intervals (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  location_id uuid not null,
  tap_number text,                 -- optional, not unique
  sku_id uuid,                     -- null when not_in_inventory guest (gated create)
  label text,                      -- guest name; null when sku_id set
  nominal_bbl numeric,
  opening_fill numeric not null default 1 check (opening_fill in (0.25,0.5,0.6,1)),
  closing_fill numeric check (closing_fill in (0,0.25,0.5)),
  not_in_inventory boolean not null default false,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid not null,
  closed_by uuid,
  close_reason text,
  unique (id, brewery_id)
);
```

- `swap_keg({ openIntervalId, incomingSkuId, tapNumber?, incomingOpeningFill?, closeFill, closeReason? })` one RPC: update A `closed_at` where `id = openIntervalId and closed_at is null` (0 rows → raise `'already swapped'`), insert B. No inventory_movements.
- `kick_keg({ openIntervalId, closeFill, reason })` close only.
- `tap_keg({ skuId, locationId, tapNumber?, openingFill })` open on empty tap.
- `list_open_taps({ locationId })`
- Guest create (`not_in_inventory` + label + nominal_bbl) ungates when label and nominal size are stored; kick of an existing guest interval is allowed.

- [ ] **Step 1:** Swap twice with the same `openIntervalId` — second raises already swapped. Kick leaves remaining open stock (no ledger). list_open_taps returns B not A.

- [ ] **Step 2–5:** Commit `feat(taps): swap is one RPC with compare-and-swap on the open interval`

---

### Task 4: `reverse_inventory_movement`

**Files:** `inventory_movements.compensates_id uuid unique` FK to `inventory_movements(id)`, command

**Interfaces:**
- `reverse_inventory_movement({ movementId, note })` admin/warehouse
- Inserts opposite qty, same type/channel/dest_state/sku/location/bin, `compensates_id = original`. Reject if original already compensated. Reject types that have a compound compensation (`sale_removal` from a shipment → use `return_shipment`). Allowed: `adjustment`, `opening_balance`? **Only `adjustment`, `loss`, `sample`, `destruction`, `depletion` (if not count-owned — count-owned correction remains gated pending the Admin exact-frozen-reversal + linked corrected-count decision).** Simplest v1: allow reverse of `adjustment` and `loss` only; count-owned depletion cannot be reversed by another depletion-only count; its correction remains gated. Document that in the SKU detail screen remaining gate if needed.

SKU detail writes `reverse_inventory_movement [SCHEMA-GATE…]` — ungate for adjustment/loss; keep sale_removal pointing at Return shipment.

- [ ] **Step 1:** Reverse an adjustment −1 → new +1 with compensates_id; second reverse raises; TTB generate (if Program 9 exists) nets to zero.

- [ ] **Step 2–5:** Commit `feat(inventory): structured reversal link for adjustment and loss`

---

### Task 5: Tap board + weekly count pages, ungate, docs

Live Weekly count, Variance, Tap board, Kick, Swap. Nav Taproom + Taps. Guest create ungates with label and nominal size. `bun run docs:api`. Browse.

Commit `docs: taproom count and tap board live`

---

### Task 6: `complete_batch` and `reattribute_loss` (close remaining production/compliance gates)

**Files:** production.ts, compliance.ts, `volume_adjustments` origin columns

**Interfaces:**
- `complete_batch({ batchId, lossBbl, classification: "evaporation"|"dump"|"packaging"|"other" })` one RPC: `batches.closed_at`, close remaining occupancies, `volume_adjustments` row with classification. Reject if an open packaging run still points at an occupancy of this batch.
- `reattribute_loss({ adjustmentId, classification })` updates **nothing on the ledger row**; inserts a compensating pair? Spec said never identify from note. Store classification on `volume_adjustments.classification` at insert time only — **reattribute** writes a new adjustment reversing the old class and a new one with the new class, same bbl, linked by `compensates_id`. If that is too heavy, **defer this task** and keep the Monthly compliance loss verb gated.

**If Task 6 is still ambiguous at execution, stop and ask.** Do not invent a class enum beyond the four strings above.

- [ ] **Step 1 (complete_batch only if Task 6 proceeds):** Open run blocks complete; after close run, complete_batch sets closed_at and writes loss adjustment.

- [ ] **Step 2–5:** Commit `feat(production): complete_batch closes occupancies and records classified loss` — or skip with the gate still on.

---

## Validation

```bash
bunx vitest run tests/taproom-count.test.ts tests/tap-board.test.ts tests/inventory-reverse.test.ts tests/app-screen-parity.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Shipping taproom role with P-staff | High | Role ships atomically with narrow RLS |
| Guest keg create without identity columns | High | Stay gated; DRIFT item |
| Count posting POS sales | High | Test: POS rows exist, count still posts from on-hand vs counted, not from POS |
| Inventing loss reattribution | Medium | Task 6 may stop |

## Acceptance

- [ ] Zero-variance count is durable
- [ ] Depletion is the only taproom FG write from the count
- [ ] Swap cannot leave an interval open
- [ ] Taproom role ships with the approved authorization matrix
- [ ] q2/q4 defaults used unless Ted overrode
