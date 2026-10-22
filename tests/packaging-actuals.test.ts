import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CommandContextExpectation, Ctx } from "@/lib/commands/registry";
import { useCommandAction, type CommandAction } from "@/lib/commands/use-command-form";
import { readRecoveries, discardRecovery } from "@/lib/commands/recovery";
import { CommandRecovery } from "@/components/mgr/command-recovery";
import type { RunClosedViewModel } from "@/components/mgr/views/run-closed";

const recovery = vi.hoisted(() => ({
  context: { actorId: "", breweryId: "" } as CommandContextExpectation,
  retry: undefined as ((requestId: string) => Promise<void>) | undefined,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/brewery-provider", () => ({
  useBrewery: () => recovery.context.breweryId,
  useCommandContext: () => recovery.context,
}));
vi.mock("@/components/mgr/views/command-recovery", () => ({
  CommandRecoveryView: ({ onRetry }: { onRetry: (requestId: string) => Promise<void> }) => { recovery.retry = onRetry; return null; },
}));
afterEach(() => vi.unstubAllGlobals());
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedMaterial, seedMovement } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { sql } from "./helpers";

async function fixture() {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "brewer");
  const owner = await makeStaffCtx(brewery.id, "admin");
  const catalog = await seedCatalog(brewery.id, { bblPerUnit: 0.001 });
  const destination = await seedLocation(brewery.id);
  const materialId = await seedMaterial(brewery.id, { name: "Actual cans", category: "packaging", uom: "each" });
  const bom = await admin.from("format_bom").insert({ brewery_id: brewery.id, format_id: catalog.formatId, material_id: materialId, qty_per_unit: 1 });
  if (bom.error) throw bom.error;
  await seedMovement(brewery.id, { materialId, locationId: destination.id, binId: destination.binId, qty: 100, type: "receipt", createdBy: ctx.userId });
  const vessel = await runCommand("upsert_vessel", { name: "Actual tank", kind: "fermenter", capacityBbl: 10 }, owner) as { id: string };
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
  // Only a first definitive stale-plan rejection may retire a saved close.
  await expect(runCommand("close_packaging_run", f.input, f.ctx)).rejects.toMatchObject({ status: 409, code: "stale_plan" });
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

// The browser transport below executes the real authorized commands. Only the
// response is lost; the ledger and idempotent replay are never mocked.
function recoveryBrowser(ctx: Ctx, runId: string) {
  recovery.context = { actorId: ctx.userId, breweryId: ctx.breweryId };
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("location", { pathname: `/packaging/${runId}`, reload: vi.fn() });
  let action!: CommandAction;
  function Harness() { action = useCommandAction(runId); return null; }
  return () => { renderToStaticMarkup(createElement(Harness)); return action; };
}

function stubCommandFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  const networkFetch = globalThis.fetch;
  const commandFetch = vi.fn(handler);
  vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) =>
    url === "/api/command" ? commandFetch(url, init ?? {}) : networkFetch(url, init));
  return commandFetch;
}

it.each(["before commit", "after commit"])("recovers a close lost %s after reload through the shared panel with one lot and output", async loss => {
  const f = await fixture();
  const mount = recoveryBrowser(f.ctx, f.run.id);
  const sent: { name: string; input: unknown; requestId: string; expectedContext: unknown }[] = [];
  let first = true;
  stubCommandFetch(async (_url, init) => {
    const request = JSON.parse(init.body as string);
    sent.push(request);
    expect(readRecoveries(sessionStorage, recovery.context)[0]).toMatchObject({ requestId: request.requestId, input: request.input, target: f.run.id, path: `/packaging/${f.run.id}`, expectedContext: recovery.context });
    const drop = first; first = false;
    if (drop && loss === "before commit") throw new TypeError("Request did not reach server");
    const data = await runCommand(request.name, request.input, f.ctx, { requestId: request.requestId, correlationId: crypto.randomUUID() });
    if (drop) throw new TypeError("Committed response lost");
    return new Response(JSON.stringify({ ok: true, data }));
  });
  expect(await mount().run("close_packaging_run", f.input)).toBe(false);
  const [saved] = readRecoveries(sessionStorage, recovery.context);
  expect(await mount().run("close_packaging_run", { ...f.input, lotCode: "Changed" })).toBe(false);
  expect(await mount().run("correct_packaging_material_record", { recordId: "new-record" })).toBe(false);
  expect(sent).toHaveLength(1); // Reload and competing/edited actions send nothing.
  const detail = await runCommand("get_packaging_run", { runId: f.run.id }, f.ctx) as { run: { closed_at: string | null; bbl_drawn: number | null }; lot: RunClosedViewModel["lot"]; outputs: RunClosedViewModel["outputs"] };
  if (loss === "after commit") {
    expect(detail.run.closed_at).not.toBeNull();
    expect(detail.lot).toMatchObject({ code: f.input.lotCode, packaged_on: f.input.packagedOn });
    expect(detail.outputs).toContainEqual(expect.objectContaining({ qty_actual: 90, qty_planned: 100 }));
  } else {
    expect(detail.run.closed_at).toBeNull();
    expect(detail.lot).toBeNull();
  }
  renderToStaticMarkup(createElement(CommandRecovery));
  await recovery.retry!(saved.requestId);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  expect(readRecoveries(sessionStorage, recovery.context)).toEqual([]);
  expect((await admin.from("lots").select("id").eq("packaging_run_id", f.run.id)).data).toHaveLength(1);
  const produced = await admin.from("inventory_movements").select("qty").eq("brewery_id", f.brewery.id).eq("sku_id", f.catalog.skuId).eq("type", "production_in");
  expect(produced.data).toEqual([{ qty: 90 }]);
  expect((await admin.from("packaging_material_records").select("id").eq("run_id", f.run.id)).data).toHaveLength(1);
});

