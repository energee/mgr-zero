// tests/batch-addition.test.ts — record_batch_addition (issue #278, Cellar
// addition): one batch_additions row plus its consumption movement against an
// open occupancy; the bin is the one holding the most of that material (and
// lot); lot required when the material is lot-tracked; idempotent by request;
// serialized with the other material writers so a bin never drains twice.
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { admin, DB, makeBrewery, makeStaffCtx, seedLocation, seedMaterial, seedMovement } from "./helpers";
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
  const day = (await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: vessel.id, initialBbl: 20, brewedOn: "2026-09-01" }, ctx)) as { occupancy: { id: string } };
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
    expect(lots).toEqual([{ material_id: citra, lot_id: lotId, lot_code: "L-0790", qty: 22, received_on: null }]);
    const all = (await runCommand("list_material_lots", {}, ctx)) as { lot_id: string }[];
    expect(all.map((l) => l.lot_id)).toEqual([lotId]);
  });

  it("refuses a closed occupancy", async () => {
    await admin.from("vessel_occupancies").update({ ended_at: new Date().toISOString() }).eq("id", occupancyId);
    await expect(runCommand("record_batch_addition", { occupancyId, materialId: salt, stage: "other", qty: 1 }, ctx)).rejects.toThrow();
  });
});

// Other material writers (bin moves, transfer receives, counts) check stock
// under the material_movements table lock; the addition must wait on that same
// lock, or both pass their checks against the same bin and drive it negative.
describe("record_batch_addition under a concurrent material writer", () => {
  it("waits for the writer's lock and then refuses what the writer already drained", async () => {
    const vessel = (await runCommand("upsert_vessel", { name: "FV-race", kind: "fermenter", capacityBbl: 30 }, ctx)) as { id: string };
    const batch = (await runCommand("schedule_batch", { plannedOn: "2026-09-01", plannedBbl: 20 }, ctx)) as { id: string };
    const day = (await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: vessel.id, initialBbl: 20, brewedOn: "2026-09-01" }, ctx)) as { occupancy: { id: string } };
    const mosaic = await seedMaterial(breweryId, { name: "Mosaic", category: "other" });
    await seedMovement(breweryId, { materialId: mosaic, locationId: loc.id, binId: loc.binId, qty: 5, createdBy: ctx.userId });

    const writer = new Client({ connectionString: DB });
    const adder = new Client({ connectionString: DB });
    await writer.connect();
    await adder.connect();
    try {
      await writer.query("set lock_timeout='7s'");
      await adder.query("set statement_timeout='8s'; set lock_timeout='7s'");
      // The writer drains the whole bin under the same lock the other material writers take.
      await writer.query("begin");
      await writer.query("lock table public.material_movements in share row exclusive mode");
      await writer.query(
        "insert into public.material_movements (brewery_id, material_id, location_id, bin_id, qty, type, created_by) values ($1,$2,$3,$4,-5,'adjustment',$5)",
        [breweryId, mosaic, loc.id, loc.binId, ctx.userId],
      );

      await adder.query("select set_config('request.jwt.claim.sub',$1,false)", [ctx.userId]);
      await adder.query("set role authenticated");
      const pid = (await adder.query("select pg_backend_pid() pid")).rows[0].pid;
      const adding = adder.query(
        "select public.record_batch_addition($1,$2,$3,'other',null,5,null,$4)",
        [breweryId, day.occupancy.id, mosaic, crypto.randomUUID()],
      );
      adding.catch(() => {});
      await expect.poll(async () => (await writer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type, { timeout: 3000 }).toBe("Lock");
      await writer.query("commit");

      await expect(adding).rejects.toThrow(/on hand/);
      const { data } = await admin.from("material_movements").select("qty").eq("material_id", mosaic);
      expect(data!.reduce((sum, m) => sum + Number(m.qty), 0)).toBe(0);
    } finally {
      await writer.query("rollback").catch(() => {});
      await Promise.all([writer.end(), adder.end()]);
    }
  });
});
