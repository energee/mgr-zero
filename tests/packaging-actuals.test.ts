import { expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedMaterial, seedMovement } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { sql } from "./helpers";

async function fixture() {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "brewer");
  const catalog = await seedCatalog(brewery.id, { bblPerUnit: 0.001 });
  const destination = await seedLocation(brewery.id);
  const materialId = await seedMaterial(brewery.id, { name: "Actual cans", category: "packaging", uom: "each" });
  const bom = await admin.from("format_bom").insert({ brewery_id: brewery.id, format_id: catalog.formatId, material_id: materialId, qty_per_unit: 1 });
  if (bom.error) throw bom.error;
  await seedMovement(brewery.id, { materialId, locationId: destination.id, binId: destination.binId, qty: 100, type: "receipt", createdBy: ctx.userId });
  const vessel = await runCommand("upsert_vessel", { name: "Actual tank", kind: "fermenter", capacityBbl: 10 }, ctx) as { id: string };
  const batch = await runCommand("schedule_batch", { intendedBrandId: catalog.brandId, plannedBbl: 1, plannedOn: "2026-09-28" }, ctx) as { id: string };
  const brew = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, brewedOn: "2026-09-28", initialBbl: 1, actuals: [], confirmEmpty: true }, ctx) as { occupancy: { id: string } };
  const run = await runCommand("schedule_packaging_run", { brandId: catalog.brandId, occupancyId: brew.occupancy.id, plannedOn: "2026-09-28", outputs: [{ skuId: catalog.skuId, qtyPlanned: 100 }] }, ctx) as { id: string };
  await runCommand("update_packaging_run", { runId: run.id, startedAt: new Date().toISOString() }, ctx);
  const actual = { materialId, locationId: destination.id, binId: destination.binId, lotId: null, used: 80, loss: 3, unused: 17 };
  const plan = await runCommand("get_packaging_close_plan", { runId: run.id }, ctx) as { revision: string };
  const input = { planRevision: plan.revision, runId: run.id, bblDrawn: 0.1, outputs: [{ skuId: catalog.skuId, qtyActual: 90 }], lotCode: "Actual lot", packagedOn: "2026-09-28", locationId: destination.id, binId: destination.binId, actuals: [actual] };
  return { brewery, ctx, catalog, destination, materialId, batch, run, actual, input };
}

it("posts only confirmed usage plus loss; unused returns never add stock", async () => {
  const f = await fixture();
  await runCommand("close_packaging_run", f.input, f.ctx);
  const movements = await admin.from("material_movements").select("qty,type").eq("material_id", f.materialId).neq("type", "receipt").order("qty");
  expect(movements.data).toEqual([{ qty: -80, type: "consumption" }, { qty: -3, type: "loss" }]);
});

it("checks combined used and loss before any output, lot, or close can commit", async () => {
  const f = await fixture();
  await expect(runCommand("close_packaging_run", { ...f.input, actuals: [{ ...f.actual, used: 99, loss: 2, unused: 0 }] }, f.ctx)).rejects.toThrow("stock");
  expect((await admin.from("packaging_runs").select("closed_at").eq("id", f.run.id).single()).data?.closed_at).toBeNull();
  expect((await admin.from("lots").select("id").eq("packaging_run_id", f.run.id)).data).toEqual([]);
});

it("freezes planned versus actual materials and replays the identical close", async () => {
  const f = await fixture();
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const closed = await runCommand("close_packaging_run", f.input, f.ctx, execution);
  expect(await runCommand("close_packaging_run", f.input, f.ctx, execution)).toEqual(closed);
  const change = await admin.from("format_bom").update({ qty_per_unit: 2 }).eq("format_id", f.catalog.formatId).eq("material_id", f.materialId);
  if (change.error) throw change.error;
  const record = await runCommand("get_packaging_material_record", { runId: f.run.id }, f.ctx) as { records: { planned: { materialId: string; qty: number }[]; actuals: { material_name: string; qty_used: number; qty_loss: number; qty_unused: number }[] }[] };
  expect(record.records[0].planned).toContainEqual(expect.objectContaining({ materialId: f.materialId, qty: 100 }));
  expect(record.records[0].actuals).toContainEqual(expect.objectContaining({ material_name: "Actual cans", qty_used: 80, qty_loss: 3, qty_unused: 17 }));
});

