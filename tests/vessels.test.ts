// tests/vessels.test.ts — vessels are admin-managed. delete_vessel deletes a
// vessel that never held beer, retires (active = false) one with occupancy
// history, and refuses one holding beer now. list_vessels hides retired
// vessels unless asked, so cellar, transfer and brew day never offer them, and
// the database refuses beer into a retired vessel. A retired name is free again.
import { beforeAll, describe, expect, it } from "vitest";
import { ins, makeBrewery, makeStaffCtx, sql } from "./helpers";
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

describe("vessel capacity uses exact numeric(10,3) precision", () => {
  it.each([0.0001, 0.0009, 0.0011, 1.2345, 10_000_000])("refuses direct RPC capacity %s before storage can round it", async capacity => {
    const requestId = crypto.randomUUID();
    const args = { p_brewery: owner.breweryId, p_vessel: null, p_name: `FV precision ${requestId}`, p_kind: "fermenter" as const, p_capacity_bbl: capacity, p_request_id: requestId };
    const refused = await owner.db.rpc("upsert_vessel", args);
    expect(refused.error?.code).toBe("P0001");
    expect(refused.error?.message).toMatch(/Capacity must|decimal places/);
    expect((await owner.db.from("vessels").select("id").eq("name", args.p_name)).data).toEqual([]);
    // A refused transaction leaves no claim behind: corrected input can reuse
    // this key without conflict, not just succeed under a fresh key.
    const corrected = await owner.db.rpc("upsert_vessel", { ...args, p_capacity_bbl: 0.001 });
    expect(corrected.error).toBeNull();
    expect(corrected.data).toMatchObject({ capacity_bbl: 0.001 });
    await expect(runCommand("upsert_vessel", { name: `FV command ${requestId}`, kind: "fermenter", capacityBbl: capacity }, owner)).rejects.toMatchObject({ status: 400 });
  });

  it.each([0.001, 0.01, 25.555, 9_999_999.999])("stores and replays the exact boundary %s without changing a later edit", async capacity => {
    const args = { p_brewery: owner.breweryId, p_vessel: null, p_name: `FV boundary ${crypto.randomUUID()}`, p_kind: "fermenter" as const, p_capacity_bbl: capacity, p_request_id: crypto.randomUUID() };
    const first = await owner.db.rpc("upsert_vessel", args);
    expect(first.error).toBeNull();
    const row = first.data as { id: string; capacity_bbl: number };
    expect(row.capacity_bbl).toBe(capacity);
    const edited = await owner.db.rpc("upsert_vessel", { ...args, p_vessel: row.id, p_capacity_bbl: 2, p_request_id: crypto.randomUUID() });
    expect(edited.error).toBeNull();
    const replayed = await owner.db.rpc("upsert_vessel", args);
    expect(replayed.error).toBeNull();
    expect(replayed.data).toEqual(first.data);
    expect((await owner.db.from("vessels").select("capacity_bbl").eq("id", row.id).single()).data?.capacity_bbl).toBe(2);
  });

  it("replays a pre-validation committed capacity through the actual command boundary", async () => {
    const requestId = crypto.randomUUID();
    const vesselId = crypto.randomUUID();
    // Recreate the old RPC transaction: the ledger hashed 1.2345, while the
    // numeric(10,3) column stored 1.235. No production function is replaced.
    sql(`select set_config('request.jwt.claim.sub', '${owner.userId}', true);
      select private.claim_command_request('${owner.breweryId}', 'upsert_vessel', '${requestId}',
        jsonb_build_object('brewery', '${owner.breweryId}'::uuid, 'vessel', null, 'name', 'FV legacy precision', 'kind', 'fermenter', 'capacity_bbl', 1.2345));
      insert into public.vessels(id, brewery_id, name, kind, capacity_bbl)
        values ('${vesselId}', '${owner.breweryId}', 'FV legacy precision', 'fermenter', 1.2345);
      select private.complete_command_request('${requestId}', (select to_jsonb(v) from public.vessels v where id='${vesselId}'));`);
    const execution = { requestId, correlationId: crypto.randomUUID(), origin: "ui" as const };
    expect(await runCommand("upsert_vessel", { name: "FV legacy precision", kind: "fermenter", capacityBbl: 1.2345 }, owner, execution)).toMatchObject({ id: vesselId, capacity_bbl: 1.235 });
    await expect(runCommand("upsert_vessel", { name: "FV new precision", kind: "fermenter", capacityBbl: 1.2345 }, owner)).rejects.toMatchObject({ status: 400, message: "Use no more than 3 decimal places for capacity." });
  });
});
