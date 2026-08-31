# Task 3 Report — Pick, Ship, Credit-Memo, Replenishment Functions

## Status
✅ COMPLETE

## Commit
`e5fe400` — feat(schema): pick/ship/credit-memo/replenishment functions

## Summary
Implemented four order fulfillment functions (record_pick, ship_order, create_credit_memo, create_replenishment_order) with full test coverage. All 66 tests pass; type check and lint green.

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
- Creates shipment row with created_by = auth.uid()
- For wholesale orders:
  - Retrieves ship_to state from ship_tos table
  - Creates invoice (kind='invoice') with shipment_id
  - Writes sale_removal inventory movements with dest_state
  - Creates invoice_lines with SKU description (name from skus table)
  - Fulfills allocations for shipped lines
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

### Test Cases (4/4 passing)
1. **short ship writes movement + invoice** — short-ship scenario (8 of 10 qty); validates:
   - Inventory movement created (sale_removal, qty=-8, dest_state=PA)
   - Invoice line created with correct qty and unit_price_cents
   - Allocation marked fulfilled
   - Order status = shipped

2. **adjust after pick sets needs_restock** — validate needs_restock flag; validates:
   - adjust_order_lines after pick sets needs_restock=true
   - Re-picking the adjusted line clears needs_restock=false

3. **credit memo writes negative lines and return_in** — partial credit; validates:
   - Credit memo invoice created (kind='credit_memo')
   - Negative invoice lines with original unit_price_cents preserved
   - return_in movement created with correct qty

4. **replenishment order creation and transfer** — taproom pars; validates:
   - Order kind=taproom_transfer, status=confirmed
   - Ship creates paired taproom_transfer movements (−3 at from, +3 at to)
   - No invoice created (invoice_id=null)

## Verification
```
npx vitest run
  Test Files  13 passed (13)
      Tests  66 passed (66)

npx tsc --noEmit
  ✅ Zero errors

npx eslint tests/orders-fulfillment.test.ts
  ✅ Zero errors
```

## Concerns
None. All functions implemented per spec, all tests green, no type errors or lint issues.

---

## Fix Report — Empty-Invoice and Full-Coverage Guards

**Coordinator Review:** Found two critical gaps in ship_order (both defects in the brief's SQL).

### Commit
`e36c000` — fix(schema): add empty-invoice and full-coverage guards to ship_order

### Changes

#### 1. Empty-Invoice Guard
**Issue:** ship_order created invoice unconditionally, even when all lines shipped qty=0, consuming an invoice_no unnecessarily.

**Fix:** Added conditional check before invoice insert:
```sql
if exists (select 1 from jsonb_array_elements(p_ship) e where (e->>'qty_shipped')::numeric > 0) then
  insert into public.invoices ...
  returning id into v_invoice;
end if;
```

**Test:** `empty-invoice guard: ship with qty_shipped 0 creates no invoice`
- Validates: no invoice row created when all qty_shipped = 0
- Returns: invoice_id = null
- Allocations: correctly released (not fulfilled)
- Order status: shipped

#### 2. Full-Coverage Guard  
**Issue:** p_ship elements that omit an order line entirely leave that line's allocation stuck open with no corresponding movement/fulfillment.

**Fix:** Added guard at function top (after lock_order):
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

**Test:** `full-coverage guard: ship with missing order line raises exception`
- Validates: rejects p_ship with empty array
- Error message: "ship list must cover every order line"

### Test Coverage Update
**File:** `tests/orders-fulfillment.test.ts`

Added 2 new tests to "pick and ship" describe block:
- ✅ empty-invoice guard test
- ✅ full-coverage guard test

**Total Tests:** 68 passed (was 66; +2 new fulfillment tests)

### Verification
```
npx supabase db reset
  ✅ Migration applied

npx vitest run tests/orders-fulfillment.test.ts
  Test Files  1 passed
      Tests  6 passed (4 original + 2 new guards)

npx vitest run
  Test Files  13 passed
      Tests  68 passed

npx tsc --noEmit
  ✅ Zero errors

npx eslint tests/orders-fulfillment.test.ts
  ✅ Zero errors
```

### Design Notes
- Guards are positioned strategically: full-coverage check immediately after lock_order (before any mutations), empty-invoice check immediately before insert (just-in-time validation).
- No breaking changes to existing tests; all 4 original fulfillment tests still pass.
- Invoice creation now correctly tracks: no invoice created = no invoice_no consumed = no spurious invoice records.
