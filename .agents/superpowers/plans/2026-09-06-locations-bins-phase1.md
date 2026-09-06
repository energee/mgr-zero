# Locations & Bins — Phase 1 ("where things are") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ledger row — finished goods, raw materials, kegs — names a location and a bin, every location always has at least one bin, and admins can add, rename and remove bins.

**Architecture:** One in-place edit to `supabase/migrations/00001_baseline.sql` (pre-deploy, per AGENTS.md) adds a `bins` table, seeds a trio per location inside `create_location`, adds `bin_id NOT NULL` to the three ledgers with a composite FK that pins the bin to the row's location, and adds bin-grain on-hand views *beside* the existing ones so nothing downstream changes grain. Three bin RPCs go through the existing idempotent command boundary. The real inventory page grows a bin picker and column; the design screens lose their bin gates.

**Tech Stack:** Postgres (Supabase local, `bunx supabase start`), plpgsql `security definer` RPCs, Next.js App Router, zod command registry (`lib/commands/registry.ts`), vitest against the real DB (`tests/helpers.ts`), `agent-browser` for the eyeball check.

**Spec:** `.agents/superpowers/specs/2026-09-06-mgr-locations-bins-transfers-design.md` — Decisions 1 and 2, and the "Phase 1" paragraph. Read it first; this plan argues from it.

## Global Constraints

- Worktree `.agents/worktrees/docs/locations-bins`, branch `docs/locations-bins`. Run `pwd && git branch --show-current` before the first edit of every task.
- `bunx supabase start` must be running. After any baseline edit: `bunx supabase db reset` (from the worktree root) before running tests.
- Edit `supabase/migrations/00001_baseline.sql` **in place**. Do not add a second migration file.
- Every mutation is one idempotent `security definer` RPC with `set search_path = ''`, `private.assert_staff`, `private.claim_command_request` / `complete_command_request` (ARCHITECTURE.md iron rules 1 and 5). Mirror `create_location` at baseline `:2089`.
- Ledgers stay append-only: `bins` is config and gets `staff_read`; the three ledgers keep their `revoke update, delete`.
- `bin_id` is `NOT NULL` on all three ledgers. No nullable branch anywhere (spec Decision 2, §16.6).
- Bins: `name` only — **no `kind` column** (spec Decision 1).
- Minimum of one bin per location, enforced in `delete_bin` under a row lock. No `is_default` flag.
- Seeded trio names, exactly: `Walk-in`, `Cold`, `Dry`.
- `taproom_pars` is **not** re-keyed in this phase.
- Prove every task with `bun run test && bunx tsc --noEmit && bun run lint`. UI tasks also need the `browse` skill eyeball check.
- Do not edit `.agents/PROGRESS.md`, `.agents/MEMORY.md`, `.agents/DRIFT.md`. Progress note goes in the PR description.
- Commit messages: no `Co-Authored-By` trailer (user rule).

---

## File Map

| File | Responsibility in this phase |
| --- | --- |
| `supabase/migrations/00001_baseline.sql` | enum value, `bins` table + index, RLS/grant lists, `create_location` seeding, three bin RPCs, `private.first_bin`, ledger columns/FKs/indexes, four order-RPC inserts, `record_inventory_movement` signature, three new views, grant-execute list |
| `lib/commands/catalog.ts` | `create_location` kind enum, `list_bins`, `create_bin`, `update_bin`, `delete_bin` |
| `lib/commands/inventory.ts` | `record_movement` gains `binId`; `get_bin_on_hand` query |
| `app/(app)/inventory/page.tsx`, `movement-form.tsx` | bin picker on the form, Bin column on the on-hand table |
| `components/mgr/screens.tsx`, `lib/mgr/screen-links.ts` | ungate Location bins / Bin, storage kind, bin on Record movement, per-location keg rows |
| `tests/bins.test.ts` (new) | bins table, seeding, RPC guards, ledger invariant, views |
| `tests/rls-ledger.test.ts`, `tests/schema-conventions.test.ts`, `tests/commands-inventory.test.ts`, `tests/rls-command-boundary.test.ts` | existing writers gain `location_id` / `bin_id` / `binId` |
| `README.md` § HTTP API, `content/docs/staff-guide.mdx`, `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md`, `.agents/ARCHITECTURE.md` | docs |

---

### Task 1: `bins` table, seeded trio on `create_location`

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql:43` (enum), after `:314` (table), `:2089-2101` (`create_location`), `:2540-2548` (RLS list), `:3536-3545` (grant select)
- Modify: `lib/commands/catalog.ts:29-36`
- Test: `tests/bins.test.ts` (new)

**Interfaces:**
- Produces: table `public.bins (id, brewery_id, location_id, name, created_at)`; `create_location` returns the location row as before and leaves exactly three `bins` rows for it; `location_kind` accepts `'storage'`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/bins.test.ts — bins are brewery-configured subdivisions of a location; every
// location is born with a trio and can never drop below one. Spec:
// .agents/superpowers/specs/2026-09-06-mgr-locations-bins-transfers-design.md, Decision 1.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Row = { id: string; name: string };

describe("bins", () => {
  let ctx: any;
  beforeAll(async () => { ctx = await makeStaffCtx((await makeBrewery()).id, "admin"); });

  it("create_location seeds Walk-in, Cold and Dry, and accepts the storage kind", async () => {
    const loc = (await runCommand("create_location", { name: "Overflow", kind: "storage" }, ctx)) as Row;
    const { data } = await admin.from("bins").select("name").eq("location_id", loc.id).order("name");
    expect(data!.map((b) => b.name)).toEqual(["Cold", "Dry", "Walk-in"]);
  });

  it("bin names are unique per location, not per brewery", async () => {
    const a = (await runCommand("create_location", { name: "WH A", kind: "warehouse" }, ctx)) as Row;
    const b = (await runCommand("create_location", { name: "WH B", kind: "warehouse" }, ctx)) as Row;
    const dup = await admin.from("bins").insert({ brewery_id: ctx.breweryId, location_id: a.id, name: "Cold" });
    expect(dup.error?.code).toBe("23505");
    const ok = await admin.from("bins").insert({ brewery_id: ctx.breweryId, location_id: b.id, name: "Rack 3" });
    expect(ok.error).toBeNull();
  });

  it("a bin cannot point at another brewery's location", async () => {
    const other = await makeBrewery();
    const loc = (await runCommand("create_location", { name: "Mine", kind: "warehouse" }, ctx)) as Row;
    const { error } = await admin.from("bins").insert({ brewery_id: other.id, location_id: loc.id, name: "Stolen" });
    expect(error?.code).toBe("23503");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/bins.test.ts`
