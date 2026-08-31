# MGR Slice 1A — Foundation Implementation Plan

status: done

> **Superseded schema:** this plan built two slice-1A migrations that were replaced by `supabase/migrations/00001_baseline.sql` on 2026-08-31 (see `../specs/2026-08-31-mgr-schema-design.md`). Task text below is history, not instructions.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-tenant foundation for MGR: Next.js + Supabase scaffold, tenancy/auth/RLS, command/query registry, product catalog, immutable FG movement ledger, allocations/ATP, and CSV import with opening balances.

**Architecture:** Every mutation is a typed command (Zod schema + permission check + logic) in a registry; the UI calls commands via a single server endpoint, and the future AI chat (plan 1C) calls the same registry as tools. Inventory is an append-only `inventory_movements` ledger; on-hand and ATP are derived views. RLS enforces tenant isolation in Postgres for both staff and portal-customer audiences.

**Tech Stack:** Next.js (App Router, TS), Supabase (Postgres/RLS/Auth, local CLI for dev + tests), Zod, vitest, shadcn/ui + Tailwind, Vercel.

**Spec:** `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`

## Global Constraints

- Every tenant table carries `brewery_id uuid not null`; RLS enabled on every table; isolation never trusted to app code.
- `inventory_movements` is append-only: no UPDATE/DELETE grants; corrections are reversal rows.
- Currency in integer cents; volume math in `numeric` (never float); `bbl` stored at write time.
- Commands only — no route handlers with inline business logic.
- Server Components by default; optimistic UI on mutations; every list query paginated + indexed in the same migration.
- Schema identical in SaaS and dedicated modes; `deployment_mode` is config, not schema.
- Consistency beats local perfection: one table pattern, one form pattern, one command pattern.
- RLS tests are first-class CI: for each table assert tenant A cannot read/write tenant B.
- Run `tsc --noEmit` clean before every commit.

---

### Task 1: Project scaffold + local Supabase

**Files:**
- Create: Next.js app at repo root (`app/`, `package.json`, `tsconfig.json`, `next.config.ts`)
- Create: `supabase/` (via `supabase init`), `.env.local`, `vitest.config.ts`
- Create: `lib/supabase/server.ts`, `lib/supabase/admin.ts`

**Interfaces:**
- Produces: `createServerClient(): Promise<SupabaseClient>` (anon, cookie-bound user) in `lib/supabase/server.ts`; `createAdminClient(): SupabaseClient` (service role, server-only) in `lib/supabase/admin.ts`.

- [ ] **Step 1: Scaffold**

```bash
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --yes
npx shadcn@latest init -y
npm i @supabase/supabase-js @supabase/ssr zod
npm i -D vitest supabase
npx supabase init
npx supabase start   # local stack; copy anon/service keys into .env.local
```

`.env.local` keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEPLOYMENT_MODE=saas`.

- [ ] **Step 2: Supabase clients**

```ts
// lib/supabase/server.ts — cookie-bound client for the logged-in user (RLS applies)
import { createServerClient as createSSR } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerClient() {
  const store = await cookies();
  return createSSR(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => store.getAll(), setAll: (all) => all.forEach(({ name, value, options }) => store.set(name, value, options)) } }
  );
}
```

```ts
// lib/supabase/admin.ts — service-role client; ONLY for tests/seeding/provisioning/invites. Never in ordinary request paths.
import { createClient } from "@supabase/supabase-js";
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 20000, fileParallelism: false } });
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx supabase status`
Expected: clean typecheck; local services running.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + Supabase + vitest"
```

### Task 2: Tenancy schema + memberships migration

**Files:**
- Create: `supabase/migrations/00001_tenancy.sql`
- Test: `tests/rls-tenancy.test.ts`
- Create: `tests/helpers.ts`

**Interfaces:**
- Produces: tables `breweries`, `brewery_users`, `customers`, `customer_users`, `ship_tos`; SQL helpers `my_brewery_ids()`, `my_customer_ids()`, `is_staff_of(uuid)`, `staff_role(uuid)`; test helpers `makeBrewery()`, `makeStaff(breweryId, role)`, `makeCustomerUser(customerId)`, `asUser(email): SupabaseClient` in `tests/helpers.ts`.

- [ ] **Step 1: Migration**

```sql
-- 00001_tenancy.sql — tenant root + membership tables. RLS derives all access from these.
create table breweries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ttb_registry_no text,
  pa_license_no text,
  timezone text not null default 'America/New_York',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create type staff_role as enum ('admin','sales','warehouse');

create table brewery_users (
  brewery_id uuid not null references breweries(id),
  user_id uuid not null references auth.users(id),
  role staff_role not null,
  created_at timestamptz not null default now(),
  primary key (brewery_id, user_id)
);

create type customer_type as enum ('distributor','retailer','brewery','other');

create table customers (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  type customer_type not null default 'retailer',
  license_no text,
  state text not null,             -- home state, 2-letter
  price_list_id uuid,             -- FK added in 00002 (price_lists created there)
  qbo_customer_id text,
  payment_terms text not null default 'net30',
  created_at timestamptz not null default now()
);
create index customers_brewery_idx on customers (brewery_id, name);

create table customer_users (
  customer_id uuid not null references customers(id),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (customer_id, user_id)
);

create table ship_tos (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  customer_id uuid not null references customers(id),
  label text not null,
  address1 text not null, address2 text, city text not null,
  state text not null,             -- drives dest_state on removals
  zip text not null,
  created_at timestamptz not null default now()
);
create index ship_tos_customer_idx on ship_tos (customer_id);

-- Access helper functions (security definer so RLS policies can call them cheaply)
create or replace function my_brewery_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select brewery_id from brewery_users where user_id = auth.uid() $$;

create or replace function my_customer_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select customer_id from customer_users where user_id = auth.uid() $$;

create or replace function is_staff_of(b uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from brewery_users where user_id = auth.uid() and brewery_id = b) $$;

create or replace function staff_role(b uuid) returns staff_role
language sql stable security definer set search_path = public as
$$ select role from brewery_users where user_id = auth.uid() and brewery_id = b $$;

-- RLS
alter table breweries enable row level security;
alter table brewery_users enable row level security;
alter table customers enable row level security;
alter table customer_users enable row level security;
alter table ship_tos enable row level security;

create policy staff_read on breweries for select using (is_staff_of(id));
create policy admin_update on breweries for update using (staff_role(id) = 'admin');

create policy member_read on brewery_users for select using (user_id = auth.uid() or is_staff_of(brewery_id));
create policy admin_write on brewery_users for all using (staff_role(brewery_id) = 'admin');

create policy staff_all on customers for all using (is_staff_of(brewery_id));
create policy customer_read_own on customers for select using (id in (select my_customer_ids()));

create policy self_read on customer_users for select using (user_id = auth.uid());
create policy staff_manage on customer_users for all
  using (exists(select 1 from customers c where c.id = customer_id and is_staff_of(c.brewery_id)));

create policy staff_all on ship_tos for all using (is_staff_of(brewery_id));
create policy customer_own on ship_tos for select using (customer_id in (select my_customer_ids()));
```

