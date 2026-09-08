import { expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

it("no POS or completed baseline means absent comparison, never fabricated zero", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "taproom");
  const location = await seedLocation(brewery.id, { kind: "taproom" });
  const rpc = await ctx.db.rpc("get_taproom_variance", { p_brewery: brewery.id, p_location: location.id, p_weeks: 4 });
  expect(rpc.error).toBeNull();
  expect(rpc.data).toMatchObject({ rows: [], periods: [], reason: "no_completed_periods" });
  expect(await runCommand("get_taproom_variance", { locationId: location.id, weeks: 4 }, ctx)).toMatchObject({ rows: [] });
});

import { admin, ins, seedCatalog, sql, channelId } from "./helpers";

type Row = { brand_id: string; expected_bbl: number | null; actual_bbl: number; variance_bbl: number | null; excluded_bbl: number; unattributed_bbl: number; split: boolean };
type Report = { rows: Row[]; periods: { count_id: string; prior_count_id: string | null; starts_at: string | null; ends_at: string; starts_before_window: boolean; coverage_complete: boolean; unmapped_lines: number; expected_bbl: number | null; actual_bbl: number; reason: string | null }[]; reason: string | null };
async function fixture() {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "taproom");
  const location = await seedLocation(brewery.id, { kind: "taproom" });
  const cat = await seedCatalog(brewery.id, { product: "Hazy", packageType: "keg", bblPerUnit: .5 });
  const pour = await ins("formats", { brewery_id: brewery.id, name: "Pint", basis: "poured", brand_id: cat.brandId, ounces: 16 });
  const connection = await ins("pos_connections", { brewery_id: brewery.id, merchant_id: crypto.randomUUID() });
  await ins("pos_locations", { brewery_id: brewery.id, connection_id: connection.id, external_location_id: "L", location_id: location.id });
  await ins("pos_item_mappings", { brewery_id: brewery.id, connection_id: connection.id, external_item_id: "pint", format_id: pour.id });
  const today = sql("select (now() at time zone 'America/New_York')::date")[0];
  const at = (days: number) => new Date(`${today}T16:00:00Z`).getTime() + days * 86400000;
  return { brewery, ctx, location, cat, pour, connection, at };
}
type F = Awaited<ReturnType<typeof fixture>>;
const stamp = (f: F, days: number) => new Date(f.at(days)).toISOString();
async function count(f: F, days: number, prior: string | null = null, actual = 2, cat = f.cat) {
  const at = stamp(f, days);
  const c = await ins("taproom_counts", { brewery_id: f.brewery.id, location_id: f.location.id, counted_on: at.slice(0, 10), created_at: at, counted_by: f.ctx.userId, prior_count_id: prior });
  const m = actual ? await ins("inventory_movements", { brewery_id: f.brewery.id, location_id: f.location.id, bin_id: f.location.binId, sku_id: cat.skuId,
    qty: -actual / .5, type: "depletion", tax_treatment: "taxable", sale_channel_id: await channelId(f.brewery.id, "Taproom"), created_by: f.ctx.userId, ref: c.id }) : null;
  await ins("taproom_count_lines", { brewery_id: f.brewery.id, count_id: c.id, location_id: f.location.id, bin_id: f.location.binId, sku_id: cat.skuId, qty_before: actual / .5, qty_counted: 0, movement_id: m?.id ?? null });
  return c.id;
}
async function sale(f: F, days: number, qty = 744, extra: Record<string, unknown> = {}) {
  return ins("pos_sales", { brewery_id: f.brewery.id, connection_id: f.connection.id, external_order_id: crypto.randomUUID(), external_line_id: "line", external_item_id: "pint", external_location_id: "L", sold_at: stamp(f, days), qty, ...extra });
}
function reconcile(f: F, saleId: string) {
  return sql(`select private.reconcile_pos_sale('${f.brewery.id}','${saleId}')::text`)[0];
}
async function coverage(f: F, start = -100, end = 0, complete = true, extra: Record<string, unknown> = {}) {
  return ins("pos_sales_coverage", { brewery_id: f.brewery.id, connection_id: f.connection.id, external_location_id: "L", location_id: f.location.id,
    starts_at: stamp(f, start), ends_at: stamp(f, end), complete, ...extra });
}
async function report(f: F, weeks = 4) {
  return await runCommand("get_taproom_variance", { locationId: f.location.id, weeks }, f.ctx) as Report;
}
const fingerprint = (f: F) => sql(`select md5(coalesce((select jsonb_agg(to_jsonb(t) order by id)::text from public.inventory_movements t where brewery_id='${f.brewery.id}'),'') ||
  coalesce((select jsonb_agg(to_jsonb(t) order by id)::text from public.taproom_counts t where brewery_id='${f.brewery.id}'),'') ||
  coalesce((select jsonb_agg(to_jsonb(t) order by id)::text from public.taproom_count_lines t where brewery_id='${f.brewery.id}'),''))`);
