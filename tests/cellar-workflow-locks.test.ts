import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { closePgSessions, insertFixture, makeBrewery, makeStaffCtx, pgSession, seedCatalog, seedLocation, staffSession } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

let breweryId: string;
let brewer: Ctx;
let owner: Ctx;
let warehouse: Ctx;
let location: { id: string; binId: string };

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  brewer = await makeStaffCtx(breweryId, "brewer");
  owner = await makeStaffCtx(breweryId, "admin");
  warehouse = await makeStaffCtx(breweryId, "warehouse");
  location = await seedLocation(breweryId, { name: "Cellar lock warehouse" });
});

afterEach(closePgSessions);

async function brew(bbl = 10) {
  const catalog = await seedCatalog(breweryId, { product: `Lock ${crypto.randomUUID()}`, bblPerUnit: 0.01 });
  const vessel = await runCommand("upsert_vessel", { name: `Lock FV ${crypto.randomUUID()}`, kind: "fermenter", capacityBbl: 100 }, owner) as { id: string };
  const batch = await runCommand("schedule_batch", { intendedBrandId: catalog.brandId, plannedOn: "2026-09-01", plannedBbl: bbl }, brewer) as { id: string };
  const day = await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: vessel.id, initialBbl: bbl, brewedOn: "2026-09-01" }, brewer) as { occupancy: { id: string } };
  return { batchId: batch.id, occupancyId: day.occupancy.id, vesselId: vessel.id, ...catalog };
}

