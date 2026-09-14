# Issue #278 — lift the schema and missing-view gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ungate the thirteen screens in issue #278 by building the read views, RPCs, columns and live pages each one waits on, one slice per PR.

**Architecture:** Every slice follows the pattern the live app already uses: a `defineQuery`/`defineCommand` in `lib/commands/*.ts`, a migration where the schema is missing, a server page under `app/(app)` or `app/(portal)` that calls the command through `runPageQuery`, and the same `components/mgr/views/*` component the inventory fixture renders. The screen record in `components/mgr/screens.tsx` loses its gate tag and gains a `SCREEN_ROUTES` row, which is what `tests/app-screen-parity.test.ts` then enforces.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS + plpgsql RPCs, Zod, vitest (pure suites locally, DB suites on the isolated test stack `scripts/test-db.sh`).

**Spec:** GitHub issue #278; `.agents/superpowers/specs/2026-09-07-mgr-recipe-builder.md` (slices 4–5); `.agents/superpowers/plans/2026-09-07-ai-chat.md` Task 10 (slice 3); `.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md:174` (slice 2); `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` §12 (slice 1) and §16.10 + §16.2a (slice 6).

## Global Constraints

- One worktree and PR per slice, base `main`: `scripts/worktree.sh feat/278-<slice> origin/main`. Only the final PR (slice 6) carries `TODO: Issue #278 — schema and missing-view gates (13 screens): …` (exact text from `TODO.md:16-22`); earlier PRs carry no `TODO:` line.
- Never edit a committed migration. New file `supabase/migrations/2026MMDDHHMMSS_<name>.sql`, then `bun run migrations:lock`.
- Every new SQL function signature goes into `AUTHENTICATED_RPCS` in `tests/rpc-allowlist.test.ts`; revoke from `public, anon, authenticated` then grant to `authenticated`.
- Every new command name must match an `API_AREAS` regex in `lib/mgr/api-operations.ts`; run `bun run docs:api` and commit `content/docs/api.mdx`.
- A `[view]` read stays tagged `[view]` in `screens.tsx` (it is deliberately unpublished) but must be registered; drop `SCHEMA-GATE`, `SCHEMA/RLS-GATE`, `[design]` tags only when the command exists.
- Customer-visible change → update `content/docs/staff-guide.mdx` and/or `portal-guide.mdx`.
- Proof per slice: `bunx tsc --noEmit && bun run lint`, pure vitest (`bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts tests/design-docs.test.ts tests/docs.test.ts tests/screen-command-gates.test.ts tests/app-screen-parity.test.ts tests/api-docs.test.ts tests/rpc-allowlist.test.ts tests/migrations-applied.test.ts`), the slice's DB test on the test stack, and a `browse` screenshot of the rendered page.
- Ponytail: shortest diff that works. No new abstractions; aggregate in TypeScript like `get_keg_fleet` does, SQL views only where RLS needs them.
- Decisions taken 2026-09-13: keg aging is FIFO (returns retire the oldest shipments first); `recipe_versions.mash_temp_f` stays and is filled from the saccharification rest.

---

## Slice 1 — Keg report (`feat/278-keg-report`)

Ungates: **Keg report**. No migration.

### Task 1.1: `get_keg_report` query

**Files:**
- Modify: `lib/commands/taproom.ts` (after `get_customer_keg_balance`, ~line 130)
- Create: `lib/keg-aging.ts` (pure FIFO)
- Test: `tests/keg-aging.test.ts` (pure), `tests/keg-report.test.ts` (DB)

**Interfaces:**
- Produces `kegAging(events: KegLedgerEvent[], now: Date): AgedKeg[]` where `KegLedgerEvent = { customer_id: string; pool_id: string; keg_size: string; qty: number; reason: string; at: string }` and `AgedKeg = { customer_id: string; pool_id: string; keg_size: string; qty: number; shipped_at: string; days: number }`.
- Produces command `get_keg_report({})` → `{ fleet: { out: number; total: number; utilization: number | null }; bySize: { pool_id: string; pool_name: string; keg_size: string; out: number; total: number }[]; aging: { bucket: "0-30" | "31-60" | "61-90" | "90+"; kegs: number; deposit_cents: number }[]; customers: { customer_id: string; name: string; over_90: number; oldest_at: string | null }[] }`. Roles `["admin","warehouse"]`.

- [ ] **Step 1: Pure FIFO test**

```ts
// tests/keg-aging.test.ts
import { describe, expect, it } from "vitest";
import { kegAging } from "@/lib/keg-aging";

const now = new Date("2026-09-13T00:00:00Z");
const ev = (reason: string, qty: number, at: string, customer_id = "c1") => ({ customer_id, pool_id: "p1", keg_size: "half", qty, reason, at });

describe("kegAging", () => {
  it("returns retire the oldest shipments first", () => {
    const out = kegAging([ev("shipped", 3, "2026-05-01"), ev("shipped", 2, "2026-08-20"), ev("returned", 3, "2026-09-01")], now);
    expect(out).toEqual([{ customer_id: "c1", pool_id: "p1", keg_size: "half", qty: 2, shipped_at: "2026-08-20", days: 24 }]);
  });
  it("splits a partially returned shipment", () => {
    const out = kegAging([ev("shipped", 5, "2026-05-01"), ev("returned", 2, "2026-06-01")], now);
    expect(out[0]).toMatchObject({ qty: 3, shipped_at: "2026-05-01" });
  });
  it("lost kegs also leave the queue and customers do not mix", () => {
    const out = kegAging([ev("shipped", 1, "2026-05-01"), ev("shipped", 1, "2026-05-01", "c2"), ev("lost", 1, "2026-06-01")], now);
    expect(out).toEqual([{ customer_id: "c2", pool_id: "p1", keg_size: "half", qty: 1, shipped_at: "2026-05-01", days: 135 }]);
  });
});
```

