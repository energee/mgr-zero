# Projected packaging material demand on Planning (#869)

Status: Phase 1 plan, awaiting owner approval. No implementation code yet.

## Why

Planning gets packaging material demand (labels, cans, trays, collars) only
from open packaging runs. A confirmed order or a planned batch adds none until
someone schedules its run. A 2–4 week label then shows up already past its
buy-by date, so Planning marks it `out_of_reach` and leaves it out of the draft.

Current decision (2026-10-13): packaging runs are scheduled separately. This
plan is the later projection the issue tracks. It does not change how runs are
scheduled.

## What exists and is reused

| Piece | Where | Reuse |
|---|---|---|
| `material_requirements` view (latest) | `supabase/migrations/20260928040000_unstarted_plans.sql:228` | Gains a third demand source and one appended column. Planning, Today's count (`lib/commands/landings.ts:78`) and the draft RPC read it unchanged. |
| Run → BOM demand math | same view, second `union all` branch | Generalised, not copied: runs and projected units feed one `sku_units` list, and one BOM join turns it into material (`ceil` per row for `each` materials, as a close draws). |
| `atp` view (on hand less open allocations) | `00001_baseline.sql:2210` | Order shortfall is a negative `atp`. Planning's screen already names "Hazy ATP negative". |
| `format_bom`, `format_volumes` | `00001_baseline.sql:418` | Units per SKU and material per unit. |
| `packaging_runs.batch_id` | `20261014100400_historical_packaging.sql:7` | One of the two links that make a run "the batch's run". The other is `occupancy_id → vessel_occupancies.batch_id`. |
| `draft_purchase_order_from_requirements` | `00001_baseline.sql:5885` | Reads `select *` from the view, so projected rows draft with no change. |
| `on_hand_rows()` pattern | `00001_baseline.sql:2194` | A public security-definer row function behind an invoker view. The order-shortfall function follows it. |
| `toPlanningViewProps` | `lib/mgr/planning-view.ts` | Adds one detail phrase. |
| `get_material_requirements` | `lib/commands/purchasing.ts:311` | Adds one selected column. |

Nothing today stores a batch's package split or a days-to-package. Batches
carry only `intended_brand_id` and `planned_bbl`.

## Decisions needed (awaiting owner approval)

Each has a recommended default (the simplest that works) and an alternative.

### D1. Which formats and how many units a batch becomes

- **Recommended:** ship order-demand projection first (Phase A). It needs no
  package split. Batch projection (Phase B) waits on this decision.