- [ ] **Step 2: Test helpers**

```ts
// tests/helpers.ts — creates tenants/users via admin client; returns RLS-bound clients per user.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

export async function makeBrewery(name = `b-${crypto.randomUUID().slice(0, 8)}`) {
  const { data, error } = await admin.from("breweries").insert({ name }).select().single();
  if (error) throw error;
  return data;
}

async function makeAuthUser() {
  const email = `${crypto.randomUUID()}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "test-password-1", email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email };
}

export async function makeStaff(breweryId: string, role: "admin" | "sales" | "warehouse" = "admin") {
  const u = await makeAuthUser();
  const { error } = await admin.from("brewery_users").insert({ brewery_id: breweryId, user_id: u.id, role });
  if (error) throw error;
  return u;
}

export async function makeCustomerUser(customerId: string) {
  const u = await makeAuthUser();
  const { error } = await admin.from("customer_users").insert({ customer_id: customerId, user_id: u.id });
  if (error) throw error;
  return u;
}

export async function asUser(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "test-password-1" });
  if (error) throw error;
  return c;
}
```

- [ ] **Step 3: Failing RLS test**

```ts
// tests/rls-tenancy.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, makeCustomerUser, asUser } from "./helpers";

describe("tenancy RLS", () => {
  let bA: any, bB: any, staffA: any, custB: any;
  beforeAll(async () => {
    bA = await makeBrewery(); bB = await makeBrewery();
    staffA = await makeStaff(bA.id, "admin");
    const { data: c } = await admin.from("customers").insert({ brewery_id: bB.id, name: "Bar X", state: "PA" }).select().single();
    custB = { customer: c, user: await makeCustomerUser(c!.id) };
  });

  it("staff of A cannot see brewery B", async () => {
    const db = await asUser(staffA.email);
    const { data } = await db.from("breweries").select("id");
    expect(data!.map(r => r.id)).toContain(bA.id);
    expect(data!.map(r => r.id)).not.toContain(bB.id);
  });

  it("staff of A cannot insert customers into B", async () => {
    const db = await asUser(staffA.email);
    const { error } = await db.from("customers").insert({ brewery_id: bB.id, name: "sneaky", state: "PA" });
    expect(error).not.toBeNull();
  });

  it("customer user sees only their own customer record", async () => {
    const db = await asUser(custB.user.email);
    const { data } = await db.from("customers").select("id");
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(custB.customer.id);
  });
});
```

- [ ] **Step 4: Run to verify fail → pass**

Run: `npx vitest run tests/rls-tenancy.test.ts` before applying the migration → FAIL (relation does not exist). Then `npx supabase db reset` (applies `00001_tenancy.sql`) and re-run → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: tenancy schema, membership RLS, RLS test harness"
```

### Task 3: Command/query registry (the AI-first backbone)

**Files:**
- Create: `lib/commands/registry.ts`, `lib/commands/context.ts`, `lib/commands/all.ts`, `app/api/command/route.ts`
- Test: `tests/registry.test.ts`

**Interfaces:**
- Consumes: `createServerClient` (Task 1), membership tables (Task 2).
- Produces:
  - `defineCommand<In, Out>({ name, description?, input: ZodType<In>, roles: StaffRole[] | "customer" | "any", requiresConfirmation?, handler(ctx, input): Promise<Out> })`
  - `defineQuery` — alias of `defineCommand` (naming signals intent)
  - `runCommand(name, rawInput, ctx): Promise<Out>` — validates, permission-checks, executes
  - `Ctx = { db: SupabaseClient /* RLS-bound */, userId: string, breweryId: string, role: StaffRole | "customer" }`
  - `buildContext(breweryId): Promise<Ctx>` in `lib/commands/context.ts`
  - `listTools(): { name, description, inputSchema, requiresConfirmation }[]` — the AI surface plan 1C consumes
  - `_clearRegistry()` — tests only

- [ ] **Step 1: Failing test**