Expected: FAIL — `relation "public.bins" does not exist` on the first `admin.from("bins")`, and the zod enum rejects `"storage"`.

- [ ] **Step 3: Baseline — enum, table, index**

At `:43` replace the enum:

```sql
create type location_kind as enum ('warehouse','taproom','storage');
```

Immediately after the `locations` table (after the `alter table breweries add foreign key (portal_fulfillment_location_id, id)` block, before `create table inventory_movements`):

```sql
-- Physical subdivisions of a location (spec 2026-09-06 Decision 1; §16.6). Every
-- location is seeded with three inside create_location and can never drop below
-- one (delete_bin). Ledger rows reach a bin through (bin_id, location_id,
-- brewery_id) so a bin can only ever be filed under its own location.
create table bins (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  location_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (location_id, name),
  unique (id, location_id, brewery_id),
  foreign key (location_id, brewery_id) references locations (id, brewery_id)
);
create index bins_brewery_idx on bins (brewery_id, location_id);
```

- [ ] **Step 4: Baseline — RLS read, grant select**

At `:2540` add `'bins'` to the `foreach t in array array[...]` list, directly after `'locations'`.

At `:3538` add `bins` to the `grant select on ...` list, directly after `locations`.

- [ ] **Step 5: Baseline — `create_location` seeds the trio**

Replace the body of `create_location` (`:2089-2101`) so the insert becomes:

```sql
  insert into public.locations (brewery_id, name, kind) values (p_brewery, p_name, p_kind) returning * into v_row;
  -- A location always has at least one bin; the trio is a starting point the
  -- brewery renames or trims (never to zero: delete_bin refuses the last one).
  insert into public.bins (brewery_id, location_id, name)
    values (p_brewery, v_row.id, 'Walk-in'), (p_brewery, v_row.id, 'Cold'), (p_brewery, v_row.id, 'Dry');
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
```

Everything above the insert (assert_staff, claim) stays verbatim.

- [ ] **Step 6: Command — accept `storage`**

`lib/commands/catalog.ts:30-31`:

```ts
  name: "create_location", description: "Create a warehouse, taproom or storage location",
  input: z.object({ name: z.string().min(1), kind: z.enum(["warehouse", "taproom", "storage"]) }),
```

- [ ] **Step 7: Reset and run**

Run: `bunx supabase db reset && bunx vitest run tests/bins.test.ts tests/schema-rls-indexes.test.ts tests/schema-rules.test.ts tests/commands-catalog.test.ts`
Expected: all PASS. `schema-rls-indexes` passes because `bins_brewery_idx` leads with `brewery_id`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/00001_baseline.sql lib/commands/catalog.ts tests/bins.test.ts
git commit -m "schema: bins table seeded per location; storage location kind

tests/bins.test.ts"
```

---

### Task 2: Bin commands — list, create, rename, delete with the two guards

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` after `create_location`; grant-execute list at `:3571-3574`
- Modify: `lib/commands/catalog.ts` after `create_location`
- Modify: `tests/rls-command-boundary.test.ts:267-275` (matrix)
- Modify: `README.md:154-161`
- Test: `tests/bins.test.ts`

**Interfaces:**
- Consumes: `public.bins` from Task 1.
- Produces: RPCs `create_bin(p_brewery uuid, p_location uuid, p_name text, p_request_id uuid)`, `update_bin(p_brewery uuid, p_bin uuid, p_name text, p_request_id uuid)`, `delete_bin(p_brewery uuid, p_bin uuid, p_request_id uuid)` — all `returns jsonb`; commands `list_bins {locationId?}`, `create_bin {locationId, name}`, `update_bin {binId, name}`, `delete_bin {binId}`. Roles `admin`, `warehouse` for the three mutations; `list_bins` also grants `sales`, matching `list_locations`.
- Note for Task 3: `delete_bin`'s stock guard reads the three ledgers. In this task the ledgers have no `bin_id` yet, so the guard is stubbed as `v_used := false;` and **Task 3 finishes it**. The test for the stock guard is therefore written in Task 3.

- [ ] **Step 1: Write the failing tests** (append to `tests/bins.test.ts`, inside the `describe`)

```ts
  it("list_bins returns a location's bins alphabetically, warehouse can read", async () => {
    const wh = await makeStaffCtx(ctx.breweryId, "warehouse");
    const loc = (await runCommand("create_location", { name: "List WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, wh)) as Row[];
    expect(bins.map((b) => b.name)).toEqual(["Cold", "Dry", "Walk-in"]);
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    expect(((await runCommand("list_bins", { locationId: loc.id }, sales)) as Row[]).length).toBe(3);
  });

  it("create_bin and update_bin are warehouse-or-admin and idempotent by request", async () => {
    const wh = await makeStaffCtx(ctx.breweryId, "warehouse");
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    const loc = (await runCommand("create_location", { name: "Cmd WH", kind: "warehouse" }, ctx)) as Row;
    const bin = (await runCommand("create_bin", { locationId: loc.id, name: "Rack 3" }, wh)) as Row;
    expect(bin.name).toBe("Rack 3");
    const renamed = (await runCommand("update_bin", { binId: bin.id, name: "Rack 3 · top" }, wh)) as Row;
    expect(renamed.name).toBe("Rack 3 · top");
    await expect(runCommand("create_bin", { locationId: loc.id, name: "Nope" }, sales))
      .rejects.toMatchObject({ code: "permission_denied" });
  });

  it("delete_bin removes an empty bin but refuses the last one", async () => {
    const loc = (await runCommand("create_location", { name: "Del WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    await runCommand("delete_bin", { binId: bins[0].id }, ctx);
    await runCommand("delete_bin", { binId: bins[1].id }, ctx);
    await expect(runCommand("delete_bin", { binId: bins[2].id }, ctx))
      .rejects.toMatchObject({ message: expect.stringMatching(/at least one bin/i) });
    const left = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    expect(left).toHaveLength(1);
    const renamed = (await runCommand("update_bin", { binId: left[0].id, name: "Only" }, ctx)) as Row;
    expect(renamed.name).toBe("Only");
  });

  it("a bin belongs to the caller's brewery or the RPC refuses it", async () => {
    const otherCtx = await makeStaffCtx((await makeBrewery()).id, "admin");
    const loc = (await runCommand("create_location", { name: "Tenant WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    await expect(runCommand("update_bin", { binId: bins[0].id, name: "Hijack" }, otherCtx)).rejects.toBeTruthy();
    await expect(runCommand("delete_bin", { binId: bins[0].id }, otherCtx)).rejects.toBeTruthy();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run tests/bins.test.ts`
