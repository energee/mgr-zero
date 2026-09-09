import { describe, it, expect } from "vitest";
import { admin, ins, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

async function setup() {
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const catalog = await seedCatalog(ctx.breweryId, { packageType: "keg", bblPerUnit: 0.5 });
  const location = await seedLocation(ctx.breweryId);
  const movement = async (qty: number, type = "adjustment") => await runCommand("record_movement", {
    skuId: catalog.skuId, locationId: location.id, binId: location.binId, qty, type,
  }, ctx) as { id: string; qty: number; bbl: number };
  return { ctx, catalog, location, movement };
}
const reverse = (ctx: Ctx, movementId: string, note = "Entered twice", requestId = crypto.randomUUID()) =>
  runCommand("reverse_inventory_movement", { movementId, note }, ctx, { requestId, correlationId: requestId });

describe("exact standalone inventory reversal", () => {
  it("freezes report package class when the format definition is corrected", async () => {
    const { ctx, catalog, movement } = await setup();
    await movement(5);
    const before = sql(`select class from private.report_movements('${ctx.breweryId}', '2099-01-01')`);
    await runCommand("upsert_format", { id: catalog.formatId, name: "Corrected", basis: "packaged", packageType: "bottle", bblPerUnit: 0.25 }, ctx);
    expect(sql(`select class from private.report_movements('${ctx.breweryId}', '2099-01-01')`)).toEqual(before);
  });

  it("appends the exact frozen opposite and replays before lifecycle checks", async () => {
    const { ctx, catalog, movement } = await setup();
    const original = await movement(5);
    await runCommand("upsert_format", { id: catalog.formatId, name: "Corrected", basis: "packaged", packageType: "bottle", bblPerUnit: 0.25 }, ctx);
    const requestId = crypto.randomUUID();
    const result = await reverse(ctx, original.id, "Entered twice", requestId) as Record<string, unknown>;
    expect(result).toMatchObject({ compensates_id: original.id, qty: -5, bbl: -2.5, package_type: "keg", lot_id: null });
    expect(await reverse(ctx, original.id, "Entered twice", requestId)).toEqual(result);
    await expect(reverse(ctx, original.id, "Changed", requestId)).rejects.toThrow();
    await expect(reverse(ctx, original.id)).rejects.toThrow(/already reversed/i);
    expect(sql(`select side || ':' || sum(bbl) from private.report_movements('${ctx.breweryId}', '2099-01-01') group by side`)).toEqual(["in:0.00000000"]);
  });

  it("serializes distinct attempts and refuses insufficient exact untracked stock", async () => {
    const { ctx, movement } = await setup();
    const original = await movement(5);
    await movement(-3, "loss");
    await expect(reverse(ctx, original.id)).rejects.toThrow(/insufficient/i);
    await movement(3);
    const results = await Promise.allSettled([reverse(ctx, original.id), reverse(ctx, original.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(sql(`select count(*) from inventory_movements where compensates_id='${original.id}'`)).toEqual(["1"]);
  });

  it("restricts roles, foreign resources, unsupported types and compensation chains", async () => {
    const { ctx, movement } = await setup();
    const original = await movement(-2, "loss");
    for (const role of ["sales", "brewer", "taproom"] as const) {
      await expect(reverse(await makeStaffCtx(ctx.breweryId, role), original.id)).rejects.toThrow(/permission/i);
    }
    await expect(reverse(await makeStaffCtx((await makeBrewery()).id), original.id)).rejects.toThrow();
    const warehouse = await makeStaffCtx(ctx.breweryId, "warehouse");
    const result = await reverse(warehouse, original.id) as { id: string };
    await expect(reverse(ctx, result.id)).rejects.toThrow();
    await expect(reverse(ctx, (await movement(1, "opening_balance")).id)).rejects.toThrow();
    const denied = await ctx.db.from("inventory_movements").update({ qty: 100 }).eq("id", original.id);
    expect(denied.error).not.toBeNull();
    const stored = await admin.from("inventory_movements").select("qty").eq("id", original.id).single();
    expect(stored.data?.qty).toBe(-2);
  });
});

it("reads scoped inventory metadata, names, and linked history even at zero stock", async () => {
  const { ctx, catalog, movement } = await setup();
  const original = await movement(2);
  const correction = await reverse(ctx, original.id) as { id: string };
  const sales = await makeStaffCtx(ctx.breweryId, "sales");
  expect(await runCommand("get_inventory_sku", { skuId: catalog.skuId }, sales)).toMatchObject({ id: catalog.skuId });
  expect(await runCommand("get_on_hand", { skuId: catalog.skuId }, sales)).toEqual([expect.objectContaining({ qty: 0, locations: { name: "WH" } })]);
  expect(await runCommand("list_movements", { skuId: catalog.skuId, movementId: original.id }, sales)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: original.id, reversed_by: correction.id, bins: { name: "Cold" } }),
    expect.objectContaining({ id: correction.id, compensates_id: original.id }),
  ]));
  const other = await makeStaffCtx((await makeBrewery()).id);
  await expect(runCommand("get_inventory_sku", { skuId: catalog.skuId }, other)).rejects.toThrow(/not found/i);
  expect(await runCommand("list_movements", { skuId: catalog.skuId }, other)).toEqual([]);
});

