# Portal releases: orderability, pre-orders and allocations

Status: Phase 1 plan, awaiting owner approval. Branch `energee/customer-portal`.
This ships as three PRs, each based on `main`: A, B, then C.

## Why

Every active SKU priced on a buyer's sale channel is orderable in the portal
today (`portal_catalog`, `lib/commands/portal.ts`). Staff cannot hold a SKU
back from the portal without deactivating it everywhere. Buyers cannot order
beer that is planned but not yet packaged. Scarce beer cannot be shared out
fairly between customers.

## Owner decisions (2026-11-18)

1. Staff **release** beer for ordering by hand, one at a time. Nothing opens
   automatically.
2. A release points at a **planned batch** or at **packaged stock**.
3. **Admin and sales** can release, edit and withdraw.
4. Packaged stock stays orderable as today. Staff control portal orderability
   **per SKU**.
5. A release can carry **per-customer allocations**. They are suggested from
   90 days of shipped history in the same format, with 20% held back.
6. Orders are **date-based**. A cart may mix stock and release items, and it
   warns which date the order ships from.
7. Orders have stages. A **pre-order** (submitted) is subject to change. The
   brewery **confirms** an order to lock it.
8. A confirmed order can still change, because product goes missing or gets
   damaged. Governance keeps that rare: fixed reason codes, the buyer sees
   why, and staff get a report.
9. A buyer with an allocation sees their own reserved quantity. When the open
   pool is 0, customers with no allocation do not see the release.
10. A release cannot drop below its confirmed quantity. Pre-orders above a
    lowered release are flagged for staff.
11. (2026-11-18) Staff can deprioritize a customer with a **release delay**:
    each customer has a number of days (0 to 60, default 0) after a release
    opens before that customer sees it or can order from it. Stock offers are
    unaffected. This replaces fairness between customers (Phase B is deferred).

## Phase A: orderability and releases (PR 1)

### Two controls, both per SKU

| Control | Where | Meaning |
| --- | --- | --- |
| **Orderable from stock** (on by default) | Edit SKU sheet and the SKU list | Buyers can order this SKU from packaged stock. Off hides the stock offer; staff ordering is unchanged. |
| **Release** | Planning (planned batch) or the SKU page (stock) | Buyers can order this SKU from this release, up to a quantity, for delivery on or after a date. |

A buyer sees a SKU when it is priced on their channel (as today) and at least
one offer is open. A SKU can show both: "In stock" and
"From Dec 4 · order by Dec 11".

### Releasing

