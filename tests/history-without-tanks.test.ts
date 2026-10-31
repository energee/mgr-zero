// tests/history-without-tanks.test.ts — readings and brew records belong to
// the batch; the tank stay is optional and, when given, must hold that batch
// (docs/plans/readings-on-batch.md). record_historical_batch writes a past
// batch with no tank and no loss, only before books_opened_on, so imported
// history never touches the cellar or a report period.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let breweryId: string;
let owner: Ctx;
let brewer: Ctx;

const vessel = async (name: string) =>
  (await runCommand("upsert_vessel", { name, kind: "fermenter", capacityBbl: 20 }, owner) as { id: string }).id;
const schedule = async (plannedOn = "2025-06-01") =>
  (await runCommand("schedule_batch", { plannedOn, plannedBbl: 10 }, owner) as { id: string }).id;
const brew = async (batchId: string, vesselId: string, brewedOn: string) =>
  (await runCommand("record_brew_day", { batchId, vesselId, initialBbl: 5, brewedOn, actuals: [], confirmEmpty: true }, brewer) as
    { occupancy: { id: string }; record: { id: string } });
const once = (requestId?: string) => (requestId ? { requestId, correlationId: requestId } : undefined);
const reading = (input: Record<string, unknown>, ctx = brewer, requestId?: string) =>
  runCommand("record_fermentation_reading", { at: "2025-06-03T12:00:00Z", tempF: 66, ...input }, ctx, once(requestId));
const historical = (input: Record<string, unknown>, ctx = owner, requestId?: string) =>
  runCommand("record_historical_batch", { brewedOn: "2025-06-01", closedOn: "2025-06-20", knockoutBbl: 9.5, process: { boilMinutes: 60, knockoutTempF: 68 }, ...input }, ctx, once(requestId));

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId, "admin");
  brewer = await makeStaffCtx(breweryId, "brewer");
  await runCommand("set_books_opened_on", { booksOpenedOn: "2026-10-01" }, owner);
});

describe("schema: the tank, when given, must hold the reading's or record's batch", () => {
  it("a reading carries its tank's batch and refuses a tank holding another batch", async () => {
    const a = await schedule("2026-10-02");
    const occ = (await brew(a, await vessel("FV reading fk"), "2026-10-02")).occupancy.id;
    const row = await reading({ occupancyId: occ, at: "2026-10-03T12:00:00Z" }) as { batch_id: string };
    expect(row.batch_id).toBe(a);
    const b = await schedule("2026-10-02");
    await expect(ins("fermentation_readings", { brewery_id: breweryId, batch_id: b, occupancy_id: occ, temp_f: 60, created_by: owner.userId }))
      .rejects.toThrow(/foreign key/);
    await expect(ins("fermentation_readings", { brewery_id: breweryId, batch_id: b, temp_f: 60, created_by: owner.userId })).resolves.toBeTruthy();
  });

  it("a brew record refuses a tank holding another batch", async () => {
    const a = await schedule("2026-10-02");
    const occ = (await brew(a, await vessel("FV record fk"), "2026-10-02")).occupancy.id;
    const b = await schedule("2026-10-02");
    const { error } = await admin.from("brew_records").update({ batch_id: b }).eq("occupancy_id", occ);
    expect(error?.code).toBe("23503");
  });

  it("list_batches still embeds each open tank's latest reading", async () => {
    const a = await schedule("2026-10-04");
    const occ = (await brew(a, await vessel("FV embed"), "2026-10-04")).occupancy.id;
    await reading({ occupancyId: occ, at: "2026-10-05T12:00:00Z", tempF: 64 });
    const batches = await runCommand("list_batches", { readings: true, open: true }, brewer) as
      { id: string; active_occupancies: { latest_reading: { temp_f: number } | null }[] }[];
    expect(Number(batches.find((x) => x.id === a)!.active_occupancies[0].latest_reading!.temp_f)).toBe(64);
  });
});

