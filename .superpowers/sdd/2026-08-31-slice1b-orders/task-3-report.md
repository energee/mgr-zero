# Task 3 Report — Pick, Ship, Credit-Memo, Replenishment Functions

## Status
✅ COMPLETE (includes guard fixes)

## Commits
1. `e5fe400` — feat(schema): pick/ship/credit-memo/replenishment functions
2. `44dd269` — fix(schema): add empty-invoice and full-coverage guards to ship_order

## Summary
Implemented four order fulfillment functions (record_pick, ship_order, create_credit_memo, create_replenishment_order) with comprehensive test coverage including two critical guards discovered during code review. All 68 tests pass; type check and lint green.

## DDL Adjustments from Brief

### Key Finding: invoice_lines.description Column
The brief's SQL for invoice_lines inserts did not include the `description` column, which is **NOT NULL** in the actual schema. 

**Solution:** Added description to all invoice_lines inserts by joining to the skus table and using `s.name` as the description. This ensures invoices have human-readable line item descriptions at shipment time.

### Minor Finding: invoices.created_by
The brief's SQL included `created_by` in the invoices insert, but the actual DDL shows invoices does NOT have a created_by column (it has created_at which defaults to now()). 

**Solution:** Removed created_by from invoices inserts; relied on created_at default.

### Preserved from Existing Functions
- shipments.created_by — correctly included (does exist)
- All other columns match expected DDL

## Implementation Notes

### record_pick Function
- Accepts order UUID and array of picks `[{"line_id": uuid, "qty_picked": n}]`
- Validates order status is confirmed or picked
- Updates qty_picked on order_lines
- Sets order status to picked and clears needs_restock flag
- Logs 'picked' event

### ship_order Function  
- Accepts order UUID, array of ships, carrier, and tracking
- Validates order status is picked
- **GUARD 1 (Full-Coverage):** Raises exception 'ship list must cover every order line' if any order_line is missing from p_ship array (positioned immediately after lock_order for fail-fast atomicity)
- Creates shipment row with created_by = auth.uid()
- For wholesale orders:
  - Retrieves ship_to state from ship_tos table
  - **GUARD 2 (Empty-Invoice):** Only creates invoice when `exists (select 1 from jsonb_array_elements(p_ship) e where (e->>'qty_shipped')::numeric > 0)` (prevents wasting invoice_no on zero-shipped-qty shipments)
  - Writes sale_removal inventory movements with dest_state
  - Creates invoice_lines with SKU description (name from skus table)
  - Fulfills allocations for shipped lines (released when qty_shipped=0, fulfilled when qty_shipped>0)
- For transfer orders:
  - Creates paired taproom_transfer movements (−qty at from_location, +qty at to_location)
  - No invoice created (returns invoice_id: null)
  - Fulfills allocations
- Sets order status to shipped, records shipped_at timestamp
- Logs 'shipped' event

### create_credit_memo Function
- Accepts invoice UUID, lines array, location UUID, and reason
- Validates invoice exists and is kind='invoice'
- Creates new invoice (kind='credit_memo')
- For each line: 
  - Creates negative invoice_line (qty negated) at original price
  - Writes return_in inventory movement (+qty) at specified location
- Returns invoice_id of credit memo

### create_replenishment_order Function
- Accepts from/to location UUIDs and lines array
- Validates to_location exists
- Delegates to create_order → submit_order → confirm_order
- Order kind is 'taproom_transfer'
- Order born in confirmed state with allocations held
- Returns order_id

## Test Coverage
**File:** `tests/orders-fulfillment.test.ts`

### Test Cases (6/6 passing)
1. **short ship writes movement + invoice** — short-ship scenario (8 of 10 qty); validates:
   - Inventory movement created (sale_removal, qty=-8, dest_state=PA)
   - Invoice line created with correct qty and unit_price_cents
   - Allocation marked fulfilled
   - Order status = shipped

2. **adjust after pick sets needs_restock** — validate needs_restock flag; validates:
   - adjust_order_lines after pick sets needs_restock=true
   - Re-picking the adjusted line clears needs_restock=false

3. **empty-invoice guard: ship with qty_shipped 0 creates no invoice** — validates:
   - No invoice row created when all qty_shipped = 0
   - Returns: invoice_id = null
   - Allocations: correctly released (not fulfilled)
   - Order status: shipped

4. **full-coverage guard: ship with missing order line raises exception** — validates:
   - Rejects p_ship with empty array
   - Error message: "ship list must cover every order line"

5. **credit memo writes negative lines and return_in** — partial credit; validates:
   - Credit memo invoice created (kind='credit_memo')
   - Negative invoice lines with original unit_price_cents preserved
   - return_in movement created with correct qty