Expected: the four new cases FAIL with `unknown command list_bins` (registry throws for unregistered names).

- [ ] **Step 3: Baseline — three RPCs** (insert directly after `create_location`)

```sql
create function create_bin(
  p_brewery uuid, p_location uuid, p_name text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  insert into public.bins (brewery_id, location_id, name) values (p_brewery, p_location, p_name) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function update_bin(
  p_brewery uuid, p_bin uuid, p_name text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'bin', p_bin, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  update public.bins set name = p_name where id = p_bin and brewery_id = p_brewery returning * into v_row;
  if not found then raise exception 'bin not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Two guards, both under a row lock on the location so concurrent deletes
-- cannot empty it between them: a location keeps at least one bin, and a bin
-- that has ever recorded stock is never removed. The ledgers are append-only
-- and reference the bin, so "move the stock out first" cannot make it
-- deletable — a net-zero balance still leaves rows behind. Rename it instead.
create function delete_bin(
  p_brewery uuid, p_bin uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins; v_used boolean;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'bin', p_bin));
  if v_replay is not null then return v_replay; end if;
  select b.* into v_row from public.bins b where b.id = p_bin and b.brewery_id = p_brewery;
  if not found then raise exception 'bin not found'; end if;
  perform 1 from public.locations where id = v_row.location_id for update;
  if (select count(*) from public.bins where location_id = v_row.location_id) <= 1 then
    raise exception 'a location keeps at least one bin; rename it instead';
  end if;
  v_used := false;  -- Task 3 replaces this with the three-ledger exists check once bin_id exists
  if v_used then
    raise exception 'bin has recorded stock and cannot be removed; rename it instead';
  end if;
  delete from public.bins where id = p_bin;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
```

- [ ] **Step 4: Baseline — grant execute**

In the `grant execute on function` list at `:3571`, after `create_location(uuid,text,public.location_kind,uuid),` add:

```sql
  create_bin(uuid,uuid,text,uuid),
  update_bin(uuid,uuid,text,uuid),
  delete_bin(uuid,uuid,uuid),
```

- [ ] **Step 5: Commands** (`lib/commands/catalog.ts`, after `create_location`)

```ts
// Bins subdivide a location (spec 2026-09-06 Decision 1). Reads go through
// RLS; the three writes are the idempotent RPCs. A location never drops below
// one bin and a bin that ever recorded stock is not deleted — delete_bin raises both.
defineQuery({
  name: "list_bins", description: "Bins of one location (or all), alphabetical",
  input: z.object({ locationId: z.string().uuid().optional() }), roles: ["admin", "sales", "warehouse"],
  handler: (ctx, i) => {
    let q = ctx.db.from("bins").select("id, location_id, name").eq("brewery_id", ctx.breweryId).order("name");
    if (i.locationId) q = q.eq("location_id", i.locationId);
    return unwrap(q);
  },
});

defineCommand({
  name: "create_bin", description: "Add a bin to a location",
  input: z.object({ locationId: z.string().uuid(), name: z.string().min(1) }),
  roles: ["admin", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_bin", {
    p_brewery: ctx.breweryId, p_location: i.locationId, p_name: i.name, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "update_bin", description: "Rename a bin",
  input: z.object({ binId: z.string().uuid(), name: z.string().min(1) }),
  roles: ["admin", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_bin", {
    p_brewery: ctx.breweryId, p_bin: i.binId, p_name: i.name, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "delete_bin", description: "Remove an empty bin; a location keeps at least one",
  input: z.object({ binId: z.string().uuid() }),
  roles: ["admin", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("delete_bin", {
    p_brewery: ctx.breweryId, p_bin: i.binId, p_request_id: execution.requestId,
  })),
});
```

`defineQuery` is already imported in `catalog.ts` (used by `list_products`).

- [ ] **Step 6: Matrix entry** (`tests/rls-command-boundary.test.ts`, after the `create_location` case at `:267-275`)

```ts
    {
      command: "create_bin", rpc: "create_bin", allowed: ["admin", "warehouse"],
      input: async role => {
        const name = unique("matrix bin", role);
        return {
          command: { locationId, name },
          rpc: { p_brewery: brewery.id, p_location: locationId, p_name: name },
        };
      },
    },
```

`locationId` and `unique` are already in scope in that file (used by the `set_taproom_par` case).

- [ ] **Step 7: README rows** (`README.md` Catalog table, after `create_location`)

```md
| `create_location` | admin | Create a `warehouse`, `taproom` or `storage` location; it starts with three bins (Walk-in, Cold, Dry) |
| `list_bins` | admin, sales, warehouse | Bins of a location (optional `locationId`), alphabetical |
| `create_bin` | admin, warehouse | Add a bin to a location (`locationId`, `name`) |
| `update_bin` | admin, warehouse | Rename a bin (`binId`, `name`) |
| `delete_bin` | admin, warehouse | Remove a never-used bin (`binId`); a location always keeps at least one, and a bin that ever recorded stock is renamed, not removed |
```

Replace the existing `create_location` row rather than duplicating it. Also change `list_locations`'s purpose to "Warehouses, taprooms and storage, alphabetical".

- [ ] **Step 8: Reset and run**

Run: `bunx supabase db reset && bunx vitest run tests/bins.test.ts tests/rls-command-boundary.test.ts tests/schema-rules.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/00001_baseline.sql lib/commands/catalog.ts tests/bins.test.ts tests/rls-command-boundary.test.ts README.md
git commit -m "feat(bins): list, create, rename and delete bins; a location keeps at least one

tests/bins.test.ts"
```

---

### Task 3: `bin_id` on all three ledgers, location on materials and kegs, bin-grain views

