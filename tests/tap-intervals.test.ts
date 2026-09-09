import { Client } from "pg";
import { expect, it } from "vitest";
import { DB, admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

async function fixture() {
  const brewery = await makeBrewery(), ctx = await makeStaffCtx(brewery.id, "taproom");
  const cat = await seedCatalog(brewery.id, { packageType: "keg", bblPerUnit: .5 });
  const location = await seedLocation(brewery.id, { kind: "taproom" });
  return { brewery, ctx, cat, location };
}
type F = Awaited<ReturnType<typeof fixture>>;
const input = (f: F) => ({ p_brewery: f.brewery.id, p_location: f.location.id, p_sku: f.cat.skuId, p_label: null, p_nominal_bbl: null, p_tap_number: null, p_opening_fill: 1, p_request_id: crypto.randomUUID() });
const state = (f: F) => sql(`select (select count(*) from public.tap_intervals where brewery_id='${f.brewery.id}')||':'||(select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}')||':'||(select count(*) from private.command_requests where brewery_id='${f.brewery.id}')`);
const fingerprint = (f: F) => sql(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.inventory_movements t where brewery_id='${f.brewery.id}'; select md5(coalesce(jsonb_agg(to_jsonb(t) order by request_id)::text,'')) from private.command_requests t where brewery_id='${f.brewery.id}'`);
async function open(f: F) { const r = await f.ctx.db.rpc("tap_keg", input(f)); expect(r.error).toBeNull(); return r.data; }
const close = (f: F, id: string) => ({ p_brewery: f.brewery.id, p_interval: id, p_closing_fill: 0, p_reason: "Empty", p_request_id: crypto.randomUUID() });
const swap = (f: F, id: string) => ({ ...close(f,id), p_sku: null, p_label: null, p_nominal_bbl: null, p_tap_number: null, p_opening_fill: 1 });

it("opens packaged kegs with frozen nominal volume, stock flag, optional repeatable numbers and complete read", async () => {
  const f = await fixture(); const i = input(f);
  const first = await f.ctx.db.rpc("tap_keg", i); expect(first.error).toBeNull();
  expect(first.data).toMatchObject({ sku_id: f.cat.skuId, nominal_bbl: .5, not_in_inventory: true, opening_fill: 1, opened_by: f.ctx.userId });
  await ins("inventory_movements", { brewery_id: f.brewery.id, sku_id: f.cat.skuId, location_id: f.location.id, bin_id: f.location.binId, qty: 2, type: "opening_balance", created_by: f.ctx.userId });
  for (const opening_fill of [.25,.5,.6,1]) {
    const r = await f.ctx.db.rpc("tap_keg", { ...input(f), p_tap_number: "1", p_opening_fill: opening_fill });
    expect(r.error).toBeNull(); expect(r.data.not_in_inventory).toBe(false);
  }
  expect((await admin.from("formats").update({ bbl_per_unit: .25 }).eq("id", f.cat.formatId)).error).toBeNull();
  expect((await f.ctx.db.rpc("tap_keg", i)).data).toEqual(first.data);
  const rows = await runCommand("list_open_taps", { locationId: f.location.id }, f.ctx) as { nominal_bbl: number; tap_number: string | null }[];
  expect(rows).toHaveLength(5); expect(rows.every(r => r.nominal_bbl === .5)).toBe(true); expect(rows.at(-1)?.tap_number).toBeNull();
  expect(state(f)).toEqual(["5:1:5"]);
});

it("atomically swaps, defaults own SKU, replays frozen identity after later close and rejects changed payload", async () => {
  const f = await fixture(), a = await open(f), i = swap(f,a.id);
  const b = await f.ctx.db.rpc("swap_keg", i); expect(b.error).toBeNull();
  expect(b.data.outgoing).toMatchObject({ id: a.id, closed_by: f.ctx.userId, closing_fill: 0 });
  expect(b.data.incoming.sku_id).toBe(f.cat.skuId);
  expect((await f.ctx.db.rpc("swap_keg", swap(f,b.data.incoming.id))).error).toBeNull();
  expect((await f.ctx.db.rpc("swap_keg", i)).data).toEqual(b.data);
  const before = state(f);
  expect((await f.ctx.db.rpc("swap_keg", { ...i, p_reason: "Different" })).error?.code).toBe("MG409");
  expect((await f.ctx.db.rpc("swap_keg", { ...i, p_request_id: crypto.randomUUID() })).error?.code).toBe("MG409");
  expect(state(f)).toEqual(before);
});

it("validates incoming identity after closing within the transaction, with no partial close or claimed request", async () => {
  const f = await fixture(), foreign = await fixture(), a = await open(f), before = state(f), effects = fingerprint(f);
  for (const change of [{ p_sku: foreign.cat.skuId }, { p_sku: crypto.randomUUID() }, { p_label: "ambiguous" }, { p_opening_fill: .75 }, { p_nominal_bbl: .5 }]) {
    expect((await f.ctx.db.rpc("swap_keg", { ...swap(f,a.id), ...change })).error).not.toBeNull();
    expect(state(f)).toEqual(before); expect(fingerprint(f)).toEqual(effects);
    expect((await admin.from("tap_intervals").select("closed_at").eq("id",a.id).single()).data?.closed_at).toBeNull();
  }
});

it("guests require explicit label and finite size, and never fabricate a SKU", async () => {
  const f = await fixture();
  const i = { ...input(f), p_sku: null, p_label: "Guest cider", p_nominal_bbl: .5 };
  const a = await f.ctx.db.rpc("tap_keg", i); expect(a.error).toBeNull();
  expect(a.data).toMatchObject({ sku_id: null, label: "Guest cider", nominal_bbl: .5, not_in_inventory: true });
  expect((await f.ctx.db.rpc("swap_keg", swap(f,a.data.id))).error).not.toBeNull();
  expect((await f.ctx.db.rpc("swap_keg", { ...swap(f,a.data.id), p_label: "Next guest", p_nominal_bbl: .25 })).error).toBeNull();
  for (const change of [{ p_label: null }, { p_label: " " }, { p_nominal_bbl: 0 }, { p_nominal_bbl: "NaN" }, { p_nominal_bbl: "Infinity" }]) {
    expect((await f.ctx.db.rpc("tap_keg", { ...i, ...change, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
  }
});

it("serializes two swaps and kick versus swap: exactly one close and at most one incoming", async () => {
  for (const rival of ["swap_keg", "kick_keg"]) {
    const f = await fixture(), a = await open(f);
    const results = await Promise.all([f.ctx.db.rpc("swap_keg", swap(f,a.id)), f.ctx.db.rpc(rival, rival === "swap_keg" ? swap(f,a.id) : close(f,a.id))]);
    expect(results.filter(r => !r.error)).toHaveLength(1); expect(results.filter(r => r.error?.code === "MG409")).toHaveLength(1);
    const rows = await admin.from("tap_intervals").select("id,closed_at").eq("brewery_id",f.brewery.id);
    expect(rows.data?.filter(r => r.closed_at)).toHaveLength(1); expect(rows.data!.length).toBeLessThanOrEqual(2);
  }
});

it("rejects foreign locations, nonkeg SKUs, invalid fills and direct DML, preserving ledger and request state", async () => {
  const f = await fixture(), other = await fixture(), a = await open(f);
  const can = await seedCatalog(f.brewery.id, { product: "Can", sku: "Can" });
  const warehouse = await seedLocation(f.brewery.id, { name: "Warehouse" });
  const before = state(f);
  for (const change of [{ p_location: other.location.id }, { p_location: warehouse.id }, { p_sku: can.skuId }, { p_sku: "bad" }, { p_opening_fill: 0 }, { p_opening_fill: null }, { p_sku: other.cat.skuId }, { p_nominal_bbl: .25 }])
    expect((await f.ctx.db.rpc("tap_keg", { ...input(f), ...change })).error).not.toBeNull();
  for (const p_closing_fill of [.6,1,.75,null]) expect((await f.ctx.db.rpc("kick_keg", { ...close(f,a.id), p_closing_fill })).error).not.toBeNull();
  expect((await other.ctx.db.rpc("kick_keg", close(f,a.id))).error?.code).toBe("42501");
  expect((await other.ctx.db.rpc("kick_keg", { ...close(other,a.id) })).error).not.toBeNull();
  for (const role of ["sales","brewer"] as const) {
    const ctx = await makeStaffCtx(f.brewery.id,role);
    expect((await ctx.db.rpc("tap_keg",input(f))).error?.code).toBe("42501");
    expect((await ctx.db.rpc("kick_keg",close(f,a.id))).error?.code).toBe("42501");
    expect((await ctx.db.rpc("list_open_taps",{ p_brewery: f.brewery.id,p_location:f.location.id })).error?.code).toBe("42501");
  }
  for (const role of ["admin","warehouse"] as const) {
    const ctx = await makeStaffCtx(f.brewery.id,role);
    const r = await ctx.db.rpc("tap_keg",input(f)); expect(r.error).toBeNull();
    expect((await ctx.db.rpc("kick_keg",close(f,r.data.id))).error).toBeNull();
  }
  expect((await f.ctx.db.from("tap_intervals").insert({})).error?.code).toBe("42501");
  expect((await f.ctx.db.from("tap_intervals").update({ label: "bad" }).eq("id",a.id)).error?.code).toBe("42501");
  expect((await f.ctx.db.from("tap_intervals").delete().eq("id",a.id)).error?.code).toBe("42501");
  expect(before).toEqual(["1:0:1"]);
  expect(state(f)).toEqual(["3:0:5"]);
});

it("returns every open interval beyond 1000 and bounded closed history without private user fields", async () => {
  const f = await fixture();
  sql(`insert into public.tap_intervals(brewery_id,location_id,label,nominal_bbl,opening_fill,not_in_inventory,opened_by)
    select '${f.brewery.id}','${f.location.id}','Guest '||i,.5,1,true,'${f.ctx.userId}' from generate_series(1,1005) i`);
  const rows = await runCommand("list_open_taps", { locationId: f.location.id }, f.ctx) as { id: string }[];
  expect(rows).toHaveLength(1005);
  for (const r of rows.slice(0,3)) expect((await f.ctx.db.rpc("kick_keg", close(f,r.id))).error).toBeNull();
  const history = await runCommand("list_tap_history", { locationId: f.location.id }, f.ctx) as unknown[];
  expect(history).toHaveLength(3); expect(JSON.stringify(history)).not.toMatch(/email|password|metadata|@test.local/);
  expect(history[0]).toHaveProperty("closed_by_label");
  sql(`insert into public.tap_intervals(brewery_id,location_id,label,nominal_bbl,opening_fill,not_in_inventory,opened_by,closed_at,closed_by,closing_fill,close_reason)
    select '${f.brewery.id}','${f.location.id}','Closed '||i,.5,1,true,'${f.ctx.userId}',now(),'${f.ctx.userId}',0,'Empty' from generate_series(1,55) i`);
  expect(await runCommand("list_tap_history", { locationId:f.location.id }, f.ctx)).toHaveLength(50);
  const stale = await f.ctx.db.rpc("kick_keg", close(f, rows[0].id));
  expect(stale.error).toMatchObject({ code: "MG409" });
  expect(stale.error?.message).toMatch(/already closed.*@.* at /i);
  expect(stale.error?.message).not.toContain(f.ctx.userId);
  expect((await runCommand("list_open_taps", { locationId: f.location.id }, f.ctx) as unknown[])).toHaveLength(1002);
});

it("rechecks role before successful replay and canonicalizes UUIDs and trimmed input", async () => {
  const f = await fixture(), i = input(f);
  const first = await f.ctx.db.rpc("tap_keg",i); expect(first.error).toBeNull();
  expect((await f.ctx.db.rpc("tap_keg", { ...i, p_sku: i.p_sku.toUpperCase(), p_location: i.p_location.toUpperCase() })).data).toEqual(first.data);
  expect((await admin.from("brewery_users").update({ role: "sales" }).eq("user_id",f.ctx.userId).eq("brewery_id",f.brewery.id)).error).toBeNull();
  expect((await f.ctx.db.rpc("tap_keg",i)).error?.code).toBe("42501");
  expect(state(f)).toEqual(["1:0:1"]);
});


it("competing swap and kick connections wait for the outgoing row and cannot close it twice", async () => {
  for (const operation of ["swap_keg", "kick_keg"]) {
  const f = await fixture(), a = await open(f), client = new Client({ connectionString: DB });
  await client.connect(); let pending: PromiseLike<unknown> | undefined;
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [f.ctx.userId]);
    await client.query("set local role authenticated");
    const b = await client.query("select public.swap_keg($1,$2,0,'Empty',null,null,null,null,1,$3) result", [f.brewery.id,a.id,crypto.randomUUID()]);
    const rival = f.ctx.db.rpc(operation,operation === "swap_keg" ? swap(f,a.id) : close(f,a.id)).then(r => r); pending = rival;
    let waiting = false;
    for (let i=0;i<100;i++) {
      const locks = sql("select 1 from pg_locks where locktype='transactionid' and not granted");
      if (locks.length) { waiting=true; break; }
      await new Promise(resolve => setTimeout(resolve,10));
    }
    expect(waiting).toBe(true);
    await client.query("commit");
    expect((await rival).error?.code).toBe("MG409");
    const rows = await runCommand("list_open_taps",{ locationId:f.location.id },f.ctx) as { id:string }[];
    expect(rows.map(r=>r.id)).toEqual([b.rows[0].result.incoming.id]);
  } finally { await client.query("rollback"); await client.end(); if(pending) await pending; }
  }
});


it("freezes the format version committed before its opening lock, not a stale pre-lock value", async () => {
  const f = await fixture(), client = new Client({ connectionString: DB });
  await client.connect(); let pending: PromiseLike<unknown> | undefined;
  try {
    await client.query("begin");
    await client.query("update public.formats set bbl_per_unit=.25 where id=$1",[f.cat.formatId]);
    const opening = f.ctx.db.rpc("tap_keg",input(f)).then(r=>r); pending=opening;
    let waiting=false;
    for(let i=0;i<100;i++) {
      if(sql("select 1 from pg_locks where locktype='transactionid' and not granted").length) { waiting=true; break; }
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    expect(waiting).toBe(true); await client.query("commit");
    const result=await opening; expect(result.error).toBeNull(); expect(result.data.nominal_bbl).toBe(.25);
    expect((await admin.from("formats").update({bbl_per_unit:.5}).eq("id",f.cat.formatId)).error).toBeNull();
    expect((await admin.from("tap_intervals").select("nominal_bbl").eq("id",result.data.id).single()).data?.nominal_bbl).toBe(.25);
  } finally { await client.query("rollback"); await client.end(); if(pending) await pending; }
});

it("freezes the authoritative composed packaged keg volume too", async () => {
  const f = await fixture();
  const child = await ins("formats",{brewery_id:f.brewery.id,name:"Keg component",basis:"packaged",package_type:"keg",bbl_per_unit:.25});
  expect((await admin.from("formats").update({bbl_per_unit:null}).eq("id",f.cat.formatId)).error).toBeNull();
  await ins("format_components",{brewery_id:f.brewery.id,parent_format_id:f.cat.formatId,child_format_id:child.id,qty:2});
  const a=await open(f); expect(a.nominal_bbl).toBe(.5);
  expect((await admin.from("formats").update({bbl_per_unit:.5}).eq("id",child.id)).error).toBeNull();
  expect((await admin.from("tap_intervals").select("nominal_bbl").eq("id",a.id).single()).data?.nominal_bbl).toBe(.5);
  expect((await open(f)).nominal_bbl).toBe(1);
});

it("tenant foreign keys reject foreign locations and SKUs even through fixture inserts", async () => {
  const f=await fixture(), other=await fixture();
  const row={brewery_id:f.brewery.id,location_id:f.location.id,sku_id:f.cat.skuId,nominal_bbl:.5,opening_fill:1,not_in_inventory:true,opened_by:f.ctx.userId};
  for(const change of [{location_id:other.location.id},{sku_id:other.cat.skuId}])
    expect((await admin.from("tap_intervals").insert({...row,...change})).error?.code).toBe("23503");
});