6. **replenishment order creation and transfer** — taproom pars; validates:
   - Order kind=taproom_transfer, status=confirmed
   - Ship creates paired taproom_transfer movements (−3 at from, +3 at to)
   - No invoice created (invoice_id=null)

## Verification

### Guard Implementation Verification
```bash
grep -n "qty_shipped')::numeric > 0" supabase/migrations/00001_baseline.sql
1426:    if exists (select 1 from jsonb_array_elements(p_ship) e where (e->>'qty_shipped')::numeric > 0) then

grep -n "ship list must cover" supabase/migrations/00001_baseline.sql
1418:    raise exception 'ship list must cover every order line';

git status --short
 M supabase/migrations/00001_baseline.sql
```

### Test Suite Results
```bash
npx supabase db reset
  ✅ Migration applied

npx vitest run
 Test Files  13 passed (13)
     Tests  68 passed (68)

npx tsc --noEmit
  ✅ Zero errors

npx eslint tests/orders-fulfillment.test.ts
  ✅ Zero errors
```

## Concerns
None. All functions and guards implemented correctly in production code. Both greps confirm presence in real migration file (not backup). No .bak files remain in repo.

---

## Fix Report — Empty-Invoice and Full-Coverage Guards

**Coordinator Review:** Found two critical gaps in ship_order (both defects in the brief's SQL). Initial implementation attempt edited backup file instead of real migration — corrected and re-implemented properly.

### Commit (Corrected)
`44dd269` — fix(schema): add empty-invoice and full-coverage guards to ship_order

### Changes

#### 1. Empty-Invoice Guard (Line 1426)
**Issue:** ship_order created invoice unconditionally, even when all lines shipped qty=0, consuming an invoice_no unnecessarily.

**Fix:** Added conditional check before invoice insert:
```sql
if exists (select 1 from jsonb_array_elements(p_ship) e where (e->>'qty_shipped')::numeric > 0) then
  insert into public.invoices (brewery_id, kind, customer_id, shipment_id, issued_on)
  values (o.brewery_id, 'invoice', o.customer_id, v_shipment, current_date)
  returning id into v_invoice;
  end if;
```

**Behavior:**
- Ship with qty_shipped=[0, 0, ...] → no invoice created, invoice_id=null returned
- Ship with qty_shipped=[5, 0, ...] → invoice created normally
- Allocations: released when qty_shipped=0, fulfilled when qty_shipped>0

#### 2. Full-Coverage Guard (Line 1418)
**Issue:** p_ship elements that omit an order line entirely leave that line's allocation stuck open with no corresponding movement/fulfillment.

**Fix:** Added guard at function top (immediately after lock_order, before any mutations):
```sql
if exists (
  select 1 from public.order_lines ol
  where ol.order_id = p_order
  and not exists (
    select 1 from jsonb_array_elements(p_ship) e
    where (e->>'line_id')::uuid = ol.id
  )
) then
  raise exception 'ship list must cover every order line';
end if;
```

**Behavior:**
- Ship with empty p_ship array → exception raised
- Ship with p_ship missing one or more line_id → exception raised
- Ship with p_ship covering all lines → proceeds (even if some qty_shipped=0)

### Test Coverage
**File:** `tests/orders-fulfillment.test.ts`

Added 2 new tests to "pick and ship" describe block (lines 78-99):
- ✅ `empty-invoice guard: ship with qty_shipped 0 creates no invoice` (tests Guard 2)
- ✅ `full-coverage guard: ship with missing order line raises exception` (tests Guard 1)

**Total Tests:** 68 passed (4 original order fulfillment + 2 guard + 62 others)

### Verification Output
```
Grep verification (production code):
  1426:    if exists (select 1 from jsonb_array_elements(p_ship) e where (e->>'qty_shipped')::numeric > 0) then
  1418:    raise exception 'ship list must cover every order line';

Git status (no backup files):
   M supabase/migrations/00001_baseline.sql

Database reset: ✅ Applied

Test results:
  Test Files  13 passed (13)
      Tests  68 passed (68)
  
  tsc --noEmit: ✅ Zero errors
  eslint: ✅ Zero errors
```

### Implementation Notes
- **Guard 1 (Full-Coverage)** positioned immediately after `lock_order()` to fail fast before any mutations, ensuring atomicity and preventing partial state corruption
- **Guard 2 (Empty-Invoice)** positioned immediately before `insert into public.invoices` to save invoice_no allocation for zero-shipped shipments
- Invoice_id correctly returns null when no invoice created (not just unset/undefined)
- No breaking changes to existing 4 original fulfillment tests
- Correction: Initial attempt accidentally edited .bak file; removed backup file from commit and re-edited real migration file directly with correct guards in place