This is the invasive task. Read the spec's "Why `not null` on all of them" before starting.

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` — `inventory_movements` `:322-357`, `material_movements` `:540-565`, `keg_events` `:950-975`, views after `:1283`, `:1324`, `:1417`, order RPC inserts `:1654`, `:1661`, `:1664`, `:1707`, `record_inventory_movement` `:2190-2203`, `delete_bin` (Task 2), grant list `:3578`
- Modify: `lib/commands/inventory.ts:4-12`, `:20-24`, after `get_on_hand`
- Modify: `tests/rls-ledger.test.ts:8-14`, `:18`, `:33`, `:52`; `tests/schema-conventions.test.ts:8-26`, `:33`, `:40`, `:48`, `:57`, `:61`; `tests/commands-inventory.test.ts:19`, `:29`; `tests/rls-command-boundary.test.ts` (`record_movement` matrix case)
- Modify: `README.md` `record_movement` row
- Test: `tests/bins.test.ts`

**Interfaces:**
- Consumes: `bins` (Task 1), `delete_bin` (Task 2).
- Produces: columns `inventory_movements.bin_id uuid not null`, `material_movements.location_id uuid not null`, `material_movements.bin_id uuid not null`, `keg_events.location_id uuid not null`, `keg_events.bin_id uuid not null`; `private.first_bin(p_location uuid) returns uuid`; RPC `record_inventory_movement(uuid,uuid,uuid,uuid,numeric,public.movement_type,public.sale_channel,text,text,uuid)` — `p_bin` is the **fourth** parameter, after `p_location`; command `record_movement` input gains required `binId`; views `bin_on_hand (brewery_id, sku_id, location_id, bin_id, qty)`, `material_bin_on_hand (brewery_id, material_id, location_id, bin_id, qty)`, `keg_bin_totals (brewery_id, pool_id, keg_size, location_id, bin_id, qty)`; query `get_bin_on_hand {skuId?, locationId?}`.
- Existing views `on_hand`, `lot_on_hand`, `atp`, `taproom_replenishment`, `material_on_hand`, `material_lot_on_hand`, `keg_fleet_totals` keep their columns and grain **unchanged** — bin grain is additive.

**Assumption, stated here because the spec leaves it open:** order-driven movements (`ship_order`, taproom transfers, credit-memo returns) have no bin on the order, so they post to `private.first_bin(location)` — the location's alphabetically first bin, which for a fresh location is `Cold`. (Not "oldest": the trio is seeded in one transaction, so all three share one `created_at` — `now()` is transaction-constant in Postgres.) Orders gain bins in a later phase if anyone needs them; until then the brewery names the bin it wants order stock to land in so it sorts first.

- [ ] **Step 1: Write the failing tests** (append to `tests/bins.test.ts`)

```ts
  it("every ledger row names a bin, and the bin must belong to the row's location", async () => {
    const a = (await runCommand("create_location", { name: "Ledger A", kind: "warehouse" }, ctx)) as Row;
    const b = (await runCommand("create_location", { name: "Ledger B", kind: "warehouse" }, ctx)) as Row;
    const [binA] = (await runCommand("list_bins", { locationId: a.id }, ctx)) as Row[];
    const [binB] = (await runCommand("list_bins", { locationId: b.id }, ctx)) as Row[];
    const p = (await runCommand("create_product", { name: "Bin Pils" }, ctx)) as Row;
    const s = (await runCommand("create_sku", { productId: p.id, name: "case", packageType: "can", bblPerUnit: "0.0645" }, ctx)) as Row;
    const { data: mat } = await admin.from("materials").insert({
      brewery_id: ctx.breweryId, name: "Bin malt", category: "malt", base_uom: "lb", purchase_uom: "lb", lot_tracked: false,
    }).select().single();
    const { data: pool } = await admin.from("keg_pools").insert({ brewery_id: ctx.breweryId, name: "Bin pool", kind: "owned" }).select().single();

    // the wrong location for the bin is a FK violation on every ledger, not app code
    const fg = await admin.from("inventory_movements").insert({
      brewery_id: ctx.breweryId, sku_id: s.id, location_id: a.id, bin_id: binB.id, qty: 1, bbl: 0, type: "opening_balance", created_by: ctx.userId,
    });
    expect(fg.error?.code).toBe("23503");
    const mm = await admin.from("material_movements").insert({
      brewery_id: ctx.breweryId, material_id: mat!.id, location_id: a.id, bin_id: binB.id, qty: 5, type: "opening_balance", created_by: ctx.userId,
    });
    expect(mm.error?.code).toBe("23503");
    const ke = await admin.from("keg_events").insert({
      brewery_id: ctx.breweryId, pool_id: pool!.id, keg_size: "sixth_bbl", location_id: a.id, bin_id: binB.id, qty: 3, reason: "acquired", created_by: ctx.userId,
    });
    expect(ke.error?.code).toBe("23503");

    // and a missing bin is rejected outright
    const noBin = await admin.from("material_movements").insert({
      brewery_id: ctx.breweryId, material_id: mat!.id, location_id: a.id, qty: 5, type: "opening_balance", created_by: ctx.userId,
    });
    expect(noBin.error?.code).toBe("23502");
    void binA;
  });

  it("the keg list reads back per pool × size × location: Microstar 36 here, 40 in storage", async () => {
    const wh = (await runCommand("create_location", { name: "Keg WH", kind: "warehouse" }, ctx)) as Row;
    const st = (await runCommand("create_location", { name: "Keg storage", kind: "storage" }, ctx)) as Row;
    const [binW] = (await runCommand("list_bins", { locationId: wh.id }, ctx)) as Row[];
    const [binS] = (await runCommand("list_bins", { locationId: st.id }, ctx)) as Row[];
    // keg_pools: (kind = 'owned') = (vendor_id is null), so pay-per-fill needs a vendor
    const { data: vendor } = await admin.from("vendors").insert({ brewery_id: ctx.breweryId, name: "Microstar" }).select().single();
    const { data: pool } = await admin.from("keg_pools").insert({
      brewery_id: ctx.breweryId, name: "Microstar", kind: "pay_per_fill", vendor_id: vendor!.id, per_fill_cents: 900,
    }).select().single();
    for (const [bin, loc, qty] of [[binW, wh, 36], [binS, st, 40]] as const) {
      const { error } = await admin.from("keg_events").insert({
        brewery_id: ctx.breweryId, pool_id: pool!.id, keg_size: "sixth_bbl", location_id: loc.id, bin_id: bin.id, qty, reason: "acquired", created_by: ctx.userId,
      });
      expect(error).toBeNull();
    }
    // neither keg view is granted to authenticated yet (no registered command reads them), so read as admin
    const { data: rows } = await admin.from("keg_bin_totals").select("location_id, qty").eq("pool_id", pool!.id).order("qty");
    expect(rows!.map((r: any) => [r.location_id, r.qty])).toEqual([[wh.id, 36], [st.id, 40]]);
    const { data: total } = await admin.from("keg_fleet_totals").select("qty").eq("pool_id", pool!.id).single();
    expect(total!.qty).toBe(76);
  });

  it("record_movement requires a bin and get_bin_on_hand reports per bin while on_hand stays per location", async () => {
    const loc = (await runCommand("create_location", { name: "Split WH", kind: "warehouse" }, ctx)) as Row;
    const [b1, b2] = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    const p = (await runCommand("create_product", { name: "Split Pils" }, ctx)) as Row;
    const s = (await runCommand("create_sku", { productId: p.id, name: "case", packageType: "can", bblPerUnit: "0.0645" }, ctx)) as Row;
    await expect(runCommand("record_movement", { skuId: s.id, locationId: loc.id, qty: 1, type: "opening_balance" }, ctx)).rejects.toBeTruthy();
    await runCommand("record_movement", { skuId: s.id, locationId: loc.id, binId: b1.id, qty: 10, type: "opening_balance" }, ctx);
    await runCommand("record_movement", { skuId: s.id, locationId: loc.id, binId: b2.id, qty: 5, type: "opening_balance" }, ctx);
    const perBin = (await runCommand("get_bin_on_hand", { skuId: s.id }, ctx)) as { bin_id: string; qty: number | string }[];
    expect(perBin.map((r) => [r.bin_id, Number(r.qty)]).sort()).toEqual([[b1.id, 10], [b2.id, 5]].sort());
    const perLoc = (await runCommand("get_on_hand", { skuId: s.id }, ctx)) as { qty: number | string }[];
    expect(perLoc).toHaveLength(1);
    expect(Number(perLoc[0].qty)).toBe(15);
  });

  it("delete_bin refuses a bin that ever recorded stock, even at net zero", async () => {
    const loc = (await runCommand("create_location", { name: "Stock WH", kind: "warehouse" }, ctx)) as Row;
    const [bin] = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    const p = (await runCommand("create_product", { name: "Stock Pils" }, ctx)) as Row;
    const s = (await runCommand("create_sku", { productId: p.id, name: "case", packageType: "can", bblPerUnit: "0.0645" }, ctx)) as Row;
    await runCommand("record_movement", { skuId: s.id, locationId: loc.id, binId: bin.id, qty: 2, type: "opening_balance" }, ctx);
    await expect(runCommand("delete_bin", { binId: bin.id }, ctx))
      .rejects.toMatchObject({ message: expect.stringMatching(/recorded stock/i) });
    // Moving it all back out does not lift the refusal: the ledger rows still
    // reference the bin, and the ledgers are append-only. The guard must say so
    // rather than letting the delete fall through to a raw FK violation.
    await runCommand("record_movement", { skuId: s.id, locationId: loc.id, binId: bin.id, qty: -2, type: "adjustment" }, ctx);
    await expect(runCommand("delete_bin", { binId: bin.id }, ctx))
      .rejects.toMatchObject({ message: expect.stringMatching(/recorded stock/i) });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run tests/bins.test.ts`
Expected: the four new cases FAIL — `column "bin_id" of relation "inventory_movements" does not exist`, and `keg_bin_totals` unknown.

- [ ] **Step 3: Baseline — `inventory_movements`**

In the table body (`:322-355`), after `location_id uuid not null,` add:

```sql
  bin_id uuid not null,
```

After the existing `foreign key (location_id, brewery_id) references locations (id, brewery_id),` add:

```sql
  -- the bin must be one of this location's bins, structurally (spec 2026-09-06 Decision 1)
  foreign key (bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id),
```

Replace the index at `:357`:

```sql
create index movements_onhand_idx on inventory_movements (brewery_id, sku_id, location_id, bin_id);
```

- [ ] **Step 4: Baseline — `material_movements`**

In the table body (`:540-563`), after `material_id uuid not null,` add:

```sql
  location_id uuid not null,                           -- materials are per site (spec 2026-09-06 Decision 2)
  bin_id uuid not null,
```

After the existing `foreign key (lot_id, material_id, brewery_id) references material_lots (id, material_id, brewery_id),` add:

```sql
  foreign key (location_id, brewery_id) references locations (id, brewery_id),
  foreign key (bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id),
```

After the index at `:564` add:

```sql
create index material_movements_onhand_idx on material_movements (brewery_id, material_id, location_id, bin_id);
```

- [ ] **Step 5: Baseline — `keg_events`**

In the table body (`:950-971`), after `keg_size keg_size not null,` add:

```sql
  location_id uuid not null,   -- for shipped: where they left from; for returned: where they came back into
  bin_id uuid not null,
```

After the existing `foreign key (pool_id, brewery_id) references keg_pools (id, brewery_id),` add:

```sql
  foreign key (location_id, brewery_id) references locations (id, brewery_id),
  foreign key (bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id),
```

Replace the index at `:973`:

```sql
create index keg_events_pool_idx on keg_events (brewery_id, pool_id, keg_size, location_id, bin_id);
```

- [ ] **Step 6: Baseline — `private.first_bin` and the four order-RPC inserts**

Before `private.create_order_impl` (`:1472`) add:

```sql
-- Order-driven movements have no bin on the order (a later phase may add one),
-- so they post to the location's alphabetically first bin ('Cold' for a fresh
-- location). Name, not created_at: the seeded trio shares one transaction
-- timestamp. Deterministic, and the brewery names the bin it wants order
-- stock to land in so it sorts first.
create function private.first_bin(p_location uuid) returns uuid
language sql stable set search_path = '' as $$
  select id from public.bins where location_id = p_location order by name limit 1
$$;
```

Then add `bin_id` to each insert — column list and the matching select expression:

`:1654-1655`:
```sql
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, channel, dest_state, ref, created_by)
        select o.brewery_id, ol.sku_id, o.from_location_id, private.first_bin(o.from_location_id), -sp.qty, 'sale_removal', 'wholesale', v_state, p_order, auth.uid()
