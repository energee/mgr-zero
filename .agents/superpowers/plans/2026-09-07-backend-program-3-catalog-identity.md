# Program 3 — Catalog identity (brands, formats, price tiers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brand is the sellable identity, a format is the physical shape (and the only place `bbl_per_unit` is typed), a SKU is exactly one brand × one packaged format, and a price list defaults at format with a per-SKU override.

**Architecture:** One in-place baseline rewrite of the catalog tables, then command + test + live page updates. Seed helper `seedCatalog` (Program 0) is the only test factory that inserts catalog rows — change it once, callers keep compiling. Do not alias `products` as a view.

**Tech Stack:** Same as Program 1.

**Spec:** `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` §16.1, §16.2, §16.2a, §16.4, §16.12. Unification plan D5A (format default + SKU override). Parent plan.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Programs 0–2 merged (`bin_id` already on movements).
- Rename `products` → `brands`; every `product_id` → `brand_id` except `batches.product_id` which becomes `intended_brand_id` **nullable** in this same program (§16.9) so Program 5 does not rename it again.
- `skus` unique `(brand_id, format_id)`. Drop `skus.bbl_per_unit`, `package_type`, `units_per_case`. `enforce_bbl_integrity` reads `formats.bbl_per_unit` (atomic) or the derived composed value.
- Poured formats are not SKUs. Do not create a sku row for `basis = 'poured'`.
- §16.16 q2 (poured binds to format vs brand) stays open — do not add `pos_menus` or a poured-binding column.
- `create_product` / `list_products` names are retired. New names: `upsert_brand`, `list_brands`. `tests/api-docs.test.ts` alias rule already bans `create_customer`-style duplicates — add `create_product` → `upsert_brand` to that retired map.
- TDD, docs:api, staff-guide, no Co-Authored-By.

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/00001_baseline.sql` | brands, formats, format_components, format_bom, sku reshape, price_list_formats, batches.intended_brand_id |
| `lib/commands/catalog.ts` | upsert_brand, upsert_format, replace_format_components, replace_format_bom, create_sku (brandId+formatId), list_brands, list_formats |
| `lib/commands/customers.ts` | set_price_list_format, set_price_list_item, clear_price_list_item |
| `tests/helpers.ts` | `seedCatalog` returns `{ brandId, skuId, formatId }` |
| `app/(app)/catalog/` | Catalog / Product / SKU / Formats pages |
| `app/(app)/pricing/` | format default + override |
| `tests/commands-catalog.test.ts`, `tests/formats.test.ts` | Proof |

---

### Task 1: `formats` + reshape `seedCatalog`

**Files:**
- Modify: baseline (enum `format_basis`, table `formats`, unique `(brewery_id, name)`), `tests/helpers.ts`
- Test: `tests/formats.test.ts`

**Interfaces:**
- Produces: `formats (id, brewery_id, name, basis, package_type, keg_size, units_per_case, bbl_per_unit, created_at)` with check: `basis = 'packaged'` ⇒ `bbl_per_unit is not null`; `basis = 'poured'` ⇒ `bbl_per_unit is null` until composed (composed packed formats also have null stored bbl — derived). **Atomic packaged:** `bbl_per_unit not null`. **Composed:** `bbl_per_unit is null` and at least one `format_components` row (enforced in replace RPC, Task 3).

```ts
seedCatalog(breweryId): Promise<{ brandId: string; skuId: string; formatId: string }>
```

- [ ] **Step 1:**

```ts
it("an atomic packaged format stores bbl_per_unit; a poured format does not", async () => {
  const b = await makeBrewery();
  const ctx = await makeStaffCtx(b.id, "admin");
  const half = await runCommand("upsert_format", {
    name: "½ bbl keg", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: "0.5",
  }, ctx) as { id: string; bbl_per_unit: string };
  expect(Number(half.bbl_per_unit)).toBe(0.5);
  const pint = await runCommand("upsert_format", {
    name: "16 oz pour", basis: "poured",
  }, ctx) as { id: string; bbl_per_unit: string | null };
  expect(pint.bbl_per_unit).toBeNull();
});
```

- [ ] **Step 2:** FAIL — unknown command / no table.

- [ ] **Step 3:** Create table + `upsert_format` RPC (admin/sales) + `list_formats` query. Do **not** rename products yet. `seedCatalog` still writes `products` until Task 2.

- [ ] **Step 4–5:** PASS, commit `feat(catalog): formats with packaged vs poured basis`

---

### Task 2: `products` → `brands` and SKU is brand × format

**Files:**
- Modify: baseline (rename table/columns/FKs, `skus` unique, drop sku package columns, `enforce_bbl_integrity` joins formats), every SQL/TS reference to `products` / `product_id` / `create_product` / `list_products`
- Modify: `tests/helpers.ts` `seedCatalog` to insert brand + format + sku
- Modify: `lib/commands/catalog.ts`
- Test: `tests/commands-catalog.test.ts`, `tests/api-docs.test.ts` retired aliases

**Interfaces:**
- Produces: `upsert_brand({ id?, name, style?, abv? })`, `list_brands`, `create_sku({ brandId, formatId })` — format must be `basis = 'packaged'`. `list_skus` returns brand name + format name.

- [ ] **Step 1:** Change `tests/commands-catalog.test.ts` create_product test to `upsert_brand` + `create_sku({ brandId, formatId })`. Run — FAIL on old names / missing columns.

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** In the baseline, `alter table products rename to brands;` `alter table brands rename constraint…` — actually this is a single baseline file, not a live alter. **Rewrite the `create table` as `brands`** and every FK. `skus`:

```sql
create table skus (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  brand_id uuid not null,
  format_id uuid not null,
  upc text,
  active boolean not null default true,
  -- keg_pool_id / container_source stay as today
  unique (id, brewery_id),
  unique (brand_id, format_id),
  foreign key (brand_id, brewery_id) references brands (id, brewery_id),
  foreign key (format_id, brewery_id) references formats (id, brewery_id)
);
```

Trigger:

```sql
select (new.qty * f.bbl_per_unit) into new.bbl
  from public.skus s join public.formats f on f.id = s.format_id
  where s.id = new.sku_id;
