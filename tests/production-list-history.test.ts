import { beforeAll, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedMaterial } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import type { HistoryPage, HistoryRow } from "@/lib/commands/history";
import "@/lib/commands/all";

type Batch = HistoryRow & { brand_name: string | null; recipe_name: string | null; active_occupancies: { latest_reading?: { temp_f: number } | null }[] };
type Run = HistoryRow & { brand_name: string; qty_planned: number; closed_at: string | null; cancelled_at: string | null };
let ctx: Ctx, other: Ctx;
let plannedId: string, activeId: string, upcomingId: string;
const completedIds = Array.from({ length: 55 }, () => crypto.randomUUID()).sort().reverse();
const cancelledIds = Array.from({ length: 55 }, () => crypto.randomUUID()).sort().reverse();
const closedRunIds = Array.from({ length: 55 }, () => crypto.randomUUID()).sort().reverse();
const cancelledRunIds = Array.from({ length: 55 }, () => crypto.randomUUID()).sort().reverse();

beforeAll(async () => {
  ctx = await makeStaffCtx((await makeBrewery()).id, "admin");
  other = await makeStaffCtx((await makeBrewery()).id, "admin");
  const catalog = await seedCatalog(ctx.breweryId, { product: "History pils" });
  const recipe = await runCommand("create_recipe", { name: "History recipe" }, ctx) as { id: string };
  const malt = await seedMaterial(ctx.breweryId, { name: "History malt", category: "malt" });
  const version = await runCommand("create_recipe_version", {
    recipeId: recipe.id, mashSchedule: [{ name: "Mash", kind: "infusion", tempF: 152, minutes: 60 }],
    brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, ingredients: [{ materialId: malt, perBblQty: 1, stage: "mash" }],
  }, ctx) as { id: string };
  const plan = { plannedOn: "2026-10-01", plannedBbl: 10, intendedBrandId: catalog.brandId, recipeVersionId: version.id };
  plannedId = (await runCommand("schedule_batch", plan, ctx) as { id: string }).id;
  activeId = (await runCommand("schedule_batch", plan, ctx) as { id: string }).id;
  const vessel = await runCommand("upsert_vessel", { name: "History FV", kind: "fermenter", capacityBbl: 30 }, ctx) as { id: string };
  const brew = await runCommand("record_brew_day", { batchId: activeId, vesselId: vessel.id, brewedOn: plan.plannedOn, initialBbl: 10, actuals: [], confirmEmpty: true }, ctx) as { occupancy: { id: string } };
  await runCommand("record_fermentation_reading", { occupancyId: brew.occupancy.id, at: "2026-10-02T12:00:00Z", tempF: 65 }, ctx);
  await runCommand("record_fermentation_reading", { occupancyId: brew.occupancy.id, at: "2026-10-03T12:00:00Z", tempF: 68 }, ctx);
  const common = { brewery_id: ctx.breweryId, created_by: ctx.userId, created_at: "2026-09-20T12:00:00.123456Z", planned_on: plan.plannedOn };
  await admin.from("batches").insert([
    ...completedIds.map(id => ({ ...common, id, planned_bbl: 10, intended_brand_id: catalog.brandId, recipe_version_id: version.id, brewed_on: plan.plannedOn, closed_at: "2026-10-03T12:00:00Z" })),
    ...cancelledIds.map(id => ({ ...common, id, planned_bbl: 10, cancelled_at: "2026-10-03T12:00:00Z" })),
  ]).throwOnError();
  upcomingId = (await runCommand("schedule_packaging_run", { brandId: catalog.brandId, plannedOn: plan.plannedOn, outputs: [{ skuId: catalog.skuId, qtyPlanned: 12 }] }, ctx) as { id: string }).id;
  await admin.from("packaging_runs").insert([
    ...closedRunIds.map(id => ({ ...common, id, brand_id: catalog.brandId, occupancy_id: brew.occupancy.id, started_at: "2026-10-02T12:00:00Z", closed_at: "2026-10-03T12:00:00Z" })),
    ...cancelledRunIds.map(id => ({ ...common, id, brand_id: catalog.brandId, cancelled_at: "2026-10-03T12:00:00Z" })),
  ]).throwOnError();
  await admin.from("packaging_run_outputs").insert([...closedRunIds, ...cancelledRunIds].map(run_id => ({ brewery_id: ctx.breweryId, run_id, sku_id: catalog.skuId, qty_planned: 12 }))).throwOnError();
  // Another tenant has matching lifecycle facts but must never enter these pages.
  const otherCatalog = await seedCatalog(other.breweryId);
  await admin.from("batches").insert({ brewery_id: other.breweryId, created_by: other.userId, planned_on: plan.plannedOn, planned_bbl: 10, brewed_on: plan.plannedOn, closed_at: "2026-10-03T12:00:00Z" }).throwOnError();
  await runCommand("schedule_packaging_run", { brandId: otherCatalog.brandId, plannedOn: plan.plannedOn, outputs: [] }, other);
});

