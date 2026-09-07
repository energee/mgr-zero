# Program 7 — Taproom kegs (not the tap board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keg fleet balances are per pool × size × location × bin, so "36 in the taproom, 40 in storage" is two rows. Staff can acquire, retire, ship, and return empties through named commands.

**Architecture:** `keg_pools` and `keg_events` already exist; Program 2 put `location_id`+`bin_id` on `keg_events`. This program is commands + the Keg fleet screen. The tap board (`keg_taps`, swap, kick, tap) and weekly count stay SCHEMA-GATE.

**Tech Stack:** Same as Program 1. New `lib/commands/taproom.ts` (keg RPCs only).

**Spec:** Schema kegs section. Locations spec Decision 2 (keg ledger has location). Keg fleet screen. Parent plan D6/D7 (park taproom role, counts, taps).

## Global Constraints

- Worktree `.agents/worktrees/backend`. Programs 0–2 required (bins). Programs 3–6 may be merged; this program does not need brands.
- `keg_events.qty > 0`; direction is `reason`.
- One-way kegs stay materials (`container_source = 'one_way_material'`). Do not show them on Keg fleet.
- Lolev-style foreign empties: out of scope (locations spec).
- Parked: `record_taproom_count`, `tap_keg`, `kick_keg`, `swap_keg`, `list_open_taps`, `staff_role = taproom`, POS menus.
- TDD, docs:api, staff-guide, nav Kegs `planned` off.

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | `create_keg_pool` / `update_keg_pool` / `record_keg_event` RPCs if not present |
| `lib/commands/taproom.ts` | keg commands + `list_keg_events` + `get_customer_keg_balance` |
| `app/(app)/kegs/` | Keg fleet |
| `tests/kegs.test.ts` | Proof |

---

### Task 1: Pool commands and location-grain balances

**Files:** taproom.ts, RPCs, views (`keg_bin_totals` from Program 2)

**Interfaces:**
- `create_keg_pool({ name, kind: "owned" | "leased" | "pay_per_fill", vendorId? })`
- `update_keg_pool({ poolId, name?, vendorId?, active? })`
- `record_keg_event({ poolId, kegSize, qty, reason: "acquired"|"retired"|"shipped"|"returned"|"lost"|"found", locationId, binId, customerId?, shipmentId?, note? })`
- `list_keg_events({ poolId? })`
- Query `keg_bin_totals` (Program 2 view): group by pool, size, location, bin.

`shipped` requires `customerId`; `returned` requires `customerId`; location/bin always required (Program 2).

- [ ] **Step 1:**

```ts
it("two locations of the same pool×size are independent balances", async () => {
  const pool = await runCommand("create_keg_pool", { name: "Microstar", kind: "leased", vendorId }, adminCtx) as { id: string };
  await runCommand("record_keg_event", {
    poolId: pool.id, kegSize: "sixth_bbl", qty: 36, reason: "acquired",
    locationId: taproomId, binId: tapBinId,
  }, adminCtx);
  await runCommand("record_keg_event", {
    poolId: pool.id, kegSize: "sixth_bbl", qty: 40, reason: "acquired",
    locationId: storageId, binId: storageBinId,
  }, adminCtx);
  const { data } = await admin.from("keg_bin_totals").select("location_id,qty").eq("pool_id", pool.id);
  const byLoc = Object.fromEntries(data!.map((r) => [r.location_id, Number(r.qty)]));
  expect(byLoc[taproomId]).toBe(36);
  expect(byLoc[storageId]).toBe(40);
});
```

- [ ] **Step 2–5:** Implement RPCs. Commit `feat(kegs): pools and location-grain events`

---

### Task 2: Customer keg balance and shipment-linked ship/return

**Files:** taproom.ts; `get_customer_keg_balance`

**Interfaces:**
- `get_customer_keg_balance({ customerId })` reads `keg_deposit_balances` plus net shipped−returned keg_events for that customer.
- `record_keg_event` reason `shipped` with `shipmentId` (optional until Program 1 return path grows keg events — do not bolt onto `ship_order` in this program; the screen says slice 9. **Do not modify `ship_order_impl`.** Fleet UI records shipped/returned explicitly.

- [ ] **Step 1:** Ship 4 halves to a customer, return 1, balance 3. Deposit cents come from invoice_lines if a deposit was invoiced; if none, kegs_on_deposit from events still shows.

- [ ] **Step 2–5:** Commit `feat(kegs): customer keg balance`

---

### Task 3: Keg fleet page, ungate, docs

Live Keg fleet matching the screen (pool × size rows with location split). Nav Kegs. Ungate `create_keg_pool`, `update_keg_pool`, `record_keg_event`, `list_keg_events`, `get_customer_keg_balance`. Leave tap board writes gated. `bun run docs:api`. Browse.

Commit `docs: keg fleet live`

---

## Validation

```bash
bunx vitest run tests/kegs.test.ts tests/rls-command-boundary.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Implementing swap/tap because the screen is adjacent | High | Park list; screen-command-gates must still see SCHEMA-GATE on those writes |
| Showing one-way kegs on fleet | Medium | Filter `container_source` / pool kind; one-way is a material |
| Auto-posting keg events from ship_order | Medium | Explicitly out of scope until slice 9 |

## Acceptance

- [ ] Microstar 36 / 40 case reads back as two location rows
- [ ] Tap board still gated
- [ ] Weekly count still gated