if new.bbl is null then raise exception 'format has no bbl_per_unit'; end if;
```

Replace `create_product` function with `upsert_brand`. Replace `create_sku` args with `p_brand, p_format`. Update grant signatures. Grep `products` in `tests/` and `lib/` and `app/` — every hit is this task. `batches.product_id` → `intended_brand_id uuid` (nullable, FK brands). `lots.product_id` → `brand_id not null`. `recipes.product_id` → `brand_id`. `product_approvals` → `brand_approvals` keyed `brand_id`.

Add to `tests/api-docs.test.ts` retired map:

```ts
create_product: "upsert_brand",
list_products: "list_brands",
```

- [ ] **Step 4:** `bunx vitest run tests/commands-catalog.test.ts tests/commands-orders.test.ts tests/orders-fulfillment.test.ts tests/rls-command-boundary.test.ts tests/data-api-boundary.test.ts tests/api-docs.test.ts` — PASS. This is the expensive reset; `scripts/test-db.sh` reapplies the baseline.

- [ ] **Step 5:** Commit `feat(catalog): brands rename; sku is brand × format`

---

### Task 3: `format_components` and derived volume

**Files:**
- Modify: baseline table + `replace_format_components` RPC, `lib/commands/catalog.ts`
- Test: `tests/formats.test.ts`

**Interfaces:**
- Produces: `replace_format_components({ formatId, components: [{ childFormatId, qty }] })` — one RPC deletes+inserts children. After write, composed `bbl_per_unit` is **not stored**; a view `format_volumes` computes atomic.bbl * product of qtys along one level only (spec: one level). `create_sku` still requires a packaged format that has a resolvable volume (atomic bbl or one-level composition of atomics).

- [ ] **Step 1:**

```ts
it("a case of six four-packs derives 6 × child bbl; cycles are rejected", async () => {
  const four = await runCommand("upsert_format", { name: "4pk 16oz", basis: "packaged", packageType: "can", bblPerUnit: "0.002" }, ctx) as { id: string };
  const caseFmt = await runCommand("upsert_format", { name: "case 24×16oz", basis: "packaged", packageType: "can" }, ctx) as { id: string };
  await runCommand("replace_format_components", {
    formatId: caseFmt.id, components: [{ childFormatId: four.id, qty: 6 }],
  }, ctx);
  const { data } = await admin.from("format_volumes").select("bbl_per_unit").eq("id", caseFmt.id).single();
  expect(Number(data!.bbl_per_unit)).toBeCloseTo(0.012, 6);
  await expect(runCommand("replace_format_components", {
    formatId: four.id, components: [{ childFormatId: caseFmt.id, qty: 1 }],
  }, ctx)).rejects.toThrow(/cycle|one level/i);
});
```

- [ ] **Step 2–5:** Implement view + RPC (reject if a child is itself composed; reject parent=child). Commit `feat(catalog): format_components derive volume one level down`

---

### Task 4: `format_bom`

**Files:**
- Modify: baseline (`format_bom` replaces `sku_bom`), `replace_format_bom` RPC, `lib/commands/catalog.ts`
- Test: `tests/formats.test.ts`

**Interfaces:**
- Produces: `format_bom (format_id, material_id, qty, on_break text check in ('consumed','return_to_stock'))`. `replace_format_bom({ formatId, lines: [{ materialId, qty, onBreak }] })`. Drop `sku_bom`.

- [ ] **Step 1:** Assert `sku_bom` select fails and `replace_format_bom` writes two lines.

- [ ] **Step 2–5:** Rewrite table, update any view that joined `sku_bom` (`material_requirements` / `packaging_run_requirements` at baseline ~1352). Commit `feat(catalog): format_bom replaces sku_bom`

---

### Task 5: Price tiers — format default, SKU override

**Files:**
- Modify: `price_lists` + `channel_id` (nullable until Program 4), table `price_list_formats`, keep `price_list_items` as override, `lib/commands/customers.ts`, `private.order_line_price`
- Test: `tests/commands-customers.test.ts`

**Interfaces:**
- Produces:
  - `set_price_list_format({ priceListId, formatId, unitPriceCents })`
  - `set_price_list_item` (existing `set_price`) becomes the override
  - `clear_price_list_item({ priceListId, skuId })` deletes the override so the format default applies
- `private.order_line_price`: SKU override if present, else format default for `skus.format_id`. Raise if neither.

- [ ] **Step 1:**

```ts
it("order snapshots the SKU override when present, else the format default", async () => {
  await runCommand("set_price_list_format", { priceListId, formatId, unitPriceCents: 18000 }, adminCtx);
  await runCommand("set_price", { priceListId, skuId, unitPriceCents: 18500 }, adminCtx);
  // create_order one line of that sku → order_lines.unit_price_cents === 18500
  await runCommand("clear_price_list_item", { priceListId, skuId }, adminCtx);
  // new draft line → 18000
});
```

- [ ] **Step 2–5:** Implement. `channel_id` column exists nullable; Program 4 fills it. Commit `feat(pricing): format default with SKU override`

---

### Task 6: Live catalog/pricing pages, ungate, docs

Rewrite `app/(app)/catalog/` to brands + formats (match Catalog / Product / SKU / Formats screens: format picker on SKU, no per-SKU bbl field). Pricing page: format rows + override sheet. Ungate `upsert_brand`, `list_brands`, `upsert_format`, `replace_format_*`, `set_price_list_format`, `clear_price_list_item` in `screens.tsx`. `bun run docs:api`. Staff-guide catalog/pricing. Browse catalog + new order (price from format default).

Commit `docs: catalog identity screens live`

---

## Validation

```bash
bash scripts/test-db.sh
bunx vitest run tests/formats.test.ts tests/commands-catalog.test.ts tests/commands-customers.test.ts tests/commands-orders.test.ts tests/orders-fulfillment.test.ts tests/rls-command-boundary.test.ts tests/api-docs.test.ts tests/helpers.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Missed `products` reference | High | `rg products` / `product_id` / `create_product` / `list_products` / `bbl_per_unit` on skus must be empty after Task 2 |
| Composed format with null bbl ships | High | `create_sku` and `enforce_bbl_integrity` both require resolvable volume |
| Price with no format default and no override | Medium | `order_line_price` raises; New order UI already disables incomplete lines |
| Doing poured-binding or pos_menus | Medium | q2 still open; do not |

## Acceptance

- [ ] No `public.products` table
- [ ] SKU unique on `(brand_id, format_id)`
- [ ] Movement `bbl` still frozen; format edit does not rewrite history
- [ ] Price: format default, SKU override
- [ ] `seedCatalog` is the only catalog factory