```ts
// tests/registry.test.ts — registry validates input, enforces roles, executes handler
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineCommand, runCommand, _clearRegistry } from "@/lib/commands/registry";

describe("command registry", () => {
  it("validates input and runs handler", async () => {
    _clearRegistry();
    defineCommand({
      name: "echo", input: z.object({ msg: z.string() }), roles: ["admin"],
      handler: async (_ctx, input) => ({ echoed: input.msg }),
    });
    const ctx = { db: null as any, userId: "u", breweryId: "b", role: "admin" as const };
    await expect(runCommand("echo", { msg: "hi" }, ctx)).resolves.toEqual({ echoed: "hi" });
    await expect(runCommand("echo", { msg: 5 }, ctx)).rejects.toThrow(/validation/i);
  });

  it("rejects wrong role", async () => {
    const ctx = { db: null as any, userId: "u", breweryId: "b", role: "warehouse" as const };
    await expect(runCommand("echo", { msg: "hi" }, ctx)).rejects.toThrow(/permission/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/registry.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// lib/commands/registry.ts — single source of truth for every operation.
// UI calls these via /api/command; AI chat (plan 1C) exposes the same registry as tools.
import { ZodType } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole = "admin" | "sales" | "warehouse";
export type Ctx = { db: SupabaseClient; userId: string; breweryId: string; role: StaffRole | "customer" };

type Def<In, Out> = {
  name: string;
  description?: string;
  input: ZodType<In>;
  roles: StaffRole[] | "customer" | "any";
  requiresConfirmation?: boolean;
  handler: (ctx: Ctx, input: In) => Promise<Out>;
};

const registry = new Map<string, Def<any, any>>();

export function defineCommand<In, Out>(def: Def<In, Out>) {
  if (registry.has(def.name)) throw new Error(`duplicate command: ${def.name}`);
  registry.set(def.name, def);
  return def;
}
export const defineQuery = defineCommand;

export async function runCommand(name: string, rawInput: unknown, ctx: Ctx) {
  const def = registry.get(name);
  if (!def) throw new Error(`unknown command: ${name}`);
  const allowed = def.roles === "any" || (def.roles === "customer" ? ctx.role === "customer" : def.roles.includes(ctx.role as StaffRole));
  if (!allowed) throw new Error(`permission denied: ${name} requires ${JSON.stringify(def.roles)}`);
  const parsed = def.input.safeParse(rawInput);
  if (!parsed.success) throw new Error(`validation failed: ${parsed.error.message}`);
  return def.handler(ctx, parsed.data);
}

export function listTools() {
  return [...registry.values()].map(d => ({ name: d.name, description: d.description ?? "", inputSchema: d.input, requiresConfirmation: !!d.requiresConfirmation }));
}
export function _clearRegistry() { registry.clear(); } // tests only
```

```ts
// lib/commands/context.ts — resolves the caller's membership into a Ctx. Throws if not a member.
import { createServerClient } from "@/lib/supabase/server";
import type { Ctx } from "./registry";

export async function buildContext(breweryId: string): Promise<Ctx> {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const { data: staff } = await db.from("brewery_users").select("role").eq("brewery_id", breweryId).eq("user_id", user.id).maybeSingle();
  if (staff) return { db, userId: user.id, breweryId, role: staff.role };
  const { data: cust } = await db.from("customer_users").select("customer_id, customers!inner(brewery_id)").eq("user_id", user.id);
  if (cust?.some((r: any) => r.customers.brewery_id === breweryId)) return { db, userId: user.id, breweryId, role: "customer" };
  throw new Error("not a member of this brewery");
}
```

```ts
// app/api/command/route.ts — the single mutation endpoint. Body: { breweryId, name, input }.
import { NextResponse } from "next/server";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all"; // side-effect: registers every command

export async function POST(req: Request) {
  try {
    const { breweryId, name, input } = await req.json();
    const ctx = await buildContext(breweryId);
    return NextResponse.json({ ok: true, data: await runCommand(name, input, ctx) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
```

`lib/commands/all.ts` starts as `export {};` — Tasks 5, 9, 10 add imports to it.

- [ ] **Step 4: Run tests** — `npx vitest run tests/registry.test.ts && npx tsc --noEmit` → PASS, clean.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: command/query registry + single command endpoint"`

### Task 4: Catalog + ledger + allocations schema

**Files:**
- Create: `supabase/migrations/00002_catalog_ledger.sql`
- Test: `tests/rls-ledger.test.ts`

**Interfaces:**
- Produces: tables `products`, `skus`, `price_lists`, `price_list_items`, `locations`, `inventory_movements`, `allocations`, `taproom_pars`; views `on_hand` (brewery_id, sku_id, location_id, qty), `atp` (brewery_id, sku_id, qty); enums `package_type`, `movement_type`, `sale_channel`, `allocation_source`, `allocation_status`, `location_kind`.

- [ ] **Step 1: Migration**

