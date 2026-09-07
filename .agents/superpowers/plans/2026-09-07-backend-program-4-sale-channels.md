# Program 4 — Sale channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brewery names its own sale channels. Removals freeze tax treatment at write time. `ship_order` stops hardcoding `'wholesale'`.

**Architecture:** Replace the `sale_channel` enum with table `sale_channels` per `docs/plans/sale-channels-customizable.md`, plus §16.3 tax treatment columns. Seed four defaults on `breweries` insert.

**Tech Stack:** Same as Program 1.

**Spec:** `docs/plans/sale-channels-customizable.md` (identity/assignment). `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` §16.3 tax treatment. Parent plan. Program 3 already added nullable `price_lists.channel_id`.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Programs 0–3 merged.
- Channel columns do **not** classify TTB removal type — `movement_type` still does.
- `tax_treatment` values: `taxable`, `export`, `vessel_supplies`, `research`, `transfer_in_bond`. Default `taxable`.
- Resolution frozen on `inventory_movements.tax_treatment` at insert: customer override → channel default; no customer ⇒ channel default.
- `on delete restrict` from movements to channels.
- Trigger on `breweries` insert seeds Wholesale, Taproom, DTC, Export (names matching today's four; Export default `tax_treatment = 'export'`).
- TDD, docs:api, staff-guide, no Co-Authored-By.

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | table, tax enum, movement FK, seed trigger, CHECK rewrite, `ship_order_impl` |
| `lib/commands/catalog.ts` | `upsert_sale_channel`, `delete_sale_channel`, `list_sale_channels` |
| `lib/commands/inventory.ts` | `record_movement` takes `saleChannelId` not enum |
| `lib/commands/customers.ts` | customer `taxTreatment` optional |
| `app/(app)/settings/` or catalog | Sale channels / Channel screens |
| `tests/sale-channels.test.ts` | Proof |

---

### Task 1: Table, seed, tax freeze

**Files:** baseline, `tests/sale-channels.test.ts`

**Interfaces:**
- Produces: `sale_channels (id, brewery_id, name, tax_treatment not null default 'taxable')`. `customers.tax_treatment` nullable. `inventory_movements.sale_channel_id` replaces `channel` enum; `inventory_movements.tax_treatment` not null on removal types that currently require a channel.

- [ ] **Step 1:**

```ts
it("a new brewery has four channels and Export is untaxpaid", async () => {
  const b = await makeBrewery();
  const { data } = await admin.from("sale_channels").select("name,tax_treatment").eq("brewery_id", b.id).order("name");
  expect(data!.map((c) => c.name)).toEqual(["DTC", "Export", "Taproom", "Wholesale"]);
  expect(data!.find((c) => c.name === "Export")!.tax_treatment).toBe("export");
});

it("deleting a channel that a movement references is rejected", async () => {
  // record_movement a sale_removal against Wholesale, then delete_sale_channel → 23503
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Create enum `tax_treatment`. Create table. Trigger `after insert on breweries`. Drop type `sale_channel` after rewriting `removal_shape`:

```sql
when 'sale_removal' then qty < 0 and sale_channel_id is not null and dest_state is not null and tax_treatment is not null
when 'depletion'    then qty < 0 and sale_channel_id is not null and dest_state is null and tax_treatment is not null
```

`record_inventory_movement` resolves tax: `coalesce(customer.tax_treatment, channel.tax_treatment)` — for staff `record_movement` there is no customer, so channel default. `ship_order_impl` looks up the brewery's channel named `'Wholesale'` **once via `sale_channels` where name = 'Wholesale'`** and writes `sale_channel_id` + frozen tax. Do not keep a text literal of the enum.

- [ ] **Step 4–5:** PASS, commit `feat(schema): sale_channels table and frozen tax treatment`

---

### Task 2: Commands

**Files:** `lib/commands/catalog.ts`, `inventory.ts`, `customers.ts`, matrix, grant list

**Interfaces:**
- `upsert_sale_channel({ id?, name, taxTreatment })` admin
- `delete_sale_channel({ channelId })` admin — map 23503 to CommandError `'channel is in use'`
- `list_sale_channels` admin/sales/warehouse
- `record_movement` input: `saleChannelId: uuid` optional except sale_removal/depletion
- `upsert_customer` input: `taxTreatment` optional

- [ ] **Step 1:** Registry tests for upsert/list/delete and a sales deny on upsert.

- [ ] **Step 2–5:** Implement, update `app/(app)/inventory/movement-form.tsx` to fetch channels. Commit `feat(catalog): sale channel commands`

---

### Task 3: `price_lists.channel_id` required on new lists

**Files:** `upsert_price_list` gains `channelId`; existing tests pass a Wholesale id from `list_sale_channels`.

- [ ] **Step 1:** `upsert_price_list` without channel fails. With channel succeeds.

- [ ] **Step 2–5:** NOT NULL on `price_lists.channel_id` after backfill in the baseline (seed lists in tests always have a channel because `makeBrewery` now has channels). Commit `feat(pricing): price list belongs to a channel`

---

### Task 4: Screens, docs, browse

Ungate Sale channels / Channel screens. `bun run docs:api`. Staff-guide. Browse Settings/Catalog channels, record a sale_removal with a picked channel, delete unused vs used.

Commit `docs: sale channels live`

---

## Validation

```bash
bunx vitest run tests/sale-channels.test.ts tests/commands-inventory.test.ts tests/orders-fulfillment.test.ts tests/commands-customers.test.ts tests/rls-command-boundary.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `ship_order_impl` still writes `'wholesale'` text | High | Task 1 test that movement.sale_channel_id is a uuid joining sale_channels.name = 'Wholesale' |
| Seeding names vs brewery language | Low | Names are English defaults; upsert can rename |
| POS assignment | — | Out of scope (slice 7 / parked Square) |

## Acceptance

- [ ] No `sale_channel` enum
- [ ] Four seeded channels per brewery
- [ ] Movement tax_treatment does not change when the channel is later edited
- [ ] Used channel cannot be deleted
