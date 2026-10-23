// tests/brew-pulls.test.ts — Prep's pull list (docs/plans/brew-day-revamp.md
// Task 4): save_batch_pulls replaces a planned batch's draft pulls and its
// planned tank without moving stock, checking each line the way
// record_brew_day does; get_brew_day_plan reads the pulls back with the
// ingredients' pack sizes. The RPC cases call it directly; the last block runs
// the save_batch_pulls command with Prep's camelCase payload.
import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedLocation, seedMaterial, seedMovement } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import type { Json } from "@/lib/supabase/database";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Line = { recipe_ingredient_id?: string | null; material_id: string; location_id: string; bin_id: string; lot_id: string | null; qty: number };

async function plannedBatch() {
  const brewery = await makeBrewery();
  const brewer = await makeStaffCtx(brewery.id, "brewer");
  const owner = await makeStaffCtx(brewery.id, "admin");
  const location = await seedLocation(brewery.id);
  const malt = await seedMaterial(brewery.id, { name: "Pilsner malt", category: "malt", lotTracked: true });
  const salt = await seedMaterial(brewery.id, { name: "Gypsum", category: "chemical" });
  await admin.from("materials").update({ purchase_uom_factor: 55 }).eq("id", malt).throwOnError();
  const lot = await ins("material_lots", { brewery_id: brewery.id, material_id: malt, lot_code: "PILS-1", received_on: "2026-10-01" });
  await seedMovement(brewery.id, { materialId: malt, locationId: location.id, binId: location.binId, lotId: lot.id, qty: 500, createdBy: owner.userId });
  const recipe = await runCommand("create_recipe", { name: "Prep pils" }, brewer) as { id: string };
  const version = await runCommand("create_recipe_version", { recipeId: recipe.id, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, mashSchedule: [{ name: "Rest", kind: "infusion", tempF: 150, minutes: 60 }], ingredients: [{ materialId: malt, perBblQty: 50, stage: "mash" }] }, brewer) as { id: string };
  const batch = await runCommand("schedule_batch", { plannedOn: "2026-10-25", plannedBbl: 2, recipeVersionId: version.id }, brewer) as { id: string };
  const vessel = await runCommand("upsert_vessel", { name: "FV prep", kind: "fermenter", capacityBbl: 10 }, owner) as { id: string };
  const ingredient = (await admin.from("recipe_ingredients").select("id").eq("recipe_version_id", version.id).single().throwOnError()).data!;
  const maltLine: Line = { recipe_ingredient_id: ingredient.id, material_id: malt, location_id: location.id, bin_id: location.binId, lot_id: lot.id, qty: 110 };
  const saltLine: Line = { material_id: salt, location_id: location.id, bin_id: location.binId, lot_id: null, qty: 0.25 };
  return { brewery, brewer, owner, location, malt, salt, lot, batch, vessel, ingredient, maltLine, saltLine };
}