```sql
-- 00002_catalog_ledger.sql — catalog, immutable movement ledger, allocations, pars.
create table products (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  style text,
  abv numeric(4,2),
  ttb_tax_class text not null default 'beer',
  created_at timestamptz not null default now()
);
create index products_brewery_idx on products (brewery_id, name);

create type package_type as enum ('keg','can','bottle');

create table skus (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  product_id uuid not null references products(id),
  name text not null,                    -- "1/2 bbl keg", "16oz 4-pack"
  package_type package_type not null,
  units_per_case int,
  bbl_per_unit numeric(12,8) not null,   -- exact fraction; basis of all TTB math
  qbo_item_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index skus_brewery_idx on skus (brewery_id, product_id);

create table price_lists (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null
);
create table price_list_items (
  price_list_id uuid not null references price_lists(id),
  sku_id uuid not null references skus(id),
  brewery_id uuid not null references breweries(id),
  unit_price_cents int not null check (unit_price_cents >= 0),
  primary key (price_list_id, sku_id)
);
alter table customers add constraint customers_price_list_fk foreign key (price_list_id) references price_lists(id);

create type location_kind as enum ('warehouse','taproom');
create table locations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  kind location_kind not null
);
create index locations_brewery_idx on locations (brewery_id);

create type movement_type as enum
  ('opening_balance','production_in','adjustment','sale_removal','taproom_transfer',
   'depletion','return_in','destruction','loss','sample','festival_removal');
create type sale_channel as enum ('wholesale','taproom','dtc','export');

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  sku_id uuid not null references skus(id),
  location_id uuid not null references locations(id),
  qty numeric(12,2) not null check (qty <> 0),   -- signed units
  bbl numeric(14,8) not null,                    -- qty * bbl_per_unit, frozen at write time
  type movement_type not null,
  channel sale_channel,
  dest_state text,
  lot_id uuid,                                   -- forward-compat (slice 5)
  ref uuid,                                      -- order_id etc.
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- removals must be negative and classified; inflows positive
  constraint removal_shape check (
    case type
      when 'sale_removal'     then qty < 0 and channel is not null and dest_state is not null
      when 'depletion'        then qty < 0 and channel = 'taproom'
      when 'destruction'      then qty < 0
      when 'loss'             then qty < 0
      when 'sample'           then qty < 0
      when 'festival_removal' then qty < 0
      when 'opening_balance'  then qty > 0
      when 'production_in'    then qty > 0
      when 'return_in'        then qty > 0
      else true
    end)
);
create index movements_onhand_idx on inventory_movements (brewery_id, sku_id, location_id);
create index movements_created_idx on inventory_movements (brewery_id, created_at);

-- Immutability at the grant level.
revoke update, delete on inventory_movements from authenticated, anon;

create type allocation_source as enum ('order_line','taproom_standing');
create type allocation_status as enum ('open','fulfilled','released');
create table allocations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  sku_id uuid not null references skus(id),
  qty numeric(12,2) not null check (qty > 0),
  source allocation_source not null,
  ref uuid not null,               -- order_line_id or location_id
  status allocation_status not null default 'open',
  created_at timestamptz not null default now()
);
create index allocations_open_idx on allocations (brewery_id, sku_id) where status = 'open';

create table taproom_pars (
  brewery_id uuid not null references breweries(id),
  location_id uuid not null references locations(id),
  sku_id uuid not null references skus(id),
  par_qty numeric(12,2) not null check (par_qty >= 0),
  primary key (location_id, sku_id)
);

-- Derived truth
create view on_hand with (security_invoker = true) as
  select brewery_id, sku_id, location_id, sum(qty) as qty
  from inventory_movements group by 1,2,3;

create view atp with (security_invoker = true) as
  select o.brewery_id, o.sku_id,
         sum(o.qty) - coalesce((select sum(a.qty) from allocations a
             where a.status = 'open' and a.brewery_id = o.brewery_id and a.sku_id = o.sku_id), 0) as qty
  from on_hand o group by o.brewery_id, o.sku_id;

-- RLS
alter table products enable row level security;
alter table skus enable row level security;
alter table price_lists enable row level security;
alter table price_list_items enable row level security;
alter table locations enable row level security;
alter table inventory_movements enable row level security;
alter table allocations enable row level security;
alter table taproom_pars enable row level security;

create policy staff_all on products for all using (is_staff_of(brewery_id));
create policy customer_read on products for select
  using (brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy staff_all on skus for all using (is_staff_of(brewery_id));
create policy customer_read on skus for select
  using (active and brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy staff_all on price_lists for all using (is_staff_of(brewery_id));
create policy staff_all on price_list_items for all using (is_staff_of(brewery_id));
create policy customer_own_prices on price_list_items for select
  using (price_list_id in (select c.price_list_id from customers c where c.id in (select my_customer_ids())));
create policy staff_all on locations for all using (is_staff_of(brewery_id));
create policy staff_read on inventory_movements for select using (is_staff_of(brewery_id));
create policy staff_insert on inventory_movements for insert with check (is_staff_of(brewery_id) and created_by = auth.uid());
create policy staff_all on allocations for all using (is_staff_of(brewery_id));
create policy staff_all on taproom_pars for all using (is_staff_of(brewery_id));
```

- [ ] **Step 2: Failing test**

```ts
// tests/rls-ledger.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, asUser } from "./helpers";

describe("ledger integrity + RLS", () => {
  let b: any, staff: any, sku: any, loc: any;
  beforeAll(async () => {
    b = await makeBrewery();
    staff = await makeStaff(b.id, "warehouse");
    const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "Hazy IPA" }).select().single();
    ({ data: sku } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "1/2 bbl keg", package_type: "keg", bbl_per_unit: 0.5 }).select().single());
    ({ data: loc } = await admin.from("locations").insert({ brewery_id: b.id, name: "Main WH", kind: "warehouse" }).select().single());
  });

  it("staff can insert movements; ledger is append-only", async () => {
    const db = await asUser(staff.email);
    const { data: { user } } = await db.auth.getUser();
    const { data: m, error } = await db.from("inventory_movements").insert({
      brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
      qty: 10, bbl: 5, type: "opening_balance", created_by: user!.id,
    }).select().single();
    expect(error).toBeNull();
    // No UPDATE/DELETE grants: PostgREST returns a permission error (or zero affected rows).
    const upd = await db.from("inventory_movements").update({ qty: 99 }).eq("id", m!.id).select();
    expect(upd.error !== null || upd.data?.length === 0).toBe(true);
    const del = await db.from("inventory_movements").delete().eq("id", m!.id).select();
    expect(del.error !== null || del.data?.length === 0).toBe(true);
    const { data: still } = await admin.from("inventory_movements").select("qty").eq("id", m!.id).single();
    expect(Number(still!.qty)).toBe(10);
  });

  it("sale_removal without dest_state is rejected by CHECK", async () => {
    const db = await asUser(staff.email);
    const { data: { user } } = await db.auth.getUser();
    const { error } = await db.from("inventory_movements").insert({
      brewery_id: b.id, sku_id: sku.id, location_id: loc.id,
      qty: -1, bbl: -0.5, type: "sale_removal", channel: "wholesale", created_by: user!.id,
    });
    expect(error).not.toBeNull();
  });

  it("on_hand and atp views sum correctly", async () => {
    const db = await asUser(staff.email);
    const { data: oh } = await db.from("on_hand").select().eq("sku_id", sku.id);
    expect(Number(oh![0].qty)).toBe(10);
    await admin.from("allocations").insert({ brewery_id: b.id, sku_id: sku.id, qty: 4, source: "taproom_standing", ref: loc.id });
    const { data: atp } = await db.from("atp").select().eq("sku_id", sku.id);
    expect(Number(atp![0].qty)).toBe(6);
  });
});
```

- [ ] **Step 3: Run fail → pass** — run before migration applies → FAIL; `npx supabase db reset` then `npx vitest run tests/rls-ledger.test.ts tests/rls-tenancy.test.ts` → PASS (both suites).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: catalog, immutable movement ledger, allocations, ATP views"`

### Task 5: Catalog + inventory commands

