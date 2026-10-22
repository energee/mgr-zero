// tests/vessels.test.ts — vessels are admin-managed. delete_vessel deletes a
// vessel that never held beer, retires (active = false) one with occupancy
// history, and refuses one holding beer now. list_vessels hides retired
// vessels unless asked, so cellar, transfer and brew day never offer them, and
// the database refuses beer into a retired vessel. A retired name is free again.
import { beforeAll, describe, expect, it } from "vitest";
import { ins, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let owner: Awaited<ReturnType<typeof makeStaffCtx>>;
let brewer: Awaited<ReturnType<typeof makeStaffCtx>>;

beforeAll(async () => {
  const b = await makeBrewery();
  owner = await makeStaffCtx(b.id, "admin");
  brewer = await makeStaffCtx(b.id, "brewer");
});

const vessel = async (name: string) =>
  (await runCommand("upsert_vessel", { name, kind: "fermenter", capacityBbl: 20 }, owner)) as { id: string };
const listed = async (input: { retired?: boolean } = {}) =>
  ((await runCommand("list_vessels", input, owner)) as { id: string; active: boolean }[]).map((v) => v.id);

describe("vessels are admin-managed", () => {
  it("refuses a brewer adding, editing or deleting a vessel", async () => {
    const v = await vessel("FV brewer");
    await expect(runCommand("upsert_vessel", { name: "FV no", kind: "fermenter", capacityBbl: 20 }, brewer)).rejects.toThrow(/permission denied/);
    await expect(runCommand("upsert_vessel", { id: v.id, name: "FV renamed", kind: "fermenter", capacityBbl: 20 }, brewer)).rejects.toThrow(/permission denied/);
    await expect(runCommand("delete_vessel", { vesselId: v.id }, brewer)).rejects.toThrow(/permission denied/);
    // A brewer still reads vessels.
    expect(((await runCommand("list_vessels", {}, brewer)) as { id: string }[]).map((r) => r.id)).toContain(v.id);
  });

  it("deletes a vessel that never held beer", async () => {
    const v = await vessel("FV unused");
    const out = (await runCommand("delete_vessel", { vesselId: v.id }, owner)) as { id: string; retired: boolean };
    expect(out).toMatchObject({ id: v.id, retired: false });
    expect(await listed({ retired: true })).not.toContain(v.id);
  });

  it("refuses a vessel holding beer, then retires it once emptied", async () => {
    const v = await vessel("FV history");
    const batch = (await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 10 }, owner)) as { id: string };
    await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: v.id, initialBbl: 10, brewedOn: "2026-10-01" }, owner);
    await expect(runCommand("delete_vessel", { vesselId: v.id }, owner)).rejects.toThrow(/holds beer/);

    await runCommand("complete_batch", { batchId: batch.id, confirmInTankBbl: 10 }, owner);
    const out = (await runCommand("delete_vessel", { vesselId: v.id }, owner)) as { id: string; retired: boolean; active: boolean };
    expect(out).toMatchObject({ id: v.id, retired: true, active: false });
    expect(await listed()).not.toContain(v.id);
    expect(await listed({ retired: true })).toContain(v.id);
  });

  it("refuses deleting another brewery's vessel", async () => {
    const v = await vessel("FV other brewery");
    const other = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(runCommand("delete_vessel", { vesselId: v.id }, other)).rejects.toThrow(/vessel not found/);
  });

  it("keeps a retired vessel retired, frees its name, and refuses beer into it", async () => {
    const v = await vessel("FV retire");
    const first = (await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 10 }, owner)) as { id: string };
    await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: first.id, vesselId: v.id, initialBbl: 10, brewedOn: "2026-10-01" }, owner);
    await runCommand("complete_batch", { batchId: first.id, confirmInTankBbl: 10 }, owner);
    await runCommand("delete_vessel", { vesselId: v.id }, owner);
    expect(await runCommand("delete_vessel", { vesselId: v.id }, owner)).toMatchObject({ id: v.id, retired: true, active: false });

    const replacement = await vessel("FV retire");
    expect(await listed()).toContain(replacement.id);

    const next = (await runCommand("schedule_batch", { plannedOn: "2026-10-02", plannedBbl: 10 }, owner)) as { id: string };
    const brewed = (await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: next.id, vesselId: replacement.id, initialBbl: 10, brewedOn: "2026-10-02" }, owner)) as { occupancy: { id: string } };
    await expect(runCommand("record_cellar_transfer", { fromOccupancyId: brewed.occupancy.id, toVesselId: v.id, volumeBbl: 5 }, owner)).rejects.toThrow(/vessel is retired/);
    // Every writer that opens an occupancy goes through the same table trigger.
    await expect(ins("vessel_occupancies", { brewery_id: owner.breweryId, vessel_id: v.id, batch_id: next.id })).rejects.toThrow(/vessel is retired/);
  });
});
