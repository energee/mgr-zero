import { Client } from "pg";
import { DB } from "./helpers";
import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

async function fixture(qty = 7) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "taproom");
  const cat = await seedCatalog(brewery.id, { packageType: "keg", bblPerUnit: 0.5 });
  const location = await seedLocation(brewery.id, { kind: "taproom" });
  if (qty) await ins("inventory_movements", { brewery_id: brewery.id, sku_id: cat.skuId, location_id: location.id, bin_id: location.binId, qty, type: "opening_balance", created_by: ctx.userId });
  const day = sql(`select (now() at time zone 'America/New_York')::date`)[0];
  return { brewery, ctx, cat, location, day };
}

describe("durable explicit taproom counts", () => {
  it("persists a matching count and every explicit line without posting", async () => {
    const f = await fixture();
    const snapshot = await f.ctx.db.rpc("get_taproom_count_snapshot", { p_brewery: f.brewery.id, p_location: f.location.id });
    expect(snapshot.error).toBeNull();
    const input = { locationId: f.location.id, countedOn: f.day, revision: snapshot.data.revision,
      lines: [{ binId: f.location.binId, skuId: f.cat.skuId, lotId: null, qtyCounted: 7 }] };
    const saved = await runCommand("record_taproom_count", input, f.ctx) as { id: string; lines: unknown[] };
    expect(saved.lines).toMatchObject([{ qty_before: 7, qty_counted: 7, movement_id: null }]);
    expect((await admin.from("taproom_counts").select("id").eq("id", saved.id)).data).toHaveLength(1);
    expect((await admin.from("inventory_movements").select("id").eq("brewery_id", f.brewery.id)).data).toHaveLength(1);
  });
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Bucket = { bin_id: string; sku_id: string; lot_id: string | null; qty_before: number };
async function prepare(f: Fixture) {
  const result = await f.ctx.db.rpc("get_taproom_count_snapshot", { p_brewery: f.brewery.id, p_location: f.location.id });
  expect(result.error).toBeNull();
  return result.data as { revision: string; counted_on: string; prior_count: { id: string } | null; lines: Bucket[] };
}
async function args(f: Fixture) {
  const s = await prepare(f);
  return { p_brewery: f.brewery.id, p_location: f.location.id, p_counted_on: f.day, p_revision: s.revision,
    p_lines: s.lines.map(l => ({ bin_id: l.bin_id, sku_id: l.sku_id, lot_id: l.lot_id, qty_counted: l.qty_before })), p_request_id: crypto.randomUUID() };
}
const state = (f: Fixture) => sql(`select (select count(*) from public.taproom_counts where brewery_id='${f.brewery.id}')||':'||
  (select count(*) from public.taproom_count_lines where brewery_id='${f.brewery.id}')||':'||
  (select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}')||':'||
  (select count(*) from private.command_requests where brewery_id='${f.brewery.id}')`);
async function lot(f: Fixture, code: string) {
  const run = await ins("packaging_runs", { brewery_id: f.brewery.id, brand_id: f.cat.brandId, planned_on: f.day, created_by: f.ctx.userId });
  return (await ins("lots", { brewery_id: f.brewery.id, packaging_run_id: run.id, brand_id: f.cat.brandId, code, packaged_on: f.day })).id;
}
async function movement(f: Fixture, qty: number, lotId: string | null = null) {
  return ins("inventory_movements", { brewery_id: f.brewery.id, location_id: f.location.id, bin_id: f.location.binId, sku_id: f.cat.skuId,
    lot_id: lotId, qty, type: qty > 0 ? "opening_balance" : "adjustment", created_by: f.ctx.userId });
}

it("7 remaining to 2 posts exactly -5, freezes tax and volume, and replays before chronology/staleness", async () => {
  const f = await fixture(); const input = await args(f); input.p_lines[0].qty_counted = 2;
  const channel = await admin.from("sale_channels").update({ tax_treatment: "research" }).eq("brewery_id", f.brewery.id).eq("name", "Taproom");
  expect(channel.error).toBeNull();
  const first = await f.ctx.db.rpc("record_taproom_count", input); expect(first.error).toBeNull();
  expect(first.data.lines).toMatchObject([{ qty_before: 7, qty_counted: 2, bbl: -2.5 }]);
  const posted = await admin.from("inventory_movements").select("qty,bbl,type,lot_id,tax_treatment,dest_state,ref").eq("ref", first.data.id);
  expect(posted.data).toEqual([{ qty: -5, bbl: -2.5, type: "depletion", lot_id: null, tax_treatment: "research", dest_state: null, ref: first.data.id }]);
  await admin.from("formats").update({ bbl_per_unit: 0.25 }).eq("id", f.cat.formatId);
  await admin.from("sale_channels").update({ tax_treatment: "taxable" }).eq("brewery_id", f.brewery.id).eq("name", "Taproom");
  await movement(f, 1);
  const before = state(f);
  expect((await f.ctx.db.rpc("record_taproom_count", input)).data).toEqual(first.data);
  expect(await runCommand("get_taproom_count", { countId: first.data.id }, f.ctx)).toEqual(first.data);
  const changed = await f.ctx.db.rpc("record_taproom_count", { ...input, p_lines: [{ ...input.p_lines[0], qty_counted: 1 }] });
  expect(changed.error?.code).toBe("MG409"); expect(state(f)).toEqual(before);
});

it("A4/B2/NULL0 counts A3/B2/NULL0: only A loses one, no raw lot metadata", async () => {
  const f = await fixture(0); const a = await lot(f, "SECRET-A"), b = await lot(f, "SECRET-B");
  await movement(f, 4, a); await movement(f, 2, b); await movement(f, 1); await movement(f, -1);
  const input = await args(f); expect(input.p_lines).toHaveLength(3);
  input.p_lines.find(l => l.lot_id === a)!.qty_counted = 3;
  const saved = await f.ctx.db.rpc("record_taproom_count", input); expect(saved.error).toBeNull();
  expect(saved.data.lines).toHaveLength(3);
  const movements = await admin.from("inventory_movements").select("qty,lot_id").eq("ref", saved.data.id);
  expect(movements.data).toEqual([{ qty: -1, lot_id: a }]);
  const snapshot = await prepare(f);
  expect(snapshot.lines.map(l => [l.lot_id, l.qty_before])).toEqual([[null, 0], ...[a, b].sort().map(id => [id, id === a ? 3 : 2])]);
  expect(JSON.stringify(snapshot)).not.toContain("SECRET");
  expect(Object.keys(snapshot.lines[0]).sort()).toEqual(["bin_id", "bin_name", "lot_id", "qty_before", "sku_id", "sku_name"]);
  expect((await f.ctx.db.from("lots").select("*")).data).toEqual([]);
  expect((await f.ctx.db.from("packaging_runs").select("*")).data).toEqual([]);
});

it("untracked positive stock is a separate exact bucket", async () => {
  const f = await fixture(3); const tracked = await lot(f, "A"); await movement(f, 4, tracked);
  const input = await args(f); input.p_lines.find(l => l.lot_id === null)!.qty_counted = 1;
  const saved = await f.ctx.db.rpc("record_taproom_count", input); expect(saved.error).toBeNull();
  expect((await admin.from("inventory_movements").select("qty,lot_id").eq("ref", saved.data.id)).data).toEqual([{ qty: -2, lot_id: null }]);
  expect((await prepare(f)).lines.find(l => l.lot_id === tracked)?.qty_before).toBe(4);
});

it("rejects every malformed or mismatched bucket atomically", async () => {
  const f = await fixture(); const tracked = await lot(f, "A"); await movement(f, 2, tracked);
  const foreign = await fixture(); const foreignLot = await lot(foreign, "FOREIGN");
  const wh = await seedLocation(f.brewery.id, { name: "Warehouse" });
  const otherSku = await seedCatalog(f.brewery.id, { product: "Other", sku: "Other" });
  const input = await args(f); const line = input.p_lines[0];
  const before = state(f);
  const badLines: unknown[] = [null, {}, [], [line], [...input.p_lines, line],
    [...input.p_lines, { ...line, bin_id: line.bin_id.toUpperCase(), sku_id: line.sku_id.toUpperCase() }],
    [{ sku_id: f.cat.skuId, qty_counted: 5 }],
    ...[-1, 1.5, 100, "NaN", "Infinity", null].map(qty_counted => [{ ...line, qty_counted }, input.p_lines[1]]),
    ...[{ lot_id: foreignLot }, { lot_id: crypto.randomUUID() }, { bin_id: wh.binId }, { bin_id: foreign.location.binId },
      { sku_id: otherSku.skuId }, { sku_id: foreign.cat.skuId }, { lot_id: undefined }].map(change => [{ ...line, ...change }, input.p_lines[1]])];
  for (const p_lines of badLines) {
    const result = await f.ctx.db.rpc("record_taproom_count", { ...input, p_request_id: crypto.randomUUID(), p_lines });
    expect(result.error, JSON.stringify(p_lines)).not.toBeNull(); expect(state(f)).toEqual(before);
  }
  for (const p_location of [wh.id, foreign.location.id]) {
    expect((await f.ctx.db.rpc("record_taproom_count", { ...input, p_location })).error).not.toBeNull();
    expect((await f.ctx.db.rpc("get_taproom_count_snapshot", { p_brewery: f.brewery.id, p_location })).error).not.toBeNull();
  }
  expect(state(f)).toEqual(before);
});

it("permits the next chronological current-day count, rejects same/earlier/future day, and binds prior identity", async () => {
  const f = await fixture(); const stale = await args(f);
  const yesterday = sql(`select (now() at time zone 'America/New_York')::date - 1`)[0];
  const prior = await ins("taproom_counts", { brewery_id: f.brewery.id, location_id: f.location.id, counted_on: yesterday, counted_by: f.ctx.userId });
  expect((await f.ctx.db.rpc("record_taproom_count", stale)).error?.code).toBe("MG409");
  const input = await args(f); const before = state(f);
  for (const p_counted_on of [yesterday, "2000-01-01", "2099-01-01", null]) {
    expect((await f.ctx.db.rpc("record_taproom_count", { ...input, p_counted_on })).error).not.toBeNull(); expect(state(f)).toEqual(before);
  }
  const result = await f.ctx.db.rpc("record_taproom_count", input); expect(result.error).toBeNull();
  expect(result.data.prior_count_id).toBe(prior.id);
  expect((await f.ctx.db.rpc("record_taproom_count", { ...await args(f), p_request_id: crypto.randomUUID() })).error?.message).toContain("already exists");
  expect((await f.ctx.db.rpc("record_taproom_count", input)).data).toEqual(result.data);
});

it("matches without POS or a channel, but missing channel makes depletion fail atomically", async () => {
  const f = await fixture(); await admin.from("sale_channels").delete().eq("brewery_id", f.brewery.id).eq("name", "Taproom");
  const input = await args(f), before = state(f);
  const failed = await f.ctx.db.rpc("record_taproom_count", { ...input, p_lines: [{ ...input.p_lines[0], qty_counted: 2 }] });
  expect(failed.error?.message).toContain("Taproom sale channel"); expect(state(f)).toEqual(before);
  expect((await f.ctx.db.rpc("record_taproom_count", input)).error).toBeNull();
  expect((await admin.from("pos_connections").select("id").eq("brewery_id", f.brewery.id)).data).toEqual([]);
});

it("serializes competing counts and exact concurrent replays", async () => {
  const f = await fixture(); const input = await args(f); input.p_lines[0].qty_counted = 2;
  const results = await Promise.all([input, { ...input, p_request_id: crypto.randomUUID() }].map(i => f.ctx.db.rpc("record_taproom_count", i)));
  expect(results.filter(r => r.error === null)).toHaveLength(1); expect(results.filter(r => r.error !== null)).toHaveLength(1);
  expect(state(f)).toEqual(["1:1:2:1"]);
  const other = await fixture(); const replayInput = await args(other);
  const replays = await Promise.all([0, 1].map(() => other.ctx.db.rpc("record_taproom_count", replayInput)));
  expect(replays[0].error).toBeNull(); expect(replays[1].error).toBeNull(); expect(replays[0].data).toEqual(replays[1].data);
  expect(state(other)).toEqual(["1:1:1:1"]);
});

it("waits for a real concurrent bin transfer, then refuses its stale observation", async () => {
  const f = await fixture(); const input = await args(f); input.p_lines[0].qty_counted = 2;
  const warehouse = await makeStaffCtx(f.brewery.id, "warehouse");
  const bin = await ins("bins", { brewery_id: f.brewery.id, location_id: f.location.id, name: "Transfer destination" });
  const client = new Client({ connectionString: DB }); await client.connect();
  let pending: PromiseLike<unknown> | undefined;
  try {
    await client.query("begin; lock table public.inventory_movements in share row exclusive mode");
    const count = f.ctx.db.rpc("record_taproom_count", input).then(result => result); pending = count;
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const locks = await client.query("select 1 from pg_locks where relation='public.inventory_movements'::regclass and mode='ShareRowExclusiveLock' and not granted");
      if (locks.rowCount) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [warehouse.userId]);
    await client.query("set local role authenticated");
    await client.query("select public.move_stock_bin($1,$2,null,null,null,1,$3,$4,null,$5,null,null)",
      [f.brewery.id, f.cat.skuId, f.location.binId, bin.id, crypto.randomUUID()]);
    await client.query("commit");
    expect((await count).error?.code).toBe("MG409");
    expect((await prepare(f)).lines.map(l => l.qty_before).sort()).toEqual([1, 6]);
    expect((await admin.from("taproom_counts").select("id").eq("brewery_id", f.brewery.id)).data).toEqual([]);
  } finally { await client.query("rollback"); await client.end(); if (pending) await pending; }
});

it("uses all movements and all buckets beyond the API 1000-row ceiling", async () => {
  const f = await fixture(0);
  sql(`insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,qty,type,created_by)
    select '${f.brewery.id}','${f.cat.skuId}','${f.location.id}','${f.location.binId}',1,'opening_balance','${f.ctx.userId}' from generate_series(1,1005)`);
  expect((await prepare(f)).lines[0].qty_before).toBe(1005);
  sql(`with bins as (insert into public.bins(brewery_id,location_id,name)
    select '${f.brewery.id}','${f.location.id}','Bucket '||i from generate_series(1,1001) i returning id)
    insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,qty,type,created_by)
    select '${f.brewery.id}','${f.cat.skuId}','${f.location.id}',id,1,'opening_balance','${f.ctx.userId}' from bins`);
  const input = await args(f); expect(input.p_lines).toHaveLength(1002);
  const result = await f.ctx.db.rpc("record_taproom_count", input); expect(result.error).toBeNull(); expect(result.data.lines).toHaveLength(1002);
  expect((await f.ctx.db.rpc("get_taproom_count", { p_brewery: f.brewery.id, p_count: result.data.id })).data.lines).toHaveLength(1002);
}, 30_000);

it("count tables are append-only with tenant-safe references and direct DML denied", async () => {
  const f = await fixture(), other = await fixture(); const result = await f.ctx.db.rpc("record_taproom_count", await args(f)); expect(result.error).toBeNull();
  for (const client of [f.ctx.db, admin]) for (const table of ["taproom_counts", "taproom_count_lines"]) {
    const id = table === "taproom_counts" ? result.data.id : result.data.lines[0].id;
    expect((await client.from(table).update(table === "taproom_counts" ? { counted_on: f.day } : { qty_counted: 1 }).eq("id", id)).error?.code).toBe("42501");
    expect((await client.from(table).delete().eq("id", id)).error?.code).toBe("42501");
  }
  const row = { brewery_id: f.brewery.id, location_id: f.location.id, counted_on: "2000-01-01", counted_by: f.ctx.userId };
  expect((await f.ctx.db.from("taproom_counts").insert(row)).error?.code).toBe("42501");
  expect((await admin.from("taproom_counts").insert({ ...row, prior_count_id: (await ins("taproom_counts", { ...row, brewery_id: other.brewery.id, location_id: other.location.id })).id })).error?.code).toBe("23503");
  const line = { ...result.data.lines[0] }; delete line.id; delete line.bbl;
  expect((await admin.from("taproom_count_lines").insert({ ...line, count_id: crypto.randomUUID() })).error?.code).toBe("23503");
  expect((await other.ctx.db.rpc("get_taproom_count", { p_brewery: other.brewery.id, p_count: result.data.id })).error?.message).toBe("count not found");
  expect((await other.ctx.db.rpc("record_taproom_count", { ...await args(f) })).error?.code).toBe("42501");
  expect((await other.ctx.db.rpc("get_taproom_count_snapshot", { p_brewery: f.brewery.id, p_location: f.location.id })).error?.code).toBe("42501");
});

it("uses the brewery's current date even when it differs from the database UTC day", async () => {
  const f = await fixture();
  const [zone, localDay, utcDay] = sql(`select zone||','||(now() at time zone zone)::date||','||(now() at time zone 'UTC')::date
    from (values ('Pacific/Kiritimati'),('Pacific/Pago_Pago')) zones(zone)
    where (now() at time zone zone)::date <> (now() at time zone 'UTC')::date limit 1`)[0].split(",");
  expect((await admin.from("breweries").update({ timezone: zone }).eq("id", f.brewery.id)).error).toBeNull();
  const input = await args(f); expect((await prepare(f)).counted_on).toBe(localDay);
  expect((await f.ctx.db.rpc("record_taproom_count", { ...input, p_counted_on: utcDay })).error?.message).toContain("brewery timezone");
  expect((await f.ctx.db.rpc("record_taproom_count", { ...input, p_counted_on: localDay })).error).toBeNull();
});

it("structurally rejects foreign count-line references and NULL-bucket duplicates", async () => {
  const f = await fixture(), foreign = await fixture();
  const otherLot = await lot(foreign, "FOREIGN");
  const otherMovement = await movement(foreign, 1);
  const otherLocation = await seedLocation(f.brewery.id, { name: "Other taproom", kind: "taproom" });
  const header = await ins("taproom_counts", { brewery_id: f.brewery.id, location_id: f.location.id, counted_on: f.day, counted_by: f.ctx.userId });
  const line = { brewery_id: f.brewery.id, count_id: header.id, location_id: f.location.id, bin_id: f.location.binId, sku_id: f.cat.skuId, lot_id: null, qty_before: 7, qty_counted: 7 };
  for (const change of [{ bin_id: foreign.location.binId }, { bin_id: otherLocation.binId }, { sku_id: foreign.cat.skuId },
    { lot_id: otherLot }, { movement_id: otherMovement.id, qty_counted: 6 }, { location_id: otherLocation.id, bin_id: otherLocation.binId }]) {
    expect((await admin.from("taproom_count_lines").insert({ ...line, ...change })).error?.code).toBe("23503");
  }
  expect((await f.ctx.db.from("taproom_count_lines").insert(line)).error?.code).toBe("42501");
  expect((await admin.from("taproom_count_lines").insert(line)).error).toBeNull();
  expect((await admin.from("taproom_count_lines").insert(line)).error?.code).toBe("23505");
});
