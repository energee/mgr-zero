# Customizable sale channels

Replace the `sale_channel` Postgres enum with a per-brewery table so breweries
create and assign channels on their own plans. Seeded with the four current
values; a channel is deletable while nothing references it.

Branch `sale-channels`, worktree `.agents/worktrees/sale-channels`.
Baseline is edited in place (`supabase/migrations/00001_baseline.sql`) — nothing
is deployed, so this is a text edit plus `supabase db reset`. After a real
brewery has movement rows it becomes `ALTER TYPE ADD VALUE` plus a constraint
rewrite plus a backfill that cannot be answered, because the information was
never captured. This is the cheap moment.

## Why

`sale_channel` is hardcoded in five places kept in sync by hand, with no test
asserting they agree:

| # | Location | Form |
|---|---|---|
| 1 | `00001_baseline.sql:47` | `create type sale_channel as enum ('wholesale','taproom','dtc','export')` |
| 2 | `00001_baseline.sql:344` | `when 'depletion' then … channel = 'taproom'` |
| 3 | `00001_baseline.sql:1654` | `ship_order_impl` inserts the literal `'wholesale'` |
| 4 | `lib/commands/inventory.ts:9` | `z.enum(["wholesale","taproom","dtc","export"])` |
| 5 | `app/(app)/inventory/movement-form.tsx:20` | `const CHANNELS = [...] as const` |

4 and 5 disappear entirely: both become a fetched list. 1 becomes a table. 2
loses its literal without needing one. 3 is replaced by a column on the order —
see "Where a movement gets its channel" below.

## Design

### The table

Modelled on `locations` — the existing brewery-scoped lookup.

```sql
create table sale_channels (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  unique (id, brewery_id),
  unique (brewery_id, name)
);
```

No semantic column. An earlier draft carried `requires_dest_state`; it was
removed because `dest_state` null-ness keys off `type`, never off the channel —
so the column would have encoded nothing the `removal_shape` CHECK did not
already enforce.

### The depletion rule (hardcode 2)

`channel = 'taproom'` was not carrying the invariant. `dest_state` discipline
comes from `type`, so the literal drops and the CHECK stays a plain CHECK — no
cross-table reference, no trigger:

```sql
when 'sale_removal' then qty < 0 and sale_channel_id is not null and dest_state is not null
when 'depletion'    then qty < 0 and sale_channel_id is not null and dest_state is null
-- every other type: sale_channel_id is null and dest_state is null (unchanged in shape)
```

### Deletion

`inventory_movements` references `(sale_channel_id, brewery_id)` with
`on delete restrict`. "Removable only if unused" is then enforced by Postgres,
not by application code, and `delete_sale_channel` turns `23503` into human copy.

### Seeding

A trigger on `breweries` insert writes the four defaults. A trigger rather than
the creation paths because there is no `create_brewery` RPC — rows arrive from
`scripts/seed-dev.ts`, onboarding, and every test fixture. One trigger covers
all of them.

## Where a movement gets its channel — decided

A brewery-wide default was considered and rejected. Breweries expect to ship
under more than one channel (`Wholesale` and `Customer` were named), and to run
**different channels for two Square locations** — so no single brewery-level
value can be correct. The rule instead:

> Every source that generates a movement names its own channel. MGR supplies
> the list and never infers a channel from anything else.

| Source | Carries the channel | Lands in |
| --- | --- | --- |
| Shipped order | `orders.sale_channel_id` | this change (Task 6) |
| POS sale / refund | `pos_locations.sale_channel_id`, with an optional per-item override | slice 7 |
| Manual movement | chosen in the form | Task 9 |

`breweries.default_sale_channel_id` survives only as a **pre-fill** for new
orders and for portal-submitted orders where no one picks — never as the value
read at ship time. `ship_order_impl` reads `o.sale_channel_id`, which is
`not null`, so shipping cannot depend on a lookup that may have been renamed.

This drops the coupling noted below: `ship_order_impl` currently infers the
channel from `o.kind = 'wholesale'`, so channel and order kind are the same
fact stored twice. After this they are independent, which is the point — a
brewery adding `Export` can put an order on it.

### POS assignment is not built here

Slice 7 owns it; `pos_locations` and `pos_item_mappings` already exist. Recorded
so that work resolves `coalesce(item.sale_channel_id, location.sale_channel_id)`
rather than re-hardcoding a literal.

## Tasks

TDD throughout: each task writes its named test first, watches it fail, then
implements. Tests hit the real database (`npx supabase start`).

**Sequential spine: 1 → 2 → 3 → 4 → 6 → 7 → 6b. Tasks 5, 8, 9 parallel after 4.**

1. **`sale_channels` table + RLS.**
   Test: `tests/sale-channels.test.ts` — staff of brewery A cannot read
   brewery B's channels; `unique (brewery_id, name)` rejects a duplicate.
   Files: `supabase/migrations/00001_baseline.sql` (table beside `locations`;
   add `'sale_channels'` to the `staff_read` foreach array at :2507).
   Accept: `npx vitest run tests/sale-channels.test.ts`.

