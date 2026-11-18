# Portal release windows: order a batch before it is packaged

Status: Phase 1 plan, awaiting owner approval. Branch `energee/customer-portal`,
PR to `main`.

## Why

Every active SKU priced on a buyer's sale channel is orderable in the portal
today (`portal_catalog`, `lib/commands/portal.ts`). Staff cannot hold a SKU
back from the portal without deactivating it everywhere. Buyers also cannot
order beer that is planned but not yet packaged.

## Owner decisions (2026-11-18)

1. Staff release a **planned batch** for ordering, one batch at a time. No
   rule opens windows automatically.
2. **Admin and sales** can release, edit, and withdraw a release.
3. Packaged stock stays orderable as today. Staff control portal
   orderability **per SKU**.

## Design

### Two controls, both per SKU

| Control | Where | Meaning |
| --- | --- | --- |
| **Orderable from stock** (on by default) | Edit SKU sheet and the SKU list | Buyers can order this SKU from packaged stock. Off hides the stock offer; staff ordering is unchanged. |
| **Batch release** | Planning, on a planned batch | Buyers can order this SKU from this batch, up to a quantity, for delivery on or after a date. |

A buyer sees a SKU when it is priced on their channel (as today) and at least
one of the two offers is open. A SKU can show both: "In stock" and
"From Dec 4 · order by Dec 11".

### Releasing a batch

