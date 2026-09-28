import { beforeAll, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedMaterial } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let catalog: Awaited<ReturnType<typeof seedCatalog>>;
let recipeVersionId: string;
let malt: string;
let packagingMaterial: string;
const day = "2026-10-01";
const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID(), origin: "ui" as const });
const scheduleBatch = async () => await runCommand("schedule_batch", { plannedOn: day, plannedBbl: 10, intendedBrandId: catalog.brandId, recipeVersionId }, ctx) as { id: string };
const scheduleRun = async (occupancyId?: string) => await runCommand("schedule_packaging_run", { brandId: catalog.brandId, plannedOn: day, occupancyId, outputs: [{ skuId: catalog.skuId, qtyPlanned: 10 }] }, ctx) as { id: string };

beforeAll(async () => {
  const brewery = await makeBrewery();
  ctx = await makeStaffCtx(brewery.id, "brewer");
  catalog = await seedCatalog(brewery.id);
  malt = await seedMaterial(brewery.id, { name: "Plan malt", category: "malt" });
  const recipe = await runCommand("create_recipe", { name: "Plan recipe" }, ctx) as { id: string };
  const version = await runCommand("create_recipe_version", { recipeId: recipe.id, mashSchedule: [{ name: "Rest", kind: "infusion", tempF: 152, minutes: 60 }], brewhouseEfficiency: 0.75, yeastAttenuation: 0.8, ingredients: [{ materialId: malt, perBblQty: 2, stage: "mash" }] }, ctx) as { id: string };
  recipeVersionId = version.id;
  packagingMaterial = await seedMaterial(brewery.id, { name: "Plan can", category: "packaging", uom: "each" });
  const bom = await admin.from("format_bom").insert({ brewery_id: brewery.id, format_id: catalog.formatId, material_id: packagingMaterial, qty_per_unit: 1 });
  if (bom.error) throw bom.error;
});

it("reschedules and cancels a batch with exact replay, retained history and no demand or physical writes", async () => {
  const batch = await scheduleBatch();
  const replay = execution();
  const moved = await runCommand("reschedule_batch", { batchId: batch.id, plannedOn: "2026-10-03" }, ctx, replay);
  expect(moved).toMatchObject({ id: batch.id, planned_on: "2026-10-03" });
  expect(await runCommand("reschedule_batch", { batchId: batch.id, plannedOn: "2026-10-03" }, ctx, replay)).toEqual(moved);
  await expect(runCommand("reschedule_batch", { batchId: batch.id, plannedOn: day }, ctx, replay)).rejects.toThrow();
  const cancelExecution = execution();
  const cancelled = await runCommand("cancel_batch", { batchId: batch.id }, ctx, cancelExecution);
  expect(cancelled).toMatchObject({ id: batch.id, cancelled_at: expect.any(String), brewed_on: null });
  expect(await runCommand("cancel_batch", { batchId: batch.id }, ctx, cancelExecution)).toEqual(cancelled);
  const requirements = await admin.from("material_requirements").select("required").eq("brewery_id", ctx.breweryId).eq("material_id", malt);
  expect(requirements.error).toBeNull();
  expect(requirements.data).toEqual([]);
  const volume = await admin.from("product_volume_requirements").select("supply_bbl").eq("brand_id", catalog.brandId).single();
  expect(volume.data?.supply_bbl).toBe(0);
  await expect(runCommand("reschedule_batch", { batchId: batch.id, plannedOn: day }, ctx)).rejects.toThrow(/cancelled/);
  const vessel = await runCommand("upsert_vessel", { name: "Cancelled batch tank", kind: "fermenter", capacityBbl: 20 }, ctx) as { id: string };
  await expect(runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: vessel.id, initialBbl: 10, brewedOn: day }, ctx)).rejects.toThrow(/cancelled/);
  for (const table of ["inventory_movements", "material_movements", "vessel_occupancies"] as const) {
    const result = await admin.from(table).select("id", { count: "exact", head: true }).eq("brewery_id", ctx.breweryId);
    expect(result.error).toBeNull(); expect(result.count).toBe(0);
  }
});

