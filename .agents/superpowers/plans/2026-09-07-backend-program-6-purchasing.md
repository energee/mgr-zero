# Program 6 — Purchasing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A buyer can maintain vendors and materials, draft and send a PO (mailto or external), receive against it, see open balance and observed lead time, and draft POs from planning gaps. MGR does not send vendor email in this program.

**Architecture:** Tables exist. Move `lead_time_days` to `vendors`. Add send transport columns. Views, not stored averages. `transmit_purchase_order` / Resend / `direct` stay gated.

**Tech Stack:** Same as Program 1. New `lib/commands/purchasing.ts`.

**Spec:** `.agents/superpowers/specs/2026-09-07-mgr-purchasing-send-and-lead-times.md`. Parent plan D6 (mailto+external only).

## Global Constraints

- Worktree `.agents/worktrees/backend`. Programs 0–5 merged (planning demand uses packaging + orders).
- `lead_time_days` on `vendors`, dropped from `materials`.
- `sent_via in ('mailto','external')` this program. Do not add `'direct'` until a dependency is approved.
- Honesty copy: mailto/external read "Marked sent by {name} · {date}", never "Delivered".
- Empty PO `update_po_status`: `bool_and` over zero lines must not yield `partially_received` — treat NULL as leave-status-alone / keep `sent`.
- Contract never gates ordering. Mixed contract+spot lines legal. Price from contract while remaining commitment covers the line, else spot (`materials` have no spot price column — **unit_cost_cents on the PO line is entered**, contract supplies the default only).
- Open balance is a **view**. Observed lead time is a **view**.
- TDD, docs:api, staff-guide, nav POs + Planning `planned` off.
- Parked: `transmit_purchase_order`, Resend, inbound MX, `record_material_count` (cycle count is its own workflow; include only if the RPC is one function and the screen is already drawn — it is. **Ship `record_material_count` here** because purchasing & materials backlog lists it and the table `material_counts` exists).

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | column move, `sent_via`, views, trigger guard, RPCs |
| `lib/commands/purchasing.ts` | vendors, materials, contracts, POs, receive, planning draft, material count |
| `app/(app)/purchasing/` | Vendors, Materials, POs, Receive, Planning |
| `tests/purchasing.test.ts` | Proof |

---

### Task 1: Lead time on vendors; empty-PO trigger guard

**Files:** baseline, `tests/purchasing.test.ts`

**Interfaces:**
- Produces: `vendors.lead_time_days int`; `materials` no longer has that column. `update_po_status` empty set: if no lines, do not set `partially_received`.

- [ ] **Step 1:**

```ts
it("lead_time_days lives on vendors; materials has no such column", async () => {
  const cols = sql(`select column_name from information_schema.columns
    where table_schema='public' and table_name='vendors' and column_name='lead_time_days'`);
  expect(cols).toEqual(["lead_time_days"]);
  const dropped = sql(`select column_name from information_schema.columns
    where table_schema='public' and table_name='materials' and column_name='lead_time_days'`);
  expect(dropped).toEqual([]);
});

it("a sent PO with zero receipt lines stays sent, not partially_received", async () => {
  // create PO+line, send, then delete lines only via admin to hit the trigger's empty case
  // OR: insert a receipt_line against a PO whose other lines were removed — simpler:
  // call update_po_status logic by inserting a receipt on a PO that has lines, then
  // the dedicated empty guard: after sending a PO, insert into purchase_orders a
  // line-less row in sent (admin) and fire the trigger via a dummy receipt — skip dummy.
  // Direct: create_purchase_order with lines, send, then admin-delete lines, insert receipt_line
  // is blocked by FK. Test the SQL:
  const result = sql(`select bool_and(true) from purchase_order_lines where false`);
  expect(result[0]).toBe(""); // psql null → empty; the trigger must treat this as not complete
});
```

Rewrite the trigger instead of testing bool_and in isolation:

```sql
  if not exists (select 1 from public.purchase_order_lines where po_id = po) then
    return null; -- leave status
  end if;
```

- [ ] **Step 2–5:** Implement column move + guard. Commit `feat(purchasing): vendor lead time; empty PO does not look received`

---

### Task 2: Vendor, material, contract upserts

**Files:** purchasing.ts, RPCs, matrix

**Interfaces:**
- `upsert_vendor({ id?, name, email?, phone?, leadTimeDays?, paymentTerms? })` admin/warehouse
- `upsert_material({ id?, name, category, baseUom, purchaseUom, purchaseUomFactor?, lotTracked?, defaultVendorId?, reorderPoint? })`
- `upsert_material_contract({ id?, vendorId, materialId, qtyCommitted, unitCostCents?, startsOn?, endsOn?, contractNo? })`
- `list_vendors_and_contracts` — vendors with nested contracts
- `list_materials`, `get_material_on_hand` (sum `material_movements` at location+bin grain from Program 2)