- [ ] **Step 2: Run** `bunx vitest run tests/keg-aging.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/keg-aging.ts — FIFO aging over the keg ledger. The ledger stores counts,
// not serials, so a return cannot name the keg it closes; oldest-first is the
// convention (decided 2026-09-13, issue #278).
export type KegLedgerEvent = { customer_id: string; pool_id: string; keg_size: string; qty: number; reason: string; at: string };
export type AgedKeg = { customer_id: string; pool_id: string; keg_size: string; qty: number; shipped_at: string; days: number };

export function kegAging(events: KegLedgerEvent[], now: Date): AgedKeg[] {
  const queues = new Map<string, { at: string; qty: number }[]>();
  const key = (e: KegLedgerEvent) => `${e.customer_id}|${e.pool_id}|${e.keg_size}`;
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const q = queues.get(key(e)) ?? [];
    if (e.reason === "shipped") q.push({ at: e.at, qty: e.qty });
    else if (e.reason === "returned" || e.reason === "lost") {
      let left = e.qty;
      while (left > 0 && q.length) { const take = Math.min(left, q[0].qty); q[0].qty -= take; left -= take; if (q[0].qty === 0) q.shift(); }
    }
    queues.set(key(e), q);
  }
  const out: AgedKeg[] = [];
  for (const [k, q] of queues) {
    const [customer_id, pool_id, keg_size] = k.split("|");
    for (const s of q) out.push({ customer_id, pool_id, keg_size, qty: s.qty, shipped_at: s.at, days: Math.floor((now.getTime() - new Date(s.at).getTime()) / 86_400_000) });
  }
  return out;
}
```

Check the `keg_event_reason` enum values in `supabase/migrations/00001_baseline.sql` (grep `create type keg_event_reason`) before finalising the reason strings.

- [ ] **Step 4: Run** the pure test → PASS.

- [ ] **Step 5: DB test**