- **Recommended for Phase B, if approved:** a per-SKU default share,
  `skus.batch_share` (0–1, the fraction of a batch's volume that SKU takes).
  It is set on the SKU sheet. A SKU with no share projects nothing. Shares of
  one brand may not sum above 1.
- **Alternative:** a split typed per batch when it is scheduled. It is more
  accurate and costs a form field on every batch.

### D2. Expected packaging date for a batch

- **Recommended:** one brewery-wide `breweries.days_to_package` (default 14).
  Needed-by is `coalesce(brewed_on, planned_on) + days_to_package`.
- **Alternative:** per brand or per recipe version. Ask for it once a single
  number proves wrong.

### D3. Double counting

- **Batch (recommended):** a batch stops projecting once any non-cancelled
  packaging run references it. A run references a batch through
  `packaging_runs.batch_id` or through its tank (`vessel_occupancies.batch_id`).
  Closed and cancelled batches never project.
- **Known gap:** a run scheduled without a tank references no batch, so both
  count until the tank is picked. **Alternative:** subtract open tankless runs'
  planned units of the same SKU from projected batch units.
- **Orders (recommended):** order shortfall per SKU is open allocations beyond
  on hand (negative `atp`), less planned units on open packaging runs. In
  Phase B it is also less projected batch units of that SKU. It drops out as
  stock or a run covers it.

### D4. Marking and drafting

- **Recommended:** keep one row per material. `required` includes projected
  demand. A new `projected` column says how much of it is projected. The row
  reads "includes N projected". Projected demand drafts like firm demand,
  because lead time is the reason for this feature.
- **Alternative:** show projected demand but leave it out of the draft.

### D5. Needed-by for order demand (raised by research)

- **Recommended:** the earliest `requested_ship_date` among the SKU's open
  order allocations, or today when none has one.
- Brewers read Planning, but `orders` is readable only by admin, sales and
  warehouse (`20261008170000_staff_role_business_reads.sql:26`). So the
  shortfall comes from a security-definer row function that returns SKU,
  units and date only, never a customer.
- **Alternative:** needed-by = today for every order shortfall. It needs no
  function, but every such row is born out of reach.

## Phase A SQL — `20261015090000_projected_order_packaging_demand.sql`

Re-check the newest file in `supabase/migrations/` on every remote branch
before writing. Today it is `20261014120000_price_group_barcodes.sql`.

```sql
-- #869 Phase A: confirmed orders beyond stock project packaging demand.
-- One row per short SKU: units no stock and no open run covers, and the
-- earliest requested ship date. Definer so brewers (who cannot read orders)
-- see the same Planning; atp keeps it to the caller's breweries.
create function public.order_packaging_shortfall_rows()
returns table (brewery_id uuid, sku_id uuid, units numeric, needed_by date)
language sql stable security definer set search_path = '' as $$
  select a.brewery_id, a.sku_id, -a.qty - coalesce(p.qty, 0),
         coalesce((select min(o.requested_ship_date)
                   from public.allocations al
                   join public.order_lines ol on ol.id = al.ref
                   join public.orders o on o.id = ol.order_id
                   where al.brewery_id = a.brewery_id and al.sku_id = a.sku_id
                     and al.source = 'order_line' and al.status = 'open'), current_date)
  from public.atp a
  left join (
    select r.brewery_id, o.sku_id, sum(o.qty_planned) as qty
    from public.packaging_runs r join public.packaging_run_outputs o on o.run_id = r.id
    where r.closed_at is null and r.cancelled_at is null group by 1, 2
  ) p on p.brewery_id = a.brewery_id and p.sku_id = a.sku_id
  where -a.qty > coalesce(p.qty, 0);
$$;
revoke all on function public.order_packaging_shortfall_rows() from public, anon, authenticated, service_role;
grant execute on function public.order_packaging_shortfall_rows() to authenticated;

-- Copied from 20260928040000_unstarted_plans.sql. New: the sku_units list
-- (open runs plus order shortfall) behind the one BOM join, req.projected,
-- and the appended `projected` column.
create or replace view public.material_requirements with (security_invoker = true) as
  with sku_units as (
    select r.brewery_id, o.sku_id, o.qty_planned as units, r.planned_on as needed_by, false as projected
    from packaging_runs r join packaging_run_outputs o on o.run_id = r.id
    where r.closed_at is null and r.cancelled_at is null
    union all
    select d.brewery_id, d.sku_id, d.units, d.needed_by, true
    from public.order_packaging_shortfall_rows() d),
  req as (
    select b.brewery_id, ri.material_id, sum(ri.per_bbl_qty * b.planned_bbl) as required, min(b.planned_on) as needed_by, 0::numeric as projected
    from batches b join recipe_ingredients ri on ri.recipe_version_id = b.recipe_version_id
    where b.brewed_on is null and b.cancelled_at is null group by 1,2
    union all
    select q.brewery_id, q.material_id, sum(q.qty), min(q.needed_by), coalesce(sum(q.qty) filter (where q.projected), 0)
    from (
      select u.brewery_id, bom.material_id, u.needed_by, u.projected,
             case when pm.base_uom = 'each' then ceil(u.units * bom.qty_per_unit) else u.units * bom.qty_per_unit end as qty
      from sku_units u
      join skus s on s.id = u.sku_id
      join format_bom bom on bom.format_id = s.format_id
      join materials pm on pm.id = bom.material_id
    ) q group by 1,2),
  gap as (
    select req.brewery_id, req.material_id, sum(req.required) as required, min(req.needed_by) as needed_by,
           coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order,
           sum(req.required) - coalesce(oh.qty, 0) - coalesce(oo.qty, 0) as short,
           sum(req.projected) as projected
    from req
    left join material_on_hand oh on oh.material_id = req.material_id
    left join material_on_order oo on oo.material_id = req.material_id
    group by 1,2, oh.qty, oo.qty)
  select gap.brewery_id, gap.material_id, gap.required, gap.needed_by, gap.on_hand, gap.on_order, gap.short,
         m.name as material_name, m.base_uom, m.purchase_uom, m.purchase_uom_factor,
         ceil(greatest(gap.short, 0) / m.purchase_uom_factor) as purchase_units_short,
         coalesce(c.vendor_id, m.default_vendor_id) as vendor_id, v.name as vendor_name, v.lead_time_days,
         gap.needed_by - v.lead_time_days as buy_by,
         coalesce(gap.needed_by - v.lead_time_days < current_date, false) as out_of_reach,
         c.contract_id, c.qty_available as contract_qty_available, c.unit_cost_cents as contract_unit_cost_cents,
         gap.projected
  from gap join materials m on m.id = gap.material_id
  left join lateral (
    select cb.contract_id, cb.vendor_id, cb.qty_available, mc.unit_cost_cents
    from contract_balances cb join material_contracts mc on mc.id = cb.contract_id
    where cb.material_id = gap.material_id and cb.qty_available > 0
      and (mc.starts_on is null or mc.starts_on <= current_date) and (mc.ends_on is null or mc.ends_on >= current_date)
    order by mc.ends_on nulls last limit 1) c on true
  left join vendors v on v.id = coalesce(c.vendor_id, m.default_vendor_id);
```

`create or replace view` may only append columns. So the final select lists
the `gap` columns in their old order, and `projected` lands last.

## Phase B SQL (only if D1 and D2 are approved) — `20261015090100_projected_batch_packaging_demand.sql`

```sql
alter table public.skus add column batch_share numeric(5,4)
  check (batch_share is null or (batch_share > 0 and batch_share <= 1));
alter table public.breweries add column days_to_package int not null default 14
  check (days_to_package between 1 and 120);
```

`sku_units` gains a third branch, `projected` = true. The BOM join is
unchanged:

```sql
select b.brewery_id, s.id, floor(b.planned_bbl * s.batch_share / fv.bbl_per_unit),
       coalesce(b.brewed_on, b.planned_on) + br.days_to_package, true
from batches b
join breweries br on br.id = b.brewery_id
join skus s on s.brand_id = b.intended_brand_id and s.active and s.batch_share is not null
join format_volumes fv on fv.id = s.format_id and fv.bbl_per_unit > 0
where b.cancelled_at is null and b.closed_at is null
  and not exists (
    select 1 from packaging_runs r left join vessel_occupancies o on o.id = r.occupancy_id
    where r.cancelled_at is null and (r.batch_id = b.id or o.batch_id = b.id))
```

`order_packaging_shortfall_rows()` also subtracts those projected units of the
same SKU (D3), so an order and the batch that will fill it count once.

## Tasks

DB tests run on `mgr_test` (`scripts/test-db.sh`). Every task starts with its
failing test, then implements, then runs its proof. Every migration task ends
with `bun run migrations:lock` and `bun run types:database`.

### Phase A — order demand (needs D3, D4, D5)

1. **Order shortfall and the view.**
   - Files: new migration above; `tests/rpc-allowlist.test.ts` (add `order_packaging_shortfall_rows()`).
   - Test first: `tests/projected-packaging-demand.test.ts` (new, DB).
     - A confirmed order beyond stock gives its label a row with
       `projected` = `required` and `needed_by` = the requested ship date.
     - Scheduling a run with those units removes the projected part.
     - Receiving stock removes it.
     - A brewer reads the same row as an admin.
     - An admin of another brewery reads nothing.
   - Accept: the test file and `tests/rpc-allowlist.test.ts` pass; `tests/packaging.test.ts`,
     `tests/purchasing.test.ts`, `tests/unstarted-plans.test.ts` still pass.
   - Deps: none.
2. **Command returns `projected`.**
   - Files: `lib/commands/purchasing.ts` (`get_material_requirements` select and `Number()`).
   - Test first: extend `tests/projected-packaging-demand.test.ts`: the command's row has `projected: number`.
   - Accept: that test; `bunx tsc --noEmit`.
   - Deps: 1.
3. **Planning row says "includes N projected".**
   - Files: `lib/mgr/planning-view.ts` (`MaterialRequirementSnapshot.projected: number`; one detail phrase when > 0).
   - Test first: `tests/planning-view.test.ts`: a row with `projected: 480` reads "includes 480 projected"; a firm row does not.
   - Accept: `bunx vitest run tests/planning-view.test.ts`; `bunx tsc --noEmit`.
   - Deps: none. Parallel with 1–2.
4. **Docs and inventory.**
   - Files: `content/docs/staff-guide.mdx` (Planning: order demand, the netting rule, the marking); `components/mgr/screens.tsx` (Planning `spec` and a `projected` state); `lib/mgr/fixtures/planning.ts` if the state needs a row; then `bun run docs:api`.
   - Test first: `tests/design-docs.test.ts` or `tests/docs.test.ts` fails on a missing phrase if one pins the guide; otherwise the screen-only proof list in `AGENTS.md`.
   - Accept: the screen-only proof list, `tests/api-docs.test.ts`; a look at `/planning`.
   - Deps: 2, 3.

### Phase B — batch demand (needs D1, D2)

Tasks 5–7 edit one migration file, so one agent owns them in sequence.

5. **SKU share.**
   - Files: Phase B migration (`skus.batch_share`; `update_sku` replaced with a trailing `p_batch_share numeric default null` plus a clear flag, copied from `20261012100600_sku_keg_pool_legacy_replay.sql:26`); `lib/commands/catalog.ts` (`batchShare` on `update_sku`); `tests/rpc-allowlist.test.ts`.
   - Test first: `tests/sku-keg-pool.test.ts` pattern, in `tests/projected-packaging-demand.test.ts`: a share saves; 1.2, or one that brings the brand above 1, is refused; omitting it replays an old request unchanged.
   - Deps: 4.
6. **Days to package.**
   - Files: Phase B migration (`breweries.days_to_package`; `set_brewery_operating_defaults` replaced with a trailing `p_days_to_package int default null`, null keeps); `lib/commands/settings.ts` (input and `BREWERY_COLUMNS`); `tests/rpc-allowlist.test.ts`.
   - Test first: `tests/settings.test.ts`: it saves and reads back; 0 is refused; reading hours alone still replays.
   - Deps: 5.
7. **Batch branch in the view.**
   - Files: Phase B migration (third `sku_units` branch; shortfall function nets projected batch units).
   - Test first: `tests/projected-packaging-demand.test.ts`:
     - A planned batch of a brand with a 0.5 can share shows can labels needed by `planned_on + days_to_package`.
     - Scheduling its run with its tank removes the projection, never adding on top (issue acceptance 2).
     - A cancelled batch projects nothing.
     - An order for the same SKU counts once.
   - Deps: 6.
8. **Controls.**
   - Files: `lib/mgr/sku-view.ts`, `components/mgr/views/sku.tsx`, `app/(app)/catalog/sku-form.tsx` (share via `E.edit` numeric); `lib/mgr/settings-view.ts`, `components/mgr/views/brewery-settings-form.tsx`, `app/(app)/settings/settings-form.tsx` (days via `E.edit`).
   - Test first: `tests/catalog-view.test.ts` and `tests/settings-view.test.ts`: the adapters map and send the new fields.
   - Accept: screen-only proof list; a look at the SKU sheet and Settings.
   - Deps: 5, 6. Parallel with 7.
9. **Docs.**
   - Files: `content/docs/staff-guide.mdx` (Planning, Create a SKU, Settings); `components/mgr/screens.tsx` (SKU, Settings, Planning); `bun run docs:api`.
   - Accept: full proof (`bun run test && bunx tsc --noEmit && bun run lint`).
   - Deps: 7, 8.

## Risks

- Existing DB tests with a negative `atp` and a BOM may now see extra demand.
  Task 1 runs `tests/packaging.test.ts`, `tests/purchasing.test.ts` and
  `tests/one-way-keg.test.ts` to catch it.