- [ ] **Step 1:** Create vendor with leadTimeDays 14; material with defaultVendorId; contract; list joins them. Sales role denied on upsert_vendor.

- [ ] **Step 2–5:** Commit `feat(purchasing): vendor, material, and contract commands`

---

### Task 3: Create, send, receive PO

**Files:** purchasing.ts, baseline (`sent_via text check in ('mailto','external')`, `sent_by uuid`, `send_purchase_order` RPC, `receive_purchase_order` RPC)

**Interfaces:**
- `create_purchase_order({ vendorId, expectedOn?, note?, lines: [{ materialId, qtyOrdered, unitCostCents?, contractId?, expectedLotCode? }] })` — header+lines one RPC. Status `draft`.
- `send_purchase_order({ poId, sentVia: "mailto" | "external" })` — `draft → sent`, sets `ordered_on = current_date`, `sent_via`, `sent_by = auth.uid()`. No HTTP.
- `receive_purchase_order({ poId, receivedOn?, lines: [{ poLineId, qtyCounted, lotCode? }] })` — one RPC: receipt header, receipt_lines, `material_movements` type `receipt` at required `locationId`+`binId`, create `material_lots` when `materials.lot_tracked`. Trigger updates PO status.
- `get_purchase_order`, `list_purchase_orders`
- View `po_open_balances (po_id, po_line_id, qty_ordered, qty_received, qty_open)`
- View `vendor_lead_times` per spec (last receipt stops clock; rolling last 10 POs; tag `sent_via`)

- [ ] **Step 1:** Draft → send mailto → receive partial 3 of 4 → status `partially_received` and `qty_open = 1` → receive remaining → `received`. `send` on already sent raises. Replay same `requestId` does not double-receive.

- [ ] **Step 2–5:** Commit `feat(purchasing): draft, mark-sent, and receive a PO`

---

### Task 4: `draft_purchase_order_from_requirements`

**Files:** purchasing.ts, planning view

**Interfaces:**
- View `get_planning_shortfalls` (or a query `get_material_requirements`) as Planning screen spec: demand (confirmed+submitted order FG converted via format bbl **plus** taproom pars, **plus** committed packaging BOM) vs supply (on-hand materials + open PO qty_open). Gap per material per week.
- Resolution: active contract for material, else `default_vendor_id`, else the row cannot draft (`noVendor: true`).
- `draft_purchase_order_from_requirements({ materialIds: uuid[] }) => { purchaseOrderIds: string[] }` — one draft PO per resolved vendor, qty = gap rounded up to purchase unit. Does not send.

- [ ] **Step 1:** Two materials, same vendor → one PO two lines. One material no vendor → that id absent from result with a `skipped: [{ materialId, reason: "no_vendor" }]`.

- [ ] **Step 2–5:** Commit `feat(purchasing): draft POs from planning gaps`

---

### Task 5: `record_material_count`

**Files:** purchasing.ts; tables `material_counts` / `material_count_lines` exist

**Interfaces:**
- `record_material_count({ locationId, binId, countedOn?, lines: [{ materialId, qty }] })` — one RPC writes header+lines plus `count_adjustment` movements for the delta vs `get_material_on_hand`. Zero-delta still writes the header (durable occurrence).

- [ ] **Step 1:** Count equal to on-hand → header exists, no movement. Count short → one negative adjustment.

- [ ] **Step 2–5:** Commit `feat(purchasing): material cycle count is a durable snapshot`

---

### Task 6: Pages, ungate, docs

Routes `/vendors`, `/materials`, `/purchase-orders`, `/planning`. Nav POs + Planning. Ungate purchasing screen writes except anything that names `transmit_purchase_order` or `direct`. Send button on a draft PO is "Mark sent" with via mailto/external, copy per spec honesty table. `bun run docs:api`. Browse.

Commit `docs: purchasing screens live`

---

## Validation

```bash
bunx vitest run tests/purchasing.test.ts tests/rls-command-boundary.test.ts tests/schema-rules.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Shipping Resend without approval | High | No `'direct'` value in the check |
| Calling mailto "Delivered" | High | Screen copy tests in mgr-screens if the string is in the record; live page uses "Marked sent" |
| Planning double-order | Medium | Open PO qty is supply |
| Contract as a gate | Medium | Test that create_purchase_order without contractId succeeds |

## Acceptance

- [ ] Lead time is on vendors
- [ ] Send is an attestation (mailto/external)
- [ ] Partial receive exposes qty_open via view
- [ ] `direct` / Resend not present