```ts
// tests/keg-report.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

// Copy the pool/location/bin/customer seeding from the test that exercises record_keg_event (grep tests/ for "record_keg_event").
describe("get_keg_report", () => {
  let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
  beforeAll(async () => { const b = await makeBrewery(); ctx = await makeStaffCtx(b.id, "warehouse"); /* seed pool, location, bin, customer; acquire 10 half; ship 4 at 2026-05-01; ship 2 at today; return 3 */ });
  it("utilization is out over fleet, aging is FIFO", async () => {
    const r = (await runCommand("get_keg_report", {}, ctx)) as { fleet: { out: number; total: number }; aging: { bucket: string; kegs: number }[]; customers: { over_90: number }[] };
    expect(r.fleet).toMatchObject({ out: 3, total: 10 });
    expect(r.aging.find((a) => a.bucket === "90+")?.kegs).toBe(1);
    expect(r.aging.find((a) => a.bucket === "0-30")?.kegs).toBe(2);
    expect(r.customers[0].over_90).toBe(1);
  });
  it("brewer cannot read it", async () => {
    const b = await makeBrewery(); const brewer = await makeStaffCtx(b.id, "brewer");
    await expect(runCommand("get_keg_report", {}, brewer)).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run** `scripts/test-db.sh && bunx vitest run tests/keg-report.test.ts` → FAIL (unknown command).

- [ ] **Step 7: Register the query** in `lib/commands/taproom.ts`

```ts
// The Keg report: utilization per pool × size (out ÷ fleet, fleet from
// keg_fleet_totals) and FIFO aging of what customers still hold.
defineQuery({
  name: "get_keg_report", description: "Keg fleet utilization and unreturned kegs by age bucket and customer", input: z.object({}), roles: ["admin", "warehouse"],
  handler: async (ctx) => {
    const [pools, totals, events, customers] = await Promise.all([
      listPools(ctx),
      unwrap(ctx.db.from("keg_fleet_totals").select("pool_id, keg_size, qty").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("keg_events").select("customer_id, pool_id, keg_size, qty, reason, at").eq("brewery_id", ctx.breweryId).not("customer_id", "is", null)),
      unwrap(ctx.db.from("customers").select("id, name").eq("brewery_id", ctx.breweryId)),
    ]);
    const aged = kegAging((events ?? []) as KegLedgerEvent[], new Date());
    const deposit = (pool_id: string) => Number(pools?.find((p) => p.id === pool_id)?.deposit_cents ?? 0);
    const bySize = (totals ?? []).map((t) => ({ pool_id: t.pool_id as string, pool_name: pools?.find((p) => p.id === t.pool_id)?.name ?? "", keg_size: t.keg_size as string, total: Number(t.qty), out: aged.filter((a) => a.pool_id === t.pool_id && a.keg_size === t.keg_size).reduce((n, a) => n + a.qty, 0) }));
    const out = bySize.reduce((n, r) => n + r.out, 0), total = bySize.reduce((n, r) => n + r.total, 0);
    const bucketOf = (d: number) => d <= 30 ? "0-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+";
    const aging = (["0-30", "31-60", "61-90", "90+"] as const).map((bucket) => { const rows = aged.filter((a) => bucketOf(a.days) === bucket); return { bucket, kegs: rows.reduce((n, a) => n + a.qty, 0), deposit_cents: rows.reduce((n, a) => n + a.qty * deposit(a.pool_id), 0) }; });
    const byCustomer = new Map<string, { over_90: number; oldest_at: string | null }>();
    for (const a of aged) { const c = byCustomer.get(a.customer_id) ?? { over_90: 0, oldest_at: null }; if (a.days > 90) c.over_90 += a.qty; if (!c.oldest_at || a.shipped_at < c.oldest_at) c.oldest_at = a.shipped_at; byCustomer.set(a.customer_id, c); }
    return { fleet: { out, total, utilization: total ? out / total : null }, bySize, aging,
      customers: [...byCustomer].map(([customer_id, c]) => ({ customer_id, name: customers?.find((x) => x.id === customer_id)?.name ?? "", ...c })).sort((a, b) => b.over_90 - a.over_90 || a.name.localeCompare(b.name)) };
  },
});
```

Verify `keg_fleet_totals` columns at `00001_baseline.sql:2477` first; adjust the select if it exposes different names. `total` must exclude retired kegs; if the view already nets them, use it as is.

- [ ] **Step 8: Run** DB test → PASS. Run `bun run docs:api` (matches `/keg/` → taproom area).

- [ ] **Step 9: Commit** `feat(kegs): get_keg_report with FIFO aging`.

### Task 1.2: Keg report page and view

**Files:**
- Create: `lib/mgr/keg-report-view.ts` (adapter: command result → `KegReportViewModel`), `components/mgr/views/keg-report.tsx`, `app/(app)/kegs/report/page.tsx`
- Modify: `components/mgr/screens.tsx:2182-2195` (body → `<KegReportView model={kegReportFixture} />`, `reads` unchanged `get_keg_report [view]`), `lib/mgr/fixtures/*` (add `kegReportFixture` reproducing 70% / 142 of 203 / buckets / Ridgeline row), `lib/mgr/screen-routes.ts` (add `{ name: "Keg report", file: "app/(app)/kegs/report/page.tsx" }`), `app/(app)/kegs/page.tsx` (link "Keg report"), `lib/mgr/screen-links.ts` if "Keg report" label routing is needed
- Test: `tests/keg-report-view.test.ts` (pure adapter)

- [ ] **Step 1: Adapter test**

```ts
import { expect, it } from "vitest";
import { toKegReportView } from "@/lib/mgr/keg-report-view";
it("renders utilization and buckets as the inventory shows them", () => {
  const m = toKegReportView({ fleet: { out: 142, total: 203, utilization: 142 / 203 }, bySize: [{ pool_id: "p", pool_name: "Owned", keg_size: "sixth", out: 18, total: 36 }], aging: [{ bucket: "90+", kegs: 9, deposit_cents: 27000 }], customers: [{ customer_id: "c", name: "Ridgeline Tap Room", over_90: 9, oldest_at: "2026-05-12" }] });
  expect(m.headline).toEqual(["70%", "142 of 203 kegs out"]);
  expect(m.aging[0]).toEqual(["Over 90 days", "9", "$270"]);
  expect(m.customers[0].detail).toBe("9 over 90 days · oldest 5/12");
});
```

- [ ] **Step 2:** FAIL → write `lib/mgr/keg-report-view.ts` (`KegReportViewModel = { headline: [string, string]; aging: string[][]; customers: { id: string; name: string; detail: string }[]; sizes: { title: string; detail: string; pct: string }[]; empty: boolean }`) and `components/mgr/views/keg-report.tsx` using `E.back("Keg fleet", "Keg report")`, `E.num`, `E.tbl(["Age","Kegs","Deposits"], model.aging)`, one `E.row` per customer with `E.act("Open balance")` → `/kegs/customers/[id]`, one `E.row` per size. → PASS.

- [ ] **Step 3: Page**

```tsx
// app/(app)/kegs/report/page.tsx — Keg report: fleet utilization and FIFO aging.
import { requirePagePermission, runPageQuery } from "@/lib/mgr/page-query";
import { KegReportView } from "@/components/mgr/views/keg-report";
import { toKegReportView } from "@/lib/mgr/keg-report-view";
export default async function KegReportPage() {
  const ctx = await requirePagePermission(["admin", "warehouse"], "/kegs");
  const report = await runPageQuery("get_keg_report", {}, ctx);
  return <KegReportView model={toKegReportView(report)} />;
}
```
Copy the exact `requirePagePermission` signature from `app/(app)/kegs/page.tsx`.

- [ ] **Step 4:** Swap the screen body to the view, add the route row, run the pure suite + `tsc` + lint → all PASS (`app-screen-parity` now demands the route file, `screen-command-gates` demands `isUngated`).
- [ ] **Step 5:** Browse `/kegs/report` on the test stack (memory: `browse-proof-on-test-stack`), screenshot.
- [ ] **Step 6:** `content/docs/staff-guide.mdx`: add a Keg report paragraph under the kegs section (utilization, four age buckets, Open balance).
- [ ] **Step 7: Commit** `feat(kegs): keg report page`, push, PR "Keg report (#278 slice 1)". Description: one-line progress note; no `TODO:` line.

---

## Slice 2 — Cellar sheets (`feat/278-cellar-sheets`)

Ungates: **Cellar transfer** (retag only), **Cellar addition** (new RPC).

### Task 2.1: Retag Cellar transfer

- Modify `components/mgr/screens.tsx:1641-1650`: `writes: "record_cellar_transfer [one RPC: create target occupancy (initial_bbl 0) when empty + append transfer (loss_bbl) + close source iff emptied]"` (drop `[design; …]`). Reads already live. Add a `tests/mgr-screens.test.ts` assertion: Cellar transfer writes do not contain `[design`. Run pure suite. Commit `docs(screens): cellar transfer is live`.

### Task 2.2: `record_batch_addition` RPC

**Files:**
- Create: `supabase/migrations/20260914100000_record_batch_addition.sql`
- Modify: `tests/rpc-allowlist.test.ts` (add `"record_batch_addition(uuid,uuid,uuid,ingredient_stage,uuid,numeric,text,uuid)"`), `lib/commands/production.ts`
- Test: `tests/batch-addition.test.ts`

**Interfaces:** command `record_batch_addition({ occupancyId, stage, materialId, qty, lotId?, note? })` roles `["admin","brewer"]`; returns the `batch_additions` row plus `movement_id`.

- [ ] **Step 1: DB test** — seed a batch with an open occupancy (copy from `tests/batch-completion.test.ts:100-140`), a lot-tracked hop material with on-hand stock (`seedMaterial` + a receive movement; see `tests/production.test.ts` and `tests/purchasing.test.ts`). Assert: (a) `record_batch_addition` writes one `batch_additions` row with `stage='dry_hop'`, `occupancy_id`, and a `material_movements` row of type `consumption` with the lot and `-qty`; (b) omitting `lotId` on a lot-tracked material throws `lot required`; (c) a closed occupancy throws; (d) replaying the same `requestId` returns the same row.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Migration** — skeleton from `record_fermentation_reading` (`00001_baseline.sql:5286`): `assert_staff(admin,brewer)`, `claim_command_request`, `lock_cellar_workflow`, `assert_open_occupancy`; look up the batch via `vessel_occupancies.batch_id`; if `materials.lot_tracked` and `p_lot is null` raise `'lot required for a lot-tracked material'`; insert the `material_movements` consumption row the same way `record_brew_day` does (grep `material_movements (` inside `record_brew_day` in the baseline and copy its column list and sign convention); insert `batch_additions (brewery_id, batch_id, occupancy_id, stage, movement_id)`; `complete_command_request`. Signature `(p_brewery uuid, p_occupancy uuid, p_material uuid, p_stage public.ingredient_stage, p_lot uuid, p_qty numeric, p_note text, p_request_id uuid)`. Revoke/grant block. `bun run migrations:lock`.
- [ ] **Step 4: Command** in `production.ts`:

```ts
defineCommand({
  name: "record_batch_addition", description: "Add a post-knockout material (dry hop, fruit, adjunct) to an open occupancy: one batch_additions row plus its consumption movement; lot required when the material is lot-tracked",
  input: z.object({ occupancyId: z.string().uuid(), stage: z.enum(INGREDIENT_STAGES), materialId: z.string().uuid(), qty: z.number().positive(), lotId: z.string().uuid().optional(), note: z.string().optional() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_batch_addition", { p_brewery: ctx.breweryId, p_occupancy: i.occupancyId, p_material: i.materialId, p_stage: i.stage, p_lot: i.lotId ?? null, p_qty: i.qty, p_note: i.note ?? null, p_request_id: execution.requestId })),
});
```
- [ ] **Step 5:** PASS; `bun run docs:api` (`batch` → production).
- [ ] **Step 6: Commit** `feat(cellar): record_batch_addition`.

### Task 2.3: Cellar addition sheet

**Files:** Create `lib/mgr/cellar-addition-view.ts`, `components/mgr/views/cellar-addition.tsx`, `app/(app)/cellar/cellar-addition-form.tsx`. Modify `app/(app)/cellar/page.tsx` (fetch `list_materials` and lots for lot-tracked materials; render `<CellarAdditionForm>` beside `CellarTransferForm`), `components/mgr/screens.tsx:1580-1600` (`reads: "list_occupancies · list_materials"`, `writes: "record_batch_addition [one RPC: …]"`, body → the view with a fixture), `lib/mgr/screen-routes.ts` (`{ name: "Cellar addition", file: "app/(app)/cellar/cellar-addition-form.tsx" }`), fixtures.

- [ ] Pure test `tests/cellar-addition-view.test.ts`: `additionPreview({ lotTracked: true, lotId: "", qty: "18" }).valid === false`; `additionPreview({ lotTracked: false, lotId: "", qty: "18" }).valid === true`; `qty: "0"` invalid.
- [ ] Form mirrors `cellar-transfer-form.tsx` exactly: `useCommandForm("record_batch_addition", …)`, `CommandForm` + shared view + `footer={null}`.
- [ ] Pure suite, tsc, lint, browse `/cellar` → open sheet → screenshot.
- [ ] `staff-guide.mdx`: Cellar addition paragraph (stage, lot rule, not Record movement).
- [ ] Commit `feat(cellar): cellar addition sheet`, PR "Cellar sheets (#278 slice 2)".

---

## Slice 3 — Coming up (`feat/278-portal-schedule`)

Ungates: **Coming up**.

### Task 3.1: `portal_schedule` view + query

**Files:** Create `supabase/migrations/20260915100000_portal_schedule.sql`; modify `lib/commands/portal.ts`, the portal RLS matrix test (grep tests/ for `customer_read` matrix listing `batches`), test `tests/portal-schedule.test.ts`.

- [ ] **Step 1: DB test** — brewery A with brand X and batches: planned (brewed_on null, planned_on next Monday), brewed (brewed_on set), and one planned for brewery B. Customer ctx via `makeCustomerUser` + `asUser`. Assert `portal_schedule` returns `[{ brand_id, brand_name, planned_week: "2026-09-14" }]` only, keys exactly those three; `asUser(...).from("batches").select("*")` returns zero rows; brewery B invisible.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Migration** — `batches` has no customer policy and must not get one, so a `security_invoker` view returns nothing to a customer. Use a definer view that scopes itself:

```sql
-- Buyers see what is brewing next as brand + week and nothing else (ai-chat
-- plan Task 10). Definer view scoped by my_customer_ids(); batches itself stays
-- unreadable to customers, which tests/portal-schedule.test.ts asserts.
create view public.portal_schedule as
select b.brewery_id, b.intended_brand_id as brand_id, br.name as brand_name,
       date_trunc('week', b.planned_on)::date as planned_week
from public.batches b
join public.brands br on br.id = b.intended_brand_id and br.brewery_id = b.brewery_id
where b.brewed_on is null and b.intended_brand_id is not null
  and (public.is_staff_of(b.brewery_id)
       or b.brewery_id in (select c.brewery_id from public.customers c where c.id in (select public.my_customer_ids())));
grant select on public.portal_schedule to authenticated;
```
Confirm the view owner is `postgres` (definer) as the other baseline views are; if the baseline convention is `security_invoker = true` everywhere, note the exception in the migration comment. Add `portal_schedule: read` for customer to the RLS matrix test.
- [ ] **Step 4: Query** in `portal.ts`:

```ts
defineQuery({
  name: "portal_schedule", description: "Planned batches for the buyer's brewery as brand and expected week, soonest first; nothing else about the batch",
  input: z.object({}), roles: "customer", aiExposed: true,
  handler: (ctx) => { requireCustomer(ctx); return unwrap(ctx.db.from("portal_schedule").select("brand_id, brand_name, planned_week").eq("brewery_id", ctx.breweryId).order("planned_week")); },
});
```
Check `aiExposed` is the field name the other portal queries use (grep `aiExposed` in `lib/commands/portal.ts`).
- [ ] **Step 5:** PASS; `migrations:lock`; `docs:api` (`^portal_` → portal area).
- [ ] **Step 6: Commit** `feat(portal): portal_schedule view and query`.

### Task 3.2: Coming up page

**Files:** Create `components/mgr/views/coming-up.tsx`, `lib/mgr/coming-up-view.ts`, `app/(portal)/portal/coming-up/page.tsx`. Modify `screens.tsx:1385-1400` (`reads: "portal_schedule [view]"`, body → view + fixture), `screen-routes.ts` (`{ name: "Coming up", file: "app/(portal)/portal/coming-up/page.tsx" }`), Shop (`app/(portal)/portal/cart.tsx`) adds a "Coming up" link, `content/docs/portal-guide.mdx:41` (replace "not available yet" with what it shows).

- [ ] Pure adapter test: rows `[{ brand_id: "b1", brand_name: "Hazy IPA", planned_week: "2026-09-14" }]` → `[{ title: "Hazy IPA", detail: "Week of Sep 14", href: "/portal#brand-b1" }]`; empty → `empty: true` with copy "Nothing planned yet · check back".
- [ ] Page: `getActiveCustomer()` → `buildContext` → `runCommand("portal_schedule")` → view. Brand row links to Shop anchored at the brand (add `id={`brand-${id}`}` on Shop's brand heading if missing).
- [ ] Pure suite, tsc, lint, browse `/portal/coming-up` as a customer, screenshot.
- [ ] Commit `feat(portal): coming up page`, PR "Coming up (#278 slice 3)".

---

## Slice 4 — Water profiles (`feat/278-water-profiles`)

Ungates: **Water profiles**, **Water profile**.

### Task 4.1: table + commands

**Files:** Create `supabase/migrations/20260916100000_water_profiles.sql`; modify `lib/commands/production.ts`, `tests/rpc-allowlist.test.ts` (`"upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,uuid)"`), RLS matrix test (`water_profiles`: staff read, customer/taproom deny); test `tests/water-profiles.test.ts`.

- [ ] **Step 1: DB test** — brewer creates "Hazy target" with six ions; `list_water_profiles` returns it alphabetically; upsert with `profileId` renames it; duplicate name in one brewery throws; a warehouse role is refused.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Migration**

```sql
create table public.water_profiles (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  name text not null,
  calcium_ppm numeric(7,1) not null check (calcium_ppm >= 0),
  magnesium_ppm numeric(7,1) not null check (magnesium_ppm >= 0),
  sodium_ppm numeric(7,1) not null check (sodium_ppm >= 0),
  sulfate_ppm numeric(7,1) not null check (sulfate_ppm >= 0),
  chloride_ppm numeric(7,1) not null check (chloride_ppm >= 0),
  bicarbonate_ppm numeric(7,1) not null check (bicarbonate_ppm >= 0),
  created_at timestamptz not null default now(),
  unique (id, brewery_id), unique (brewery_id, name)
);
create index water_profiles_brewery_idx on public.water_profiles (brewery_id);
alter table public.water_profiles enable row level security;
create policy staff_read on public.water_profiles for select using (public.is_staff_of(brewery_id));
create function public.upsert_water_profile(p_brewery uuid, p_profile uuid, p_name text, p_calcium numeric, p_magnesium numeric, p_sodium numeric, p_sulfate numeric, p_chloride numeric, p_bicarbonate numeric, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.water_profiles;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_water_profile', p_request_id, jsonb_build_object('brewery', p_brewery, 'profile', p_profile, 'name', p_name, 'calcium', p_calcium, 'magnesium', p_magnesium, 'sodium', p_sodium, 'sulfate', p_sulfate, 'chloride', p_chloride, 'bicarbonate', p_bicarbonate));
  if v_replay is not null then return v_replay; end if;
  if p_profile is null then
    insert into public.water_profiles (brewery_id, name, calcium_ppm, magnesium_ppm, sodium_ppm, sulfate_ppm, chloride_ppm, bicarbonate_ppm)
    values (p_brewery, p_name, p_calcium, p_magnesium, p_sodium, p_sulfate, p_chloride, p_bicarbonate) returning * into v_row;
  else
    update public.water_profiles set name = p_name, calcium_ppm = p_calcium, magnesium_ppm = p_magnesium, sodium_ppm = p_sodium, sulfate_ppm = p_sulfate, chloride_ppm = p_chloride, bicarbonate_ppm = p_bicarbonate
    where id = p_profile and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'water profile not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,uuid) from public, anon, authenticated;
grant execute on function public.upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,uuid) to authenticated;
```
- [ ] **Step 4: Commands** — `list_water_profiles` (`defineQuery`, roles admin/brewer, select all columns order by name) and `upsert_water_profile` (`defineCommand`, input `{ profileId?: uuid, name: trim min 1, calciumPpm…bicarbonatePpm: nonnegative }`).
- [ ] **Step 5:** PASS; lock; docs:api (`water_profile` → production).
- [ ] **Step 6: Commit** `feat(catalog): water profiles table and commands`.

### Task 4.2: pages

**Files:** Create `app/(app)/catalog/water-profiles/page.tsx`, `app/(app)/catalog/water-profiles/water-profile-form.tsx`, `components/mgr/views/water-profiles.tsx`, `lib/mgr/water-profiles-view.ts`. Modify `screens.tsx:2590-2635` (remove `gatedBy`, `reads: "list_water_profiles"`, `writes: "upsert_water_profile [one RPC; insert when profileId is empty]"`, bodies → views), `screen-routes.ts` (two rows), catalog index page (link "Water profiles"), `lib/mgr/screen-links.ts` if needed, `staff-guide.mdx` (catalog section).

- [ ] Pure adapter test: profile row → `"Calcium 110 · Magnesium 10 · Sodium 15 · Sulfate 90 · Chloride 180 · Bicarbonate 40"`.
- [ ] Form: `useCommandForm("upsert_water_profile")`, six `type="number"` inputs, shared view, `footer={null}`.
- [ ] Pure suite, tsc, lint, browse, screenshot.
- [ ] Commit `feat(catalog): water profiles pages`, PR "Water profiles (#278 slice 4)".

---

## Slice 5 — Recipe process spec (`feat/278-recipe-process`)

Ungates: **Mash schedule**, **Mash step**, **Fermentation schedule**, **Fermentation stage**, **Water**, **Water addition**; clears the Recipe screen's `SCHEMA-GATE: process-spec columns` note. Depends on slice 4 (water profile ids).

### Task 5.1: columns + new `create_recipe_version` signature

**Files:** Create `supabase/migrations/20260917100000_recipe_process_spec.sql`; modify `lib/commands/production.ts:32-60` and `get_recipe`, `tests/rpc-allowlist.test.ts` (replace the old `create_recipe_version` signature with the new one), `tests/production.test.ts:30-100` (callers pass `mashSchedule` instead of `mashTempF`), `lib/recipe-schedule.ts`; test `tests/recipe-process.test.ts`.

**Interfaces:** the command input becomes

```ts
mashSchedule: z.array(z.object({ type: z.enum(["infusion","decoction","temperature","rest"]), name: z.string().trim().min(1), tempF: z.number(), minutes: z.number().int().positive() })).min(1),
fermentationSchedule: z.array(z.object({ type: z.enum(["primary","diacetyl_rest","dry_hop","cold_crash","conditioning"]), name: z.string().trim().min(1), tempF: z.number(), days: z.number().positive() })).min(1),
preBoilBbl: z.number().positive().optional(),
whirlpool: z.object({ minutes: z.number().int().nonnegative(), tempF: z.number().optional(), restMinutes: z.number().int().nonnegative().optional() }).optional(),
knockoutTempF: z.number().optional(),
water: z.object({ targetProfileId: z.string().uuid().optional(), sourceProfileId: z.string().uuid().optional(), mashGal: z.number().positive().optional(), spargeGal: z.number().positive().optional(), targetMashPh: z.number().optional(), additions: z.array(z.object({ materialId: z.string().uuid(), qty: z.number().positive(), stage: z.enum(["mash","sparge","kettle"]) })).default([]) }).optional(),
```
`mashTempF` leaves the input; the RPC fills `mash_temp_f` from the saccharification rest. Take the step/stage type enums from the Mash step and Fermentation stage sheet pick lists in `screens.tsx:1925-1990`; use those exact values. New RPC signature: `create_recipe_version(uuid, uuid, jsonb, jsonb, numeric, numeric, integer, numeric, text, numeric, integer, numeric, integer, numeric, uuid, uuid, numeric, numeric, numeric, jsonb, jsonb, uuid)` in the order `(p_brewery, p_recipe, p_mash_schedule, p_fermentation_schedule, p_brewhouse_efficiency, p_yeast_attenuation, p_boil_minutes, p_target_ibu, p_note, p_pre_boil_bbl, p_whirlpool_minutes, p_whirlpool_temp_f, p_whirlpool_rest_minutes, p_knockout_temp_f, p_target_water_profile, p_source_water_profile, p_mash_water_gal, p_sparge_water_gal, p_target_mash_ph, p_water_additions, p_ingredients, p_request_id)`.

- [ ] **Step 1: DB test** — create a version with a three-step mash (104/15, 152/60, 168/10) and four-stage fermentation, water block with two additions; assert `get_recipe` returns them verbatim, `version.mash_temp_f === 152`, and `recipe_water_additions` has two rows with `stage`. Assert an empty `mashSchedule` is rejected. Assert the old caller shape (`mashTempF`) is rejected by Zod.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Migration** — `alter table public.recipe_versions add column mash_schedule jsonb, add column fermentation_schedule jsonb, add column pre_boil_bbl numeric(10,3), add column whirlpool_minutes int, add column whirlpool_temp_f numeric, add column whirlpool_rest_minutes int, add column knockout_temp_f numeric, add column target_water_profile_id uuid, add column source_water_profile_id uuid, add column mash_water_gal numeric(8,2), add column sparge_water_gal numeric(8,2), add column target_mash_ph numeric(4,2);` plus composite FKs `(target_water_profile_id, brewery_id) references water_profiles (id, brewery_id)` (same for source). New table `public.recipe_water_additions (id, brewery_id, recipe_version_id, material_id, qty numeric(12,4) check (qty > 0), stage text check (stage in ('mash','sparge','kettle')), sort int not null default 0)` with `staff_read` RLS, brewery index, and composite FKs to `recipe_versions` and `materials`. `drop function public.create_recipe_version(uuid,uuid,numeric,numeric,numeric,integer,numeric,text,jsonb,uuid);` then create the new one from the baseline body (`00001_baseline.sql:4970`) adding the columns, the water additions insert, and

```sql
v_mash_temp := (select (s->>'temp_f')::numeric from jsonb_array_elements(p_mash_schedule) s
  order by (case when (s->>'temp_f')::numeric between 140 and 162 then 0 else 1 end), (s->>'minutes')::int desc limit 1);
```
Mirror that rule in `lib/recipe-schedule.ts` `saccharificationRest` if it differs today (read it first; the SQL must match the TS). Revoke/grant. Old versions keep `mash_schedule null`; `get_recipe` returns `[]` for them.
- [ ] **Step 4:** Update the command, `get_recipe` select list (+ a read of `recipe_water_additions`), `app/(app)/recipes/[id]/recipe-version-form.tsx` build payload (temporary: one-step mash `[{ type: "rest", name: "Saccharification", tempF: <existing field>, minutes: 60 }]` and one fermentation stage from defaults, so the live form keeps working until Task 5.2 replaces it), `tests/production.test.ts` callers.
- [ ] **Step 5:** PASS; lock; docs:api.
- [ ] **Step 6: Commit** `feat(recipes): process spec columns on recipe versions`.

### Task 5.2: the six sheets on the live recipe version form

**Files:** Create `components/mgr/views/mash-schedule.tsx`, `components/mgr/views/fermentation-schedule.tsx`, `components/mgr/views/water.tsx` (list views with add/remove/reorder verbs, each row opening its step/stage/addition sheet), `lib/mgr/recipe-process-view.ts` (draft state + `reorder`, `remove`, `upsertAt` pure helpers), `app/(app)/recipes/[id]/mash-schedule-sheet.tsx`, `fermentation-schedule-sheet.tsx`, `water-sheet.tsx`. Modify `recipe-version-form.tsx` (holds the draft; sheets edit it; submit sends the full `create_recipe_version` payload; remove the mash temp field), `app/(app)/recipes/[id]/page.tsx` (read-out of the cut version's schedules), `screens.tsx:1896-2040` (drop every `SCHEMA-GATE: recipe process spec` and `[design]` on `get_recipe`/`create_recipe_version`/`list_water_profiles`; bodies → views over `MASH_STEPS`/`FERM_STAGES`), `screen-routes.ts` (six rows pointing at the three sheet files), `staff-guide.mdx` (recipes section: schedules, water, one stage field).

- [ ] Pure test `tests/recipe-process-view.test.ts`: `reorder(steps, 2, 0)` moves the third step first; `remove(steps, 1)` keeps the others in order; `upsertAt(steps, undefined, step)` appends and `upsertAt(steps, 1, step)` replaces; `totalDuration`/`saccharificationRest` from `lib/recipe-schedule.ts` still agree with the fixture (85 min total, 60 min at 152 °F).
- [ ] Build the views and sheets; `footer={null}` slots preserved; position from list order (no typed number).
- [ ] Pure suite, tsc, lint; browse `/recipes/<id>` → New version → open each sheet, screenshot each.
- [ ] Commit `feat(recipes): mash, fermentation and water schedules`, PR "Recipe process spec (#278 slice 5)".

---

## Slice 6 — Repack parity (`feat/278-repack-parity`)

Ungates: **Repack**. No migration; `record_repack` exists and pins `childQty = parentQty × format_components.quantity`.

### Task 6.1: live form renders the shared `RepackView`

**Files:** Modify `app/(app)/packaging/repack-form.tsx` (drop the free "Into" SKU + child qty inputs; derive child SKU and qty from the parent's composition; render `RepackView` with `footer={null}` and the tape lines the inventory shows), `app/(app)/packaging/page.tsx` (fetch `get_format_composition` rows for the packaged SKUs so the form has them; read its input schema in `lib/commands/packaging.ts` first), `lib/mgr/repack-view.ts` (add `toRepackView({ parentLabel, composition, qty, location, bin })` producing `RepackViewModel`, `unavailable` set when the parent has no single composition row), `screens.tsx:2690-2700` (`writes: "record_repack [one RPC; the outbound leg's qty is derived from format composition, abs(sum(bbl)) < 0.000001 over the shared ref]"`, footer no longer gated), `screen-routes.ts` (`{ name: "Repack", file: "app/(app)/packaging/repack-form.tsx" }`), `tests/mgr-screens.test.ts` (assert Repack writes carry no `SCHEMA-GATE`).

- [ ] Pure test `tests/repack-view.test.ts`: composition `{ childLabel: "four-pack", quantity: 6, parentBbl: 0.096774 }` with qty 1 → `tape[0] = ["−1 case · repack", "0.096774 bbl"]`, `tape[1] = ["+6 four-pack · repack", "derived from the case total"]`, `unavailable` undefined; a parent with no composition → `unavailable` equals the fixture sentence at `lib/mgr/fixtures/packaging.ts` (`repackCase.unavailable`).
- [ ] Rewrite the form on the shared view; keep the irreversible confirm button and `requiresConfirmation`; the payload still sends `childSkuId` and `childQty`, now derived.
- [ ] Pure suite, tsc, lint, `bunx vitest run tests/packaging.test.ts` on the test stack, browse `/packaging` → Repack, screenshot.
- [ ] `staff-guide.mdx`: repack paragraph says the "into" side is derived, not typed.
- [ ] Commit `feat(packaging): repack on the shared view`, PR "Repack parity (#278 slice 6)". Description carries `TODO: Issue #278 — schema and missing-view gates (13 screens): …` verbatim from `TODO.md` and "Closes #278".

---

## Self-review

- Spec coverage: 9 SCHEMA-GATE screens → slices 4, 5, 6; 4 missing-view reads → slices 1, 2, 3. Cellar transfer is retag only. `get_material_shortfalls` / `get_planning_shortfalls` belong to #274, not here.
- Schedule packaging run appears in the TODO.md item text but not in #278's tables and has its own TODO item; out of scope, say so in the slice 6 PR.
- Types: `KegLedgerEvent`/`AgedKeg` (1.1) feed `toKegReportView` (1.2); slice 5 input names match the `recipe_versions` columns added in 5.1; `RepackViewModel` fields match `lib/mgr/repack-view.ts` as it exists today.
