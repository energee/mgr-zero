import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedLocation, seedMaterial, seedMovement } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

async function plannedBrew(stock = 200) {
  const brewery = await makeBrewery();
  const brewer = await makeStaffCtx(brewery.id, "brewer");
  const location = await seedLocation(brewery.id);
  const materialId = await seedMaterial(brewery.id, { name: "Pale malt", category: "malt", lotTracked: true });
  const lot = await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "MALT-ORIGINAL", received_on: "2026-09-01" });
  await seedMovement(brewery.id, { materialId, locationId: location.id, binId: location.binId, lotId: lot.id, qty: stock, createdBy: brewer.userId });
  const recipe = await runCommand("create_recipe", { name: "Brew record pale" }, brewer) as { id: string };
  const version = await runCommand("create_recipe_version", { recipeId: recipe.id, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, mashSchedule: [{ name: "Rest", kind: "infusion", tempF: 152, minutes: 60 }], ingredients: [{ materialId, perBblQty: 60, stage: "mash" }] }, brewer) as { id: string };
  const batch = await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 2, recipeVersionId: version.id }, brewer) as { id: string };
  const vessel = await runCommand("upsert_vessel", { name: "FV actuals", kind: "fermenter", capacityBbl: 10 }, brewer) as { id: string };
  const ingredient = await admin.from("recipe_ingredients").select("id").eq("recipe_version_id", version.id).single().throwOnError();
  const actual = { materialId, recipeIngredientId: ingredient.data!.id, stage: "mash", locationId: location.id, binId: location.binId, lotId: lot.id, qty: 115 };
  const input = { batchId: batch.id, vesselId: vessel.id, initialBbl: 2, brewedOn: "2026-10-01", actuals: [actual], process: { knockoutTempF: 68, preBoilBbl: 2.4 } };
  return { brewery, brewer, materialId, location, lot, recipe, version, batch, input };
}

describe("actual brew-day record (#622)", () => {
  it("consumes confirmed quantities from the exact lot once, independent of recipe theory", async () => {
    const f = await plannedBrew();
    const requestId = crypto.randomUUID();
    const first = await runCommand("record_brew_day", f.input, f.brewer, { requestId, correlationId: requestId });
    expect(await runCommand("record_brew_day", f.input, f.brewer, { requestId, correlationId: requestId })).toEqual(first);
    const movements = await admin.from("material_movements").select("id,qty,lot_id,bin_id").eq("brewery_id", f.brewery.id).eq("type", "consumption").throwOnError();
    expect(movements.data).toEqual([expect.objectContaining({ qty: -115, lot_id: f.lot.id, bin_id: f.location.binId })]);
    const additions = await admin.from("batch_additions").select("movement_id").eq("batch_id", f.batch.id).throwOnError();
    expect(additions.data).toEqual([{ movement_id: movements.data![0].id }]);
  });

  it("refuses insufficient actual stock without stamping a batch or opening an occupancy", async () => {
    const f = await plannedBrew(100);
    await expect(runCommand("record_brew_day", f.input, f.brewer)).rejects.toThrow(/stock|on hand|available/i);
    expect((await admin.from("batches").select("brewed_on").eq("id", f.batch.id).single().throwOnError()).data?.brewed_on).toBeNull();
    expect((await admin.from("vessel_occupancies").select("id").eq("batch_id", f.batch.id).throwOnError()).data).toEqual([]);
    expect((await admin.from("material_movements").select("id").eq("brewery_id", f.brewery.id).eq("type", "consumption").throwOnError()).data).toEqual([]);
  });

  it("retains the confirmed process and material identity after master-data edits", async () => {
    const f = await plannedBrew();
    await runCommand("record_brew_day", f.input, f.brewer);
    await admin.from("materials").update({ name: "Renamed malt" }).eq("id", f.materialId).throwOnError();
    await admin.from("material_lots").update({ lot_code: "RENAMED-LOT" }).eq("id", f.lot.id).throwOnError();
    await admin.from("recipes").update({ name: "Renamed recipe" }).eq("id", f.recipe.id).throwOnError();
    const record = await runCommand("get_brew_record", { batchId: f.batch.id }, f.brewer);
    expect(JSON.stringify(record)).toContain("Pale malt");
    expect(JSON.stringify(record)).toContain("MALT-ORIGINAL");
    expect(JSON.stringify(record)).toContain("Brew record pale");
    expect(JSON.stringify(record)).toContain('"knockoutTempF":68');
    expect(JSON.stringify(record)).toContain('"preBoilBbl":2.4');
  });
});