2. **Seed trigger on brewery insert.**
   Test: `tests/sale-channels.test.ts` — a new brewery has exactly
   Wholesale, Taproom, DTC, Export.
   Files: baseline (trigger + `private.` function).
   Depends: 1.

3. **Column swap on `inventory_movements`.**
   Test: `tests/sale-channels.test.ts` — a movement referencing another
   brewery's channel is rejected by the composite FK.
   Files: baseline — `channel sale_channel` → `sale_channel_id uuid`;
   `foreign key (sale_channel_id, brewery_id) references sale_channels (id, brewery_id) on delete restrict`;
   drop `create type sale_channel` (:47).
   Depends: 2.

4. **`removal_shape` CHECK rewrite.**
   Test: `tests/commands-inventory.test.ts` — a `depletion` without a channel
   is rejected; a `depletion` with any channel and null `dest_state` is
   accepted (this is the behaviour change: no longer pinned to Taproom).
   Files: baseline :343–353.
   Depends: 3.

5. **`record_inventory_movement` signature.**
   Test: `tests/commands-inventory.test.ts` — replay under the same
   `p_request_id` still returns the first result with the new payload shape.
   Files: baseline :2190–2201 — `p_channel public.sale_channel` →
   `p_sale_channel uuid`, including the `claim_command_request` payload.
   Depends: 4. Parallel with 8, 9.

6. **`orders.sale_channel_id` + `ship_order_impl`.**
   Test: `tests/orders-fulfillment.test.ts` — shipping posts a `sale_removal`
   carrying the order's own channel; two orders on different channels produce
   two differently-classified movements; renaming a channel does not affect
   either. `tests/rls-orders.test.ts` — an order cannot reference another
   brewery's channel.
   Files: baseline — `orders.sale_channel_id uuid not null` with the composite
   FK; `breweries.default_sale_channel_id` as the pre-fill only; :1654 selects
   `o.sale_channel_id` instead of the literal, and stops keying off
   `o.kind = 'wholesale'` for the channel (the `kind` branch still chooses
   between `sale_removal` and the two `taproom_transfer` rows).
   Depends: 4.

6b. **Order create + portal.**
   Test: `tests/commands-orders.test.ts` — `create_order` accepts a channel and
   falls back to the brewery pre-fill; `tests/commands-portal.test.ts` — a
   customer-submitted order gets the pre-fill and the customer cannot choose
   one.
   Files: `lib/commands/orders.ts`, `lib/commands/portal.ts`, baseline
   (`create_order`); `app/(app)/orders/order-form.tsx` adds the picker.
   Depends: 6, 7.

7. **Channel commands.**
   Test: `tests/commands-inventory.test.ts` — `delete_sale_channel` on a
   referenced channel fails with human copy, not a raw `23503`.
   Files: `lib/commands/inventory.ts`; baseline (`upsert_sale_channel`,
   `delete_sale_channel`, `list_sale_channels`, modelled on
   `upsert_price_list` at :2146 — `assert_staff(['admin','sales'])` +
   `claim_command_request`).
   Depends: 6.

8. **Zod input (hardcode 4).**
   Test: `tests/commands-inventory.test.ts` — `channel: z.enum([...])` gone;
   `saleChannelId: z.string().uuid().optional()` accepted.
   Files: `lib/commands/inventory.ts:9`.
   Depends: 5. Parallel with 5, 9.

9. **Movement form (hardcode 5).**
   No unit test — UI rendering. Logic below the boundary is covered by 8;
   verify by eye per AGENTS.md step 4.
   Files: `app/(app)/inventory/movement-form.tsx:20,37` — `CHANNELS` constant
   becomes `list_sale_channels`; default is the brewery's Taproom row rather
   than the string `"taproom"`.
   Depends: 8.

10. **Settings screen to manage channels.**
    No unit test — UI rendering over commands covered by 7.
    Files: `app/(app)/settings/channels/page.tsx` + form, following
    `app/(app)/pricing/price-list-form.tsx`.
    Depends: 7.

11. **Docs.**
    Files: `docs/user-guide.md` (customer language: creating a channel,
    why one cannot be deleted while in use); `.agents/MEMORY.md` (the enum →
    table decision and its reason).
    Depends: 10.

## Final validation

`npx vitest run && npx tsc --noEmit && npm run lint`, plus `next build` in CI.
`supabase db reset` before the suite, since the baseline changed.

## Not in scope

- **Wireframes.** `2026-08-31-mgr-wireframes.html` is being edited in another
  session. The POS item frame's premise chip should become a sale-channel
  picker and its `SCHEMA-GATE` note should go — coordinate, do not edit here.
- **An enum-parity test** for the remaining enums (`movement_type` is duplicated
  the same way at `inventory.ts:7`). Worth doing; unrelated to this change.
- **Premise reporting.** Once channels are data a brewery can create
  `Taproom · off-premise` and MGR reports on it with no schema change. That
  falls out of this work rather than needing its own.