describe("record_fermentation_reading: batch, tank, or both", () => {
  it("batch-only works on a brewed open batch; a mismatched pair is refused", async () => {
    const a = await schedule("2026-10-06");
    const occ = (await brew(a, await vessel("FV pair"), "2026-10-06")).occupancy.id;
    const row = await reading({ batchId: a, at: "2026-10-07T12:00:00Z" }) as { batch_id: string; occupancy_id: string | null };
    expect(row).toMatchObject({ batch_id: a, occupancy_id: null });
    const b = await schedule("2026-10-06");
    await expect(reading({ batchId: b, occupancyId: occ })).rejects.toThrow(/occupancy does not hold this batch/);
  });

  it("batch-only is refused on an unbrewed, cancelled, or live-closed batch", async () => {
    await expect(reading({ batchId: await schedule() })).rejects.toThrow(/has not been brewed/);
    const cancelled = await schedule();
    await runCommand("cancel_batch", { batchId: cancelled }, owner);
    await expect(reading({ batchId: cancelled })).rejects.toThrow(/cancelled/);
    const live = await schedule("2026-10-08");
    await brew(live, await vessel("FV closed"), "2026-10-08");
    await runCommand("complete_batch", { batchId: live, confirmInTankBbl: 5 }, owner);
    await expect(reading({ batchId: live })).rejects.toThrow(/batch is closed/);
  });

  it("takes a reading with no temperature (gravity or pH only)", async () => {
    const a = await schedule();
    await historical({ batchId: a });
    const row = await runCommand("record_fermentation_reading", { batchId: a, at: "2025-06-02T12:00:00Z", ph: 5.3 }, brewer) as { temp_f: number | null; ph: number };
    expect(row.temp_f).toBeNull();
    expect(Number(row.ph)).toBe(5.3);
  });

  it("refuses neither batch nor tank", async () => {
    await expect(reading({})).rejects.toThrow();
  });

  it("replays a request with the first row", async () => {
    const a = await schedule();
    await historical({ batchId: a });
    const requestId = crypto.randomUUID();
    const first = await reading({ batchId: a }, brewer, requestId) as { id: string };
    expect((await reading({ batchId: a }, brewer, requestId) as { id: string }).id).toBe(first.id);
  });
});