async function interval(f: F, from: number, to: number | null, excluded = false, extra: Record<string, unknown> = {}) {
  return ins("tap_intervals", { brewery_id: f.brewery.id, location_id: f.location.id, sku_id: f.cat.skuId, nominal_bbl: .5, opening_fill: 1,
    not_in_inventory: excluded, opened_at: stamp(f, from), opened_by: f.ctx.userId,
    ...(to === null ? {} : { closed_at: stamp(f, to), closed_by: f.ctx.userId, closing_fill: 0, close_reason: "empty" }), ...extra });
}

it("two completed 3 expected / 2 actual periods total +2; 4/12 local-date weeks include whole count gaps and omit unpaired actual", async () => {
  const f = await fixture();
  const first = await count(f, -70, null, 9), old = await count(f, -40, first), a = await count(f, -14, old), b = await count(f, -7, a);
  await coverage(f);
  for (const d of [-50, -20, -10]) reconcile(f, (await sale(f, d)).id);
  await ins("inventory_movements", { brewery_id:f.brewery.id,location_id:f.location.id,bin_id:f.location.binId,sku_id:f.cat.skuId,qty:999,type:"taproom_transfer",created_by:f.ctx.userId });
  const before = fingerprint(f);
  const r = await report(f);
  expect(r.rows).toMatchObject([{ brand_id: f.cat.brandId, expected_bbl: 6, actual_bbl: 4, variance_bbl: 2, unattributed_bbl: 6 }]);
  expect(r.periods.map(p => p.count_id)).toEqual([a, b]);
  expect(r.periods[0]).toMatchObject({ prior_count_id: old, starts_before_window: true });
  const long = await report(f, 12);
  expect(long.rows).toMatchObject([{ expected_bbl: 9, actual_bbl: 6, variance_bbl: 3 }]);
  expect(long.periods.find(p => p.count_id === first)).toMatchObject({ reason: "missing_baseline", expected_bbl: null, actual_bbl: 9 });
  expect(fingerprint(f)).toEqual(before);
});

it("absent/incomplete empty coverage is null; completed zero-sales observation compares zero to physical actual", async () => {
  const f = await fixture(); const a = await count(f, -14, null, 0); await count(f, -7, a);
  expect((await report(f)).rows).toEqual([]);
  expect((await report(f)).periods.at(-1)).toMatchObject({ expected_bbl: null, actual_bbl: 2, reason: "no_pos_coverage" });
  await coverage(f, -14, -7, false);
  expect((await report(f)).rows).toEqual([]);
  await coverage(f, -14, -11); await coverage(f, -10, -7);
  expect((await report(f)).rows).toEqual([]); // A real one-day hole cannot prove zero.
  await coverage(f, -11, -10);
  expect((await report(f)).rows).toMatchObject([{ expected_bbl: 0, actual_bbl: 2, variance_bbl: -2 }]);
});

it("freezes poured and packaged volume, replays once, and late reconciled facts change only expected", async () => {
  const f = await fixture(); const a = await count(f, -14, null, 0); await count(f, -7, a);
  await coverage(f); await interval(f, -20, null);
  const s = await sale(f, -10, 248); reconcile(f, s.id);
  await ins("pos_item_mappings", { brewery_id: f.brewery.id, connection_id: f.connection.id, external_item_id: "package", sku_id: f.cat.skuId });
  const p = await sale(f, -10, 2, { external_item_id: "package" }); reconcile(f, p.id);
  const before = fingerprint(f);
  expect((await report(f)).rows).toMatchObject([{ expected_bbl: 2, actual_bbl: 2, variance_bbl: 0 }]);
  expect((await admin.from("formats").update({ ounces: 12 }).eq("id", f.pour.id)).error).toBeNull();
  expect((await admin.from("formats").update({ bbl_per_unit: .25 }).eq("id", f.cat.formatId)).error).toBeNull();
  expect(reconcile(f, s.id)).toBe("true"); expect(reconcile(f, p.id)).toBe("true");
  expect((await report(f)).rows[0].expected_bbl).toBe(2);
  const replacement = await ins("formats", { brewery_id: f.brewery.id, name: "Taster", basis: "poured", brand_id: f.cat.brandId, ounces: 4 });
  expect((await admin.from("pos_item_mappings").update({ format_id: replacement.id }).eq("connection_id", f.connection.id).eq("external_item_id", "pint")).error).toBeNull();
  reconcile(f, s.id); expect((await report(f)).rows[0].expected_bbl).toBe(2);
  expect((await admin.from("pos_item_mappings").update({ format_id: f.pour.id }).eq("connection_id", f.connection.id).eq("external_item_id", "pint")).error).toBeNull();
  reconcile(f, (await sale(f, -10, 248)).id);
  expect((await report(f)).rows).toMatchObject([{ expected_bbl: 2.75, actual_bbl: 2, variance_bbl: .75 }]);
  expect(fingerprint(f)).toEqual(before);
  expect((await admin.from("pos_sales").update({ qty: 99 }).eq("id", s.id)).error).not.toBeNull();
  expect((await admin.from("pos_sale_expectations").update({ expected_bbl: 99 }).eq("sale_id", s.id)).error).not.toBeNull();
});