**Release for ordering** on a Planning row opens a sheet prefilled from the
existing `projected_batch_packaging_units` view (#869):

- one row per SKU with a batch share, prefilled with projected units;
- **Ships from**, prefilled with the batch's needed-by (ready) date;
- **Order by**, optional.

Staff untick SKUs or lower quantities, then save. Saving writes one
`batch_releases` row per kept SKU. **Withdraw** sets `withdrawn_at`; orders
already submitted stay and are handled at confirm.

### Remaining quantity

Remaining = release `qty` minus `qty_ordered` on order lines that carry the
release and whose order is `submitted`, `confirmed`, `picked` or `shipped`.
Drafts do not count. The portal shows it as the existing in/low/out badge,
never as a number.

### Ordering against a release

An order line gains an optional `batch_release_id`. On submit,
`portal_submit_quote` locks each release row it uses, then rejects the order
when:

- the release is withdrawn, past its order-by date, or its batch is packaged
  or cancelled;
- the line exceeds the remaining quantity;
- the order's requested date is before the release's ships-from date;
- a line without a release is for a SKU that is not orderable from stock.

### Confirming

This keeps `submitted → confirmed` as it is. The Confirm order view flags a
release line whose batch's ready date is now later than the order's requested
date, because the brew slipped.

### Packaging ends the release

A release closes once its batch has a packaging run, which is the same signal
the projection uses. The packaged units then count as stock and follow
**Orderable from stock**.

Known gap: submitted, unconfirmed release orders hold no allocation. Packaged
stock can therefore show "in" before those orders are confirmed. Staff should
confirm release orders when the batch packages.

## Out of scope (ask before adding)

- per-customer caps (allotments);
- rule-based automatic windows;
- a brand-level toggle (bulk-toggling the brand's SKUs on the SKU list covers it);
- buyer notifications when a batch is released.

## Migration

`supabase/migrations/20261118160000_batch_releases.sql`:

```sql
alter table public.skus add column portal_from_stock boolean not null default true;

create table public.batch_releases (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  batch_id uuid not null,
  sku_id uuid not null,
  qty numeric(12,2) not null check (qty > 0),
  ships_from date not null,
  orders_close_on date,
  released_at timestamptz not null default now(),
  released_by uuid not null default auth.uid(),
  withdrawn_at timestamptz,
  unique (id, brewery_id),
  unique (batch_id, sku_id),
  foreign key (batch_id, brewery_id) references public.batches (id, brewery_id),
  foreign key (sku_id, brewery_id) references public.skus (id, brewery_id)
);
alter table public.batch_releases enable row level security;
create policy batch_releases_staff_read on public.batch_releases for select
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])));
-- Writes go through security-definer RPCs that check admin/sales.

alter table public.order_lines add column batch_release_id uuid;
alter table public.order_lines add foreign key (batch_release_id, brewery_id)
  references public.batch_releases (id, brewery_id);
create index order_lines_batch_release_idx on public.order_lines (batch_release_id)
  where batch_release_id is not null;
```

Plus these functions, written in the tasks below:

- `release_batch`, `update_batch_release` and `withdraw_batch_release`, all
  admin/sales;
- `portal_releases(p_customer)`, a definer that returns `sku_id`,
  `release_id`, `ships_from`, `orders_close_on` and `badge`, scoped like
  `portal_availability`;
- `portal_availability`, updated to skip SKUs with `portal_from_stock = false`;
- `portal_submit_quote` and the quote snapshot, updated with the release checks.

After adding it, run `bun run migrations:lock`.

## Tasks

Each task starts by writing its named test and watching it fail. P = can run
in parallel with the other P tasks of the same step.

| # | Task | Files | Types | Test (first) | Accept | Depends |
|---|---|---|---|---|---|---|
| 1 | Migration: table, columns, RLS | `supabase/migrations/20261118160000_batch_releases.sql`, `supabase/migrations.lock.json` | — | `tests/batch-releases.test.ts`: brewer cannot insert; `unique (batch_id, sku_id)` holds | vitest green | — |
| 2 | `release_batch` / `update_batch_release` / `withdraw_batch_release` RPCs + commands (admin, sales) | same migration; `lib/commands/planning.ts` (or the owner `.agents/ARCHITECTURE.md` names) | `BatchReleaseInput` (zod) | `tests/batch-releases.test.ts`: sales releases; warehouse is refused; withdraw keeps the row | vitest green | 1 |
| 3 | `update_sku.portalFromStock` | `lib/commands/catalog.ts`, same migration (`update_sku`) | `UpdateSkuInput` | `tests/commands-catalog.test.ts`: omit keeps, false hides | vitest green | 1 |
| 4 | `portal_availability` honors `portal_from_stock`; new `portal_releases` | same migration | — | `tests/portal-releases.test.ts`: hidden SKU drops its stock badge; released SKU shows a window; other brewery or channel sees nothing | vitest green | 1 |
| 5 | Submit guards: lock release, remaining qty, ships-from, order-by, packaged/withdrawn, stock-hidden | same migration (`portal_submit_quote`, quote snapshot) | — | `tests/portal-releases.test.ts`: each rejection; two concurrent submits cannot oversell | vitest green | 2, 4 |
| 6 | `portal_catalog` returns stock offer + release offers; cart line carries `batchReleaseId` | `lib/commands/portal.ts`, `lib/mgr/shop-view.ts`, `lib/mgr/fixtures/portal.ts` | `CatalogItem.releases: { releaseId, shipsFrom, ordersCloseOn, badge }[]` | `tests/shop-view.test.ts`: both offers mapped; hidden-from-stock SKU with a release shows only the release | tsc + vitest | 4 |
| 7 (P) | Shop UI: offer picker per SKU, requested-date floor | `components/mgr/views/` shop component, `app/(portal)/portal/page.tsx` | — | logic in task 6; render checked visually | browse screenshot | 6 |
| 8 (P) | Release sheet view-model: prefill from projection, untick, validate | `lib/mgr/release-batch-view.ts` (new) | `ReleaseBatchViewModel` | `tests/release-batch-view.test.ts` | vitest green | 2 |
| 9 | Release sheet + Planning row action + withdraw | `components/mgr/views/release-batch.tsx` (new), `components/mgr/views/planning.tsx`, `lib/mgr/planning-view.ts` | — | `tests/planning-view.test.ts`: released rows show a Released badge; action shown to admin/sales only | browse screenshot | 8 |
| 10 (P) | Orderable-from-stock control on Edit SKU sheet + SKU list | `components/mgr/views/sku.tsx`, `lib/mgr/sku-view.ts`, `components/mgr/views/sku-list.tsx`, `lib/mgr/sku-list-view.ts` | `SkuViewModel.portalFromStock` | `tests/catalog-edit-controls.test.ts` | vitest green | 3 |
| 11 (P) | Confirm order flags slipped release lines | `lib/mgr/confirm-order-view.ts`, `components/mgr/views/confirm-order.tsx` | `ConfirmLine.slipped` | `tests/confirm-order-atp-lock.test.ts` (or new `confirm-order-view` case) | vitest green | 5 |
| 12 | Screen inventory entries | `components/mgr/screens.tsx` (Release batch, Shop with releases) | — | `tests/mgr-screens.test.ts`, `tests/screen-links.test.ts` | screen proof list green | 7, 9, 10, 11 |
| 13 | Docs: staff + portal guides, API docs | `content/docs/staff-guide.mdx`, `content/docs/portal-guide.mdx`, `bun run docs:api` output | — | `tests/docs.test.ts`, `tests/api-docs.test.ts` | green | 2–6 |
| 14 | Full proof | — | — | `bun run test && bunx tsc --noEmit && bun run lint` | exit 0 | all |

Order: 1 → (2, 3, 4 in parallel) → 5 → 6 → (7, 8, 10, 11 in parallel) → 9 →
12 → 13 → 14.