it("refuses structural forgeries and rolls rejected requests back", async () => {
  const { ctx, catalog, location, movement } = await setup();
  const original = await movement(3);
  const base = { brewery_id: ctx.breweryId, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId,
    created_by: ctx.userId, type: "adjustment", qty: -3, compensates_id: original.id };
  for (const changed of [{ qty: -2 }, { type: "loss" }, { ref: crypto.randomUUID() }, { source_movement_id: original.id }, { id: original.id }, { brewery_id: (await makeBrewery()).id }]) {
    expect(() => insertFixture("inventory_movements", { ...base, ...changed })).toThrow();
  }
  expect((await ctx.db.from("inventory_movements").insert(base)).error).not.toBeNull();
  const [owned] = insertFixture<{ id: string }>("inventory_movements", { ...base, compensates_id: null, qty: -1, type: "loss", ref: crypto.randomUUID() });
  const requestId = crypto.randomUUID();
  await expect(reverse(ctx, owned.id, "Cannot unpick one row", requestId)).rejects.toThrow(/standalone/);
  expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`)).toEqual(["0"]);
  expect(sql(`select count(*) from inventory_movements where compensates_id='${owned.id}'`)).toEqual(["0"]);
  const sales = await makeStaffCtx(ctx.breweryId, "sales");
  expect((await sales.db.rpc("reverse_inventory_movement", { p_brewery: ctx.breweryId, p_movement: original.id, p_note: "Forbidden", p_request_id: crypto.randomUUID() })).error).not.toBeNull();
});

it("posts a signed later-period correction without rewriting a filing", async () => {
  const { ctx, catalog, location } = await setup();
  const past = { jurisdiction: "TTB", periodStart: "2000-01-01", periodEnd: "2000-01-31" };
  const [row] = insertFixture<{ id: string }>("inventory_movements", { brewery_id: ctx.breweryId, sku_id: catalog.skuId,
    location_id: location.id, bin_id: location.binId, created_by: ctx.userId, qty: 4, type: "adjustment", created_at: "2000-01-15T12:00:00Z" });
  const filed = await runCommand("file_compliance_report", past, ctx) as { id: string; figures: unknown };
  await reverse(ctx, row.id);
  expect((await admin.from("report_filings").select("figures").eq("id", filed.id).single()).data?.figures).toEqual(filed.figures);
  const periodStart = new Date().toISOString().slice(0, 7) + "-01";
  const report = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart, periodEnd: "2099-12-31" }, ctx) as { figures: { lines: { class: string; begin: number; in: number; out: number; end: number }[]; balances: boolean } };
  expect(report.figures.lines.find(l => l.class === "keg")).toMatchObject({ begin: 2, in: -2, out: 0, end: 0 });
  expect(report.figures.balances).toBe(true);
});

it("preserves tracked identity and refuses borrowing other lots or bins", async () => {
  const { ctx, catalog, location } = await setup();
  const run = await ins("packaging_runs", { brewery_id: ctx.breweryId, brand_id: catalog.brandId, planned_on: "2026-09-01", created_by: ctx.userId });
  const lot = await ins("lots", { brewery_id: ctx.breweryId, packaging_run_id: run.id, brand_id: catalog.brandId, code: "EXACT", packaged_on: "2026-09-01" });
  const base = { brewery_id: ctx.breweryId, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId, lot_id: lot.id, created_by: ctx.userId };
  const original = await ins("inventory_movements", { ...base, qty: 4, type: "adjustment" });
  await ins("inventory_movements", { ...base, qty: -3, type: "loss" });
  await ins("inventory_movements", { ...base, lot_id: null, qty: 100, type: "opening_balance" });
  const other = await ins("bins", { brewery_id: ctx.breweryId, location_id: location.id, name: "Other" });
  await ins("inventory_movements", { ...base, bin_id: other.id, qty: 100, type: "opening_balance" });
  await expect(reverse(ctx, original.id)).rejects.toThrow(/insufficient/);
  await ins("inventory_movements", { ...base, qty: 3, type: "adjustment" });
  expect(await reverse(ctx, original.id)).toMatchObject({ lot_id: lot.id, bin_id: location.binId, qty: -4, bbl: -2 });
});

it("nets losses and negative adjustments in their original report outflow side", async () => {
  const { ctx, movement } = await setup();
  for (const type of ["adjustment", "loss"]) await reverse(ctx, (await movement(-2, type)).id);
  const report = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: "2000-01-01", periodEnd: "2099-12-31" }, ctx) as { figures: { lines: { in: number; out: number; end: number }[]; removals: Record<string, number>; balances: boolean } };
  for (const line of report.figures.lines) expect(line).toMatchObject({ in: 0, out: 0, end: 0 });
  expect(report.figures.removals.loss ?? 0).toBe(0);
  expect(report.figures.balances).toBe(true);
});

it("refuses an actual count-owned depletion without changing count history", async () => {
  const { ctx, catalog } = await setup();
  const location = await seedLocation(ctx.breweryId, { name: "Taproom", kind: "taproom" });
  await ins("inventory_movements", { brewery_id: ctx.breweryId, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId, qty: 5, type: "opening_balance", created_by: ctx.userId });
  const snapshot = await ctx.db.rpc("get_taproom_count_snapshot", { p_brewery: ctx.breweryId, p_location: location.id });
  expect(snapshot.error).toBeNull();
  const count = await runCommand("record_taproom_count", { locationId: location.id, countedOn: sql("select (now() at time zone 'America/New_York')::date")[0], revision: snapshot.data.revision,
    lines: [{ binId: location.binId, skuId: catalog.skuId, lotId: null, qtyCounted: 3 }] }, ctx) as { id: string; lines: { movement_id: string }[] };
  await expect(reverse(ctx, count.lines[0].movement_id)).rejects.toThrow(/standalone/);
  expect(await runCommand("get_taproom_count", { countId: count.id }, ctx)).toEqual(count);
});

it("reads all scoped location balances beyond the API row cap", async () => {
  const { ctx, catalog } = await setup();
  sql(`with locations as (insert into locations(brewery_id,name,kind) select '${ctx.breweryId}', 'Loc '||n, 'warehouse' from generate_series(1,1001) n returning id),
    bins as (insert into bins(brewery_id,location_id,name) select '${ctx.breweryId}',id,'Stock' from locations returning id,location_id)
    insert into inventory_movements(brewery_id,sku_id,location_id,bin_id,qty,type,created_by)
    select '${ctx.breweryId}','${catalog.skuId}',location_id,id,1,'opening_balance','${ctx.userId}' from bins`, true);
  const rows = await runCommand("get_on_hand", { skuId: catalog.skuId }, ctx) as unknown[];
  expect(rows).toHaveLength(1001);
});

it("copies frozen package class on source-linked returns and damaged-return loss", async () => {
  const { ctx, catalog, location } = await setup();
  const base = { brewery_id: ctx.breweryId, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId, created_by: ctx.userId };
  const channel = (await admin.from("sale_channels").select("id").eq("brewery_id", ctx.breweryId).eq("name", "Wholesale").single()).data!.id;
  const shipped = await ins("inventory_movements", { ...base, qty: -3, type: "sale_removal", sale_channel_id: channel, tax_treatment: "taxable", dest_state: "PA", ref: crypto.randomUUID() });
  await runCommand("upsert_format", { id: catalog.formatId, name: "Corrected", basis: "packaged", packageType: "bottle", bblPerUnit: 0.25 }, ctx);
  const ref = crypto.randomUUID();
  const returned = await ins("inventory_movements", { ...base, qty: 1, type: "return_in", source_movement_id: shipped.id, ref });
  const damage = await ins("inventory_movements", { ...base, qty: -1, type: "loss", source_movement_id: returned.id, ref });
  expect(sql(`select package_type||':'||bbl from inventory_movements where id='${returned.id}'`)).toEqual(["keg:0.50000000"]);
  expect(sql(`select package_type||':'||bbl from inventory_movements where id='${damage.id}'`)).toEqual(["keg:-0.50000000"]);
  await expect(reverse(ctx, damage.id)).rejects.toThrow(/standalone/);
});

it("rechecks current membership before replaying a completed request", async () => {
  const { ctx, movement } = await setup();
  const row = await movement(-1, "loss");
  const requestId = crypto.randomUUID();
  await reverse(ctx, row.id, "Wrong entry", requestId);
  expect((await admin.from("brewery_users").update({ role: "sales" }).eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId)).error).toBeNull();
  await expect(reverse(ctx, row.id, "Wrong entry", requestId)).rejects.toThrow(/permission/);
});