```

`:1661-1662`:
```sql
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, ref, created_by)
        select o.brewery_id, ol.sku_id, o.from_location_id, private.first_bin(o.from_location_id), -sp.qty, 'taproom_transfer', p_order, auth.uid()
```

`:1664-1665`:
```sql
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, ref, created_by)
        select o.brewery_id, ol.sku_id, o.to_location_id, private.first_bin(o.to_location_id), sp.qty, 'taproom_transfer', p_order, auth.uid()
```

`:1707-1708`:
```sql
    insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, note, created_by)
    select v_inv.brewery_id, il.sku_id, p_location, private.first_bin(p_location), cl.qty, 'return_in', p_reason, auth.uid()
```

Verify with `grep -n "insert into public.inventory_movements" supabase/migrations/00001_baseline.sql` that exactly five inserts exist and all five carry `bin_id`.

- [ ] **Step 7: Baseline — `record_inventory_movement` takes `p_bin`**

Replace `:2190-2203`:

```sql
create function record_inventory_movement(
  p_brewery uuid, p_sku uuid, p_location uuid, p_bin uuid, p_qty numeric, p_type public.movement_type,
  p_channel public.sale_channel, p_dest_state text, p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.inventory_movements;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_inventory_movement', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sku', p_sku, 'location', p_location, 'bin', p_bin, 'qty', p_qty, 'type', p_type, 'channel', p_channel, 'dest_state', p_dest_state, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, channel, dest_state, note, created_by)
    values (p_brewery, p_sku, p_location, p_bin, p_qty, p_type, p_channel, p_dest_state, p_note, auth.uid()) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
