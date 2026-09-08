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
- complete_batch / reattribute_loss: included here as Task 6 because Cellar map and Monthly compliance still show them gated after 5 and 9.
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

### Task 1: Durable taproom count snapshot

**Files:** baseline tables + `record_taproom_count` + `get_taproom_count_snapshot`

**Interfaces:**
- `taproom_counts (id, brewery_id, location_id, counted_on date, counted_by, created_at)` unique `(location_id, counted_on)`
- `taproom_count_lines (count_id, sku_id, qty_expected numeric, qty_counted numeric, movement_id uuid null)`
- `record_taproom_count({ locationId, countedOn, lines: [{ skuId, qtyCounted }] })` warehouse/admin
  - `qty_expected` from POS sales since last count (0 if no POS)
  - delta = previous on-hand at location − qtyCounted (for packaged SKUs). If delta > 0, insert `depletion` movement of −delta and store `movement_id`. If delta = 0, `movement_id` null.
  - Always insert header+lines.
- `get_taproom_count_snapshot({ locationId, countedOn? })` latest.

- [ ] **Step 1:**

```ts
it("a matching count writes a snapshot and no movements", async () => {
  // on-hand 4 at taproom for sku; count 4
  const r = await runCommand("record_taproom_count", { locationId: tapId, countedOn: "2026-09-07", lines: [{ skuId, qtyCounted: 4 }] }, warehouseCtx);
  const { data: mvs } = await admin.from("inventory_movements").select("id").eq("type", "depletion").eq("sku_id", skuId);
  expect(mvs!.length).toBe(0);
  const { data: lines } = await admin.from("taproom_count_lines").select("qty_counted,movement_id");
  expect(Number(lines![0].qty_counted)).toBe(4);
  expect(lines![0].movement_id).toBeNull();
});

it("a short count posts depletion equal to the gap", async () => {
  // on-hand 4, count 2 → depletion qty -2, channel taproom
});
```

- [ ] **Step 2–5:** Implement. Commit `feat(taproom): weekly count snapshot posts only the depletion gap`

---

### Task 2: Variance report

**Files:** view `taproom_variance` + query `get_taproom_variance`

**Interfaces:**
- Per brand, window 4 or 12 weeks: sum expected, sum counted, variance = counted − expected. Exclude lines whose sku was `not_in_inventory` (interval flag, Task 3). Never writes movements.

- [ ] **Step 1:** Two weeks Hazy expected 3 counted 2 each → variance −2 over 4 weeks. No POS → expected 0, report still returns counted (spec: empty expected column / empty report when no POS — **follow the screen state "no POS": report is empty, counts still post**). Test both.

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
- Inserts opposite qty, same type/channel/dest_state/sku/location/bin, `compensates_id = original`. Reject if original already compensated. Reject types that have a compound compensation (`sale_removal` from a shipment → use `return_shipment`). Allowed: `adjustment`, `opening_balance`? **Only `adjustment`, `loss`, `sample`, `destruction`, `depletion` (if not count-owned — count-owned reverse is a new count).** Simplest v1: allow reverse of `adjustment` and `loss` only; depletion reverses via a new count. Document that in the SKU detail screen remaining gate if needed.

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