- **From a planned batch.** **Release for ordering** on a Planning row opens a
  form prefilled from `projected_batch_packaging_units` (#869). Each SKU with a
  batch share gets its projected units. **Ships from** is the batch's ready
  date. **Order by** is optional.
- **From stock.** **Release** on a SKU sets aside a quantity of packaged
  stock. It has no batch, and ships from today. The system refuses a quantity
  above what's available to promise.

Staff untick SKUs or lower quantities, then save. Saving writes one
`releases` row per SKU. **Withdraw** sets `withdrawn_at`. Orders already
submitted stay, and staff handle them at confirm.

### Remaining quantity

Remaining is the release `qty` minus `qty_ordered` on order lines that carry
the release, counting orders that are `submitted`, `confirmed`, `picked` or
`shipped`. Drafts do not count. Phase A shows the in/low/out badge.

### Ordering against a release

An order line gains an optional `release_id`. On submit,
`portal_submit_quote` locks each release row it uses. It then rejects the
order when:

- the release is withdrawn, past its order-by date, or its batch is packaged
  or cancelled;
- a line exceeds the remaining quantity;
- the order's requested date is before a line's ships-from date;
- a line without a release is for a SKU that is not orderable from stock.

**Mixed carts.** The cart sets the earliest requested date to the latest
ships-from date among its lines. It shows "This order ships from Dec 4".

**Pre-order.** A submitted order with release lines shows in the portal as
**Pre-order — may change until the brewery confirms**. Staff can already trim
a submitted order with `adjust_order_lines`.

### Stock availability stays honest

The stock offer's badge subtracts quantity that releases still claim:

- a stock release claims its `qty` minus what is already confirmed on it,
  because confirmed lines already hold allocations;
- a packaged batch release claims its unconfirmed pre-orders.

This replaces the earlier gap where packaged stock could show "in" before
release orders were confirmed.

### Editing and confirming

- **Lowering a release.** `update_release` refuses a `qty` below the confirmed
  quantity on the release. When the new `qty` is below confirmed plus
  pre-ordered, the system allows it. The affected pre-orders are then flagged
  **Over release** on Confirm order.
- **Confirming** stays `submitted → confirmed`. Confirm order also flags a
  release line whose batch's ready date is now later than the requested date.
- **Packaging** closes a batch release. That's the same signal the projection
  uses. Packaged units then follow **Orderable from stock**.

### Release delay per customer (decision 11)

**Release delay (days)** on Customer detail (Trading terms), 0 to 60, default
0, saved by `upsert_customer.releaseDelayDays` (omit to keep). A release
appears to a customer only once whole brewery days since it was released
reach that customer's delay: `portal_releases` leaves it out until then, and
submit refuses a line on it. Stock offers are unchanged.

## Phase B: per-customer allocations (PR 2)

**Deferred: owner does not need fairness between customers (2026-11-18).**
Decision 11's release delay covers deprioritizing a customer. The design below
is kept for reference only.

A release can be split into customer **allocations** plus an **open pool**.
A release with no allocations is all open pool, first come, first served.

**Suggest.** The release form gets an **Allocate** step. It lists customers
whose channel prices the SKU. For each customer it shows:

- **History**: units shipped in the last 90 days of any SKU in the **same
  format**, such as all 1/6 bbl kegs. Format, not brand, so a new beer still
  has history.
- **Share**: that customer's history ÷ the total for all listed customers.
- **Suggested**: `floor((release qty − held back) × share)`.

**Held back** defaults to 20% and goes to the open pool. Rounding leftovers
also go to the pool.

**Edit.** Staff change any number, clear a customer, or add one. The grid shows
a running total, and the system refuses allocations above the release
quantity.

**Hold until.** Allocations hold until an optional date, or until order-by
when that is blank. After that, unused allocations join the open pool.

**What the buyer sees.** A buyer with an allocation sees
**Reserved for you: 4**. Beyond that they can order from the open pool. When
the pool is 0, customers with no allocation do not see the release.

**Remaining, per customer.** `used_c` is the units on customer c's counted
lines for the release.

- Allocation remaining: `max(0, allot_c − used_c)`.
- Open pool: `qty − Σ allot`.
- Pool remaining: `(qty − Σ allot) − Σ max(0, used_c − allot_c)`.
- After the hold date: `qty − Σ used`.

Lowering one allocation below what that customer has pre-ordered is allowed,
and those pre-orders are flagged **Over allocation**. Lowering it below their
confirmed quantity is refused.

## Phase C: governed changes after confirm (PR 3)

What ships must match what the customer sees, so confirmed orders stay
changeable. `adjust_order_lines` already allows this for sales roles, with a
free-text reason, a confirm prompt and an order event. Phase C adds:

- **Reason codes.** Changes to a confirmed or picked order require one of
  `short`, `damaged`, `customer_request`, `brewery_error` or `other`. Every
  code takes an optional note, and `other` requires one. The event payload
  stores the code. Submitted (pre-order) changes keep free text.
- **Buyer sees why.** The portal order shows each change made after confirm,
  for example "Changed after confirm: Damaged, Monarch 1/6 bbl −2".
- **Report.** A staff list of changes made after confirm, filterable by reason,
  staff member and customer, read from `order_events`.

The existing `reason` input stays, so old requests replay unchanged.

## Out of scope (ask before adding)

- rule-based automatic releases;
- history weighting beyond the 90-day, same-format share;
- a brand-level toggle (bulk-toggling the SKU list covers it);
- buyer notifications when beer is released;
- Jev notes beside allocations (`docs/plans/jev-use-cases.md`, use case 4).

## Migrations

### Phase A: `supabase/migrations/<ts>_releases.sql`

Set the timestamp when the PR is cut; it must be later than everything on
`main`.

```sql
alter table public.skus add column portal_from_stock boolean not null default true;

create table public.releases (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  batch_id uuid,                         -- null: released from packaged stock
  sku_id uuid not null,
  qty numeric(12,2) not null check (qty > 0),
  ships_from date not null,
  orders_close_on date,
  released_at timestamptz not null default now(),
  released_by uuid not null default auth.uid(),
  withdrawn_at timestamptz,
  unique (id, brewery_id),
  foreign key (batch_id, brewery_id) references public.batches (id, brewery_id),
  foreign key (sku_id, brewery_id) references public.skus (id, brewery_id)
);
create unique index releases_batch_sku_uidx on public.releases (batch_id, sku_id)
  where batch_id is not null;
alter table public.releases enable row level security;
create policy releases_staff_read on public.releases for select
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])));
-- Writes go through security-definer RPCs that check admin/sales.

alter table public.order_lines add column release_id uuid;
alter table public.order_lines add foreign key (release_id, brewery_id)
  references public.releases (id, brewery_id);
create index order_lines_release_idx on public.order_lines (release_id)
  where release_id is not null;

alter table public.customers add column release_delay_days integer not null default 0
  check (release_delay_days between 0 and 60);
```

Phase A also adds or changes these functions:

- `release_sku`, `update_release` and `withdraw_release` (new; admin/sales);
- `portal_releases(p_customer)` (new; scoped like `portal_availability`);
- `portal_availability` (changed: `portal_from_stock`, and release claims);
- `portal_submit_quote` and the quote snapshot (changed: release checks);
- `upsert_customer` (changed: `p_release_delay_days`), with `portal_releases`
  and the submit checks honoring the customer's delay.

### Phase B: `<ts>_release_allotments.sql`

```sql
alter table public.releases add column allotments_hold_until date;

create table public.release_allotments (
  brewery_id uuid not null references public.breweries(id),
  release_id uuid not null,
  customer_id uuid not null,
  qty numeric(12,2) not null check (qty > 0),
  primary key (release_id, customer_id),
  foreign key (release_id, brewery_id) references public.releases (id, brewery_id) on delete cascade,
  foreign key (customer_id, brewery_id) references public.customers (id, brewery_id)
);
alter table public.release_allotments enable row level security;
create policy release_allotments_staff_read on public.release_allotments for select
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[])));
-- Buyers never read this table; portal_releases returns only their own numbers.
```

Phase B also adds `suggest_release_allotments` and `set_release_allotments`,
and changes `portal_releases` and `portal_submit_quote`.

### Phase C

Phase C needs no table. It changes the `adjust_order_lines` RPC to take
`p_reason_code`, and adds an `order_change_rows` query.

Run `bun run migrations:lock` after each migration.

## Tasks

Each task starts with its named test failing. P = parallel with the other P
tasks of its step.

### Phase A (PR 1)

| # | Task | Files | Types | Test (first) | Accept | Depends |
|---|---|---|---|---|---|---|
| A1 | Migration: `releases`, `portal_from_stock`, `order_lines.release_id`, RLS | Phase A migration, `supabase/migrations.lock.json` | — | `tests/releases.test.ts`: brewer cannot insert; one batch release per SKU | vitest | — |
| A2 | `release_sku` / `update_release` / `withdraw_release` | same migration; commands file `.agents/ARCHITECTURE.md` names for planning | `ReleaseInput` (zod) | `tests/releases.test.ts`: sales releases; warehouse refused; stock release above ATP refused; cut below confirmed refused; withdraw keeps row | vitest | A1 |
| A3 (P) | `update_sku.portalFromStock` | `lib/commands/catalog.ts`, same migration | `UpdateSkuInput` | `tests/commands-catalog.test.ts`: omit keeps, false hides | vitest | A1 |
| A4 (P) | `portal_releases`; `portal_availability` honors the toggle and release claims | same migration | — | `tests/portal-releases.test.ts`: hidden SKU drops stock offer; stock release lowers stock badge; packaged batch pre-orders lower it; other brewery/channel sees nothing | vitest | A1 |
| A5 | Submit guards + pre-order | same migration | — | `tests/portal-releases.test.ts`: each rejection; concurrent submits cannot oversell | vitest | A2, A4 |
| A6 | `portal_catalog` offers; cart `releaseId`; ships-from date floor | `lib/commands/portal.ts`, `lib/mgr/shop-view.ts`, `lib/mgr/fixtures/portal.ts` | `CatalogItem.releases[]` | `tests/shop-view.test.ts`: both offers; mixed cart floor = latest ships-from | tsc + vitest | A4 |
| A7 (P) | Shop UI: offer picker, "ships from" warning; Pre-order label on portal orders | shop component, `app/(portal)/portal/page.tsx`, `lib/mgr/portal-orders-view.ts` | — | `tests/portal-orders-view.test.ts`: submitted with release lines → Pre-order | browse screenshot | A6 |
| A8 (P) | Release form view-model (batch prefill, stock) | `lib/mgr/release-view.ts` (new) | `ReleaseViewModel` | `tests/release-view.test.ts` | vitest | A2 |
| A9 | Release form on Planning row and SKU page | `components/mgr/views/release.tsx` (new), `planning.tsx`, `sku.tsx` | — | `tests/planning-view.test.ts`: Released badge; admin/sales only | browse screenshot | A8 |
| A10 (P) | Orderable-from-stock control | `components/mgr/views/sku.tsx`, `sku-list.tsx`, `lib/mgr/sku-view.ts`, `sku-list-view.ts` | `SkuViewModel.portalFromStock` | `tests/catalog-edit-controls.test.ts` | vitest | A3 |
| A11 (P) | Confirm order flags: slipped, over release | `lib/mgr/confirm-order-view.ts`, `confirm-order.tsx` | `ConfirmLine.flags` | `tests/confirm-order-view.test.ts` (new) | vitest | A5 |
| A13 | Release delay per customer (decision 11) | Phase A migration, `lib/commands/customers.ts`, `lib/mgr/customer-view.ts`, `components/mgr/views/customer.tsx` | `CustomerEditValues.releaseDelayDays` | `tests/portal-releases.test.ts`: delayed customer neither sees nor orders until the delay passes; `tests/customers-view.test.ts`: the field | vitest | A4, A5 |
| A12 | Screens, guides, API docs, full proof | `components/mgr/screens.tsx`, `content/docs/staff-guide.mdx`, `portal-guide.mdx`, `bun run docs:api` | — | screen proof list, `tests/docs.test.ts`, `tests/api-docs.test.ts` | `bun run test && bunx tsc --noEmit && bun run lint` exit 0 | all A |

### Phase B (PR 2)

| # | Task | Files | Types | Test (first) | Accept | Depends |
|---|---|---|---|---|---|---|
| B1 | Migration + `suggest_release_allotments` / `set_release_allotments` | Phase B migration; release commands file | `ReleaseAllotmentInput` | `tests/release-allotments.test.ts`: 90-day same-format share; 20% hold-back and rounding to pool; Σ over qty refused; below confirmed refused; buyer cannot read table | vitest | Phase A merged |
| B2 | Per-customer remaining in `portal_releases` and submit; hide when pool is 0 | same migration | — | `tests/release-allotments.test.ts`: A cannot use B's allocation; overflow draws pool; pooled after hold-until; no-allocation buyer hidden at pool 0 | vitest | B1 |
| B3 (P) | Allocate view-model | `lib/mgr/release-allotments-view.ts` (new) | `ReleaseAllotmentsViewModel` | `tests/release-allotments-view.test.ts` | vitest | B1 |
| B4 | Allocate step; "Reserved for you: n"; Over-allocation flag | `release.tsx`, shop component, `confirm-order-view.ts` | `CatalogItem.releases[].reserved` | `tests/shop-view.test.ts`, `tests/confirm-order-view.test.ts` | browse screenshot | B2, B3 |
| B5 | Screens, guides, API docs, full proof | as A12 | — | as A12 | exit 0 | all B |

### Phase C (PR 3)

| # | Task | Files | Types | Test (first) | Accept | Depends |
|---|---|---|---|---|---|---|
| C1 | Reason code on `adjust_order_lines` after confirm | `lib/commands/orders.ts`, new migration | `AdjustReasonCode` enum (zod) | `tests/commands-orders.test.ts` (or the adjust test that exists): confirmed change without code refused; `other` needs a note; old request replays | vitest | — |
| C2 (P) | Buyer sees changes after confirm | `lib/mgr/portal-order-view.ts`, `components/mgr/views/portal-order.tsx` | `PortalOrderChange` | `tests/portal-order-view.test.ts` | browse screenshot | C1 |
| C3 (P) | Changes-after-confirm report (staff) | `order_change_rows` query, `lib/mgr/order-changes-view.ts` (new), view + screen entry | `OrderChangeRow` | `tests/order-changes-view.test.ts` | vitest | C1 |
| C4 | Guides, API docs, full proof | as A12 | — | as A12 | exit 0 | C1–C3 |

Phase C does not depend on A or B, so it can be built in parallel with them.