**Files:**
- Create: `lib/commands/catalog.ts`, `lib/commands/inventory.ts`
- Modify: `lib/commands/all.ts` (add `import "./catalog"; import "./inventory";`)
- Test: `tests/commands-inventory.test.ts`

**Interfaces:**
- Consumes: `defineCommand`, `defineQuery`, `Ctx` (Task 3); tables/views (Task 4).
- Produces commands: `create_product {name, style?, abv?}`, `create_sku {productId, name, packageType, unitsPerCase?, bblPerUnit}`, `create_location {name, kind}`, `record_movement {skuId, locationId, qty, type, channel?, destState?, note?}`, `set_taproom_par {locationId, skuId, parQty}`; queries: `get_on_hand {skuId?}`, `get_atp {skuId?}`, `list_movements {skuId?, limit?}`.
- `record_movement` computes `bbl` from the SKU and sets `created_by` — callers never supply either.

- [ ] **Step 1: Failing test**

```ts
// tests/commands-inventory.test.ts — exercises the command handlers with a real RLS-bound Ctx.
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaff, asUser } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("inventory commands", () => {
  let ctx: any;
  beforeAll(async () => {
    const b = await makeBrewery();
    const staff = await makeStaff(b.id, "admin");
    const db = await asUser(staff.email);
    const { data: { user } } = await db.auth.getUser();
    ctx = { db, userId: user!.id, breweryId: b.id, role: "admin" };
  });

  it("full flow: product -> sku -> location -> movement -> on_hand", async () => {
    const p = await runCommand("create_product", { name: "Pils" }, ctx);
    const s = await runCommand("create_sku", { productId: p.id, name: "1/6 bbl keg", packageType: "keg", bblPerUnit: "0.16666667" }, ctx);
    const l = await runCommand("create_location", { name: "WH", kind: "warehouse" }, ctx);
    await runCommand("record_movement", { skuId: s.id, locationId: l.id, qty: 12, type: "opening_balance" }, ctx);
    const oh = await runCommand("get_on_hand", { skuId: s.id }, ctx);
    expect(Number(oh[0].qty)).toBe(12);
  });

  it("record_movement surfaces CHECK failure for unclassified sale_removal", async () => {
    const p = await runCommand("create_product", { name: "Stout" }, ctx);
    const s = await runCommand("create_sku", { productId: p.id, name: "1/2 bbl keg", packageType: "keg", bblPerUnit: "0.5" }, ctx);
    const l = await runCommand("create_location", { name: "WH2", kind: "warehouse" }, ctx);
    await expect(runCommand("record_movement", { skuId: s.id, locationId: l.id, qty: -1, type: "sale_removal", channel: "wholesale" }, ctx))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run** — FAIL (commands unregistered).

- [ ] **Step 3: Implement**

```ts
// lib/commands/catalog.ts
import { z } from "zod";
import { defineCommand } from "./registry";

