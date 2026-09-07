# Program 2 — Locations, bins, and stock transfers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ledger row names a location and a bin; stock can move between buildings without becoming an order; bin-to-bin moves inside one building never become deliveries.

**Architecture:** Phase 1 is already a complete TDD plan — execute it in this worktree, do not copy it. Phase 2 (this file) adds `stock_transfers` and `move_stock_bin`. Phase 3 (deliveries polymorphism) is Program 8.

**Tech Stack:** Same as Program 1. Baseline in-place. Vitest on `mgr_test`.

**Spec:** `.agents/superpowers/specs/2026-09-06-mgr-locations-bins-transfers-design.md` Decisions 1–5. Phase 1 tasks: `.agents/superpowers/plans/2026-09-06-locations-bins-phase1.md`. Parent unification plan.

## Global Constraints

- Worktree `.agents/worktrees/backend`, branch `backend`. Ignore the phase-1 plan header that names `.agents/worktrees/docs/locations-bins`.
- Program 0 and Program 1 merged first (Program 1's `ship_order` / movement inserts must already pass a `bin_id` after phase 1 — phase 1 updates those tests).
- One baseline file. Seeded trio names exactly: `Walk-in`, `Cold`, `Dry`. No bin `kind`. `taproom_pars` is not re-keyed.
- `bin_id NOT NULL` on all three ledgers. Composite FK `(bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id)`.
- `stock_transfers` check `to_location_id <> from_location_id`.
- `receive_stock_transfer` posts both ledger halves or neither (one RPC).
- TDD, docs:api, staff-guide, no Co-Authored-By, no PROGRESS/MEMORY/DRIFT edits.

## File map

| File | Responsibility |
| --- | --- |
| `.agents/superpowers/plans/2026-09-06-locations-bins-phase1.md` | Phase 1 task list (execute as written, path retargeted) |
| `supabase/migrations/00001_baseline.sql` | Phase 2 tables, enums, RPCs, `'transfer'` counter key |
| `lib/commands/catalog.ts` | bin commands (phase 1) |
| `lib/commands/inventory.ts` | `record_movement` + `binId`; `move_stock_bin`; `get_bin_on_hand` |
| `lib/commands/transfers.ts` | **new** — stock transfer commands |
| `lib/commands/all.ts` | import `./transfers` |
| `tests/bins.test.ts` | Phase 1 |
| `tests/stock-transfers.test.ts` | Phase 2 |
| `app/(app)/inventory/` | bin picker |
| `app/(app)/transfers/` | live transfer pages matching screens once they exist |

---

### Task 1: Execute locations-bins phase 1 in this worktree

**Files:** every file listed in `.agents/superpowers/plans/2026-09-06-locations-bins-phase1.md` (bins table, seed trio, three bin RPCs, `bin_id` on three ledgers, `location_kind += storage`, bin-grain views, inventory page picker).

**Interfaces:**
- Produces: `create_bin` / `update_bin` / `delete_bin` / `list_bins`; `record_movement` requires `binId`; `create_location` seeds Walk-in, Cold, Dry.

- [ ] **Step 1:** Open the phase-1 plan. Replace its Global Constraints worktree line with `.agents/worktrees/backend` / branch `backend`. Do not edit any other step.

- [ ] **Step 2:** Execute that plan's tasks in order (failing `tests/bins.test.ts` first). After each of its commits, `pwd` is still the backend worktree.

- [ ] **Step 3:** Re-run Program 1 suites. Every `inventory_movements` insert in tests must name a `bin_id` (phase 1 already patches `tests/rls-ledger.test.ts`, `tests/commands-inventory.test.ts`, `tests/orders-fulfillment.test.ts`). If Program 1 added movement inserts (`return_shipment` loss/return_in), add `p_bin` / `bin_id` in this task.

- [ ] **Step 4:** `bunx vitest run tests/bins.test.ts tests/orders-fulfillment.test.ts tests/schema-conventions.test.ts tests/rls-ledger.test.ts` — PASS.

- [ ] **Step 5:** No extra commit; phase 1 plan already commits per task.

---

### Task 2: `stock_transfers` tables

**Files:**
- Modify: `00001_baseline.sql` enums, tables, `brewery_counters` check, RLS/grant lists
- Test: `tests/stock-transfers.test.ts` (new)

**Interfaces:**
- Produces: types and tables exactly as spec Decision 3 (status enum, header, lines with `num_nonnulls(sku_id, material_id, keg_pool_id) = 1`, `from_bin_id`/`to_bin_id` not null). Counter key `'transfer'`.

- [ ] **Step 1: Failing test**

```ts
// tests/stock-transfers.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, seedCatalog } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("stock_transfers schema", () => {
  it("rejects a transfer whose from and to location are equal", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "admin");
    const from = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
    const { data: bins } = await admin.from("bins").select("id").eq("location_id", from.id);
    const { skuId } = await seedCatalog(b.id);
    const { error } = await admin.from("stock_transfers").insert({
      brewery_id: b.id, from_location_id: from.id, to_location_id: from.id,
      created_by: ctx.userId,
    });
    expect(error).not.toBeNull(); // check (to_location_id <> from_location_id)
  });
});
```

- [ ] **Step 2:** FAIL — `relation "stock_transfers" does not exist`.

- [ ] **Step 3:** Add enum values and tables from the spec (copy the SQL block in Decision 3 verbatim). Extend `brewery_counters` check:

```sql
check (key in ('batch', 'run', 'po', 'order', 'invoice', 'transfer'))
```

`movement_type` add `'location_transfer'`. `keg_event_reason` add `'transferred_out','transferred_in'`. `material_movement_type` add `'transfer_out','transfer_in'`. Add `'stock_transfers','stock_transfer_lines'` to RLS and grant-select lists. Line composite FKs for bins: `(from_bin_id, from_location_id, brewery_id)` cannot be expressed if `from_location_id` is only on the header — **enforce in `receive_stock_transfer` and in an insert trigger** that joins the header: `bins.location_id` of `from_bin_id` equals `stock_transfers.from_location_id` (and to-bin vs to-location). Spec puts bins on the line and locations on the header; the trigger is the invariant.

```sql
create function private.stock_transfer_line_bins() returns trigger language plpgsql set search_path = '' as $$
declare loc_from uuid; loc_to uuid;
begin
  select from_location_id, to_location_id into loc_from, loc_to
    from public.stock_transfers where id = new.transfer_id;
  if not exists (select 1 from public.bins where id = new.from_bin_id and location_id = loc_from) then
    raise exception 'from_bin does not belong to the source location';
  end if;
  if not exists (select 1 from public.bins where id = new.to_bin_id and location_id = loc_to) then
    raise exception 'to_bin does not belong to the destination location';
  end if;
  return new;
end $$;
```

- [ ] **Step 4–5:** PASS, commit `feat(schema): stock_transfers documents, not a third order kind`

---

### Task 3: Create, submit, pick a stock transfer

**Files:**
- Create: `lib/commands/transfers.ts`
- Modify: `all.ts`, baseline RPCs, matrix, grant list
- Test: `tests/stock-transfers.test.ts`

**Interfaces:**
- Produces:
  - `create_stock_transfer({ fromLocationId, toLocationId, requestedDate?, note?, lines: [{ skuId?, materialId?, kegPoolId?, kegSize?, qty, fromBinId, toBinId }] }) => { transferId }`
  - `submit_stock_transfer({ transferId })`
  - `record_stock_transfer_pick({ transferId, picks: [{ lineId, qty }] })` — status `picked`
  - Roles: create/submit admin+warehouse; pick admin+warehouse
  - `toLocationId === fromLocationId` raises `'use move_stock_bin'`.

- [ ] **Step 1:**

```ts
it("create_stock_transfer refuses same-location and accepts a sku line across two locations", async () => {
  const b = await makeBrewery();
  const ctx = await makeStaffCtx(b.id, "admin");
  const from = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
  const to = await seedLocation(b.id, { name: "Storage", kind: "storage" });
  const { data: fromBins } = await admin.from("bins").select("id").eq("location_id", from.id).order("name");
  const { data: toBins } = await admin.from("bins").select("id").eq("location_id", to.id).order("name");
  const { skuId } = await seedCatalog(b.id);
  await expect(runCommand("create_stock_transfer", {
    fromLocationId: from.id, toLocationId: from.id,
    lines: [{ skuId, qty: 2, fromBinId: fromBins![0].id, toBinId: fromBins![1].id }],
  }, ctx)).rejects.toThrow(/move_stock_bin/);
  const row = await runCommand("create_stock_transfer", {
    fromLocationId: from.id, toLocationId: to.id,
    lines: [{ skuId, qty: 2, fromBinId: fromBins![0].id, toBinId: toBins![0].id }],
  }, ctx) as { transferId: string };
  expect(row.transferId).toMatch(/^[0-9a-f-]{36}$/i);
});
```

- [ ] **Step 2:** FAIL — unknown command.

- [ ] **Step 3:** One RPC `create_stock_transfer` inserts header+lines. `submit_stock_transfer` draft→submitted. `record_stock_transfer_pick` submitted|picked → picked. Each uses claim/complete. Module `lib/commands/transfers.ts`.

- [ ] **Step 4–5:** PASS, commit `feat(transfers): create, submit, and pick stock transfers`

---

### Task 4: `receive_stock_transfer` volume neutrality

**Files:**
- Modify: baseline, `lib/commands/transfers.ts`, matrix
- Test: `tests/stock-transfers.test.ts`

**Interfaces:**
- Produces: `receive_stock_transfer({ transferId, lines: [{ lineId, qty }] }) => { transferId }`. Posts paired ledger rows per line kind. FG: `location_transfer` −qty at from bin, +qty at to bin; `sum(bbl)` across the two rows is 0. Status `received`. One RPC.

- [ ] **Step 1:**

```ts
it("receive_stock_transfer posts paired FG rows whose bbl sums to 0", async () => {
  // create + submit + pick a 2-qty sku transfer as in Task 3, with opening_balance 10 at from bin
  const received = await runCommand("receive_stock_transfer", {
    transferId, lines: [{ lineId, qty: 2 }],
  }, ctx) as { transferId: string };
  const { data: mvs } = await admin.from("inventory_movements").select("qty,bbl,location_id,bin_id,type")
    .eq("sku_id", skuId).eq("type", "location_transfer");
  expect(mvs!.length).toBe(2);
  const bbl = mvs!.reduce((s, m) => s + Number(m.bbl), 0);
  expect(Math.abs(bbl)).toBeLessThan(0.000001);
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** `private.receive_stock_transfer_impl` locks the header (`picked`), loops lines, inserts the pair, sets `received_at` and status. Material lines use `transfer_out`/`transfer_in`. Keg lines use `transferred_out`/`transferred_in` with `qty > 0` on both (reason carries direction). Update `removal_shape` / material_sign checks to admit the new types.

- [ ] **Step 4–5:** PASS, commit `feat(transfers): receive_stock_transfer posts paired volume-neutral rows`

---

### Task 5: `move_stock_bin`

**Files:**
- Modify: `lib/commands/inventory.ts`, baseline RPC, matrix
- Test: `tests/stock-transfers.test.ts`

**Interfaces:**
- Produces: `move_stock_bin({ skuId?, materialId?, kegPoolId?, kegSize?, qty, fromBinId, toBinId })`. Both bins must share a location; else raise `'use create_stock_transfer'`. No document row. Paired ledger rows, same `location_id`, different `bin_id`.

- [ ] **Step 1:**

```ts
it("move_stock_bin relocates inside one location and refuses a cross-location pair", async () => {
  const { error: ok } = await ctx.db.rpc("move_stock_bin", {
    p_sku: skuId, p_qty: 1, p_from_bin: fromBins[0].id, p_to_bin: fromBins[1].id,
    p_request_id: crypto.randomUUID(),
  });
  expect(ok).toBeNull();
  await expect(runCommand("move_stock_bin", {
    skuId, qty: 1, fromBinId: fromBins[0].id, toBinId: toBins[0].id,
  }, ctx)).rejects.toThrow(/create_stock_transfer/);
});
```

- [ ] **Step 2–5:** Implement, PASS, commit `feat(inventory): move_stock_bin is not a transfer`

---

### Task 6: Pages, ungate, docs

- Inventory page already has a bin column from phase 1. Add Work › Transfers list (`planned` off in `nav.ts`), new-transfer form using `CommandForm`.
- Ungate Location bins / Bin / Record movement (phase 1 should have done this). Ungate any transfer screens if present in `screens.tsx`; if no screen record exists yet, do not invent one — the spec said screens lose gates, not that a new drawing is required.
- `bun run docs:api`, staff-guide locations/bins/transfers.
- Browse `/inventory` bin picker, create location (trio appears), delete last bin (refused).

Commit `docs: bins and stock transfers live`

---

## Validation

```bash
bash scripts/test-db.sh
bunx vitest run tests/bins.test.ts tests/stock-transfers.test.ts tests/orders-fulfillment.test.ts tests/rls-ledger.test.ts tests/schema-conventions.test.ts tests/rls-command-boundary.test.ts tests/schema-rules.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Phase 1 plan still names the old worktree | High | Task 1 retargets; never `git worktree add` a second locations tree |
| Program 1 movement inserts miss `bin_id` | High | Task 1 step 3 re-runs Program 1 tests |
| Line bins vs header locations | Medium | Trigger in Task 2, not application ifs |
| Treating taproom_transfer orders as stock_transfers | Medium | Do not. Existing `orders.kind = taproom_transfer` stays for priced? No — taproom_transfer is unpriced FG. Leave it. New document is for mixed SKU/material/keg. |

## Acceptance

- [ ] Phase 1 invariants (trio, min-one, composite FK) green
- [ ] Cross-location receive is volume-neutral
- [ ] Same-location move cannot write a `stock_transfers` row
- [ ] Deliveries still require `shipment_id` (Program 8 changes that)