it("cancelled runs stop demanding beer and no longer block completion, without dropping outputs", async () => {
  const batch = await scheduleBatch();
  const vessel = await runCommand("upsert_vessel", { name: "Run tank", kind: "fermenter", capacityBbl: 20 }, ctx) as { id: string };
  const brewed = await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: vessel.id, initialBbl: 10, brewedOn: day }, ctx) as { occupancy: { id: string } };
  for (const command of ["cancel_batch", "reschedule_batch"]) await expect(runCommand(command, { batchId: batch.id, plannedOn: day }, ctx)).rejects.toThrow(/physical work/);
  const run = await scheduleRun(brewed.occupancy.id);
  await expect(runCommand("get_batch_completion_preview", { batchId: batch.id }, ctx)).rejects.toThrow(/still open/);
  expect(await runCommand("reschedule_packaging_run", { runId: run.id, plannedOn: "2026-10-04" }, ctx)).toMatchObject({ planned_on: "2026-10-04" });
  await runCommand("reschedule_packaging_run", { runId: run.id, plannedOn: "2020-01-01" }, ctx);
  const activeDemand = await admin.from("product_volume_requirements").select("demand_bbl").eq("brand_id", catalog.brandId).single();
  expect(Number(activeDemand.data?.demand_bbl)).toBeGreaterThan(0);
  const activeMaterials = await admin.from("packaging_run_requirements").select("required").eq("run_id", run.id).single();
  expect(activeMaterials.data?.required).toBe(10);
  const replay = execution();
  const cancelled = await runCommand("cancel_packaging_run", { runId: run.id }, ctx, replay);
  expect(await runCommand("cancel_packaging_run", { runId: run.id }, ctx, replay)).toEqual(cancelled);
  expect(await runCommand("get_batch_completion_preview", { batchId: batch.id }, ctx)).toMatchObject({ batchId: batch.id });
  const volume = await admin.from("product_volume_requirements").select("demand_bbl").eq("brand_id", catalog.brandId).single();
  expect(volume.data?.demand_bbl).toBe(0);
  const cancelledMaterials = await admin.from("packaging_run_requirements").select("run_id").eq("run_id", run.id);
  expect(cancelledMaterials.error).toBeNull(); expect(cancelledMaterials.data).toEqual([]);
  const aggregate = await admin.from("material_requirements").select("required").eq("brewery_id", ctx.breweryId).eq("material_id", packagingMaterial);
  expect(aggregate.error).toBeNull(); expect(aggregate.data).toEqual([]);
  const detail = await runCommand("get_packaging_run", { runId: run.id }, ctx) as { outputs: unknown[] };
  expect(detail.outputs).toHaveLength(1);
  for (const input of [{ startedAt: new Date().toISOString() }, { outputs: [] }, { occupancyId: brewed.occupancy.id }]) await expect(runCommand("update_packaging_run", { runId: run.id, ...input }, ctx)).rejects.toThrow(/cancelled/);
  await expect(runCommand("reschedule_packaging_run", { runId: run.id, plannedOn: day }, ctx)).rejects.toThrow(/cancelled/);
  const started = await scheduleRun(brewed.occupancy.id);
  await runCommand("update_packaging_run", { runId: started.id, startedAt: new Date().toISOString() }, ctx);
  for (const command of ["cancel_packaging_run", "reschedule_packaging_run"]) await expect(runCommand(command, { runId: started.id, plannedOn: day }, ctx)).rejects.toThrow(/physical work/);
});

it("refuses foreign plans and uses existing production permissions at the RPC boundary", async () => {
  const batch = await scheduleBatch();
  const run = await scheduleRun();
  const outsider = await makeStaffCtx((await makeBrewery()).id, "brewer");
  const warehouse = await makeStaffCtx(ctx.breweryId, "warehouse");
  for (const [name, input] of [["cancel_batch", { batchId: batch.id }], ["reschedule_batch", { batchId: batch.id, plannedOn: day }], ["cancel_packaging_run", { runId: run.id }], ["reschedule_packaging_run", { runId: run.id, plannedOn: day }]] as const) {
    await expect(runCommand(name, input, outsider)).rejects.toThrow(/not found/);
  }
  const denied = await warehouse.db.rpc("cancel_batch", { p_brewery: ctx.breweryId, p_batch: batch.id, p_request_id: crypto.randomUUID() });
  expect(denied.error).not.toBeNull();
  expect(await runCommand("cancel_packaging_run", { runId: run.id }, warehouse)).toMatchObject({ cancelled_at: expect.any(String) });
});

it("rejects a missing reschedule date before claiming the request", async () => {
  const batch = await scheduleBatch();
  const requestId = crypto.randomUUID();
  const missing = await ctx.db.rpc("reschedule_batch", { p_brewery: ctx.breweryId, p_batch: batch.id, p_planned_on: null as unknown as string, p_request_id: requestId });
  expect(missing.error?.message).toMatch(/planned date is required/);
  // The request id was never claimed, so the same id may carry a valid date.
  const moved = await ctx.db.rpc("reschedule_batch", { p_brewery: ctx.breweryId, p_batch: batch.id, p_planned_on: "2026-10-05", p_request_id: requestId });
  expect(moved.error).toBeNull();
});
