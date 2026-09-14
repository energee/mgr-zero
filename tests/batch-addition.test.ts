// tests/batch-addition.test.ts — record_batch_addition (issue #278, Cellar
// addition): one batch_additions row plus its consumption movement against an
// open occupancy; the bin is the one holding the most of that material (and
// lot); lot required when the material is lot-tracked; idempotent by request.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, seedMaterial, seedMovement } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let breweryId: string;
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let loc: Awaited<ReturnType<typeof seedLocation>>;
let occupancyId: string;
let citra: string;
let lotId: string;
let salt: string;

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  ctx = await makeStaffCtx(breweryId, "brewer");
  loc = await seedLocation(breweryId);
  const vessel = (await runCommand("upsert_vessel", { name: "FV1", kind: "fermenter", capacityBbl: 30 }, ctx)) as { id: string };
  const batch = (await runCommand("schedule_batch", { plannedOn: "2026-09-01", plannedBbl: 20 }, ctx)) as { id: string };
  const day = (await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, initialBbl: 20, brewedOn: "2026-09-01" }, ctx)) as { occupancy: { id: string } };
  occupancyId = day.occupancy.id;
  citra = await seedMaterial(breweryId, { name: "Citra", category: "hop", lotTracked: true });
  const { data: lot, error } = await admin.from("material_lots").insert({ brewery_id: breweryId, material_id: citra, lot_code: "L-0790" }).select("id").single();
  if (error) throw error;
  lotId = lot.id;
  await seedMovement(breweryId, { materialId: citra, locationId: loc.id, binId: loc.binId, qty: 40, createdBy: ctx.userId, type: "receipt", lotId });
  salt = await seedMaterial(breweryId, { name: "Gypsum", category: "other" });
  await seedMovement(breweryId, { materialId: salt, locationId: loc.id, binId: loc.binId, qty: 5, createdBy: ctx.userId });
});

describe("record_batch_addition", () => {
  it("writes the addition row and a negative consumption movement carrying the lot", async () => {
    const row = (await runCommand("record_batch_addition", { occupancyId, materialId: citra, lotId, stage: "dry_hop", qty: 18 }, ctx)) as { id: string; occupancy_id: string; stage: string; movement_id: string };
    expect(row).toMatchObject({ occupancy_id: occupancyId, stage: "dry_hop" });
    const { data: mv } = await admin.from("material_movements").select("material_id, lot_id, qty, type, bin_id").eq("id", row.movement_id).single();
    expect(mv).toMatchObject({ material_id: citra, lot_id: lotId, qty: -18, type: "consumption", bin_id: loc.binId });
  });

  it("requires a lot for a lot-tracked material and refuses more than the bin holds", async () => {
    await expect(runCommand("record_batch_addition", { occupancyId, materialId: citra, stage: "dry_hop", qty: 1 }, ctx)).rejects.toThrow(/lot/i);
    await expect(runCommand("record_batch_addition", { occupancyId, materialId: salt, stage: "other", qty: 50 }, ctx)).rejects.toThrow(/on hand/i);
  });

  it("replays the same request instead of consuming twice", async () => {
    const requestId = crypto.randomUUID();
    const a = await runCommand("record_batch_addition", { occupancyId, materialId: salt, stage: "other", qty: 1 }, ctx, { requestId, correlationId: requestId });
    const b = await runCommand("record_batch_addition", { occupancyId, materialId: salt, stage: "other", qty: 1 }, ctx, { requestId, correlationId: requestId });
    expect(b).toEqual(a);
  });

  it("lists lots with on hand for the sheet's lot picker", async () => {
    const lots = (await runCommand("list_material_lots", { materialId: citra }, ctx)) as { lot_id: string; lot_code: string; qty: number }[];
    expect(lots).toEqual([{ lot_id: lotId, lot_code: "L-0790", qty: 22, received_on: null }]);
  });

  it("refuses a closed occupancy", async () => {
    await admin.from("vessel_occupancies").update({ ended_at: new Date().toISOString() }).eq("id", occupancyId);
    await expect(runCommand("record_batch_addition", { occupancyId, materialId: salt, stage: "other", qty: 1 }, ctx)).rejects.toThrow();
  });
});