defineCommand({
  name: "create_product", description: "Create a beer brand/product",
  input: z.object({ name: z.string().min(1), style: z.string().optional(), abv: z.number().optional() }),
  roles: ["admin", "sales"],
  handler: async (ctx, i) => {
    const { data, error } = await ctx.db.from("products").insert({ brewery_id: ctx.breweryId, name: i.name, style: i.style, abv: i.abv }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
});

defineCommand({
  name: "create_sku", description: "Create a sellable format of a product",
  input: z.object({
    productId: z.string().uuid(), name: z.string().min(1),
    packageType: z.enum(["keg", "can", "bottle"]), unitsPerCase: z.number().int().optional(),
    bblPerUnit: z.string().regex(/^\d+(\.\d+)?$/, "numeric string"), // string preserves exact numeric
  }),
  roles: ["admin", "sales"],
  handler: async (ctx, i) => {
    const { data, error } = await ctx.db.from("skus").insert({
      brewery_id: ctx.breweryId, product_id: i.productId, name: i.name,
      package_type: i.packageType, units_per_case: i.unitsPerCase, bbl_per_unit: i.bblPerUnit,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
});

defineCommand({
  name: "create_location", description: "Create a warehouse or taproom location",
  input: z.object({ name: z.string().min(1), kind: z.enum(["warehouse", "taproom"]) }),
  roles: ["admin"],
  handler: async (ctx, i) => {
    const { data, error } = await ctx.db.from("locations").insert({ brewery_id: ctx.breweryId, ...i }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
});
```

```ts
// lib/commands/inventory.ts
import { z } from "zod";
import { defineCommand, defineQuery } from "./registry";

const movementInput = z.object({
  skuId: z.string().uuid(), locationId: z.string().uuid(),
  qty: z.number().refine(n => n !== 0, "qty cannot be 0"),
  type: z.enum(["opening_balance", "production_in", "adjustment", "sale_removal", "taproom_transfer",
                "depletion", "return_in", "destruction", "loss", "sample", "festival_removal"]),
  channel: z.enum(["wholesale", "taproom", "dtc", "export"]).optional(),
  destState: z.string().length(2).optional(),
  note: z.string().optional(),
});

defineCommand({
  name: "record_movement", description: "Append an inventory movement (immutable; corrections are reversals)",
  input: movementInput, roles: ["admin", "warehouse"],
  handler: async (ctx, i) => {
    const { data: sku, error: se } = await ctx.db.from("skus").select("bbl_per_unit").eq("id", i.skuId).single();
    if (se) throw new Error(`sku not found: ${se.message}`);
    const bbl = i.qty * Number(sku.bbl_per_unit);
    const { data, error } = await ctx.db.from("inventory_movements").insert({
      brewery_id: ctx.breweryId, sku_id: i.skuId, location_id: i.locationId,
      qty: i.qty, bbl, type: i.type, channel: i.channel ?? null,
      dest_state: i.destState ?? null, note: i.note ?? null, created_by: ctx.userId,
    }).select().single();
    if (error) throw new Error(error.message); // CHECK constraints surface here
    return data;
  },
});

defineCommand({
  name: "set_taproom_par", description: "Set par level for a SKU at a taproom",
  input: z.object({ locationId: z.string().uuid(), skuId: z.string().uuid(), parQty: z.number().nonnegative() }),
  roles: ["admin", "sales"],
  handler: async (ctx, i) => {
    const { data, error } = await ctx.db.from("taproom_pars").upsert({
      brewery_id: ctx.breweryId, location_id: i.locationId, sku_id: i.skuId, par_qty: i.parQty,
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
});

defineQuery({
  name: "get_on_hand", description: "On-hand quantity per SKU/location",
  input: z.object({ skuId: z.string().uuid().optional() }), roles: ["admin", "sales", "warehouse"],
  handler: async (ctx, i) => {
    let q = ctx.db.from("on_hand").select().eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  },
});

defineQuery({
  name: "get_atp", description: "Available-to-promise (on-hand minus open allocations) per SKU",
  input: z.object({ skuId: z.string().uuid().optional() }), roles: ["admin", "sales", "warehouse"],
  handler: async (ctx, i) => {
    let q = ctx.db.from("atp").select().eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  },
});

defineQuery({
  name: "list_movements", description: "Recent inventory movements",
  input: z.object({ skuId: z.string().uuid().optional(), limit: z.number().int().max(200).default(50) }),
  roles: ["admin", "sales", "warehouse"],
  handler: async (ctx, i) => {
    let q = ctx.db.from("inventory_movements").select().eq("brewery_id", ctx.breweryId)
      .order("created_at", { ascending: false }).limit(i.limit);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  },
});
```

```ts
// lib/commands/all.ts
import "./catalog";
import "./inventory";
export {};
```

- [ ] **Step 4: Run** — `npx vitest run tests/commands-inventory.test.ts && npx tsc --noEmit` → PASS, clean.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: catalog + inventory commands and queries"`

### Task 6: Auth pages + app shell

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/actions.ts`, `middleware.ts`
- Create: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `lib/brewery.ts`, `app/(app)/brewery-provider.tsx`

**Interfaces:**
- Consumes: `createServerClient` (Task 1), memberships (Task 2).
- Produces: `getActiveBrewery(): Promise<{ id: string, name: string, role: string }>` in `lib/brewery.ts`; `BreweryProvider` client component + `useBrewery(): string` hook in `app/(app)/brewery-provider.tsx` (re-exported for Task 7's client helper). `DEPLOYMENT_MODE=dedicated` skips the brewery switcher.

- [ ] **Step 1: Login page + server action**

```tsx
// app/(auth)/login/page.tsx
import { login } from "../actions";
export default function Login() {
  return (
    <form action={login} className="mx-auto mt-32 flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">MGR</h1>
      <input name="email" type="email" required placeholder="Email" className="rounded border p-2" />
      <input name="password" type="password" required placeholder="Password" className="rounded border p-2" />
      <button className="rounded bg-black p-2 text-white">Sign in</button>
    </form>
  );
}
```

```ts
// app/(auth)/actions.ts
"use server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export async function login(form: FormData) {
  const db = await createServerClient();
  const { error } = await db.auth.signInWithPassword({
    email: String(form.get("email")), password: String(form.get("password")),
  });
  if (error) redirect("/login?error=1");
  redirect("/");
}
```

```ts
// middleware.ts — refresh Supabase session cookies on every request
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (all) => all.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    } }
  );
  await supabase.auth.getUser();
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

- [ ] **Step 2: Active brewery resolution + shell**

```ts
// lib/brewery.ts — resolves which brewery this session operates as.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export async function getActiveBrewery() {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await db.from("brewery_users")
    .select("brewery_id, role, breweries!inner(name)").eq("user_id", user!.id);
  if (!memberships?.length) redirect("/login?error=no-membership");
  const picked = (await cookies()).get("brewery")?.value;
  const m = memberships!.find(x => x.brewery_id === picked) ?? memberships![0];
  return { id: m.brewery_id, name: (m as any).breweries.name, role: m.role };
}
```

```tsx
// app/(app)/brewery-provider.tsx
"use client";
import { createContext, useContext } from "react";
const BreweryContext = createContext<string>("");
export const useBrewery = () => useContext(BreweryContext);
export function BreweryProvider({ id, children }: { id: string; children: React.ReactNode }) {
  return <BreweryContext.Provider value={id}>{children}</BreweryContext.Provider>;
}
```

```tsx
// app/(app)/layout.tsx — authenticated shell: sidebar nav, brewery name.
import { getActiveBrewery } from "@/lib/brewery";
import { BreweryProvider } from "./brewery-provider";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const brewery = await getActiveBrewery();
  return (
    <BreweryProvider id={brewery.id}>
      <div className="flex min-h-screen">
        <aside className="w-52 border-r p-4">
          <div className="mb-6 font-semibold">{brewery.name}</div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link href="/">Dashboard</Link>
            <Link href="/inventory">Inventory</Link>
            <Link href="/catalog">Catalog</Link>
            <Link href="/settings/import">Import</Link>
            <Link href="/settings/team">Team</Link>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </BreweryProvider>
  );
}
```

`app/(app)/page.tsx`: server component rendering a "Dashboard" heading (content grows in later plans).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run dev`; create a staff user via Supabase Studio (or a one-off node script reusing `tests/helpers.ts` functions); sign in; see the shell.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: auth, session middleware, app shell with active-brewery resolution"`

### Task 7: Catalog UI (products + SKUs)

**Files:**
- Create: `app/(app)/catalog/page.tsx`, `app/(app)/catalog/product-form.tsx`, `app/(app)/catalog/sku-form.tsx`
- Create: `lib/commands/client.ts`

**Interfaces:**
- Consumes: commands from Task 5 via `/api/command`; `useBrewery` (Task 6).
- Produces: `command(breweryId: string, name: string, input: unknown): Promise<any>` in `lib/commands/client.ts`.

- [ ] **Step 1: Client command helper**

```ts
// lib/commands/client.ts — the one way client components mutate anything.
export async function command(breweryId: string, name: string, input: unknown) {
  const res = await fetch("/api/command", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ breweryId, name, input }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}
```

- [ ] **Step 2: Catalog page** — `page.tsx` is a server component: `createServerClient()`, query products with nested skus (`.from("products").select("*, skus(*)").order("name")` — RLS scopes it), render a table per product (name, style, ABV) with SKU rows (name, package type, bbl/unit). Include `<ProductForm />` and per-product `<SkuForm productId={...} />`.

- [ ] **Step 3: Forms** — `product-form.tsx` / `sku-form.tsx`: client components; shadcn `Dialog` with `Input`/`Select` fields matching the command schemas exactly (`create_product`: name, style, abv; `create_sku`: name, packageType, unitsPerCase, bblPerUnit as text input). On submit: `await command(useBrewery(), "create_product", values)` inside a try/catch that surfaces the error inline; on success close dialog + `router.refresh()`.

- [ ] **Step 4: Verify manually** — create a product and two SKUs through the UI; confirm rows in Studio carry the right `brewery_id`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: catalog UI (products, SKUs)"`

### Task 8: Inventory UI (on-hand, ATP, movement entry, log)

**Files:**
- Create: `app/(app)/inventory/page.tsx`, `app/(app)/inventory/movement-form.tsx`

**Interfaces:**
- Consumes: `on_hand`/`atp` views + `list_movements`/`record_movement` (Tasks 4–5); `command` helper (Task 7).

- [ ] **Step 1: Page** — server component: query `on_hand` joined to sku + location names, `atp` per sku, and last 50 movements (newest first). Render: an inventory table (SKU / location / on-hand / ATP) and a movement log (created_at, type badge, signed qty, sku, note). All direct RLS queries — reads don't need the command endpoint.

- [ ] **Step 2: Movement form** — client dialog: sku select, location select, qty (number), type select limited to the staff-facing subset (`opening_balance`, `production_in`, `adjustment`, `depletion`, `destruction`, `loss`, `sample`, `festival_removal`, `return_in` — `sale_removal`/`taproom_transfer` are produced by order flows in plan 1B), conditional channel/destState inputs shown when the selected type requires them (mirror the DB CHECK client-side; depletion pre-fills channel=taproom), note. Submit via `command(breweryId, "record_movement", …)`; optimistic close + `router.refresh()`; server error text shown in the dialog on failure.

- [ ] **Step 3: Verify** — record an opening balance and a depletion; on-hand updates. Attempt a movement the CHECK rejects (e.g. negative opening balance) → error surfaces in the form.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: inventory UI with on-hand/ATP and movement entry"`

### Task 9: CSV import (customers, ship-tos, catalog, prices, opening balances)

**Files:**
- Create: `lib/commands/import.ts`; Modify: `lib/commands/all.ts` (add `import "./import";`)
- Create: `app/(app)/settings/import/page.tsx`, `app/(app)/settings/import/import-client.tsx`
- Test: `tests/commands-import.test.ts`

**Interfaces:**
- Consumes: registry (Task 3), schema (Tasks 2/4).
- Produces command `import_csv { kind: "customers" | "ship_tos" | "products_skus" | "price_list_items" | "opening_balances", rows: Record<string,string>[] }` → `{ inserted: number, errors: { row: number, message: string }[] }`. Row-by-row: failures are reported per row, good rows land. Roles: `["admin"]`.

Column contracts (synthetic examples):
- customers: `name,type,license_no,state,payment_terms` → `Acme Dist,distributor,PA-123,PA,net30`
- ship_tos: `customer_name,label,address1,city,state,zip`
- products_skus: `product,style,abv,sku_name,package_type,units_per_case,bbl_per_unit` (creates product if new, then SKU)
- price_list_items: `price_list,sku_name,unit_price_cents` (creates price list if new)
- opening_balances: `sku_name,location,qty` → one `opening_balance` movement each; `bbl` computed from the SKU; `created_by: ctx.userId`

- [ ] **Step 1: Failing test**

```ts
// tests/commands-import.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaff, asUser, admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("import_csv", () => {
  let ctx: any, b: any;
  beforeAll(async () => {
    b = await makeBrewery();
    const staff = await makeStaff(b.id, "admin");
    const db = await asUser(staff.email);
    const { data: { user } } = await db.auth.getUser();
    ctx = { db, userId: user!.id, breweryId: b.id, role: "admin" };
    await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" });
  });

  it("imports products+skus then opening balances; bad rows reported not fatal", async () => {
    const r1 = await runCommand("import_csv", { kind: "products_skus", rows: [
      { product: "Hazy IPA", style: "IPA", abv: "6.5", sku_name: "1/2 bbl keg", package_type: "keg", units_per_case: "", bbl_per_unit: "0.5" },
      { product: "Hazy IPA", style: "IPA", abv: "6.5", sku_name: "16oz 4-pack", package_type: "can", units_per_case: "6", bbl_per_unit: "0.01612903" },
    ] }, ctx);
    expect(r1.inserted).toBe(2);
    const r2 = await runCommand("import_csv", { kind: "opening_balances", rows: [
      { sku_name: "1/2 bbl keg", location: "WH", qty: "24" },
      { sku_name: "does-not-exist", location: "WH", qty: "5" },
    ] }, ctx);
    expect(r2.inserted).toBe(1);
    expect(r2.errors).toHaveLength(1);
    const oh = await runCommand("get_on_hand", {}, ctx);
    expect(oh.some((r: any) => Number(r.qty) === 24)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — FAIL (command missing).

- [ ] **Step 3: Implement** — `lib/commands/import.ts`: one `defineCommand({ name: "import_csv", roles: ["admin"], input: z.object({ kind: z.enum([...]), rows: z.array(z.record(z.string(), z.string())) }) })`. Handler: `switch (i.kind)` dispatching to a per-kind row inserter; each resolves referenced entities by name **within `ctx.breweryId`** (sku by `name`, location by `name`, customer by `name`, product by `name` with create-if-missing for `products_skus`/`price_list_items`); wrap each row in try/catch pushing `{ row: index, message }`; return `{ inserted, errors }`. Opening balances insert `inventory_movements` rows exactly like `record_movement` does (same field computation — factor the insert into a shared function `insertMovement(ctx, args)` exported from `lib/commands/inventory.ts` and reuse it).

- [ ] **Step 4: Run** — test PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Import UI** — `npm i papaparse && npm i -D @types/papaparse`. `import-client.tsx`: kind select, file input, papaparse → rows preview (first 5), Import button calling `command(breweryId, "import_csv", { kind, rows })`, results panel showing inserted count + per-row errors. `page.tsx` just renders it.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: CSV import for customers, catalog, price lists, opening balances"`

### Task 10: Invitations (staff + customer users)

**Files:**
- Create: `lib/commands/invites.ts`; Modify: `lib/commands/all.ts` (add `import "./invites";`)
- Create: `app/(app)/settings/team/page.tsx`, `app/(app)/settings/team/invite-form.tsx`
- Test: `tests/commands-invites.test.ts`

**Interfaces:**
- Consumes: registry (Task 3); `createAdminClient` (Task 1) — `auth.admin.inviteUserByEmail` needs the service role, so these two handlers are the sanctioned exception to "admin client never in request paths": the command permission-checks first, then touches admin.
- Produces commands: `invite_staff { email, role }` (roles: `["admin"]`), `invite_customer_user { email, customerId }` (roles: `["admin","sales"]`) → `{ userId: string }`. Each invites the auth user by email (Supabase invite flow = magic link + password set) then inserts the membership row via the admin client (membership insert must bypass RLS since the new user isn't the caller).

- [ ] **Step 1: Failing test**

```ts
// tests/commands-invites.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaff, asUser, admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("invitations", () => {
  let adminCtx: any, warehouseCtx: any, b: any;
  beforeAll(async () => {
    b = await makeBrewery();
    for (const [role, slot] of [["admin", "adminCtx"], ["warehouse", "warehouseCtx"]] as const) {
      const u = await makeStaff(b.id, role);
      const db = await asUser(u.email);
      const { data: { user } } = await db.auth.getUser();
      const ctx = { db, userId: user!.id, breweryId: b.id, role };
      if (slot === "adminCtx") adminCtx = ctx; else warehouseCtx = ctx;
    }
  });

  it("admin invites staff; membership row created with role", async () => {
    const email = `${crypto.randomUUID()}@test.local`;
    const { userId } = await runCommand("invite_staff", { email, role: "sales" }, adminCtx);
    const { data } = await admin.from("brewery_users").select().eq("user_id", userId).eq("brewery_id", b.id).single();
    expect(data!.role).toBe("sales");
  });

  it("warehouse role cannot invite", async () => {
    await expect(runCommand("invite_staff", { email: "x@test.local", role: "sales" }, warehouseCtx))
      .rejects.toThrow(/permission/i);
  });
});
```

- [ ] **Step 2: Run** — FAIL. 

- [ ] **Step 3: Implement** — `lib/commands/invites.ts`: `invite_staff` handler calls `createAdminClient().auth.admin.inviteUserByEmail(i.email)` (fall back to `createUser` if the user already exists — look up by email via `admin.auth.admin.listUsers` filtered client-side, or catch the "already registered" error and resolve the existing id), then inserts `{ brewery_id: ctx.breweryId, user_id, role: i.role }` into `brewery_users` via the admin client. `invite_customer_user`: verify the customer belongs to `ctx.breweryId` via `ctx.db` (RLS check for free), then same pattern into `customer_users`.

- [ ] **Step 4: Run** — PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Team UI** — `settings/team/page.tsx`: server component listing `brewery_users` joined to emails is not possible via RLS (auth.users hidden) — list role + user_id and show email from the invite form's optimistic append; simplest honest version: keep a `display_email text` column? No — YAGNI: show the invite dialog + a count; full member management UI belongs to a later pass. `invite-form.tsx`: email + role select → `command(breweryId, "invite_staff", …)`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: staff and customer-user invitations"`

### Task 11: CI + README + deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1: CI**

```yaml
# .github/workflows/ci.yml — RLS + command tests gate every merge.
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase db reset
      - name: Env from local stack
        run: supabase status -o env | grep -E 'ANON_KEY|SERVICE_ROLE_KEY|API_URL' >> $GITHUB_ENV
      - run: npx vitest run
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ env.API_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ env.ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ env.SERVICE_ROLE_KEY }}
      - run: npx tsc --noEmit
      - run: npm run build
```

(Adjust the env-extraction step to the actual `supabase status -o env` output names on first run.)

- [ ] **Step 2: README** — orientation for humans and agents: what MGR is; pointer to spec + plans; local dev (`supabase start`, `.env.local` keys, `npm run dev`, `npx vitest run`); the two iron rules ("every operation is a command — `lib/commands/registry.ts`"; "never mutate `inventory_movements` — corrections are reversals").

- [ ] **Step 3: Deploy** — create hosted Supabase project + Vercel project; set the three env vars + `DEPLOYMENT_MODE=saas`; `supabase db push` to hosted; deploy; verify login → catalog → inventory on the preview URL.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "chore: CI pipeline and README"`

---

## Self-review

- **Spec coverage (foundation scope):** tenancy/RLS ✅ T2 · deployment modes ✅ T1 env + T6 · catalog ✅ T4/T5/T7 · ledger + CHECKs + immutability ✅ T4/T5/T8 · allocations/ATP ✅ T4 (allocation *creation* flows arrive with orders in plan 1B; ATP view + schema proven by test) · pars ✅ T5 · import/opening balances ✅ T9 · invites ✅ T10 · AI-first registry ✅ T3 (`listTools` ready for plan 1C) · performance ✅ (server components, indexes in migrations, optimistic dialogs).
- **Deferred to plan 1B:** orders, pick lists, shipments/short-ship, invoices, portal, taproom replenishment view, Playwright smoke. **To plan 1C:** QBO, AI chat.
- **Type consistency check:** `command(breweryId, name, input)` signature consistent across T7–T10; `Ctx` shape consistent T3/T5/T9/T10; `insertMovement` shared between T5 and T9 noted in T9 step 3.