```

Update the grant-execute signature at `:3578`:

```sql
  record_inventory_movement(uuid,uuid,uuid,uuid,numeric,public.movement_type,public.sale_channel,text,text,uuid),
```

- [ ] **Step 8: Baseline — finish `delete_bin`'s stock guard** (replace Task 2's `v_used := false;` line)

```sql
  v_used := exists (select 1 from public.inventory_movements where bin_id = p_bin)
         or exists (select 1 from public.material_movements  where bin_id = p_bin)
         or exists (select 1 from public.keg_events          where bin_id = p_bin);
```

An existence check, not a net balance: the three ledgers are append-only and their `bin_id` FKs have no `on delete` clause, so a bin with any history can never be deleted — a net-zero sum would pass the guard and then fail on the FK. The guard names the real rule ("rename it instead") so the client never sees a raw constraint error.

- [ ] **Step 9: Baseline — three additive views**

After `lot_on_hand` (`:1295`):

```sql
-- Bin grain, beside on_hand rather than replacing it: atp and taproom_replenishment
-- keep their location-grain join. Spec 2026-09-06 Decision 2.
create view bin_on_hand with (security_invoker = true) as
  select brewery_id, sku_id, location_id, bin_id, sum(qty) as qty
  from inventory_movements group by 1,2,3,4;
```

After `material_on_hand` (`:1325`):

```sql
create view material_bin_on_hand with (security_invoker = true) as
  select brewery_id, material_id, location_id, bin_id, sum(qty) as qty
  from material_movements group by 1,2,3,4;
```

After `keg_fleet_totals` (`:1421`):

```sql
create view keg_bin_totals with (security_invoker = true) as
  select brewery_id, pool_id, keg_size, location_id, bin_id,
         sum(case reason when 'acquired' then qty when 'found' then qty
                         when 'retired' then -qty when 'lost' then -qty else 0 end)::int as qty
  from keg_events group by 1,2,3,4,5;
