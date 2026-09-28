import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedLocation, seedMaterial, seedMovement, sql } from "./helpers";
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
  return { brewery, brewer, materialId, location, lot, recipe, version, batch, vessel, input };
}

describe("actual brew-day record (#622)", () => {
  it("replays a completed legacy request with the originally accepted quantity precision", async () => {
    const f = await plannedBrew();
    const requestId = crypto.randomUUID();
    sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
      values('${f.brewer.userId}','${f.brewery.id}','${requestId}','record_brew_day',
      digest(jsonb_build_object('brewery','${f.brewery.id}'::uuid,'batch','${f.batch.id}'::uuid,'vessel','${f.vessel.id}'::uuid,'initial_bbl',1.2345,'brewed_on','2026-10-01'::date)::text,'sha256'),'{"legacy":true}')`);
    const input = { batchId: f.batch.id, vesselId: f.vessel.id, initialBbl: 1.2345, brewedOn: "2026-10-01" };
    expect(await runCommand("record_brew_day", input, f.brewer, { requestId, correlationId: requestId })).toEqual({ legacy: true });
    await expect(runCommand("record_brew_day", { ...input, actuals: [], confirmEmpty: true }, f.brewer)).rejects.toThrow(/three decimals/i);
  });

  it("requires deliberate empty use and leaves omitted usage unrecorded", async () => {
    const f = await plannedBrew();
    await expect(runCommand("record_brew_day", { ...f.input, actuals: [] }, f.brewer)).rejects.toThrow(/confirm.*no ingredients/i);
    await runCommand("record_brew_day", { ...f.input, actuals: [], confirmEmpty: true }, f.brewer);
    expect((await runCommand("get_brew_record", { batchId: f.batch.id }, f.brewer) as { records: { additions: unknown[] }[] }).records[0].additions).toEqual([]);
  });

  it("aggregates duplicate buckets and rejects foreign recipe and lot identities atomically", async () => {
    const f = await plannedBrew();
    const actual = f.input.actuals[0];
    await expect(runCommand("record_brew_day", { ...f.input, actuals: [actual, { ...actual, materialId: actual.materialId.toUpperCase(), binId: actual.binId.toUpperCase(), lotId: actual.lotId.toUpperCase() }] }, f.brewer)).rejects.toThrow(/stock/i);
    await expect(runCommand("record_brew_day", { ...f.input, actuals: [{ ...actual, recipeIngredientId: crypto.randomUUID() }] }, f.brewer)).rejects.toThrow(/pinned recipe/i);
    await expect(runCommand("record_brew_day", { ...f.input, actuals: [{ ...actual, lotId: null }] }, f.brewer)).rejects.toThrow(/lot/i);
    expect((await admin.from("vessel_occupancies").select("id").eq("batch_id", f.batch.id).throwOnError()).data).toEqual([]);
  });

  it("requires an exact source-bound material compensation and permits only one", async () => {
    const f = await plannedBrew();
    await runCommand("record_brew_day", f.input, f.brewer);
    const original = (await admin.from("material_movements").select("id").eq("brewery_id", f.brewery.id).eq("type", "consumption").single().throwOnError()).data!;
    const row = { brewery_id: f.brewery.id, material_id: f.materialId, location_id: f.location.id, bin_id: f.location.binId, lot_id: f.lot.id, qty: 115, type: "adjustment", compensates_id: original.id, created_by: f.brewer.userId };
    await expect(ins("material_movements", { ...row, qty: 114 })).rejects.toThrow(/exact opposite|compensation/i);
    const reversal = await ins("material_movements", row);
    await expect(ins("material_movements", row)).rejects.toThrow(/duplicate|unique/i);
    await expect(ins("material_movements", { ...row, qty: -115, compensates_id: reversal.id })).rejects.toThrow(/compensation/i);
  });

  it("appends an unused-record correction and exact material compensation once", async () => {
    const f = await plannedBrew();
    const original = await runCommand("record_brew_day", f.input, f.brewer) as { record: { id: string }; occupancy: { id: string } };
    const requestId = crypto.randomUUID();
    const input = { recordId: original.record.id, reason: "Weighed malt again", initialBbl: 1.8, actuals: [{ ...f.input.actuals[0], qty: 100 }], process: { knockoutTempF: 67 } };
    const corrected = await runCommand("correct_brew_record", input, f.brewer, { requestId, correlationId: requestId });
    expect(await runCommand("correct_brew_record", input, f.brewer, { requestId, correlationId: requestId })).toEqual(corrected);
    await expect(runCommand("correct_brew_record", input, f.brewer)).rejects.toThrow(/corrected|reload/i);
    const movements = (await admin.from("material_movements").select("qty,type,compensates_id").eq("brewery_id", f.brewery.id).throwOnError()).data!;
    expect(movements.filter(m => m.compensates_id)).toEqual([expect.objectContaining({ qty: 115, type: "adjustment" })]);
    expect(movements.reduce((n,m) => n+Number(m.qty),0)).toBe(100);
    const records = await runCommand("get_brew_record", { batchId: f.batch.id }, f.brewer) as { records: { initial_bbl: number; corrects_id: string | null }[] };
    expect(records.records).toHaveLength(2);
    expect(records.records).toContainEqual(expect.objectContaining({ initial_bbl: 2, corrects_id: null }));
    expect(records.records).toContainEqual(expect.objectContaining({ initial_bbl: 1.8, corrects_id: original.record.id }));
    expect((await admin.from("vessel_occupancies").select("initial_bbl").eq("id", original.occupancy.id).single().throwOnError()).data?.initial_bbl).toBe(2);
    expect((await admin.from("volume_adjustments").select("bbl,reason").eq("occupancy_id", original.occupancy.id).throwOnError()).data).toEqual([{ bbl: -0.2, reason: "measurement" }]);
  });

  it("refuses correction after a later addition and never posts a partial reversal", async () => {
    const f = await plannedBrew();
    const original = await runCommand("record_brew_day", f.input, f.brewer) as { record: { id: string }; occupancy: { id: string } };
    await runCommand("record_batch_addition", { occupancyId: original.occupancy.id, materialId: f.materialId, stage: "dry_hop", lotId: f.lot.id, qty: 1 }, f.brewer);
    await expect(runCommand("correct_brew_record", { recordId: original.record.id, reason: "Wrong amount", initialBbl: 2, actuals: f.input.actuals }, f.brewer)).rejects.toThrow(/later addition/i);
    expect((await admin.from("material_movements").select("id").eq("brewery_id", f.brewery.id).not("compensates_id", "is", null).throwOnError()).data).toEqual([]);
  });

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
