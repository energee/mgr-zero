import { describe, expect, it } from "vitest";
import { ins, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import type { Report, Filing } from "@/lib/commands/compliance";
import "@/lib/commands/all";

const SEPTEMBER = { jurisdiction: "TTB", periodStart: "2025-09-01", periodEnd: "2025-09-30" };

describe("period-end beer in process (#1640)", () => {
  it("keeps current and upcoming periods live to date, without claiming a future period-end balance", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    const [today, tomorrow] = sql(`select (now() at time zone timezone)::date, (now() at time zone timezone)::date + 1 from breweries where id='${brewery.id}'`, true)[0].split("|");
    const year = Number(today.slice(0, 4));
    const vessel = await ins("vessels", { brewery_id: brewery.id, name: "Live tank", kind: "fermenter", capacity_bbl: 20 });
    const batch = await runCommand("schedule_batch", { plannedOn: today, plannedBbl: 15 }, owner) as { id: string };
    await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, brewedOn: today, initialBbl: 10, actuals: [], confirmEmpty: true }, owner);
    await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, brewedOn: tomorrow, initialBbl: 5, actuals: [], confirmEmpty: true }, owner);
    for (const reportYear of [year, year + 1]) {
      const report = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: `${reportYear}-01-01`, periodEnd: `${reportYear}-12-31` }, owner) as Report;
      expect(report.figures.inProcess).toBe(10);
      expect(report.figures).not.toHaveProperty("inProcessAsOf");
    }
  });

  it("replays tank history at brewery-local midnight, including tanks emptied later and excluding later turns", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    const catalog = await seedCatalog(brewery.id);
    const vessel = await ins("vessels", { brewery_id: brewery.id, name: "Source", kind: "fermenter", capacity_bbl: 30 });
    const targetVessel = await ins("vessels", { brewery_id: brewery.id, name: "Target", kind: "fermenter", capacity_bbl: 30 });
    const batch = await runCommand("schedule_batch", { plannedOn: "2025-09-01", plannedBbl: 15, intendedBrandId: catalog.brandId }, owner) as { id: string };
    const brewed = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, brewedOn: "2025-09-01", initialBbl: 10, actuals: [], confirmEmpty: true }, owner) as { occupancy: { id: string } };
    await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, brewedOn: "2025-10-05", initialBbl: 5, actuals: [], confirmEmpty: true }, owner);
    const source = brewed.occupancy.id;
    const target = await ins("vessel_occupancies", { brewery_id: brewery.id, vessel_id: targetVessel.id, batch_id: batch.id, initial_bbl: 0, started_at: "2025-09-20T12:00:00Z" });
    await ins("transfers", { brewery_id: brewery.id, from_occupancy_id: source, to_occupancy_id: target.id, bbl: 4, at: "2025-09-20T12:00:00Z", created_by: owner.userId });
    await ins("transfers", { brewery_id: brewery.id, from_occupancy_id: source, to_occupancy_id: target.id, bbl: 2, at: "2025-10-05T12:00:00Z", created_by: owner.userId });
    insertFixture("volume_adjustments", [
      { brewery_id: brewery.id, occupancy_id: source, bbl: -1, reason: "loss", at: "2025-10-01T03:59:59Z", created_by: owner.userId },
      { brewery_id: brewery.id, occupancy_id: source, bbl: -2, reason: "loss", at: "2025-10-01T04:00:00Z", created_by: owner.userId },
      { brewery_id: brewery.id, occupancy_id: target.id, bbl: -0.5, reason: "loss", at: "2025-09-21T12:00:00Z", created_by: owner.userId },
    ]);
    const packaging = await ins("packaging_runs", { brewery_id: brewery.id, brand_id: catalog.brandId, occupancy_id: source, planned_on: "2025-09-25", started_at: "2025-09-25T12:00:00Z", closed_at: "2025-10-10T12:00:00Z", bbl_drawn: 3, created_by: owner.userId });
    await ins("lots", { brewery_id: brewery.id, packaging_run_id: packaging.id, brand_id: catalog.brandId, code: "PERIOD-END", packaged_on: "2025-09-25" });
    sql(`update vessel_occupancies set ended_at='2025-10-12T12:00:00Z' where id='${source}'`);
    // Reused vessels must not count either an occupancy already ended or one not started yet.
    await ins("vessel_occupancies", { brewery_id: brewery.id, vessel_id: vessel.id, batch_id: batch.id, initial_bbl: 9, started_at: "2025-08-01T12:00:00Z", ended_at: "2025-08-31T12:00:00Z" });
    await ins("vessel_occupancies", { brewery_id: brewery.id, vessel_id: vessel.id, batch_id: batch.id, initial_bbl: 7, started_at: "2025-10-12T12:00:00Z" });
    const report = await runCommand("generate_compliance_report", SEPTEMBER, owner) as Report;
    // Source: 10 knockout - 4 transfer - 1 loss - 3 packaged = 2; target: 4 - 0.5 = 3.5.
    expect(report.figures.inProcess).toBe(5.5);
    expect(report.figures.inProcessAsOf).toBe("2025-09-30");
    expect(report.figures.balances).toBe(true);
  });

  it("files the period-end quantity, not today's tank balance, and preserves the saved snapshot", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    const catalog = await seedCatalog(brewery.id, { bblPerUnit: 0.5 });
    const location = await seedLocation(brewery.id);
    const vessel = await ins("vessels", { brewery_id: brewery.id, name: "Filing tank", kind: "fermenter", capacity_bbl: 20 });
    const batch = await runCommand("schedule_batch", { plannedOn: "2025-09-01", plannedBbl: 10, intendedBrandId: catalog.brandId }, owner) as { id: string };
    const brewed = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, brewedOn: "2025-09-01", initialBbl: 10, actuals: [], confirmEmpty: true }, owner) as { occupancy: { id: string } };
    const run = await runCommand("schedule_packaging_run", { brandId: catalog.brandId, occupancyId: brewed.occupancy.id, plannedOn: "2025-09-25", outputs: [{ skuId: catalog.skuId, qtyPlanned: 6 }] }, owner) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2025-09-25T12:00:00Z" }, owner);
    const plan = await runCommand("get_packaging_close_plan", { runId: run.id }, owner) as { revision: string };
    await runCommand("close_packaging_run", { runId: run.id, bblDrawn: 3, outputs: [{ skuId: catalog.skuId, qtyActual: 6 }], lotCode: "LATE-ENTRY", packagedOn: "2025-09-25", locationId: location.id, binId: location.binId, actuals: [], planRevision: plan.revision }, owner);
    insertFixture("volume_adjustments", { brewery_id: brewery.id, occupancy_id: brewed.occupancy.id, bbl: -2, reason: "loss", created_by: owner.userId });
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const filed = await runCommand("file_compliance_report", SEPTEMBER, owner, execution) as Filing;
    expect(filed.figures.inProcess).toBe(7);
    expect(filed.figures.inProcessAsOf).toBe("2025-09-30");
    expect(filed.figures.packaged).toBe(3);
    insertFixture("volume_adjustments", { brewery_id: brewery.id, occupancy_id: brewed.occupancy.id, bbl: -1, reason: "loss", created_by: owner.userId });
    const regenerated = await runCommand("generate_compliance_report", SEPTEMBER, owner) as Report;
    expect(regenerated.figures).toEqual(filed.figures);
    expect(await runCommand("file_compliance_report", SEPTEMBER, owner, execution)).toEqual(filed);
    const listed = await runCommand("list_compliance_reports", SEPTEMBER, owner) as { filings: Filing[] };
    expect(listed.filings[0].figures).toEqual(filed.figures);
    const emptyOwner = await makeStaffCtx((await makeBrewery()).id);
    const empty = await runCommand("generate_compliance_report", SEPTEMBER, emptyOwner) as Report;
    expect(empty.figures.inProcess).toBe(0);
  });
});