it("mapped lines survive unmapped order siblings, ignored is explicit, line UID is scoped to order and variation stays distinct", async () => {
  const f = await fixture(); const a = await count(f, -14, null, 0); await count(f, -7, a); await coverage(f);
  const order = crypto.randomUUID(); const s = await sale(f, -10, 248, { external_order_id: order }); reconcile(f, s.id);
  const unknown = await sale(f, -10, 3, { external_order_id: order, external_line_id: "other", external_item_id: "half" });
  expect(reconcile(f, unknown.id)).toBe("false");
  expect((await report(f)).rows[0].expected_bbl).toBe(1);
  expect((await report(f)).periods.at(-1)).toMatchObject({ unmapped_lines: 1, coverage_complete: true });
  const pretzel = await sale(f, -10, 1, { external_item_id: "pretzel" });
  await ins("pos_item_mappings", { brewery_id: f.brewery.id, connection_id: f.connection.id, external_item_id: "pretzel", ignored: true });
  expect(reconcile(f, pretzel.id)).toBe("false");
  expect((await report(f)).periods.at(-1)?.unmapped_lines).toBe(1);
  const duplicate = await admin.from("pos_sales").insert({ brewery_id: f.brewery.id, connection_id: f.connection.id, external_order_id: order, external_line_id: "line", sold_at: stamp(f, -10), qty: 248, source_version: "2" });
  expect(duplicate.error?.code).toBe("23505");
  reconcile(f, (await sale(f, -10, 248, { external_line_id: "line" })).id);
  expect((await report(f)).rows[0].expected_bbl).toBe(2);
});

it("timestamp-active equal shares conserve stock overlaps and retain excluded shares in denominator; guest labels never match", async () => {
  const f = await fixture(); const a = await count(f, -14, null, 0); await count(f, -7, a); await coverage(f);
  await interval(f, -14, -10, false, { tap_number: "1" });
  await interval(f, -10, null, false, { tap_number: "1" });
  await interval(f, -14, null, true, { tap_number: "1" });
  await interval(f, -14, null, true, { sku_id: null, label: "Hazy" });
  reconcile(f, (await sale(f, -10, 744)).id);
  expect((await report(f)).rows).toMatchObject([{ expected_bbl: 1.5, excluded_bbl: 1.5, actual_bbl: 2, variance_bbl: -.5, split: true, unattributed_bbl: 0 }]);
  const g = await fixture(); const ga = await count(g, -14, null, 0); await count(g, -7, ga); await coverage(g);
  await interval(g, -14, null); await interval(g, -14, null);
  reconcile(g, (await sale(g, -10)).id);
  expect((await report(g)).rows).toMatchObject([{ expected_bbl: 3, excluded_bbl: 0, split: true }]);
});

it("prior sale boundary excluded and current included once; pending sales excluded, brands and locations cannot bleed", async () => {
  const f = await fixture(); const a = await count(f, -14, null, 0), b = await count(f, -7, a); await count(f, -1, b); await coverage(f);
  for (const d of [-14, -7, -1, 0]) reconcile(f, (await sale(f, d, 248)).id);
  const other = await seedLocation(f.brewery.id, { name: "Elsewhere", kind: "taproom" });
  await ins("pos_locations", { brewery_id: f.brewery.id, connection_id: f.connection.id, external_location_id: "OTHER", location_id: other.id });
  reconcile(f, (await sale(f, -10, 999, { external_location_id: "OTHER" })).id);
  expect((await report(f)).rows).toMatchObject([{ expected_bbl: 2, actual_bbl: 4, variance_bbl: -2 }]);
  const brand = await seedCatalog(f.brewery.id, { product: "Lager", sku: "Lager", packageType: "keg", bblPerUnit: .5 });
  await ins("pos_item_mappings", { brewery_id: f.brewery.id, connection_id: f.connection.id, external_item_id: "lager", sku_id: brand.skuId });
  reconcile(f, (await sale(f, -10, 2, { external_item_id: "lager" })).id);
  expect((await report(f)).rows.find(r => r.brand_id === brand.brandId)).toMatchObject({ expected_bbl: 1, actual_bbl: 0 });
});