it.each(["before commit", "after commit"])("independently recovers a material correction lost %s against its original record after reload", async loss => {
  const f = await fixture();
  await runCommand("close_packaging_run", f.input, f.ctx);
  const history = await runCommand("get_packaging_material_record", { runId: f.run.id }, f.ctx) as { records: { id: string }[] };
  const input = { recordId: history.records[0].id, reason: "Recounted unused trays", actuals: [{ ...f.actual, used: 75, loss: 2, unused: 23 }] };
  const mount = recoveryBrowser(f.ctx, f.run.id);
  const sent: { name: string; input: unknown; requestId: string }[] = [];
  let first = true;
  stubCommandFetch(async (_url, init) => {
    const request = JSON.parse(init.body as string);
    sent.push(request);
    expect(readRecoveries(sessionStorage, recovery.context)[0].input).toEqual(input);
    const drop = first; first = false;
    if (drop && loss === "before commit") throw new TypeError("Request did not reach server");
    const data = await runCommand(request.name, request.input, f.ctx, { requestId: request.requestId, correlationId: crypto.randomUUID() });
    if (drop) throw new TypeError("Committed correction response lost");
    return new Response(JSON.stringify({ ok: true, data }));
  });
  expect(await mount().run("correct_packaging_material_record", input)).toBe(false);
  const [saved] = readRecoveries(sessionStorage, recovery.context);
  const current = await runCommand("get_packaging_material_record", { runId: f.run.id }, f.ctx) as { records: { id: string }[] };
  expect(current.records).toHaveLength(loss === "after commit" ? 2 : 1);
  expect(await mount().run("correct_packaging_material_record", { ...input, recordId: current.records.at(-1)!.id, reason: "Changed" })).toBe(false);
  expect(sent).toHaveLength(1);
  renderToStaticMarkup(createElement(CommandRecovery));
  await recovery.retry!(saved.requestId);
  expect(sent[1]).toEqual(sent[0]);
  expect(readRecoveries(sessionStorage, recovery.context)).toEqual([]);
  expect((await admin.from("packaging_material_records").select("id").eq("run_id", f.run.id)).data).toHaveLength(2);
  expect(sql(`select sum(m.qty)::numeric from public.packaging_run_consumptions c join public.material_movements m on m.id=c.movement_id where c.run_id='${f.run.id}'`)).toEqual(["-77.0000"]);
  expect((await admin.from("inventory_movements").select("qty").eq("brewery_id", f.brewery.id).eq("sku_id", f.catalog.skuId).eq("type", "production_in")).data).toEqual([{ qty: 90 }]);
});

it("retires a first stale-plan refusal, but retains a stale-plan refusal after a lost attempt until explicit discard", async () => {
  const f = await fixture();
  const mount = recoveryBrowser(f.ctx, f.run.id);
  const change = await admin.from("format_bom").update({ qty_per_unit: 2 }).eq("format_id", f.catalog.formatId);
  if (change.error) throw change.error;
  let drop = false;
  const fetch = stubCommandFetch(async (_url, init) => {
    if (drop) throw new TypeError("No server response");
    const request = JSON.parse(init.body as string);
    try {
      await runCommand(request.name, request.input, f.ctx, { requestId: request.requestId, correlationId: crypto.randomUUID() });
      throw new Error("Expected stale plan");
    } catch (cause) {
      expect(cause).toMatchObject({ code: "stale_plan", status: 409 });
      return new Response(JSON.stringify({ ok: false, error: { message: "Material plan changed", code: "stale_plan" } }), { status: 409 });
    }
  });
  expect(await mount().run("close_packaging_run", f.input)).toBe(false);
  expect(readRecoveries(sessionStorage, recovery.context)).toEqual([]);
  drop = true;
  expect(await mount().run("close_packaging_run", f.input)).toBe(false);
  const [saved] = readRecoveries(sessionStorage, recovery.context);
  drop = false;
  expect(await mount().run(saved.name, saved.input)).toBe(false);
  expect(readRecoveries(sessionStorage, recovery.context)).toEqual([saved]);
  const sends = fetch.mock.calls.length;
  discardRecovery(sessionStorage, recovery.context, saved.requestId);
  expect(fetch.mock.calls).toHaveLength(sends);
  expect(readRecoveries(sessionStorage, recovery.context)).toEqual([]);
  expect((await admin.from("lots").select("id").eq("packaging_run_id", f.run.id)).data).toEqual([]);
});