describe("record_historical_batch", () => {
  it("writes a tankless brew record and closes on the past date with no loss", async () => {
    const a = await schedule();
    const result = await historical({ batchId: a }) as { batch: { completion_adjustment_id: string | null } };
    expect(result.batch.completion_adjustment_id).toBeNull();
    const batch = (await admin.from("batches").select("brewed_on, closed_at").eq("id", a).single().throwOnError()).data!;
    expect(batch.brewed_on).toBe("2025-06-01");
    expect(batch.closed_at!.slice(0, 10)).toBe("2025-06-20");
    const records = await runCommand("get_brew_record", { batchId: a }, brewer) as
      { records: { occupancy_id: string | null; initial_bbl: number; process: { boilMinutes: number } }[] };
    expect(records.records).toHaveLength(1);
    expect(records.records[0]).toMatchObject({ occupancy_id: null, process: { boilMinutes: 60 } });
    expect(Number(records.records[0].initial_bbl)).toBe(9.5);
    expect((await admin.from("vessel_occupancies").select("id").eq("batch_id", a).throwOnError()).data).toEqual([]);
  });

  it("lands in Completed with no tank, takes later batch-only readings, and stays out of reports", async () => {
    const a = await schedule();
    await historical({ batchId: a });
    await reading({ batchId: a, at: "2025-06-10T12:00:00Z" });
    const batches = await runCommand("list_batches", {}, brewer) as { id: string; closed_at: string | null }[];
    expect(batches.find((x) => x.id === a)!.closed_at).not.toBeNull();
    expect((await runCommand("get_brew_day", { batchId: a }, brewer) as { occupancy: unknown }).occupancy).toBeNull();
    const report = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: "2026-10-01", periodEnd: "2026-10-31" }, owner) as
      { figures: { inProcess: number } };
    // Only the live 2026-10 tanks above are in process; a historical batch adds nothing.
    const open = (await admin.from("occupancy_volumes").select("bbl").eq("brewery_id", breweryId).is("ended_at", null).throwOnError()).data!;
    expect(report.figures.inProcess).toBeCloseTo(open.reduce((s, r) => s + Number(r.bbl), 0), 2);
  });

  it("refuses dates on or after books opened, an inverted range, a brewed batch, and an unset books date", async () => {
    const a = await schedule();
    await expect(historical({ batchId: a, closedOn: "2026-10-01" })).rejects.toThrow(/before the books opened/);
    await expect(historical({ batchId: a, brewedOn: "2025-06-21" })).rejects.toThrow(/brewed after it closed/);
    const live = await schedule("2026-10-09");
    await brew(live, await vessel("FV brewed"), "2026-10-09");
    await expect(historical({ batchId: live })).rejects.toThrow(/already brewed/);
    const other = await makeBrewery();
    const otherOwner = await makeStaffCtx(other.id, "admin");
    const otherBatch = (await runCommand("schedule_batch", { plannedOn: "2025-06-01", plannedBbl: 10 }, otherOwner) as { id: string }).id;
    await expect(historical({ batchId: otherBatch }, otherOwner)).rejects.toThrow(/books opened/);
  });

  it("is admin-only and replays", async () => {
    const a = await schedule();
    await expect(historical({ batchId: a }, brewer)).rejects.toThrow(/permission denied/);
    const requestId = crypto.randomUUID();
    const first = await historical({ batchId: a }, owner, requestId);
    expect(await historical({ batchId: a }, owner, requestId)).toEqual(first);
  });

  it("corrects a historical process without reopening beer or changing its volume", async () => {
    const a = await schedule();
    await historical({ batchId: a });
    const record = (await runCommand("get_brew_record", { batchId: a }, brewer) as { records: { id: string }[] }).records[0];
    const batchBefore = await admin.from("batches").select("brewed_on,closed_at").eq("id", a).single().throwOnError();
    const materialBefore = await admin.from("material_movements").select("id,qty").eq("brewery_id", breweryId).order("id").throwOnError();
    const volumeBefore = await admin.from("volume_adjustments").select("id,bbl").eq("brewery_id", breweryId).order("id").throwOnError();
    await expect(runCommand("correct_brew_record", { recordId: record.id, reason: "typo", initialBbl: 9, actuals: [], confirmEmpty: true }, owner))
      .rejects.toMatchObject({ status: 400, code: "bad_request" });
    const process = { boilMinutes: 60, knockoutTempF: 67 };
    const corrected = await runCommand("correct_brew_record", {
      recordId: record.id, reason: "Correct historical temperature", initialBbl: 9.5, actuals: [], confirmEmpty: true, process,
    }, owner) as { record: { corrects_id: string; occupancy_id: string | null; initial_bbl: number; volume_adjustment_id: string | null; process: typeof process } };
    expect(corrected.record).toMatchObject({ corrects_id: record.id, occupancy_id: null, initial_bbl: 9.5, volume_adjustment_id: null, process });
    const original = await admin.from("brew_records").select("initial_bbl,process").eq("id", record.id).single().throwOnError();
    expect(original.data).toEqual({ initial_bbl: 9.5, process: { boilMinutes: 60, knockoutTempF: 68 } });
    const batchAfter = await admin.from("batches").select("brewed_on,closed_at").eq("id", a).single().throwOnError();
    expect(batchAfter.data).toEqual(batchBefore.data);
    const materialAfter = await admin.from("material_movements").select("id,qty").eq("brewery_id", breweryId).order("id").throwOnError();
    const volumeAfter = await admin.from("volume_adjustments").select("id,bbl").eq("brewery_id", breweryId).order("id").throwOnError();
    expect(materialAfter.data).toEqual(materialBefore.data);
    expect(volumeAfter.data).toEqual(volumeBefore.data);
  });
});