it("SQL aggregates beyond 1000 facts without inventory effects and matching counts have zero actual", async () => {
  const f = await fixture(); const a = await count(f, -14, null, 0); await count(f, -7, a, 0); await coverage(f);
  sql(`insert into public.pos_sales(brewery_id,connection_id,external_order_id,external_line_id,external_item_id,external_location_id,sold_at,qty)
    select '${f.brewery.id}','${f.connection.id}',n::text,'line','pint','L','${stamp(f, -10)}',1 from generate_series(1,1005) n`);
  const before = fingerprint(f);
  sql(`select private.reconcile_pos_sale(brewery_id,id) from public.pos_sales where brewery_id='${f.brewery.id}'`);
  expect((await report(f)).rows[0].expected_bbl).toBeCloseTo(1005 * 16 / 3968, 10);
  expect((await report(f)).rows[0].actual_bbl).toBe(0);
  expect(fingerprint(f)).toEqual(before);
  const countId=(await report(f)).periods.at(-1)!.count_id;
  const channel=await channelId(f.brewery.id,"Taproom");
  sql(`with bins as (
    insert into public.bins(brewery_id,location_id,name) select '${f.brewery.id}','${f.location.id}','Bucket '||n from generate_series(1,1005) n returning id
  ), movements as (
    insert into public.inventory_movements(brewery_id,location_id,bin_id,sku_id,qty,type,sale_channel_id,tax_treatment,created_by,ref)
    select '${f.brewery.id}','${f.location.id}',id,'${f.cat.skuId}',-1,'depletion','${channel}','taxable','${f.ctx.userId}','${countId}' from bins returning id,bin_id
  ) insert into public.taproom_count_lines(brewery_id,count_id,location_id,bin_id,sku_id,qty_before,qty_counted,movement_id)
    select '${f.brewery.id}','${countId}','${f.location.id}',bin_id,'${f.cat.skuId}',1,0,id from movements`);
  const after=fingerprint(f);
  expect((await report(f)).rows[0].actual_bbl).toBe(502.5);
  expect(fingerprint(f)).toEqual(after);
});

it("rejects foreign source, format and location ownership, unauthorized reads and direct mutation", async () => {
  const f = await fixture(), g = await fixture(); const a = await count(f, -14, null, 0); await count(f, -7, a); await coverage(f); reconcile(f, (await sale(f, -10)).id);
  for (const role of ["sales", "brewer"] as const) {
    const ctx = await makeStaffCtx(f.brewery.id, role);
    expect((await ctx.db.rpc("get_taproom_variance", { p_brewery: f.brewery.id, p_location: f.location.id, p_weeks: 4 })).error?.code).toBe("42501");
    await expect(runCommand("get_taproom_variance", { locationId: f.location.id, weeks: 4 }, ctx)).rejects.toMatchObject({ code: "permission_denied" });
  }
  expect((await f.ctx.db.rpc("get_taproom_variance", { p_brewery: g.brewery.id, p_location: g.location.id, p_weeks: 4 })).error?.code).toBe("42501");
  for (const p_location of [g.location.id, (await seedLocation(f.brewery.id, { name: "Warehouse" })).id]) expect((await f.ctx.db.rpc("get_taproom_variance", { p_brewery: f.brewery.id, p_location, p_weeks: 4 })).error).not.toBeNull();
  for (const p_weeks of [0, 5, 13, null]) expect((await f.ctx.db.rpc("get_taproom_variance", { p_brewery: f.brewery.id, p_location: f.location.id, p_weeks })).error).not.toBeNull();
  for (const table of ["pos_sale_expectations", "pos_sales_coverage"]) {
    expect((await g.ctx.db.from(table).select("*").eq("brewery_id", f.brewery.id)).data).toEqual([]);
    expect((await f.ctx.db.from(table).select("*").eq("brewery_id", f.brewery.id)).data?.length).toBeGreaterThan(0);
    expect((await f.ctx.db.from(table).insert({ brewery_id: f.brewery.id })).error?.code).toBe("42501");
    expect((await f.ctx.db.from(table).delete().eq("brewery_id", f.brewery.id)).error?.code).toBe("42501");
  }
  expect((await admin.from("pos_item_mappings").insert({ brewery_id: f.brewery.id, connection_id: f.connection.id, external_item_id: "foreign", format_id: g.pour.id })).error?.code).toBe("23503");
  await expect(coverage(f, -14, -7, true, { location_id: g.location.id })).rejects.toThrow();
  const foreignSale = await sale(g, -10); expect(() => reconcile(f, foreignSale.id)).toThrow();
});