async function waitForLock(observer: Client, pid: number) {
  await expect.poll(async () => (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type, { timeout: 3000 }).toBe("Lock");
}

// The fourth argument acknowledges the exact barrels the completion writes off from open tanks.
const completionSql = "select public.complete_batch($1,$2,$3,$4) result";

describe("cellar workflow serialization", { concurrent: false }, () => {
  it("locks the observed occupancy through a first reading while completed retries bypass closure", async () => {
    const f = await brew(1);
    const requestId = crypto.randomUUID();
    const a = await staffSession(brewer.userId);
    const first = (await a.query(
      "select public.record_fermentation_reading($1,null,$2,$3,68,4.2,4.1,'frozen',$4) result",
      [breweryId, f.occupancyId, "2026-09-10T14:15:16.000Z", requestId],
    )).rows[0].result;
    await a.query("reset role");

    const b = await pgSession();
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const closing = b.query("update public.vessel_occupancies set ended_at=now() where id=$1", [f.occupancyId]);
    closing.catch(() => {});
    await waitForLock(a, pid);
    await a.query("commit");
    await closing;

    const retry = await staffSession(brewer.userId, false);
    const replay = (await retry.query(
      "select public.record_fermentation_reading($1,null,$2,$3,68,4.2,4.1,'frozen',$4) result",
      [breweryId, f.occupancyId, "2026-09-10T14:15:16.000Z", requestId],
    )).rows[0].result;
    expect(replay.id).toBe(first.id);
    expect((await retry.query("select count(*)::int n from public.fermentation_readings where id=$1", [first.id])).rows[0].n).toBe(1);
    await expect(retry.query(
      "select public.record_fermentation_reading($1,null,$2,$3,69,4.2,4.1,'frozen',$4)",
      [breweryId, f.occupancyId, "2026-09-10T14:15:16.000Z", requestId],
    )).rejects.toThrow(/different payload/);
    const firstFlushId = crypto.randomUUID();
    await expect(retry.query(
      "select public.record_fermentation_reading($1,null,$2,$3,68,4.2,4.1,'late',$4)",
      [breweryId, f.occupancyId, "2026-09-10T15:00:00.000Z", firstFlushId],
    )).rejects.toThrow(/occupancy is closed/);
    expect((await b.query("select count(*)::int n from private.command_requests where actor_id=$1 and request_id=$2", [brewer.userId, firstFlushId])).rows[0].n).toBe(0);
  });

  it("waits for a real packaging close and calculates from its committed frozen output", async () => {
    const f = await brew();
    const run = await runCommand("schedule_packaging_run", { brandId: f.brandId, plannedOn: "2026-09-02", occupancyId: f.occupancyId, outputs: [{ skuId: f.skuId, qtyPlanned: 995 }] }, brewer) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-09-02T12:00:00Z" }, brewer);
    const a = await staffSession(brewer.userId);
    const b = await staffSession(brewer.userId, false);
    const materialPlan = await runCommand("get_packaging_close_plan", { runId: run.id }, brewer) as { revision: string };
    await a.query("select public.close_packaging_run($1,$2,9.95,$3::jsonb,$4,'2026-09-02',null,$5,$6,$7,'[]'::jsonb,$8)", [
      breweryId, run.id, JSON.stringify([{ sku_id: f.skuId, qty_actual: 995 }]), `LOCK-${crypto.randomUUID()}`, location.id, location.binId, crypto.randomUUID(), materialPlan.revision,
    ]);
    await a.query("reset role");
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const pending = b.query(completionSql, [breweryId, f.batchId, crypto.randomUUID(), 0.05]);
    pending.catch(() => {});
    await waitForLock(a, pid);
    await a.query("commit");
    const result = (await pending).rows[0].result;
    expect(Number(result.packagedBbl)).toBe(9.95);
    expect(Number(result.residualBbl)).toBe(0.05);
  });

  it("waits for a real transfer and recalculates the committed batch scope", async () => {
    const f = await brew();
    const target = await runCommand("upsert_vessel", { name: `Lock BT ${crypto.randomUUID()}`, kind: "brite", capacityBbl: 100 }, owner) as { id: string };
    const a = await staffSession(brewer.userId);
    const b = await staffSession(brewer.userId, false);
    await a.query("select public.record_cellar_transfer($1,$2,$3,4,0.2,$4)", [breweryId, f.occupancyId, target.id, crypto.randomUUID()]);
    await a.query("reset role");
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const pending = b.query(completionSql, [breweryId, f.batchId, crypto.randomUUID(), 9.8]);
    pending.catch(() => {});
    await waitForLock(a, pid);
    await a.query("commit");
    const result = (await pending).rows[0].result;
    expect(Number(result.baselineBbl)).toBe(10);
    expect(Number(result.attributedBbl)).toBe(0.2);
  });

  it("makes schedule and update recheck a just-completed occupancy without residue", async () => {
    for (const mode of ["schedule", "update"] as const) {
      const f = await brew(1);
      const unattached = mode === "update" ? await runCommand("schedule_packaging_run", { brandId: f.brandId, plannedOn: "2026-09-03", outputs: [] }, brewer) as { id: string } : null;
      const a = await staffSession(brewer.userId);
      const b = await staffSession(brewer.userId, false);
      await a.query(completionSql, [breweryId, f.batchId, crypto.randomUUID(), 1]);
      await a.query("reset role");
      const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
      const pending = mode === "schedule"
        ? b.query("select public.schedule_packaging_run($1,$2,'2026-09-03',$3,'[]'::jsonb,$4)", [breweryId, f.brandId, f.occupancyId, crypto.randomUUID()])
        : b.query("select public.update_packaging_run($1,$2,$3,null,null,$4)", [breweryId, unattached!.id, f.occupancyId, crypto.randomUUID()]);
      pending.catch(() => {});
      await waitForLock(a, pid);
      await a.query("commit");
      await expect(pending).rejects.toThrow(/occupancy is closed/);
      const { count } = await brewer.db.from("packaging_runs").select("id", { count: "exact", head: true }).eq("occupancy_id", f.occupancyId);
      expect(count).toBe(0);
      await closePgSessions();
    }
  });

  it("waits behind a scheduled run, then refuses completion after that run commits", async () => {
    const f = await brew(1);
    const a = await staffSession(brewer.userId);
    const b = await staffSession(brewer.userId, false);
    await a.query("select public.schedule_packaging_run($1,$2,'2026-09-03',$3,'[]'::jsonb,$4)", [breweryId, f.brandId, f.occupancyId, crypto.randomUUID()]);
    await a.query("reset role");
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const pending = b.query(completionSql, [breweryId, f.batchId, crypto.randomUUID(), 1]);
    pending.catch(() => {});
    await waitForLock(a, pid);
    await a.query("commit");
    await expect(pending).rejects.toThrow(/packaging run is still open/);
  });

  it("waits for an inventory-only ledger writer without deadlocking on the cellar gate", async () => {
    const f = await brew(1);
    await runCommand("record_movement", { skuId: f.skuId, locationId: location.id, binId: location.binId, qty: 2, type: "adjustment" }, warehouse);
    const a = await staffSession(warehouse.userId);
    const b = await staffSession(brewer.userId, false);
    await a.query("select public.record_inventory_movement($1,$2,$3,$4,-1,'adjustment',null,null,null,$5,null)", [
      breweryId, f.skuId, location.id, location.binId, crypto.randomUUID(),
    ]);
    await a.query("reset role");
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const pending = b.query(completionSql, [breweryId, f.batchId, crypto.randomUUID(), 1]);
    pending.catch(() => {});
    await waitForLock(a, pid);
    await a.query("commit");
    await expect(pending).resolves.toMatchObject({ rows: [expect.objectContaining({ result: expect.objectContaining({ batchId: f.batchId }) })] });
  });

  it("makes a books-opened clear wait for filing, then refuse without changing its basis", async () => {
    const ctx = await makeStaffCtx((await makeBrewery()).id);
    await runCommand("set_books_opened_on", { booksOpenedOn: "2026-02-01" }, ctx);
    const a = await staffSession(ctx.userId);
    const b = await staffSession(ctx.userId, false);
    const filingRequest = crypto.randomUUID();
    const filed = (await a.query(
      "select public.file_compliance_report($1,'TTB','2026-02-01','2026-02-28',null,$2) result",
      [ctx.breweryId, filingRequest],
    )).rows[0].result;
    await a.query("reset role");
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const clearRequest = crypto.randomUUID();
    const pending = b.query("select public.set_brewery_books_opened_on($1,null,$2)", [ctx.breweryId, clearRequest]);
    pending.catch(() => {});
    await waitForLock(a, pid);
    await a.query("commit");
    await expect(pending).rejects.toThrow(/cannot change or be cleared.*filed/);
    expect((await b.query("select books_opened_on::text from public.breweries where id=$1", [ctx.breweryId])).rows[0].books_opened_on).toBe("2026-02-01");
    expect((await b.query("select figures from public.report_filings where id=$1", [filed.id])).rows[0].figures).toEqual(filed.figures);
    expect((await a.query("select count(*)::int n from private.command_requests where request_id=$1", [clearRequest])).rows[0].n).toBe(0);
    const replay = (await b.query(
      "select public.file_compliance_report($1,'TTB','2026-02-01','2026-02-28',null,$2) result",
      [ctx.breweryId, filingRequest],
    )).rows[0].result;
    expect(replay).toEqual(filed);
  });

  it("makes filing wait for a prefiling clear and calculate from that committed basis", async () => {
    const ctx = await makeStaffCtx((await makeBrewery()).id);
    const { skuId } = await seedCatalog(ctx.breweryId, { packageType: "can", bblPerUnit: 0.5 });
    const loc = await seedLocation(ctx.breweryId);
    insertFixture("inventory_movements", {
      brewery_id: ctx.breweryId, sku_id: skuId, location_id: loc.id, bin_id: loc.binId,
      created_by: ctx.userId, qty: 10, type: "opening_balance", occurred_on: "2026-01-01",
    });
    await runCommand("set_books_opened_on", { booksOpenedOn: "2026-02-01" }, ctx);
    const a = await staffSession(ctx.userId);
    const b = await staffSession(ctx.userId, false);
    await a.query("select public.set_brewery_books_opened_on($1,null,$2)", [ctx.breweryId, crypto.randomUUID()]);
    await a.query("reset role");
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const pending = b.query(
      "select public.file_compliance_report($1,'TTB','2026-02-01','2026-02-28',null,$2) result",
      [ctx.breweryId, crypto.randomUUID()],
    );
    pending.catch(() => {});
    await waitForLock(a, pid);
    await a.query("commit");
    const filed = (await pending).rows[0].result;
    expect(filed.figures.lines.find((line: { class: string }) => line.class === "can")).toMatchObject({ begin: 5, end: 5 });
    const generated = await runCommand("generate_compliance_report", {
      jurisdiction: "TTB", periodStart: "2026-02-01", periodEnd: "2026-02-28",
    }, ctx) as { figures: unknown };
    expect(generated.figures).toEqual(filed.figures);
    await expect(runCommand("set_books_opened_on", { booksOpenedOn: "2026-02-01" }, ctx)).rejects.toThrow(/filed/);
  });

  it("rechecks the period after a waiting filing sees the books-opened date move past its start", async () => {
    const ctx = await makeStaffCtx((await makeBrewery()).id);
    const a = await staffSession(ctx.userId);
    const b = await staffSession(ctx.userId, false);
    await a.query("select public.set_brewery_books_opened_on($1,'2026-03-01',$2)", [ctx.breweryId, crypto.randomUUID()]);
    await a.query("reset role");
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const requestId = crypto.randomUUID();
    const pending = b.query(
      "select public.file_compliance_report($1,'TTB','2026-02-01','2026-02-28',null,$2)",
      [ctx.breweryId, requestId],
    );
    pending.catch(() => {});
    await waitForLock(a, pid);
    await a.query("commit");
    await expect(pending).rejects.toThrow(/period starts before the books opened on 2026-03-01/);
    expect((await b.query("select count(*)::int n from public.report_filings where brewery_id=$1", [ctx.breweryId])).rows[0].n).toBe(0);
    expect((await a.query("select count(*)::int n from private.command_requests where request_id=$1", [requestId])).rows[0].n).toBe(0);
  });
});