it("requires whole counted units, every planned material, and unique canonical source identities", async () => {
  const f = await fixture();
  for (const actuals of [[], [{ ...f.actual, used: 0.5 }], [f.actual, { ...f.actual, materialId: f.materialId.toUpperCase() }]]) {
    await expect(runCommand("close_packaging_run", { ...f.input, actuals }, f.ctx)).rejects.toThrow();
  }
  await runCommand("close_packaging_run", { ...f.input, outputs: [{ skuId: f.catalog.skuId, qtyActual: 0 }], actuals: [{ ...f.actual, used: 0, loss: 0, unused: 100 }] }, f.ctx);
  expect((await admin.from("material_movements").select("id").eq("material_id", f.materialId).neq("type", "receipt")).data).toEqual([]);
});

it("rejects changed BOM plans and keeps the invoker requirements view tenant-scoped", async () => {
  const f = await fixture();
  const requirements = await f.ctx.db.from("packaging_run_requirements").select("required").eq("run_id", f.run.id);
  expect(requirements.error).toBeNull();
  expect(requirements.data).toEqual([{ required: 100 }]);
  const foreign = await makeStaffCtx((await makeBrewery()).id, "brewer");
  expect((await foreign.db.from("packaging_run_requirements").select("run_id").eq("run_id", f.run.id)).data).toEqual([]);
  await expect(runCommand("get_packaging_close_plan", { runId: f.run.id }, foreign)).rejects.toThrow();
  const direct = await foreign.db.rpc("packaging_material_plan", { p_brewery: f.brewery.id, p_outputs: [{ sku_id: f.catalog.skuId, qty_planned: 100 }] });
  expect(direct.error).not.toBeNull();
  await admin.from("format_bom").update({ qty_per_unit: 2 }).eq("format_id", f.catalog.formatId);
  await expect(runCommand("close_packaging_run", f.input, f.ctx)).rejects.toThrow("plan changed");
});

it("appends a correction and exact compensations without rewriting outputs or tank draw", async () => {
  const f = await fixture();
  await runCommand("close_packaging_run", f.input, f.ctx);
  const history = await runCommand("get_packaging_material_record", { runId: f.run.id }, f.ctx) as { records: { id: string }[] };
  const before = (await admin.from("packaging_runs").select("closed_at,bbl_drawn").eq("id", f.run.id).single()).data;
  const input = { recordId: history.records[0].id, reason: "Counted the unused tray", actuals: [{ ...f.actual, used: 75, loss: 2, unused: 23 }] };
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const result = await runCommand("correct_packaging_material_record", input, f.ctx, execution);
  expect(await runCommand("correct_packaging_material_record", input, f.ctx, execution)).toEqual(result);
  const movements = await admin.from("material_movements").select("qty,compensates_id").eq("material_id", f.materialId);
  expect(movements.data?.reduce((sum, row) => sum + row.qty, 0)).toBe(23);
  expect(movements.data?.filter(row => row.compensates_id).map(row => row.qty).sort((a,b)=>a-b)).toEqual([3, 80]);
  expect((await admin.from("packaging_runs").select("closed_at,bbl_drawn").eq("id", f.run.id).single()).data).toEqual(before);
  const after = await runCommand("get_packaging_material_record", { runId: f.run.id }, f.ctx) as { records: unknown[] };
  expect(after.records).toHaveLength(2);
  expect(sql(`select sum(m.qty)::numeric from public.packaging_run_consumptions c join public.material_movements m on m.id=c.movement_id where c.run_id='${f.run.id}'`)).toEqual(["-77.0000"]);
  await expect(runCommand("correct_packaging_material_record", input, f.ctx)).rejects.toThrow("already corrected");
});

it("refuses material corrections once finished goods have downstream movements", async () => {
  const f = await fixture();
  await runCommand("close_packaging_run", f.input, f.ctx);
  const history = await runCommand("get_packaging_material_record", { runId: f.run.id }, f.ctx) as { records: { id: string }[] };
  const lot = await admin.from("lots").select("id").eq("packaging_run_id", f.run.id).single();
  sql(`insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,created_by) values('${f.brewery.id}','${f.catalog.skuId}','${f.destination.id}','${f.destination.binId}','${lot.data!.id}',-1,'adjustment','${f.ctx.userId}')`);
  await expect(runCommand("correct_packaging_material_record", { recordId: history.records[0].id, reason: "Late count", actuals: [f.actual] }, f.ctx)).rejects.toThrow("finished goods prevent");
});