it("brewery-local ending dates include the first day exactly, and UTC sale bounds accept both DST offset spellings", async () => {
  const f = await fixture();
  expect((await admin.from("breweries").update({ timezone: "Pacific/Kiritimati" }).eq("id", f.brewery.id)).error).toBeNull();
  const start = sql("select (now() at time zone 'Pacific/Kiritimati')::date-27")[0];
  const priorAt = new Date(`${start}T00:00:00+14:00`);
  priorAt.setUTCDate(priorAt.getUTCDate()-7);
  const endAt = new Date(`${start}T00:00:00+14:00`);
  const first = await ins("taproom_counts", { brewery_id: f.brewery.id, location_id: f.location.id, counted_on: new Date(priorAt.getTime()+14*3600000).toISOString().slice(0,10), created_at: priorAt.toISOString(), counted_by: f.ctx.userId });
  const last = await ins("taproom_counts", { brewery_id: f.brewery.id, location_id: f.location.id, counted_on: start, created_at: endAt.toISOString(), counted_by: f.ctx.userId, prior_count_id: first.id });
  const offset = (at: Date,hours: number) => new Date(at.getTime()-hours*3600000).toISOString().slice(0,19)+`-0${hours}:00`;
  reconcile(f,(await sale(f,-10,248,{sold_at:offset(priorAt,4)})).id);
  reconcile(f,(await sale(f,-10,248,{sold_at:offset(endAt,5)})).id);
  const r=await report(f);
  expect(r.periods.map(p=>p.count_id)).toEqual([last.id]);
  expect(r.rows).toMatchObject([{expected_bbl:1,actual_bbl:0,variance_bbl:1}]);
  expect(r.periods[0].starts_before_window).toBe(true);
});

it("every mapped source must cover the period, and concurrent reconciliation freezes exactly one interpretation", async () => {
  const f=await fixture(); const first=await count(f,-14,null,0); await count(f,-7,first); await coverage(f);
  await ins("pos_locations",{brewery_id:f.brewery.id,connection_id:f.connection.id,external_location_id:"L2",location_id:f.location.id});
  expect((await report(f)).rows).toEqual([]);
  await coverage(f,-14,-7,true,{external_location_id:"L2"});
  expect((await report(f)).rows[0].expected_bbl).toBe(0);
  const s=await sale(f,-10); const before=fingerprint(f);
  const {Client}=await import("pg"); const {DB}=await import("./helpers");
  const a=new Client({connectionString:DB}),b=new Client({connectionString:DB});
  await Promise.all([a.connect(),b.connect()]);
  try {
    await a.query("begin");
    await a.query("select private.reconcile_pos_sale($1,$2)",[f.brewery.id,s.id]);
    const pid=(await b.query("select pg_backend_pid() pid")).rows[0].pid;
    const pending=b.query("select private.reconcile_pos_sale($1,$2)",[f.brewery.id,s.id]);
    await expect.poll(async()=>(await a.query("select wait_event_type from pg_stat_activity where pid=$1",[pid])).rows[0]?.wait_event_type).toBe("Lock");
    await a.query("commit"); await pending;
    expect((await admin.from("pos_sale_expectations").select("sale_id").eq("sale_id",s.id)).data).toHaveLength(1);
    expect((await report(f)).rows[0].expected_bbl).toBe(3);
    const later=await sale(f,-10);
    await a.query("begin"); await a.query("update public.formats set ounces=12 where id=$1",[f.pour.id]);
    const afterEdit=b.query("select private.reconcile_pos_sale($1,$2)",[f.brewery.id,later.id]);
    await expect.poll(async()=>(await a.query("select wait_event_type from pg_stat_activity where pid=$1",[pid])).rows[0]?.wait_event_type).toBe("Lock");
    await a.query("commit"); await afterEdit;
    expect((await report(f)).rows[0].expected_bbl).toBe(5.25);
    expect(fingerprint(f)).toEqual(before);
  } finally {await a.query("rollback"); await Promise.all([a.end(),b.end()]);}
});