async function save(ctx: Ctx, batchId: string, vesselId: string | null, lines: Json) {
  const { data, error } = await ctx.db.rpc("save_batch_pulls", {
    // The generated Args type omits nullability; p_vessel null means no tank chosen yet.
    p_brewery: ctx.breweryId, p_batch: batchId, p_vessel: vesselId as string, p_lines: lines, p_request_id: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  return data as { batch: { planned_vessel_id: string | null }; pulls: { material_id: string; qty: number }[] };
}

const pullRows = async (batchId: string) =>
  (await admin.from("brew_pulls").select("material_id,lot_id,qty,recipe_ingredient_id").eq("batch_id", batchId).order("qty").throwOnError()).data!;

describe("save_batch_pulls", () => {
  it("replaces the batch's pulls and sets its planned tank, moving no stock", async () => {
    const f = await plannedBatch();
    const before = (await admin.from("material_movements").select("id").eq("brewery_id", f.brewery.id).throwOnError()).data!;
    const first = await save(f.brewer, f.batch.id, f.vessel.id, [f.maltLine, f.saltLine]);
    expect(first.batch.planned_vessel_id).toBe(f.vessel.id);
    expect(first.pulls).toHaveLength(2);
    await save(f.brewer, f.batch.id, null, [{ ...f.maltLine, qty: 220 }]);
    expect(await pullRows(f.batch.id)).toEqual([{ material_id: f.malt, lot_id: f.lot.id, qty: 220, recipe_ingredient_id: f.ingredient.id }]);
    const batch = (await admin.from("batches").select("planned_vessel_id").eq("id", f.batch.id).single().throwOnError()).data!;
    expect(batch.planned_vessel_id).toBeNull();
    expect((await admin.from("material_movements").select("id").eq("brewery_id", f.brewery.id).throwOnError()).data).toEqual(before);
  });

  it("refuses a brewed batch and a cancelled batch", async () => {
    const f = await plannedBatch();
    await admin.from("batches").update({ brewed_on: "2026-10-20" }).eq("id", f.batch.id).throwOnError();
    await expect(save(f.brewer, f.batch.id, f.vessel.id, [f.maltLine])).rejects.toThrow(/already brewed/i);
    await admin.from("batches").update({ brewed_on: null, cancelled_at: "2026-10-20T12:00:00Z" }).eq("id", f.batch.id).throwOnError();
    await expect(save(f.brewer, f.batch.id, f.vessel.id, [f.maltLine])).rejects.toThrow(/cancelled/i);
    expect(await pullRows(f.batch.id)).toEqual([]);
  });

  it("refuses a retired vessel and another brewery's vessel", async () => {
    const f = await plannedBatch();
    await admin.from("vessels").update({ active: false }).eq("id", f.vessel.id).throwOnError();
    await expect(save(f.brewer, f.batch.id, f.vessel.id, [f.maltLine])).rejects.toThrow(/retired/i);
    const other = await plannedBatch();
    await expect(save(f.brewer, f.batch.id, other.vessel.id, [f.maltLine])).rejects.toThrow(/vessel not found/i);
  });

  it("chooses a lot exactly when the material is lot-tracked", async () => {
    const f = await plannedBatch();
    await expect(save(f.brewer, f.batch.id, null, [{ ...f.saltLine, lot_id: f.lot.id }])).rejects.toThrow(/exactly when the material is lot-tracked/i);
    await expect(save(f.brewer, f.batch.id, null, [{ ...f.maltLine, lot_id: null }])).rejects.toThrow(/exactly when the material is lot-tracked/i);
    expect(await pullRows(f.batch.id)).toEqual([]);
  });

  it("refuses foreign lines, bad quantities, and a non-array", async () => {
    const f = await plannedBatch();
    await expect(save(f.brewer, f.batch.id, null, [{ ...f.maltLine, recipe_ingredient_id: crypto.randomUUID() }])).rejects.toThrow(/pinned recipe/i);
    await expect(save(f.brewer, f.batch.id, null, [{ ...f.maltLine, bin_id: crypto.randomUUID() }])).rejects.toThrow(/bin not found/i);
    await expect(save(f.brewer, f.batch.id, null, [{ ...f.maltLine, qty: -1 }])).rejects.toThrow(/four decimals/i);
    await expect(save(f.brewer, f.batch.id, null, [{ ...f.maltLine, qty: 1.00001 }])).rejects.toThrow(/four decimals/i);
    await expect(save(f.brewer, f.batch.id, null, { lines: [] })).rejects.toThrow(/array/i);
    // Prep reads one pull per recipe line; a second would be ignored, so it is refused.
    await expect(save(f.brewer, f.batch.id, null, [f.maltLine, f.maltLine])).rejects.toThrow(/pulled once/i);
  });

  it("refuses another brewery's batch and a role outside admin and brewer", async () => {
    const f = await plannedBatch();
    const foreign = await makeStaffCtx((await makeBrewery()).id, "brewer");
    await expect(save(foreign, f.batch.id, null, [])).rejects.toThrow(/batch not found/i);
    const sales = await makeStaffCtx(f.brewery.id, "sales");
    await expect(save(sales, f.batch.id, null, [])).rejects.toThrow(/role|permission|allowed|forbidden/i);
  });
});

describe("save_batch_pulls command", () => {
  it("maps Prep's camelCase lines to the RPC and refuses sales at the command", async () => {
    const f = await plannedBatch();
    const lines = [
      { recipeIngredientId: f.ingredient.id, materialId: f.malt, locationId: f.location.id, binId: f.location.binId, lotId: f.lot.id, qty: 110 },
      { materialId: f.salt, locationId: f.location.id, binId: f.location.binId, lotId: null, qty: 0 },
    ];
    await runCommand("save_batch_pulls", { batchId: f.batch.id, vesselId: f.vessel.id, lines }, f.brewer);
    expect(await pullRows(f.batch.id)).toEqual([
      { material_id: f.salt, lot_id: null, qty: 0, recipe_ingredient_id: null },
      { material_id: f.malt, lot_id: f.lot.id, qty: 110, recipe_ingredient_id: f.ingredient.id },
    ]);
    const sales = await makeStaffCtx(f.brewery.id, "sales");
    await expect(runCommand("save_batch_pulls", { batchId: f.batch.id, vesselId: null, lines: [] }, sales)).rejects.toThrow(/permission denied/);
  });
});

describe("get_brew_day_plan", () => {
  it("returns the saved pulls and each ingredient's pack size", async () => {
    const f = await plannedBatch();
    await save(f.brewer, f.batch.id, f.vessel.id, [f.maltLine, f.saltLine]);
    const { data, error } = await f.brewer.db.rpc("get_brew_day_plan", { p_brewery: f.brewery.id, p_batch: f.batch.id });
    expect(error).toBeNull();
    const plan = data as {
      batch: { planned_vessel_id: string };
      plan: { ingredients: { material_id: string; purchaseUomFactor: number }[] };
      pulls: Record<string, unknown>[];
    };
    expect(plan.batch.planned_vessel_id).toBe(f.vessel.id);
    expect(plan.plan.ingredients).toEqual([expect.objectContaining({ material_id: f.malt, purchaseUomFactor: 55 })]);
    expect(plan.pulls).toEqual([
      { id: expect.any(String), recipe_ingredient_id: null, material_id: f.salt, material_name: "Gypsum", unit: "lb", location_id: f.location.id, location_name: "WH", bin_id: f.location.binId, bin_name: "Cold", lot_id: null, lot_code: null, qty: 0.25 },
      { id: expect.any(String), recipe_ingredient_id: f.ingredient.id, material_id: f.malt, material_name: "Pilsner malt", unit: "lb", location_id: f.location.id, location_name: "WH", bin_id: f.location.binId, bin_name: "Cold", lot_id: f.lot.id, lot_code: "PILS-1", qty: 110 },
    ]);
  });
});