it("keeps current batch work separate from imported history and embeds the recipe and latest reading", async () => {
  const planned = await runCommand("list_batches", { open: false }, ctx) as Batch[];
  const active = await runCommand("list_batches", { open: true, readings: true }, ctx) as Batch[];
  expect(planned.map(row => row.id)).toEqual([plannedId]);
  expect(active.map(row => row.id)).toEqual([activeId]);
  expect(planned[0]).toMatchObject({ brand_name: "History pils", recipe_name: "History recipe", active_occupancies: [] });
  expect(active[0]).toMatchObject({ brand_name: "History pils", recipe_name: "History recipe", active_occupancies: [{ latest_reading: { temp_f: 68 } }] });
  expect((await runCommand("list_batches", {}, ctx) as Batch[]).map(row => row.id).sort()).toEqual([plannedId, activeId].sort());
});

it("pages completed and cancelled batches independently without timestamp-tie gaps or tenant leaks", async () => {
  for (const [status, ids] of [["completed", completedIds], ["cancelled", cancelledIds]] as const) {
    const first = await runCommand("list_batch_history", { status }, ctx) as HistoryPage<Batch>;
    expect(first.rows.map(row => row.id)).toEqual(ids.slice(0, 50));
    expect(first.nextCursor).toBe(`${first.rows[49].created_at}~${first.rows[49].id}`);
    const next = await runCommand("list_batch_history", { status, cursor: first.nextCursor }, ctx) as HistoryPage<Batch>;
    expect(next.rows.map(row => row.id)).toEqual(ids.slice(50));
    expect(next.nextCursor).toBeNull();
    expect([...first.rows, ...next.rows].every(row => row.active_occupancies.length === 0)).toBe(true);
    expect(first.rows[0]).toMatchObject(status === "completed" ? { brand_name: "History pils", recipe_name: "History recipe" } : { brand_name: null, recipe_name: null });
    const denied = await runCommand("list_batch_history", { status }, { ...ctx, breweryId: other.breweryId }) as HistoryPage<Batch>;
    expect(denied.rows).toEqual([]);
  }
});

it("keeps every upcoming run visible while paging only finished runs with their planned quantities", async () => {
  expect((await runCommand("list_packaging_runs", {}, ctx) as Run[]).map(row => row.id)).toEqual([upcomingId]);
  const expected = [...closedRunIds, ...cancelledRunIds].sort().reverse();
  const listed: Run[] = [];
  let cursor: string | undefined;
  do {
    const page = await runCommand("list_packaging_history", { cursor }, ctx) as HistoryPage<Run>;
    expect(page.rows.length).toBeLessThanOrEqual(50);
    listed.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(listed.map(row => row.id)).toEqual(expected);
  expect(listed.every(row => (row.closed_at || row.cancelled_at) && row.brand_name === "History pils" && row.qty_planned === 12)).toBe(true);
  expect((await runCommand("list_packaging_history", {}, { ...ctx, breweryId: other.breweryId }) as HistoryPage<Run>).rows).toEqual([]);
  for (const [name, input] of [["list_batch_history", { status: "completed" }], ["list_packaging_history", {}]] as const) {
    for (const invalid of [{ cursor: "bad),brewery_id.not.is.null" }, { limit: 0 }, { limit: 201 }]) {
      await expect(runCommand(name, { ...input, ...invalid }, ctx)).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(runCommand(name, input, { ...ctx, roles: ["sales"] })).rejects.toMatchObject({ code: "permission_denied" });
  }
});