it("denies a precommit saved close after role revocation and keeps its original recovery identity", async () => {
  const f = await fixture();
  const mount = recoveryBrowser(f.ctx, f.run.id);
  stubCommandFetch(async () => { throw new TypeError("Request never reached server"); });
  expect(await mount().run("close_packaging_run", f.input)).toBe(false);
  const [saved] = readRecoveries(sessionStorage, recovery.context);
  sql(`update public.brewery_users set roles=array['sales']::public.staff_role[] where brewery_id='${f.brewery.id}' and user_id='${f.ctx.userId}'`);
  const denied = stubCommandFetch(async (_url, init) => {
    const request = JSON.parse(init.body as string);
    expect(request).toMatchObject({ requestId: saved.requestId, input: f.input });
    // Even this stale brewer Ctx cannot bypass the RPC's current role check.
    await expect(runCommand(request.name, request.input, f.ctx, { requestId: request.requestId, correlationId: crypto.randomUUID() })).rejects.toThrow();
    return new Response(JSON.stringify({ ok: false, error: { message: "Current role cannot close this run", code: "forbidden" } }), { status: 403 });
  });
  renderToStaticMarkup(createElement(CommandRecovery));
  await recovery.retry!(saved.requestId);
  expect(denied).toHaveBeenCalledOnce();
  expect(readRecoveries(sessionStorage, recovery.context)).toEqual([saved]);
  expect((await admin.from("lots").select("id").eq("packaging_run_id", f.run.id)).data).toEqual([]);
  expect((await admin.from("packaging_runs").select("closed_at").eq("id", f.run.id).single()).data?.closed_at).toBeNull();
});

it.each(["admin", "brewer", "warehouse"] as const)("exposes only the committed run lot receipt to %s through the authorized packaging read", async role => {
  const f = await fixture();
  const reader = role === "brewer" ? f.ctx : await makeStaffCtx(f.brewery.id, role);
  expect(await reader.db.rpc("get_packaging_run_lot", { p_brewery: f.brewery.id, p_run: f.run.id })).toMatchObject({ error: null, data: null });
  await runCommand("close_packaging_run", f.input, f.ctx);
  const committed = (await admin.from("lots").select("id,code,packaged_on,best_by").eq("packaging_run_id", f.run.id).single()).data;
  const result = await reader.db.rpc("get_packaging_run_lot", { p_brewery: f.brewery.id, p_run: f.run.id });
  expect(result.error).toBeNull();
  expect(result.data).toEqual(committed);
  expect(Object.keys(result.data as object).sort()).toEqual(["best_by", "code", "id", "packaged_on"]);
  if (role === "brewer") {
    // Receipt authority must not broaden the compliance-owned table policy.
    expect((await reader.db.from("lots").select("id").eq("packaging_run_id", f.run.id)).data).toEqual([]);
  }
});

it("keeps the lot receipt tenant-scoped, denies non-packaging roles, and gives foreign/missing runs the same refusal", async () => {
  const f = await fixture();
  await runCommand("close_packaging_run", f.input, f.ctx);
  const foreign = await fixture();
  const missing = await f.ctx.db.rpc("get_packaging_run_lot", { p_brewery: f.brewery.id, p_run: crypto.randomUUID() });
  const foreignRun = await f.ctx.db.rpc("get_packaging_run_lot", { p_brewery: f.brewery.id, p_run: foreign.run.id });
  expect(missing.error?.message).toBe("packaging run not found");
  expect(foreignRun.error).toEqual(missing.error);
  const foreignBrewery = await f.ctx.db.rpc("get_packaging_run_lot", { p_brewery: foreign.brewery.id, p_run: foreign.run.id });
  expect(foreignBrewery.error?.code).toBe("42501");
  for (const role of ["sales", "taproom"] as const) {
    const denied = await makeStaffCtx(f.brewery.id, role);
    expect((await denied.db.rpc("get_packaging_run_lot", { p_brewery: f.brewery.id, p_run: f.run.id })).error?.code).toBe("42501");
  }
  sql(`update public.brewery_users set roles=array['sales']::public.staff_role[] where brewery_id='${f.brewery.id}' and user_id='${f.ctx.userId}'`);
  expect((await f.ctx.db.rpc("get_packaging_run_lot", { p_brewery: f.brewery.id, p_run: f.run.id })).error?.code).toBe("42501");
});