it("records an explicit all-zero tracked planned material without inventing a source lot", async () => {
  const f = await fixture();
  const tracked = await seedMaterial(f.brewery.id, { name: "Unused tracked sleeve", category: "packaging", uom: "each", lotTracked: true });
  const bom = await admin.from("format_bom").insert({ brewery_id: f.brewery.id, format_id: f.catalog.formatId, material_id: tracked, qty_per_unit: 1 });
  if (bom.error) throw bom.error;
  const plan = await runCommand("get_packaging_close_plan", { runId: f.run.id }, f.ctx) as { revision: string };
  await runCommand("close_packaging_run", { ...f.input, planRevision: plan.revision, actuals: [f.actual, { ...f.actual, materialId: tracked, used: 0, loss: 0, unused: 0 }] }, f.ctx);
  expect((await admin.from("material_movements").select("id").eq("material_id", tracked)).data).toEqual([]);
});

it("replays a completed pre-upgrade close without permitting a new unconfirmed close", async () => {
  const f = await fixture();
  const requestId = crypto.randomUUID();
  const execution = { requestId, correlationId: crypto.randomUUID() };
  const result = { id: f.run.id, closed_at: "2026-09-27T12:00:00Z" };
  const legacy = { ...f.input, actuals: undefined, planRevision: undefined };
  const payload = { brewery: f.brewery.id, run: f.run.id, bbl_drawn: legacy.bblDrawn,
    outputs: legacy.outputs.map(row => ({ sku_id: row.skuId, qty_actual: row.qtyActual })), lot_code: legacy.lotCode,
    packaged_on: legacy.packagedOn, best_by: null, location: legacy.locationId, bin: legacy.binId };
  sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
    values('${f.ctx.userId}','${f.brewery.id}','${requestId}','close_packaging_run',extensions.digest('${JSON.stringify(payload)}'::jsonb::text,'sha256'),'${JSON.stringify(result)}'::jsonb)`);
  expect(await runCommand("close_packaging_run", legacy, f.ctx, execution)).toEqual(result);
  await expect(runCommand("close_packaging_run", { ...legacy, bblDrawn: 0.2 }, f.ctx, execution)).rejects.toMatchObject({ code: "conflict" });
  await expect(runCommand("close_packaging_run", legacy, f.ctx)).rejects.toThrow("confirm actuals");
  expect((await admin.from("packaging_material_records").select("id").eq("run_id", f.run.id)).data).toEqual([]);
});

import { Client } from "pg";
import { DB } from "./helpers";
it.each(["materials", "skus", "format_bom", "material_lots", "inventory_movements", "material_movements"])("refuses a busy %s writer without waiting while holding other locks", async table => {
  const f = await fixture();
  const writer = new Client({ connectionString: DB });
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  await writer.connect();
  try {
    await writer.query(`begin; lock table public.${table} in row exclusive mode`);
    await expect(runCommand("close_packaging_run", f.input, f.ctx, execution)).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("busy") });
    expect((await admin.from("packaging_material_records").select("id").eq("run_id", f.run.id)).data).toEqual([]);
  } finally { await writer.query("rollback"); await writer.end(); }
  await runCommand("close_packaging_run", f.input, f.ctx, execution);
  expect((await admin.from("packaging_material_records").select("id").eq("run_id", f.run.id)).data).toHaveLength(1);
});


it.each(["completed batch", "filed report"])("refuses correction after a %s without changing recorded material movements", async dependency => {
  const f = await fixture();
  await runCommand("close_packaging_run", f.input, f.ctx);
  const history = await runCommand("get_packaging_material_record", { runId: f.run.id }, f.ctx) as { records: { id: string }[] };
  if (dependency === "completed batch") sql(`update public.batches set closed_at=now() where id='${f.batch.id}'`);
  else sql(`insert into public.report_filings(brewery_id,jurisdiction,period_start,period_end,figures,filed_at,filed_by) values('${f.brewery.id}','TTB','2026-09-01','2026-09-30','{}',now(),'${f.ctx.userId}')`);
  await expect(runCommand("correct_packaging_material_record", { recordId: history.records[0].id, reason: "Late count", actuals: [f.actual] }, f.ctx)).rejects.toThrow(dependency);
  expect((await admin.from("material_movements").select("id").eq("material_id", f.materialId).not("compensates_id", "is", null)).data).toEqual([]);
});
