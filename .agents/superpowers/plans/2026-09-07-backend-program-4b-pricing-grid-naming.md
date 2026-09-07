# Program 4b — Pricing grid and naming standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price every SKU by one lookup, `channel_prices[customer's sale channel][brand's price tier][sku's format]`, and use one name per concept (sale channel, price tier, format, channel price) across SQL, commands, pages, screens and guides.

**Architecture:** Replace `price_lists` / `price_list_formats` / `price_list_items` with `price_tiers` (rows), `channel_prices` (cells) and `customers.sale_channel_id` (column group). `brands.price_group` becomes `brands.price_tier_id`. Orders copy the customer's channel at creation and `ship_order_impl` posts to it, retiring the Wholesale-by-name lookup. One baseline edit, then commands, then pages/screens/docs.

**Tech Stack:** Same as Program 4 (Next.js App Router, Supabase Postgres + RLS, security-definer RPCs, vitest against the throwaway test stack, agent-browser).

**Spec:** `.agents/superpowers/specs/2026-09-07-mgr-pricing-grid-naming.md` (binding). Also §16.3 of `2026-08-31-mgr-schema-design.md` for sale channels.

## Global Constraints

- Worktree `.agents/worktrees/backend`, branch `backend`. Program 4 merged (`7a61de7`).
- Names, verbatim from the spec: `sale_channels` / `sale_channel_id` / `saleChannelId`; `price_tiers` / `price_tier_id` / `priceTierId`; `channel_prices`; commands `list_price_tiers`, `upsert_price_tier`, `delete_price_tier`, `list_channel_prices`, `set_channel_price`, `clear_channel_price`. Nothing new contains `price_list`, `price_group`, or `override`.
- `channel_prices` primary key `(sale_channel_id, price_tier_id, format_id)`; `unit_price_cents int not null check (>= 0)`; composite FKs to `sale_channels`, `price_tiers`, `formats` on `(id, brewery_id)`, all `on delete restrict`.
- `customers.sale_channel_id not null`; `orders.sale_channel_id not null` copied from the customer at creation; `brands.price_tier_id` nullable (an untiered brand is unpriced everywhere).
- `sku_prices` view columns: `brewery_id, sale_channel_id, sku_id, sku_name, brand_name, active, unit_price_cents`.
- Portal customers read `channel_prices` for their own channel only; `sale_channels` stays staff-only.
- Iron rules (`.agents/ARCHITECTURE.md`): every mutation via a granted `security definer` RPC with `search_path = ''` and `claim_command_request`; every tenant table has `brewery_id` + RLS; tests hit the real database.
- `tests/rpc-allowlist.test.ts` sorted; `tests/rls-command-boundary.test.ts` one matrix row per mutation; `tests/screen-command-gates.test.ts` green; `bun run docs:api` after command edits; staff and portal guides updated in the same commit.
- No Co-Authored-By trailers. Do not edit `.agents/PROGRESS.md`, `MEMORY.md`, `DRIFT.md`.

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/00001_baseline.sql` | tables, view, pricing function, order/ship RPCs, tier and price RPCs, policies, grants |
| `tests/helpers.ts` | `seedCustomer` assigns a channel; new `seedPriceTier`, `priceSku` helpers |
| `tests/pricing.test.ts` | the grid: tier, cell, lookup, portal read, restrict deletes |
| `lib/commands/catalog.ts` | `upsert_brand { priceTierId }`, `list_price_tiers`, `upsert_price_tier`, `delete_price_tier` |
| `lib/commands/customers.ts` | `upsert_customer { saleChannelId }`, `list_channel_prices`, `set_channel_price`, `clear_channel_price`; price-list commands removed |
| `lib/commands/import.ts` | import kind `channel_prices` replaces `price_list_items` (still a fail-closed stub) |
| `app/(app)/pricing/` | `page.tsx` grid per channel, `price-cell-form.tsx`, `tier-form.tsx` |
| `app/(app)/catalog/brand-form.tsx` | price tier select |
| `app/(app)/customers/*` | sale channel select and column |
| `components/mgr/screens.tsx`, `lib/mgr/nav.ts`, `lib/mgr/screen-links.ts` | Prices / Price tiers screens, nav label |
| `content/docs/staff-guide.mdx`, `portal-guide.mdx`, `api.mdx` | customer docs |

---

### Task 1: Schema — tiers, cells, channel on customer and order

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` (brands ~236–256, price tables ~346–395, orders ~988–1006, `order_line_price` ~1731, `create_order_impl` ~1762–1790, reprice sites ~1814 and ~1868, `ship_order_impl` ~1934–1957, `upsert_brand` ~2433–2456, `upsert_customer` ~2628–2650, `upsert_sale_channel` / `delete_sale_channel` Wholesale guards ~2585–2620, price RPCs ~2675–2770, portal submit check ~2888–2897, policies ~3486–3496, staff_read array ~3439, grants ~4452–4510)
- Modify: `tests/helpers.ts:104–125`
- Rewrite: `tests/pricing.test.ts`
- Modify: every test that inserts `price_lists` or passes `priceListId` / `price_list_id`: `tests/commands-customers.test.ts`, `tests/commands-orders.test.ts`, `tests/commands-portal.test.ts`, `tests/orders-fulfillment.test.ts`, `tests/orders-lifecycle.test.ts`, `tests/command-idempotency.test.ts`, `tests/commands-catalog.test.ts` (price_group), `tests/chat-delivery-policy.test.ts`, `tests/chat-jobs.test.ts`, `tests/chat-occurrences.test.ts`, `tests/commands-today.test.ts`, `tests/data-api-boundary.test.ts`, `tests/helpers.test.ts`, `tests/rls-command-boundary.test.ts` (RPC payloads only; command rows come in Task 2), `tests/rpc-allowlist.test.ts`, `tests/sale-channels.test.ts` (Wholesale-guard tests removed; price-list restrict test becomes a channel_prices restrict test)

**Interfaces:**
- Produces RPCs (all `security definer set search_path = ''`, `assert_staff`, `claim_command_request`):
  - `upsert_price_tier(p_brewery uuid, p_id uuid, p_name text, p_position int, p_request_id uuid) returns jsonb` — admin, sales
  - `delete_price_tier(p_brewery uuid, p_id uuid, p_request_id uuid) returns jsonb` — admin, sales; 23503 propagates
  - `set_channel_price(p_brewery uuid, p_sale_channel uuid, p_price_tier uuid, p_format uuid, p_unit_price_cents int, p_request_id uuid) returns jsonb` — admin, sales; upsert on the PK
  - `clear_channel_price(p_brewery uuid, p_sale_channel uuid, p_price_tier uuid, p_format uuid, p_request_id uuid) returns jsonb` — admin, sales
  - `upsert_brand(... p_price_tier uuid ...)` replaces `p_price_group text` in the same position
  - `upsert_customer(p_brewery, p_id, p_name, p_type, p_state, p_sale_channel uuid, p_license_no, p_payment_terms, p_tax_treatment, p_request_id)` — `p_sale_channel` replaces `p_price_list`, required (raise `'customer needs a sale channel'` when null)
  - `private.order_line_price(p_brewery uuid, p_sale_channel uuid, p_sku uuid) returns int`
- Produces view `sku_prices(brewery_id, sale_channel_id, sku_id, sku_name, brand_name, active, unit_price_cents)`.
- Produces helpers: `seedCustomer(breweryId, { name?, state?, saleChannelId? })` → `{ customerId, shipToId, saleChannelId }`; `seedPriceTier(breweryId, name = "1", position = 1)` → `tierId`; `priceSku(breweryId, { saleChannelId, brandId, formatId, cents })` → sets the brand's tier (creating tier "1" if the brand has none) and the cell.

- [ ] **Step 1: Write the failing tests** — replace `tests/pricing.test.ts` with:

```ts
// tests/pricing.test.ts — the price grid: channel × tier × format (spec 2026-09-07-mgr-pricing-grid-naming).
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, seedPriceTier, channelId, makeCustomerUser, asUser } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string }; let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let cat: Awaited<ReturnType<typeof seedCatalog>>; let wholesale: string; let taproom: string;
beforeAll(async () => {
  b = await makeBrewery(); ctx = await makeStaffCtx(b.id, "sales"); cat = await seedCatalog(b.id);
  wholesale = await channelId(b.id, "Wholesale"); taproom = await channelId(b.id, "Taproom");
});

async function setCell(channel: string, tier: string, cents: number) {
  return admin.rpc("set_channel_price", { p_brewery: b.id, p_sale_channel: channel, p_price_tier: tier, p_format: cat.formatId, p_unit_price_cents: cents, p_request_id: crypto.randomUUID() });
}

describe("price tiers", () => {
  it("a tier is unique by name and by position within a brewery", async () => {
    const t = await seedPriceTier(b.id, "1", 1);
    const dupName = await admin.from("price_tiers").insert({ brewery_id: b.id, name: "1", position: 9 });
    const dupPos = await admin.from("price_tiers").insert({ brewery_id: b.id, name: "9", position: 1 });
    expect(dupName.error?.code).toBe("23505"); expect(dupPos.error?.code).toBe("23505");
    expect(t).toBeTruthy();
  });
  it("a brand on another brewery's tier is rejected by the composite FK", async () => {
    const other = await makeBrewery(); const foreign = await seedPriceTier(other.id, "1", 1);
    const { error } = await admin.from("brands").update({ price_tier_id: foreign }).eq("id", cat.brandId);
    expect(error?.code).toBe("23503");
  });
});

describe("channel prices resolve one cell per channel × tier × format", () => {
  let tier: string;
  beforeAll(async () => {
    tier = (await admin.from("price_tiers").select("id").eq("brewery_id", b.id).eq("name", "1").single()).data!.id;
    await admin.from("brands").update({ price_tier_id: tier }).eq("id", cat.brandId);
  });
  it("an unpriced sku is not in sku_prices; a cell prices every sku of that brand's tier on that channel", async () => {
    const before = await admin.from("sku_prices").select("sku_id").eq("brewery_id", b.id);
    expect(before.data).toEqual([]);
    const { error } = await setCell(wholesale, tier, 13200); expect(error).toBeNull();
    const rows = await admin.from("sku_prices").select("sale_channel_id, sku_id, unit_price_cents").eq("brewery_id", b.id);
    expect(rows.data).toEqual([{ sale_channel_id: wholesale, sku_id: cat.skuId, unit_price_cents: 13200 }]);
  });
  it("the same sku prices differently per channel and repricing a cell replaces it", async () => {
    await setCell(taproom, tier, 700);
    await setCell(wholesale, tier, 13500);
    const rows = await admin.from("sku_prices").select("sale_channel_id, unit_price_cents").eq("sku_id", cat.skuId).order("unit_price_cents");
    expect(rows.data).toEqual([{ sale_channel_id: taproom, unit_price_cents: 700 }, { sale_channel_id: wholesale, unit_price_cents: 13500 }]);
  });
  it("clearing a cell unprices the sku on that channel only", async () => {
    const { error } = await admin.rpc("clear_channel_price", { p_brewery: b.id, p_sale_channel: taproom, p_price_tier: tier, p_format: cat.formatId, p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    const rows = await admin.from("sku_prices").select("sale_channel_id").eq("sku_id", cat.skuId);
    expect(rows.data).toEqual([{ sale_channel_id: wholesale }]);
  });
  it("a channel, tier or format with a cell cannot be deleted", async () => {
    const t = await admin.from("price_tiers").delete().eq("id", tier); expect(t.error?.code).toBe("23503");
    const f = await admin.from("formats").delete().eq("id", cat.formatId); expect(f.error?.code).toBe("23503");
    const c = await admin.from("sale_channels").delete().eq("id", wholesale); expect(c.error?.code).toBe("23503");
  });
});

describe("customers and orders carry the channel", () => {
  it("a customer needs a sale channel", async () => {
    const { error } = await admin.from("customers").insert({ brewery_id: b.id, name: "NoChan", type: "retailer", state: "PA" });
    expect(error?.code).toBe("23502");
  });
  it("create_order copies the customer's channel and prices lines from it; an unpriced sku is refused", async () => {
    const cust = await seedCustomer(b.id, { name: "Grid Bar" });
    const loc = await seedLocation(b.id);
    const created = await runCommand("create_order", { customerId: cust.customerId, shipToId: cust.shipToId, fromLocationId: loc.id, lines: [{ skuId: cat.skuId, qty: 2 }] }, ctx) as { orderId: string };
    const o = await admin.from("orders").select("sale_channel_id, order_lines(unit_price_cents)").eq("id", created.orderId).single();
    expect(o.data!.sale_channel_id).toBe(wholesale);
    expect(o.data!.order_lines).toEqual([{ unit_price_cents: 13500 }]);
    const dtc = await seedCustomer(b.id, { name: "DTC Buyer", saleChannelId: await channelId(b.id, "DTC") });
    await expect(runCommand("create_order", { customerId: dtc.customerId, shipToId: dtc.shipToId, fromLocationId: loc.id, lines: [{ skuId: cat.skuId, qty: 1 }] }, ctx))
      .rejects.toThrow(/not active and priced/);
  });
  it("a portal customer reads only its own channel's cells", async () => {
    const cust = await seedCustomer(b.id, { name: "Portal Co" });
    const email = await makeCustomerUser(cust.customerId); const db = await asUser(email);
    const cells = await db.from("channel_prices").select("sale_channel_id");
    expect(cells.data!.every((r) => r.sale_channel_id === wholesale)).toBe(true);
    expect(cells.data!.length).toBeGreaterThan(0);
    const chans = await db.from("sale_channels").select("id"); expect(chans.data).toEqual([]);
  });
});
```

(`create_order`'s exact input keys: copy them from `tests/commands-orders.test.ts`.)

Add to `tests/helpers.ts`, replacing the price-list `seedCustomer`:

```ts
// A customer with one ship-to on a sale channel (Wholesale unless given).
export async function seedCustomer(breweryId: string, opts: { name?: string; state?: string; saleChannelId?: string } = {}) {
  const saleChannelId = opts.saleChannelId ?? await channelId(breweryId, "Wholesale");
  const state = opts.state ?? "PA";
  const { data: c, error: ce } = await admin.from("customers").insert({
    brewery_id: breweryId, name: opts.name ?? "Bar", type: "retailer", state, sale_channel_id: saleChannelId,
  }).select("id").single();
  if (ce) throw ce;
  const { data: st, error: se } = await admin.from("ship_tos").insert({
    brewery_id: breweryId, customer_id: c.id, label: "main", address1: "1 Main St", city: "Town", state, zip: "19100",
  }).select("id").single();
  if (se) throw se;
  return { customerId: c.id as string, shipToId: st.id as string, saleChannelId };
}

// One row of the price grid.
export async function seedPriceTier(breweryId: string, name = "1", position = 1) {
  const { data, error } = await admin.from("price_tiers").insert({ brewery_id: breweryId, name, position }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

// Price every SKU of a brand on one channel and format: put the brand on tier "1"
// (created if missing) and fill that cell. Replaces the old set_price seeding.
export async function priceSku(breweryId: string, o: { saleChannelId: string; brandId: string; formatId: string; cents: number }) {
  let tier = (await admin.from("price_tiers").select("id").eq("brewery_id", breweryId).eq("name", "1").maybeSingle()).data?.id as string | undefined;
  if (!tier) tier = await seedPriceTier(breweryId);
  await admin.from("brands").update({ price_tier_id: tier }).eq("id", o.brandId);
  const { error } = await admin.from("channel_prices").upsert({ brewery_id: breweryId, sale_channel_id: o.saleChannelId, price_tier_id: tier, format_id: o.formatId, unit_price_cents: o.cents });
  if (error) throw error;
  return tier;
}
```

Every other test that today seeds a price via `price_list_formats` / `price_list_items` / `set_price` / `set_price_list_format` calls `priceSku(b.id, { saleChannelId: cust.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents })` instead; every `priceListId` becomes `saleChannelId`. `tests/commands-catalog.test.ts` asserts `price_tier_id` instead of `price_group`.

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/test-db.sh && bunx vitest run tests/pricing.test.ts`
Expected: FAIL — `relation "price_tiers" does not exist`.

- [ ] **Step 3: Edit the baseline.** In order of appearance:

Brands (replace the `price_group` comment and column):

```sql
-- description, category and hops are optional facts drawn on the Brand screen.
-- price_tier_id is the row of the price grid this beer sits on
-- (specs/2026-09-07-mgr-pricing-grid-naming.md); null means unpriced everywhere.
create table price_tiers (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  position int not null,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  unique (brewery_id, position)
);
create index price_tiers_brewery_idx on price_tiers (brewery_id, position);
```

and in `brands`: `price_tier_id uuid,` plus `foreign key (price_tier_id, brewery_id) references price_tiers (id, brewery_id)` (restrict is the default).

Replace `price_lists`, `price_list_formats`, `price_list_items`, the `customers_price_list_fk` alter, the `sku_prices` view, and the deferred `price_lists_channel_fk` block with (placed after `sale_channels` is created, where `price_lists_channel_fk` is today):

```sql
-- The price grid (specs/2026-09-07-mgr-pricing-grid-naming.md): one cell per
-- sale channel × price tier × format. A SKU's price on a channel is the cell at
-- its brand's tier and its format; no other table prices anything.
create table channel_prices (
  brewery_id uuid not null references breweries(id),
  sale_channel_id uuid not null,
  price_tier_id uuid not null,
  format_id uuid not null,
  unit_price_cents int not null check (unit_price_cents >= 0),
  primary key (sale_channel_id, price_tier_id, format_id),
  foreign key (sale_channel_id, brewery_id) references sale_channels (id, brewery_id) on delete restrict,
  foreign key (price_tier_id, brewery_id) references price_tiers (id, brewery_id) on delete restrict,
  foreign key (format_id, brewery_id) references formats (id, brewery_id) on delete restrict
);
create index channel_prices_brewery_idx on channel_prices (brewery_id, sale_channel_id);

create view sku_prices with (security_invoker = true) as
  select s.brewery_id, cp.sale_channel_id, s.id as sku_id, s.name as sku_name, b.name as brand_name, s.active, cp.unit_price_cents
  from skus s
  join brands b on b.id = s.brand_id
  join channel_prices cp on cp.brewery_id = s.brewery_id and cp.price_tier_id = b.price_tier_id and cp.format_id = s.format_id;
```

Customers: replace `price_list_id uuid, -- FK added after price_lists` with `sale_channel_id uuid not null,` and, right after `sale_channels` is created, `alter table customers add constraint customers_sale_channel_fk foreign key (sale_channel_id, brewery_id) references sale_channels (id, brewery_id) on delete restrict;`. (Customers are created before channels in the file; the seed trigger guarantees every brewery has a Wholesale row before any customer exists.)

Orders: `price_list_id uuid, -- list used for line snapshots` → `sale_channel_id uuid not null, -- copied from the customer at creation; removals post to it`, and the composite FK line → `foreign key (sale_channel_id, brewery_id) references sale_channels (id, brewery_id) on delete restrict`.

Pricing function:

```sql
create function private.order_line_price(p_brewery uuid, p_sale_channel uuid, p_sku uuid) returns int
language plpgsql stable set search_path = '' as $$
declare v int;
begin
  select p.unit_price_cents into v from public.sku_prices p
  where p.brewery_id = p_brewery and p.sale_channel_id = p_sale_channel and p.sku_id = p_sku and p.active;
  if v is null then raise exception 'sku % is not active and priced for this customer', p_sku; end if;
  return v;
end $$;
```

`create_order_impl`: rename `v_pl` to `v_channel`. Wholesale branch: `select sale_channel_id into v_channel from public.customers where id = p_customer and brewery_id = p_brewery; if v_channel is null then raise exception 'customer not found'; end if;`. Taproom-transfer branch (no customer): `select id into v_channel from public.sale_channels where brewery_id = p_brewery order by (name = 'Taproom') desc, name limit 1;` with the comment `-- a transfer has no customer: the channel named Taproom, else the first by name`. Insert `sale_channel_id` in place of `price_list_id`; price lines with `private.order_line_price(p_brewery, v_channel, l.sku_id)`. The two reprice sites use `o.sale_channel_id`.

`ship_order_impl`: replace the `select sc.id, coalesce(...) ... where sc.name = 'Wholesale'` block and its `if v_channel is null` raise with:

```sql
    select o.sale_channel_id, coalesce(c.tax_treatment, sc.tax_treatment)
      into v_channel, v_tax
      from public.sale_channels sc
      left join public.customers c on c.id = o.customer_id
     where sc.id = o.sale_channel_id;
```

`upsert_sale_channel` / `delete_sale_channel`: delete the two `'Wholesale is the shipping channel'` guards and their comments (orders carry their channel now).

`upsert_brand`: `p_price_group text` → `p_price_tier uuid` in the signature, the claim payload key `'price_tier'`, the insert column `price_tier_id`, the update `price_tier_id = p_price_tier`.

`upsert_customer`: `p_price_list uuid` → `p_sale_channel uuid`; claim key `'sale_channel'`; `if p_sale_channel is null then raise exception 'customer needs a sale channel' using errcode = 'P0001'; end if;` before the insert; column `sale_channel_id`.

Replace `set_price_list_format`, `clear_price_list_item`, `upsert_price_list`, `set_price` with:

```sql
create function upsert_price_tier(p_brewery uuid, p_id uuid, p_name text, p_position int, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.price_tiers;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_price_tier', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'position', p_position));
  if v_replay is not null then return v_replay; end if;
  begin
    if p_id is null then
      insert into public.price_tiers (brewery_id, name, position) values (p_brewery, p_name, p_position) returning * into v_row;
    else
      update public.price_tiers set name = p_name, position = p_position where id = p_id and brewery_id = p_brewery returning * into v_row;
      if not found then raise exception 'price tier not found' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'a price tier with that name or position already exists' using errcode = 'P0001';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function delete_price_tier(p_brewery uuid, p_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_price_tier', p_request_id, jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  delete from public.price_tiers where id = p_id and brewery_id = p_brewery;   -- 23503 when a brand or cell references it
  if not found then raise exception 'price tier not found' using errcode = 'P0001'; end if;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', p_id, 'deleted', true));
end $$;

create function set_channel_price(
  p_brewery uuid, p_sale_channel uuid, p_price_tier uuid, p_format uuid, p_unit_price_cents int, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.channel_prices;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_channel_price', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sale_channel', p_sale_channel, 'price_tier', p_price_tier, 'format', p_format, 'unit_price_cents', p_unit_price_cents));
  if v_replay is not null then return v_replay; end if;
  insert into public.channel_prices (brewery_id, sale_channel_id, price_tier_id, format_id, unit_price_cents)
    values (p_brewery, p_sale_channel, p_price_tier, p_format, p_unit_price_cents)
    on conflict (sale_channel_id, price_tier_id, format_id) do update
      set unit_price_cents = excluded.unit_price_cents
      where public.channel_prices.brewery_id = excluded.brewery_id
    returning * into v_row;   -- the composite FKs refuse another brewery's channel, tier or format
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function clear_channel_price(p_brewery uuid, p_sale_channel uuid, p_price_tier uuid, p_format uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_n int;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'clear_channel_price', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sale_channel', p_sale_channel, 'price_tier', p_price_tier, 'format', p_format));
  if v_replay is not null then return v_replay; end if;
  delete from public.channel_prices where brewery_id = p_brewery and sale_channel_id = p_sale_channel and price_tier_id = p_price_tier and format_id = p_format;
  get diagnostics v_n = row_count;
  return private.complete_command_request(p_request_id, jsonb_build_object('cleared', v_n > 0));
end $$;
```

Portal submit check (~2888): replace the `price_list_items` join with `join public.sku_prices p on p.brewery_id = c.brewery_id and p.sale_channel_id = c.sale_channel_id and p.sku_id = (e->>'sku_id')::uuid and p.active` and drop the `skus` join.

Policies: delete the three `customer_own_prices` / `customer_own_price_list` policies; add

```sql
create policy customer_own_prices on channel_prices for select
  using (sale_channel_id in (select c.sale_channel_id from customers c where c.id in (select my_customer_ids())));
```

`price_tiers` gets no customer policy (buyers see tier ids only through their own cells). `staff_read` array and the `grant select` list: `'price_lists','price_list_formats','price_list_items'` → `'price_tiers','channel_prices'`. Grants: replace the four old RPC signatures with `upsert_price_tier(uuid,uuid,text,int,uuid)`, `delete_price_tier(uuid,uuid,uuid)`, `set_channel_price(uuid,uuid,uuid,uuid,int,uuid)`, `clear_channel_price(uuid,uuid,uuid,uuid,uuid)`; `upsert_brand` and `upsert_customer` lines updated to their new types; `sku_prices` stays granted.

`tests/rpc-allowlist.test.ts`: same four removals and additions, sorted; `upsert_brand` / `upsert_customer` signatures updated. `tests/sale-channels.test.ts`: drop the two Wholesale-guard tests; the "channel a price list prices for cannot be deleted" test becomes a `channel_prices` cell.

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/test-db.sh && bunx vitest run tests/pricing.test.ts tests/sale-channels.test.ts tests/commands-orders.test.ts tests/commands-portal.test.ts tests/orders-fulfillment.test.ts tests/orders-lifecycle.test.ts tests/commands-customers.test.ts tests/commands-catalog.test.ts tests/schema-rules.test.ts tests/rpc-allowlist.test.ts tests/rls-command-boundary.test.ts tests/helpers.test.ts`
Expected: PASS except `commands-customers` / `commands-catalog` registry tests that pass `priceListId` / `priceGroup` (Task 2 fixes the commands); baseline and RPC tests green. Then `bunx tsc --noEmit` (expect errors only in `lib/commands/customers.ts` and `catalog.ts`, fixed in Task 2 — if you prefer a green commit, fold Task 2's command edits into this commit and say so in the report).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00001_baseline.sql tests/
git commit -m "feat(schema): price grid — price_tiers, channel_prices, customers and orders on a sale channel"
```

---

### Task 2: Commands

**Files:**
- Modify: `lib/commands/catalog.ts` (`upsert_brand` input ~line 11–16; add tier commands after `list_sale_channels`)
- Modify: `lib/commands/customers.ts` (`upsert_customer` ~9–27; delete `upsert_price_list`, `set_price_list_item`, `set_price_list_format`, `clear_price_list_item`, `list_price_lists`; `list_customers` / `get_customer` selects)
- Modify: `lib/commands/import.ts:16` kind enum
- Modify: `tests/commands-customers.test.ts`, `tests/commands-catalog.test.ts`, `tests/pricing.test.ts` (add command-level tests), `tests/rls-command-boundary.test.ts` (matrix rows), `tests/api-docs.test.ts` if it names the old commands
- Regenerate: `content/docs/api.mdx`, `.agents/superpowers/plans/2026-09-06-api-operations-backlog.md` via `bun run docs:api`

**Interfaces:**
- Consumes Task 1's RPC signatures verbatim.
- Produces commands:
  - `upsert_brand { ..., priceTierId?: uuid }` (replaces `priceGroup`)
  - `list_price_tiers {}` → rows of `price_tiers` ordered by `position` — admin, sales, warehouse
  - `upsert_price_tier { id?, name, position }`, `delete_price_tier { priceTierId }` — admin, sales; `delete_price_tier` maps 23503 → `CommandError("price tier is in use")`
  - `upsert_customer { ..., saleChannelId: uuid (required) }`
  - `list_channel_prices { saleChannelId }` → `channel_prices` rows with `price_tiers(name, position)`, `formats(name)` — admin, sales
  - `set_channel_price { saleChannelId, priceTierId, formatId, unitPriceCents }`, `clear_channel_price { saleChannelId, priceTierId, formatId }` — admin, sales
  - `list_customers` / `get_customer` select `*, sale_channels(name)`

- [ ] **Step 1: Write the failing tests** — append to `tests/pricing.test.ts`:

```ts
describe("pricing commands", () => {
  it("upsert_price_tier creates and renames; a duplicate position is refused with copy", async () => {
    const t = await runCommand("upsert_price_tier", { name: "2", position: 2 }, ctx) as { id: string; name: string };
    expect(t.name).toBe("2");
    await expect(runCommand("upsert_price_tier", { name: "two", position: 1 }, ctx)).rejects.toThrow(/already exists/);
    const tiers = await runCommand("list_price_tiers", {}, ctx) as { name: string }[];
    expect(tiers.map((x) => x.name)).toEqual(["1", "2"]);
  });
  it("set_channel_price fills a cell, list_channel_prices reads it, clear_channel_price empties it; a tier in use cannot be deleted", async () => {
    const tiers = await runCommand("list_price_tiers", {}, ctx) as { id: string; name: string }[];
    const t2 = tiers.find((x) => x.name === "2")!.id;
    await runCommand("set_channel_price", { saleChannelId: wholesale, priceTierId: t2, formatId: cat.formatId, unitPriceCents: 15400 }, ctx);
    const cells = await runCommand("list_channel_prices", { saleChannelId: wholesale }, ctx) as { price_tier_id: string; unit_price_cents: number }[];
    expect(cells.find((c) => c.price_tier_id === t2)?.unit_price_cents).toBe(15400);
    await expect(runCommand("delete_price_tier", { priceTierId: t2 }, ctx)).rejects.toThrow(/in use/);
    await runCommand("clear_channel_price", { saleChannelId: wholesale, priceTierId: t2, formatId: cat.formatId }, ctx);
    await runCommand("delete_price_tier", { priceTierId: t2 }, ctx);
    expect((await runCommand("list_price_tiers", {}, ctx) as unknown[]).length).toBe(1);
  });
  it("upsert_customer requires a sale channel and upsert_brand takes a price tier", async () => {
    await expect(runCommand("upsert_customer", { name: "X", type: "retailer", state: "PA" }, ctx)).rejects.toThrow();
    const c = await runCommand("upsert_customer", { name: "X", type: "retailer", state: "PA", saleChannelId: wholesale }, ctx) as { sale_channel_id: string };
    expect(c.sale_channel_id).toBe(wholesale);
    const tier = (await runCommand("list_price_tiers", {}, ctx) as { id: string }[])[0].id;
    const br = await runCommand("upsert_brand", { id: cat.brandId, name: "Hazy", priceTierId: tier }, ctx) as { price_tier_id: string };
    expect(br.price_tier_id).toBe(tier);
  });
  it("warehouse can list tiers but not set a price", async () => {
    const wh = await makeStaffCtx(b.id, "warehouse");
    await runCommand("list_price_tiers", {}, wh);
    const tier = (await runCommand("list_price_tiers", {}, ctx) as { id: string }[])[0].id;
    await expect(runCommand("set_channel_price", { saleChannelId: wholesale, priceTierId: tier, formatId: cat.formatId, unitPriceCents: 1 }, wh)).rejects.toThrow();
  });
});
```

(`upsert_brand`'s other required inputs: copy whatever `tests/commands-catalog.test.ts` passes today.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run tests/pricing.test.ts`
Expected: FAIL — `unknown command: upsert_price_tier`.

- [ ] **Step 3: Implement.** In `lib/commands/customers.ts` delete the five price-list commands and add:

```ts
defineCommand({
  name: "upsert_customer", description: "Create or update a customer account: its sale channel decides its prices and where its removals post; tax treatment may override the channel default",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().min(1),
    type: z.enum(["distributor", "retailer", "brewery", "other"]),
    state: z.string().regex(/^[A-Z]{2}$/),
    saleChannelId: z.string().uuid(),
    licenseNumber: z.string().optional(), paymentTerms: z.string().optional(),
    taxTreatment: z.enum(["taxable", "export", "vessel_supplies", "research", "transfer_in_bond"]).optional(),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_customer", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_type: i.type, p_state: i.state,
    p_sale_channel: i.saleChannelId, p_license_no: i.licenseNumber ?? null,
    p_payment_terms: i.paymentTerms || null, p_tax_treatment: i.taxTreatment ?? null, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_channel_prices", description: "The price grid for one sale channel: one cell per price tier × format (integer cents)",
  roles: ["admin", "sales"],
  input: z.object({ saleChannelId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.from("channel_prices").select("*, price_tiers(name, position), formats(name)")
    .eq("brewery_id", ctx.breweryId).eq("sale_channel_id", i.saleChannelId)),
});

defineCommand({
  name: "set_channel_price", description: "Fill one cell of the price grid: every SKU on that tier and format sells at it on that channel",
  roles: ["admin", "sales"],
  input: z.object({ saleChannelId: z.string().uuid(), priceTierId: z.string().uuid(), formatId: z.string().uuid(), unitPriceCents: z.number().int().nonnegative() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_channel_price", {
    p_brewery: ctx.breweryId, p_sale_channel: i.saleChannelId, p_price_tier: i.priceTierId, p_format: i.formatId,
    p_unit_price_cents: i.unitPriceCents, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "clear_channel_price", description: "Empty one cell of the price grid; SKUs on that tier and format become unpriced on that channel",
  roles: ["admin", "sales"],
  input: z.object({ saleChannelId: z.string().uuid(), priceTierId: z.string().uuid(), formatId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("clear_channel_price", {
    p_brewery: ctx.breweryId, p_sale_channel: i.saleChannelId, p_price_tier: i.priceTierId, p_format: i.formatId, p_request_id: execution.requestId,
  })),
});
```

`list_customers` and `get_customer`: `select("*, sale_channels(name)")`; descriptions say "with sale channel name".

In `lib/commands/catalog.ts`: `priceGroup: z.string().optional()` → `priceTierId: z.string().uuid().optional()`, `p_price_group` → `p_price_tier: i.priceTierId ?? null`; add after `list_sale_channels`:

```ts
defineQuery({
  name: "list_price_tiers", description: "Rows of the price grid in position order",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("price_tiers").select("*").eq("brewery_id", ctx.breweryId).order("position")),
});

defineCommand({
  name: "upsert_price_tier", description: "Create or rename a price tier (a row of the price grid) and set its position",
  roles: ["admin", "sales"],
  input: z.object({ id: z.string().uuid().optional(), name: z.string().min(1), position: z.number().int().positive() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_price_tier", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_position: i.position, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "delete_price_tier", description: "Remove a price tier no brand sits on and no cell prices",
  roles: ["admin", "sales"],
  input: z.object({ priceTierId: z.string().uuid() }),
  handler: async (ctx, i, execution) => {
    const result = await ctx.db.rpc("delete_price_tier", { p_brewery: ctx.breweryId, p_id: i.priceTierId, p_request_id: execution.requestId });
    if (result.error?.code === "23503") throw new CommandError("price tier is in use");
    return unwrap(Promise.resolve(result));
  },
});
```

(Copy the `delete_sale_channel` handler's exact 23503 shape from the same file.) `lib/commands/import.ts:16`: `"price_list_items"` → `"channel_prices"`. `tests/rls-command-boundary.test.ts`: rows for `upsert_price_tier`, `delete_price_tier`, `set_channel_price`, `clear_channel_price` replacing the price-list rows; `upsert_customer` payload gains `saleChannelId`. Then `bun run docs:api`.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run tests/pricing.test.ts tests/commands-customers.test.ts tests/commands-catalog.test.ts tests/rls-command-boundary.test.ts tests/registry.test.ts tests/api-docs.test.ts && bunx tsc --noEmit && bun run lint`
Expected: PASS; tsc errors remain only under `app/(app)/pricing`, `customers`, `catalog/brand-form.tsx` (Task 3).

- [ ] **Step 5: Commit**

```bash
git add lib/commands tests content/docs/api.mdx .agents/superpowers/plans/2026-09-06-api-operations-backlog.md
git commit -m "feat(pricing): price tier and channel price commands; customers take a sale channel"
```

---

### Task 3: Pages, screens, guides

**Files:**
- Rewrite: `app/(app)/pricing/page.tsx`; create `app/(app)/pricing/price-cell-form.tsx`, `app/(app)/pricing/tier-form.tsx`; delete `price-form.tsx`, `price-format-form.tsx`, `price-list-form.tsx`, `clear-override-button.tsx`
- Modify: `app/(app)/catalog/brand-form.tsx:11,32,45` (tier select), `app/(app)/catalog/page.tsx` (fetch `list_price_tiers`, pass `tiers`)
- Modify: `app/(app)/customers/customer-form.tsx`, `customers/page.tsx`, `customers/[id]/page.tsx` (sale channel select and column; `list_sale_channels` replaces `list_price_lists`)
- Modify: `components/mgr/screens.tsx` — "Price lists" (~3518) becomes **Prices**, "Price tiers" (~3536) is rewritten as the tier list, "Override" (~3560) deleted; the Brand record (~1574) `E.pick("Price group", …)` → `E.pick("Price tier", "3", ["1","2","3","4","5","6","7","8"])`; New customer (~1323) `E.pick("Price list", …)` → `E.pick("Sale channel", "Wholesale", CHANNELS)`; Catalog nav (~1534) `"Price lists", "3 tiers"` → `"Prices", "3 channels · 8 tiers"`; Settings nav (~298) `"Price tiers", "customer price lists"` → `"Price tiers", "rows of the price grid"`; every `to:` map that named the retired screens
- Modify: `lib/mgr/nav.ts:71` label `Prices`; `lib/mgr/screen-links.ts:314` `"/pricing": "Prices"`
- Modify: `content/docs/staff-guide.mdx` §Price lists (~172–186 → **Prices**), customer step 5 (~160), order-failure sentence (~215), the More line (~50), Brand step (~75), the deletion list (~360); `content/docs/portal-guide.mdx` (prices come from the buyer's sale channel; no list)

**Interfaces:**
- Consumes Task 2's commands verbatim.
- Produces screens named **Prices**, **Price tiers**; nav label **Prices**.

- [ ] **Step 1: Write the failing tests** — the screen suites are the test: after renaming records, run `bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/screen-command-gates.test.ts tests/docs.test.ts tests/nav-ready-links.test.ts` and fix every failure they name (a `to:` still pointing at "Price lists" or "Override", a guide `<Screen name="Price lists" />`). Expected first run: FAIL on the retired names.

- [ ] **Step 2: Pricing page.** `app/(app)/pricing/page.tsx`:

```tsx
// app/(app)/pricing/page.tsx — Prices: the price grid, one table per sale
// channel, price tiers down and formats across. Reads list_sale_channels,
// list_price_tiers, list_formats and list_channel_prices; every cell edits
// through set_channel_price / clear_channel_price (PriceCellForm). Tiers are
// added and renamed here too (TierForm). Failures throw to the (app) boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { money } from "@/lib/mgr/money";
import { PriceCellForm } from "./price-cell-form";
import { TierForm } from "./tier-form";

type Row = { id: string; name: string };
type Cell = { sale_channel_id: string; price_tier_id: string; format_id: string; unit_price_cents: number };

export default async function PricingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [channels, tiers, formats] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx), runCommand("list_price_tiers", {}, ctx), runCommand("list_formats", {}, ctx),
  ])) as [Row[], Row[], Row[]];
  const cells = (await Promise.all(channels.map((c) => runCommand("list_channel_prices", { saleChannelId: c.id }, ctx)))).flat() as Cell[];
  const at = (ch: string, tier: string, fmt: string) => cells.find((x) => x.sale_channel_id === ch && x.price_tier_id === tier && x.format_id === fmt);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Prices</h1><TierForm nextPosition={tiers.length + 1} /></div>
      {tiers.length === 0 && <p className="text-sm text-muted-foreground">Add a price tier, then put each brand on one from Catalog.</p>}
      {channels.map((ch) => (
        <section key={ch.id} className="flex flex-col gap-2">
          <h2 className="font-medium">{ch.name}</h2>
          <div className="overflow-x-auto"><table className="text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-4 font-normal">Tier</th>{formats.map((f) => <th key={f.id} className="py-1 pr-4 font-normal">{f.name}</th>)}</tr></thead>
            <tbody>{tiers.map((t) => (
              <tr key={t.id} className="border-t"><td className="py-1 pr-4"><TierForm tier={t} nextPosition={0} /></td>
                {formats.map((f) => { const c = at(ch.id, t.id, f.id); return (
                  <td key={f.id} className="py-1 pr-4"><PriceCellForm saleChannelId={ch.id} priceTierId={t.id} formatId={f.id} cents={c?.unit_price_cents ?? null} label={c ? money(c.unit_price_cents) : "—"} /></td>); })}
              </tr>))}</tbody>
          </table></div>
        </section>
      ))}
    </div>
  );
}
```

`price-cell-form.tsx`: a `"use client"` CommandForm (same shape as `app/(app)/settings/channels/channel-form.tsx`) whose trigger is the cell's label, one `Price` input in dollars converted to integer cents, submitting `set_channel_price`, plus a Clear button calling `clear_channel_price` when `cents !== null`. `tier-form.tsx`: CommandForm for `upsert_price_tier` with `name` and `position` (prefilled `nextPosition` on create, the tier's values on edit) and a Delete calling `delete_price_tier` that shows the CommandError inline (copy `delete-channel-button.tsx`). Both files start with a module comment.

- [ ] **Step 3: Brand and customer forms.** `brand-form.tsx`: `priceGroup` → `priceTierId`; the text field becomes a native select over `tiers: { id: string; name: string }[]` with an empty "Unpriced" option; `catalog/page.tsx` fetches `list_price_tiers` and passes it. `customer-form.tsx`: `priceLists` prop → `channels: { id: string; name: string }[]`, `priceListId` state → `saleChannelId` defaulting to the channel named Wholesale (native select, required, no "None"); the two customer pages fetch `list_sale_channels`, show `c.sale_channels?.name`, and pass `saleChannelId: c.sale_channel_id`.

- [ ] **Step 4: Screens, nav, guides** per the file list. The **Prices** record (`reads: "list_sale_channels · list_price_tiers · list_formats · list_channel_prices"`, `writes: "set_channel_price · clear_channel_price · upsert_price_tier · delete_price_tier"`) draws one `E.tbl` per channel with tiers down and formats across; **Price tiers** (`reads: "list_price_tiers"`, `writes: "upsert_price_tier · delete_price_tier"`) lists rows with position, name, and "n brands". Guide text for `## Prices [#pricing]`:

> Prices are one grid per sale channel: price tiers down the side, formats across the top. Put each brand on a tier (Catalog → Brand → Price tier) and fill the cells; every SKU of that brand then sells at its format's cell on the customer's channel. An empty cell means unpriced, and an order for that SKU is refused. Clear a cell to unprice it. A tier a brand sits on, or a cell is filled for, cannot be deleted.

Customer step 5 becomes "Choose a **Sale channel** (required; Wholesale is preselected). It decides the customer's prices and where shipped orders are recorded." Remove "customer has no price list" from the order-failure sentence. Portal guide: prices shown are the buyer's channel prices; nothing else changes. Then `bun run docs:api` (no diff expected) and `bunx vitest run tests/docs.test.ts tests/design-docs.test.ts`.

- [ ] **Step 5: Run to verify it passes and browse**

Run: `bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts tests/design-docs.test.ts tests/docs.test.ts tests/screen-command-gates.test.ts tests/nav-ready-links.test.ts && bunx tsc --noEmit && bun run lint`
Expected: PASS. Then per `.agents/skills/browse/SKILL.md` (session `backend`; `bunx supabase db reset` on the app stack first, reseed): Prices shows one grid per channel; add tier "2"; fill Wholesale × 2 × half keg; Catalog → Brand → Price tier "2"; Customers → New with Wholesale preselected; New order for that customer prices the line at the cell; clear the cell and the order is refused. One screenshot per outcome in the scratchpad.

- [ ] **Step 6: Commit**

```bash
git add app components lib/mgr content tests
git commit -m "ui: Prices grid, price tiers on brands, sale channel on customers; guides"
```

---

## Validation

```bash
bash scripts/test-db.sh && bunx vitest run tests/pricing.test.ts tests/sale-channels.test.ts tests/commands-orders.test.ts tests/commands-portal.test.ts tests/orders-fulfillment.test.ts tests/commands-customers.test.ts tests/commands-catalog.test.ts tests/rls-command-boundary.test.ts tests/rpc-allowlist.test.ts tests/schema-rules.test.ts
bunx tsc --noEmit && bun run lint && bun run docs:api && bunx vitest run
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| A test still seeds `price_lists` | High | `grep -rn "price_list\|priceList\|price_group\|priceGroup\|set_price\b" tests lib app supabase content components` must return nothing before the final commit |
| Taproom-transfer orders need a channel but have no customer | Certain | `create_order_impl` picks the channel named Taproom, else the first by name; documented in the RPC comment |
| Portal buyers see tier ids | Low | ids only, `price_tiers` has no customer policy; verified by the portal test in Task 1 |
| `import.ts` kind rename breaks a fixture | Low | it is a fail-closed stub; `tests/api-docs.test.ts` catches the enum |

## Acceptance

- [ ] `grep -rn "price_list\|price_group" supabase lib app components content tests` is empty
- [ ] One `channel_prices` cell prices every SKU of that tier and format on that channel
- [ ] A customer cannot exist without a sale channel; an order carries its customer's channel and ships to it
- [ ] The Wholesale-by-name lookup and its rename/delete guard are gone
- [ ] Screens: Prices, Price tiers, Sale channels; nav label Prices; guides use sale channel / price tier / format / price only