```

Grant only what a registered command reads (the comment at `:3547-3548` is the rule): at `:3549` change the statement to `grant select on on_hand, bin_on_hand, atp, invoice_totals, portal_brewery to authenticated;`. `material_bin_on_hand` and `keg_bin_totals` have no registered command in this phase, so they are **not** granted — like `material_on_hand` and `keg_fleet_totals` today — and the tests read them through `admin`.

- [ ] **Step 10: Commands** (`lib/commands/inventory.ts`)

`:4-5`:
```ts
const movementInput = z.object({
  skuId: z.string().uuid(), locationId: z.string().uuid(), binId: z.string().uuid(),
```

`:20-24`:
```ts
  return unwrap(ctx.db.rpc("record_inventory_movement", {
    p_brewery: ctx.breweryId, p_sku: input.skuId, p_location: input.locationId, p_bin: input.binId, p_qty: input.qty,
    p_type: input.type, p_channel: input.channel ?? null, p_dest_state: input.destState ?? null,
    p_note: input.note ?? null, p_request_id: execution.requestId,
  }));
```

After `get_on_hand`:
```ts
defineQuery({
  name: "get_bin_on_hand", description: "On-hand quantity per SKU/location/bin",
  input: z.object({ skuId: z.string().uuid().optional(), locationId: z.string().uuid().optional() }), roles: [...readRoles],
  handler: (ctx, i) => {
    let q = ctx.db.from("bin_on_hand").select().eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    if (i.locationId) q = q.eq("location_id", i.locationId);
    return unwrap(q);
  },
});
```

Update the `insertMovement` JSDoc (`:14-18`) to say `binId` is required and there is no default bin.

- [ ] **Step 11: Existing tests learn about bins**

`tests/rls-ledger.test.ts` — declare `bin: any` on line 7; in `beforeAll` after the `loc` insert add:
```ts
    ({ data: bin } = await admin.from("bins").insert({ brewery_id: b.id, location_id: loc.id, name: "Test bin" }).select().single());
```
Add `bin_id: bin.id` to every `inventory_movements` insert in the file (`:18`, `:33`, `:52`).

`tests/schema-conventions.test.ts` — in `seed()` after `pool` add:
```ts
  const loc = await mk<{ id: string }>("locations", { brewery_id: b.id, name: "Conv WH", kind: "warehouse" });
  const bin = await mk<{ id: string }>("bins", { brewery_id: b.id, location_id: loc.id, name: "Conv bin" });
  return { b, staff, db, tracked, untracked, lot, pool, loc, bin };
```
Add `location_id: s.loc.id, bin_id: s.bin.id` to every `material_movements` and `keg_events` insert (`:33`, the `base` object at `:40`, `:48`, `:57`, `:61`). The cross-tenant case at `:33` inserts under `other.id` — keep its `location_id`/`bin_id` pointing at `s.loc`/`s.bin`; a composite FK still rejects it and the assertion is unchanged.

`tests/commands-inventory.test.ts` — after each `create_location` (`:19`, `:29`) add:
```ts
    const [bin] = (await runCommand("list_bins", { locationId: l.id }, ctx)) as EntityWithId[];
```
and pass `binId: bin.id` to both `record_movement` calls.

`tests/rls-command-boundary.test.ts` — find the `record_movement` matrix case; add `binId` to `command` and `p_bin` to `rpc`. Resolve a `binId` once in the file's setup right after `locationId` is created, via `runCommand("list_bins", { locationId }, adminCtx)`.

- [ ] **Step 12: README** — `record_movement` row: `(skuId, locationId, binId, non-zero qty, …)`; add a row after `get_on_hand`: `` `get_bin_on_hand` | admin, sales, warehouse | On-hand per SKU/location/bin (optional `skuId`, `locationId`) ``.

- [ ] **Step 13: Reset and run everything**

Run: `bunx supabase db reset && bun run test && bunx tsc --noEmit && bun run lint`
Expected: PASS. Watch `tests/orders-*.test.ts` and `tests/commands-orders.test.ts` in particular — they exercise the four order inserts through `private.first_bin`. `tests/schema-rules.test.ts` "every public view is security_invoker" covers the three new views.

- [ ] **Step 14: Commit**

```bash
git add supabase/migrations/00001_baseline.sql lib/commands/inventory.ts tests/ README.md
git commit -m "schema: every ledger row names a location and a bin

inventory_movements, material_movements and keg_events carry bin_id not
null through a composite FK to the row's own location; bin-grain views
sit beside the location-grain ones. Order-driven movements post to the
location's first bin. tests/bins.test.ts"
```

---

### Task 4: Inventory page — bin picker and Bin column

**Files:**
- Modify: `app/(app)/inventory/page.tsx:25-32`, `:41`, `:47-66`
- Modify: `app/(app)/inventory/movement-form.tsx:26-41`, after the Location select (`:69-85`)
- Test: none below the component boundary beyond Task 3 (rendering is the eyeball check)

**Interfaces:**
- Consumes: `list_bins`, `get_bin_on_hand`, `record_movement {binId}` from Tasks 2–3.

- [ ] **Step 1: Page fetches bins and per-bin on-hand**

`page.tsx:25-32` — add two calls to the `Promise.all` and the tuple type:
```ts
  const [skus, locations, bins, binOnHand, atp, movements] = (await Promise.all([
    runCommand("list_skus", {}, ctx),
    runCommand("list_locations", {}, ctx),
    runCommand("list_bins", {}, ctx),
    runCommand("get_bin_on_hand", {}, ctx),
    runCommand("get_atp", {}, ctx),
    runCommand("list_movements", { limit: 50 }, ctx),
  ])) as [Sku[], Location[], Bin[], BinOnHandRow[], AtpRow[], Movement[]];
```
Add the types beside the existing ones: `type Bin = { id: string; location_id: string; name: string }` and `type BinOnHandRow = OnHandRow & { bin_id: string }`. Add `const binName = (id: string) => bins.find((b) => b.id === id)?.name ?? "—";`. `get_on_hand` is no longer fetched by this page; remove its call and, if nothing else on the page uses `OnHandRow`'s standalone import, keep the type only as the base of `BinOnHandRow`.

- [ ] **Step 2: On-hand table shows bins**

Render `binOnHand` in the table; add a `Bin` column after Location using `binName(row.bin_id)`; row key becomes `${row.sku_id}-${row.bin_id}`.

- [ ] **Step 3: Form gets a Bin select**

Pass `bins={bins}` into `<MovementForm>`. In `movement-form.tsx`:
- props: `bins: { id: string; location_id: string; name: string }[]`
- state: `const [binId, setBinId] = useState("");`
- `build`: add `binId`; `reset`: `setBinId("")`
- `onValueChange` of the Location select: after `setLocationId(v)`, set `binId` to the first bin of that location (`bins.filter((b) => b.location_id === v)[0]?.id ?? ""`; `list_bins` is already alphabetical) so the common case is one tap
- after the Location select, a `Bin` select with `id="movement-bin"`, `<Label htmlFor="movement-bin">Bin</Label>`, placeholder "Select a bin", listing `bins.filter((b) => b.location_id === locationId)`, `disabled={!locationId}`

- [ ] **Step 4: Type-check and eyeball**

Run: `bunx tsc --noEmit && bun run lint`
Then per `.agents/skills/browse/SKILL.md`: `bunx agent-browser --session docs-locations-bins open http://localhost:3000/inventory`, record an opening balance into a non-first bin, confirm the on-hand table shows the bin, then `close` the session. Use whichever port the dev server for this worktree is on.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inventory/page.tsx" "app/(app)/inventory/movement-form.tsx"
git commit -m "feat(inventory): pick a bin when recording a movement; on hand per bin"
```

---

### Task 5: Design screens lose their bin gates

**Files:**
- Modify: `components/mgr/screens.tsx` — Locations `:334-347`, Location detail `:352-366`, Record movement `:746-770`, Keg fleet `:2540-2560`, Location bins `:3255-3275`, Bin `:3277-3295`
- Modify: `lib/mgr/screen-links.ts:94` only if a new label needs a global rule
- Test: `tests/mgr-screens.test.ts`, `tests/screen-links.test.ts`, `tests/design-docs.test.ts` (existing; must stay green)

**Interfaces:** none — mocks. The `writes:` strings name the real commands from Tasks 2–3.

- [ ] **Step 1: Locations and Location detail**
  - Locations `writes:` → `"create_location"` (drop `[design]`); the row copy `"taproom · 11 taps · 2 bins"` → `"taproom · 11 taps · 3 bins"`.
  - Location detail: `E.pick("Type", "Taproom", ["Warehouse", "Taproom", "Storage"])`; `E.nav("Location bins", "Walk-in · Cold · Dry")`.

- [ ] **Step 2: Location bins and Bin**
  - Location bins: `reads: "list_locations · list_bins"`, `writes: "create_bin · update_bin · delete_bin"`; drop the SCHEMA-GATE text. States: replace `["default bin", "created with the location · cannot be deleted", 1]` with `["last bin", "a location keeps at least one · rename it instead", 1]`. Spec string: "Every location starts with Walk-in, Cold and Dry. Rename or remove what doesn't match the building, but a location always keeps one bin, so no on-hand or availability query carries a nullable branch. Bins are physical subdivisions a menu can read; they are explicitly not tap lines (§16.8)." Body: replace the three current rows (`E.gated("Taproom", …)`, `E.nav("Walk-in", …)`, `E.nav("To-go fridge", …)`) with exactly the seeded trio — `E.nav("Walk-in", "38 cases · 12 kegs")`, `E.nav("Cold", "22 cases")`, `E.nav("Dry", "6 cases")` — replace `E.gated("Add bin", …)` with `E.btn("Add bin", "g")`, and set `to: { "Walk-in": "Bin", "Cold": "Bin", "Dry": "Bin", "Add bin": "Bin" }`. `To-go fridge` goes away: it is not one of the three bins `create_location` seeds.
  - Bin: `writes: "create_bin · update_bin · delete_bin"`; remove the `Kind` pick and the `Par` edit and the par `E.info` (Kind deferred to §16.7, Par to the pars phase); keep the "Tap lines are not bins" note; replace `E.gated("Save bin", …)` with `E.btn("Save bin")`; replace the "A brewery that never subdivides…" info with `E.info("A location keeps at least one bin. Rename the last one rather than removing it.")`. States: replace `["default", "cannot be removed", 1]` with `["last bin", "rename it instead of removing it", 1]`; replace `["in use", "delete is refused", 1]` with `["has history", "a bin that ever recorded stock is renamed, not removed", 1]`.

- [ ] **Step 3: Record movement** — after the Location pick add `E.pick("Bin", "Cold", ["Cold", "Dry", "Walk-in"])` (alphabetical, matching `list_bins`; the first is preselected); `reads:` gains `list_bins`.

- [ ] **Step 4: Keg fleet** — replace `E.row("Owned ½ bbl", "142 out · 61 in", "203")` with two rows showing the per-location split the spec opens with:
  ```tsx
  {E.row("Microstar ⅙ bbl · Warehouse", "36 in · Walk-in", "36")}
  {E.row("Microstar ⅙ bbl · Storage", "40 in · Cold", "40")}
  ```
  and `reads: "get_keg_fleet [design] · keg_bin_totals"`. Update the "Selected pool" field to `"Microstar ⅙ bbl · 76 kegs · pay per fill"`.

- [ ] **Step 5: Run the screen suites and eyeball**

Run: `bunx vitest run tests/mgr-screens.test.ts tests/screen-links.test.ts tests/design-docs.test.ts tests/docs.test.ts`
Expected: PASS. If `screen-links` "walks the main flows end to end" or "name the screen each chip opens" fails, the `to:` entries in Step 2 are what it wants — every tappable label on a screen must map.

Then `bunx agent-browser --session docs-locations-bins open http://localhost:3000/docs/screens-explore`, filter "bins", tap through Locations → Location detail → Location bins → Bin, screenshot each, `close`.

- [ ] **Step 6: Commit**

```bash
git add components/mgr/screens.tsx lib/mgr/screen-links.ts
git commit -m "screens: bins are real; storage locations; bin on Record movement"
```

---

### Task 6: Documentation

**Files:**
- Modify: `content/docs/staff-guide.mdx:86-98`, `:289`
- Modify: `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md:86`, `:162`, `:352-356`, `:560-566`, `:615-616`, `:827-838`
- Modify: `.agents/ARCHITECTURE.md:13` (the `lib/commands/<area>.ts` row)
- Test: `tests/docs.test.ts` (existing)

- [ ] **Step 1: Staff guide**
  - Card `:86`: "On hand" → "The sum of recorded movements for one SKU in one bin at one location."
  - Step 2 `:96`: "Choose a **SKU**, **Location** and **Bin**. Every location starts with three bins — Cold, Dry, Walk-in — listed alphabetically, and the first is preselected."
  - Add a short "Bins" paragraph under the Inventory cards: a bin is a named place inside a location; every location keeps at least one; a bin that has ever recorded stock cannot be removed — rename it instead.
  - `:289`: the "not in the interface" bullet still says creating locations is missing (true — no settings page exists yet); add "adding, renaming or removing bins" to that same bullet so the guide does not overclaim.

- [ ] **Step 2: Schema design doc amendments** — each is one or two lines:
  - `:86` `location_kind` row: values `warehouse, taproom, storage`, note "storage added 2026-09-06".
  - `:162` "### `locations` — unchanged" → "### `locations` — gains `storage` kind and a `bins` child (2026-09-06)".
  - `:352` `material_movements`: add `location_id → locations not null, bin_id → bins (composite) not null` to the column list.
  - `:560` `keg_events`: same two columns; index becomes `(brewery_id, pool_id, keg_size, location_id, bin_id)`.
  - `:615-616` decision #6: prefix with `~~` … `~~` and append "**Reversed 2026-09-06:** materials are per location and bin; see `2026-09-06-mgr-locations-bins-transfers-design.md`."
  - `:827-838` §16.6: append a paragraph "**Amended 2026-09-06:** implemented as a seeded trio (Walk-in, Cold, Dry) with a minimum-of-one rule in `delete_bin`, not an undeletable default row; no `kind` column until §16.7 reads one; the `taproom_pars` re-key is deferred."

- [ ] **Step 3: ARCHITECTURE ownership** — in the `lib/commands/<area>.ts` row, after the `customers.ts` sentence add: "`catalog.ts` owns products, SKUs, locations and their bins (`list_bins`, `create_bin`, `update_bin`, `delete_bin`)."

- [ ] **Step 4: Run the doc tests**

Run: `bunx vitest run tests/docs.test.ts tests/design-docs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content/docs/staff-guide.mdx .agents/superpowers/specs/2026-08-31-mgr-schema-design.md .agents/ARCHITECTURE.md
git commit -m "docs: bins and storage locations in the staff guide, schema design and architecture"
```

---

## Final validation

- [ ] `bunx supabase db reset && bun run test && bunx tsc --noEmit && bun run lint` — all green.
- [ ] `bunx next build` — CI runs it; run it once locally.
- [ ] `git diff main --stat` and skim `git diff main -- supabase/migrations/00001_baseline.sql` for a stray NUL byte (AGENTS.md step 5).
- [ ] PR description carries the progress note: "Phase 1 of locations/bins: bins table seeded per location, bin_id not null on all three ledgers, bin-grain views, bin commands, inventory page bin picker. Phases 2 (stock_transfers) and 3 (deliveries) next." And the durable decision: "Order-driven movements post to `private.first_bin(location)` (alphabetically first bin) until orders carry a bin. A bin that ever recorded stock is never deleted — the ledgers are append-only — so `delete_bin` refuses on history, not on net balance."
