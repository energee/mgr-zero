import { Client } from "pg";
import { DB } from "./helpers";
import { describe, expect, it } from "vitest";
import { admin, ins, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { countFailureKind } from "@/lib/mgr/taproom-count-state";
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
    const saved = await runCommand("record_taproom_count", input, f.ctx) as { id: string; correction_eligible: boolean; lines: unknown[] };
    expect(saved.lines).toMatchObject([{ qty_before: 7, qty_counted: 7, movement_id: null }]);
    expect(saved.correction_eligible).toBe(false);
    expect((await admin.from("taproom_counts").select("id").eq("id", saved.id)).data).toHaveLength(1);
    expect((await admin.from("inventory_movements").select("id").eq("brewery_id", f.brewery.id)).data).toHaveLength(1);
  });

  it("lists only an owned taproom's newest 50 durable count headers in stable order", async () => {
    const f = await fixture();
    const other = await fixture();
    const warehouse = await seedLocation(f.brewery.id, { name: "Warehouse" });
    sql(`insert into public.taproom_counts(id,brewery_id,location_id,counted_on,counted_by,observed_at,created_at)
      select private.new_uuid(),'${f.brewery.id}','${f.location.id}',date '2026-01-01'+n,'${f.ctx.userId}',timestamptz '2026-01-01 12:00Z'+n*interval '1 day',timestamptz '2026-01-01 12:00Z'+n*interval '1 day'
      from generate_series(0,50) n`);

    const rows = await runCommand("list_taproom_counts", { locationId: f.location.id }, f.ctx) as { counted_on: string }[];
    expect(rows).toHaveLength(50);
    expect(rows[0].counted_on).toBe("2026-02-20");
    expect(rows.at(-1)?.counted_on).toBe("2026-01-02");
    await expect(runCommand("list_taproom_counts", { locationId: other.location.id }, f.ctx)).rejects.toThrow(/owned taproom/);
    await expect(runCommand("list_taproom_counts", { locationId: warehouse.id }, f.ctx)).rejects.toThrow(/owned taproom/);
    for (const role of ["sales", "brewer"] as const) {
      const denied = await makeStaffCtx(f.brewery.id, role);
      await expect(runCommand("list_taproom_counts", { locationId: f.location.id }, denied)).rejects.toMatchObject({ code: "permission_denied" });
    }
  });
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Bucket = { bin_id: string; sku_id: string; lot_id: string | null; qty_before: number; brand_id: string; brand_name: string; bbl_per_unit: number };
type PrintLabel = {
  worksheet_row: number; bin_id: string; bin_name: string; sku_id: string; sku_name: string;
  brand_id: string; brand_name: string; package_volume_label: string;
  lot_id: string | null; lot_code: string | null; qty: number;
};
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

it("prints only current positive tracked and untracked buckets at their original worksheet rows", async () => {
  const f = await fixture(0);
  const binId = (lead: string) => `${lead}${f.brewery.id.slice(1)}`;
  const zeroBin = binId("0"), untrackedBin = binId("1"), trackedBin = binId("2");
  expect((await admin.from("bins").insert([
    { id: zeroBin, brewery_id: f.brewery.id, location_id: f.location.id, name: "A history" },
    { id: trackedBin, brewery_id: f.brewery.id, location_id: f.location.id, name: "B tracked" },
    { id: untrackedBin, brewery_id: f.brewery.id, location_id: f.location.id, name: "C untracked" },
  ])).error).toBeNull();
  const historyLot = await lot(f, "HISTORY-ONLY"), trackedLot = await lot(f, "PRINT-260909");
  for (const row of [
    { bin_id: zeroBin, lot_id: historyLot, qty: 1, type: "opening_balance" },
    { bin_id: zeroBin, lot_id: historyLot, qty: -1, type: "adjustment" },
    { bin_id: trackedBin, lot_id: trackedLot, qty: 2, type: "opening_balance" },
    { bin_id: untrackedBin, lot_id: null, qty: 3, type: "opening_balance" },
  ]) expect(() => insertFixture("inventory_movements", {
    brewery_id: f.brewery.id, location_id: f.location.id, sku_id: f.cat.skuId,
    created_by: f.ctx.userId, ...row,
  })).not.toThrow();
  const foreign = await fixture();
  const foreignLot = await lot(foreign, "FOREIGN-LABEL");
  await movement(foreign, 9, foreignLot);

  const snapshot = await prepare(f);
  expect(snapshot.lines.map(line => [line.bin_id, line.qty_before])).toEqual([
    [zeroBin, 0], [untrackedBin, 3], [trackedBin, 2],
  ]);
  expect((await admin.from("brands").update({ name: "Renamed IPA" }).eq("id", f.cat.brandId)).error).toBeNull();
  expect((await admin.from("skus").update({ name: "Renamed keg" }).eq("id", f.cat.skuId)).error).toBeNull();
  expect((await admin.from("locations").update({ name: "Renamed taproom" }).eq("id", f.location.id)).error).toBeNull();
  const labels = await runCommand("get_taproom_print_labels", { locationId: f.location.id, revision: snapshot.revision }, f.ctx) as PrintLabel[];

  expect(labels).toEqual([
    { worksheet_row: 2, bin_id: untrackedBin, bin_name: "C untracked", sku_id: f.cat.skuId, sku_name: "Renamed keg",
      brand_id: f.cat.brandId, brand_name: "Renamed IPA", package_volume_label: "keg 0.5 bbl",
      lot_id: null, lot_code: null, qty: 3 },
    { worksheet_row: 3, bin_id: trackedBin, bin_name: "B tracked", sku_id: f.cat.skuId, sku_name: "Renamed keg",
      brand_id: f.cat.brandId, brand_name: "Renamed IPA", package_volume_label: "keg 0.5 bbl",
      lot_id: trackedLot, lot_code: "PRINT-260909", qty: 2 },
  ]);
  expect(JSON.stringify(labels)).not.toMatch(/HISTORY-ONLY|FOREIGN-LABEL|packaging_run|packaged_on|best_by|movement|recipient|customer/);
  expect(sql(`select count(*) from private.command_requests where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
});

it("refuses a stale print revision and denies Sales and Brewer at both boundaries", async () => {
  const f = await fixture();
  const snapshot = await prepare(f);
  await movement(f, 1);
  await expect(runCommand("get_taproom_print_labels", { locationId: f.location.id, revision: snapshot.revision }, f.ctx))
    .rejects.toMatchObject({ status: 409 });
  expect(sql(`select count(*) from private.command_requests where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
  for (const role of ["sales", "brewer"] as const) {
    const denied = await makeStaffCtx(f.brewery.id, role);
    await expect(runCommand("get_taproom_print_labels", { locationId: f.location.id, revision: (await prepare(f)).revision }, denied))
      .rejects.toMatchObject({ code: "permission_denied" });
    expect((await denied.db.rpc("get_taproom_print_labels", {
      p_brewery: f.brewery.id, p_location: f.location.id, p_revision: (await prepare(f)).revision,
    })).error?.code).toBe("42501");
  }
});

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

it("corrects the latest mistaken-low count with frozen compensating and replacement legs", async () => {
  const f = await fixture();
  const adminCtx = await makeStaffCtx(f.brewery.id, "admin");
  const input = await args(f); input.p_lines[0].qty_counted = 2;
  const rootResult = await f.ctx.db.rpc("record_taproom_count", input); expect(rootResult.error).toBeNull();
  const root = rootResult.data;
  const originalMovement = (await admin.from("inventory_movements").select("sale_channel_id,tax_treatment,package_type,bin_id,sku_id,lot_id").eq("id", root.lines[0].movement_id).single()).data!;
  const originalHeader = sql(`select to_jsonb(c)::text from public.taproom_counts c where id='${root.id}'`)[0];
  const originalLine = sql(`select to_jsonb(l)::text from public.taproom_count_lines l where id='${root.lines[0].id}'`)[0];
  expect((await admin.from("formats").update({ bbl_per_unit: .25 }).eq("id", f.cat.formatId)).error).toBeNull();
  expect((await admin.from("sale_channels").update({ name: "Bar", tax_treatment: "research" }).eq("id", originalMovement.sale_channel_id)).error).toBeNull();

  const corrected = await runCommand("correct_taproom_count", {
    countId: root.id,
    corrections: [{ lineId: root.lines[0].id, qtyCounted: 4 }],
    reason: "Counted two unopened kegs as empty",
  }, adminCtx) as { root_id: string; effective_id: string; observed_at: string; corrected_at: string; corrected_by: string; lines: { qty_before: number; qty_counted: number; bbl: number | null }[] };

  expect(corrected).toMatchObject({
    root_id: root.id,
    corrected_by: adminCtx.userId,
    lines: [{ qty_before: 7, qty_counted: 4, bbl: -1.5 }],
  });
  expect(corrected.effective_id).not.toBe(root.id);
  expect((await admin.from("inventory_movements")
    .select("qty,bbl,type,compensates_id,correction_source_id,ref,sale_channel_id,tax_treatment,package_type,bin_id,sku_id,lot_id")
    .eq("brewery_id", f.brewery.id).eq("type", "depletion").order("created_at")).data).toEqual([
      expect.objectContaining({ qty: -5, bbl: -2.5, type: "depletion", compensates_id: null, correction_source_id: null, ref: root.id }),
      expect.objectContaining({ qty: 5, bbl: 2.5, type: "depletion", compensates_id: root.lines[0].movement_id, correction_source_id: null, ref: corrected.effective_id }),
      expect.objectContaining({ qty: -3, bbl: -1.5, type: "depletion", compensates_id: null, correction_source_id: root.lines[0].movement_id, ref: corrected.effective_id }),
    ]);
  const frozen = (await admin.from("inventory_movements").select("sale_channel_id,tax_treatment,package_type,bin_id,sku_id,lot_id").eq("ref", corrected.effective_id)).data!;
  expect(frozen).toEqual([originalMovement, originalMovement]);
  expect(sql(`select sum(qty)::numeric::float8 from public.inventory_movements where brewery_id='${f.brewery.id}' and location_id='${f.location.id}'`)).toEqual(["4"]);
  expect(await runCommand("get_taproom_count", { countId: root.id }, f.ctx)).toEqual(corrected);
  const draft = await runCommand("get_taproom_draft_projection", { locationId: f.location.id }, f.ctx) as { prior_count: { id: string }; starts_at: string };
  expect(draft.prior_count.id).toBe(corrected.effective_id);
  expect(new Date(draft.starts_at).toISOString()).toBe(new Date(corrected.observed_at).toISOString());
  expect(await runCommand("list_taproom_counts", { locationId: f.location.id }, f.ctx)).toMatchObject([
    { id: root.id, root_id: root.id, effective_id: corrected.effective_id, corrected_at: corrected.corrected_at, corrected_by: adminCtx.userId,
      observations: 1, movements: 1, depleted_units: 3 },
  ]);
  expect(sql(`select to_jsonb(c)::text from public.taproom_counts c where id='${root.id}'`)).toEqual([originalHeader]);
  expect(sql(`select to_jsonb(l)::text from public.taproom_count_lines l where id='${root.lines[0].id}'`)).toEqual([originalLine]);
});

it("revalidates a committed correction when a root line is appended", async () => {
  const f = await fixture(); const adminCtx = await makeStaffCtx(f.brewery.id, "admin");
  const input = await args(f); input.p_lines[0].qty_counted = 2;
  const rootResult = await f.ctx.db.rpc("record_taproom_count", input); expect(rootResult.error).toBeNull();
  const root = rootResult.data;
  const ordinarySku = await seedCatalog(f.brewery.id, { product: "Ordinary root line", sku: "Ordinary root keg", packageType: "keg", bblPerUnit: .5 });
  expect(() => insertFixture("taproom_count_lines", { brewery_id: f.brewery.id, count_id: root.id, location_id: f.location.id,
    bin_id: f.location.binId, sku_id: ordinarySku.skuId, qty_before: 0, qty_counted: 0 })).not.toThrow();
  const original = root.lines.find((line: { sku_id: string }) => line.sku_id === f.cat.skuId)!;
  const corrected = await runCommand("correct_taproom_count", { countId: root.id,
    corrections: [{ lineId: original.id, qtyCounted: 4 }], reason: "Found two full kegs" }, adminCtx) as { effective_id: string };

  const lateSku = await seedCatalog(f.brewery.id, { product: "Late root line", sku: "Late root keg", packageType: "keg", bblPerUnit: .5 });
  const client = new Client({ connectionString: DB }); await client.connect();
  try {
    await client.query("begin");
    await client.query(`insert into public.taproom_count_lines(brewery_id,count_id,location_id,bin_id,sku_id,qty_before,qty_counted)
      values($1,$2,$3,$4,$5,0,0)`, [f.brewery.id, root.id, f.location.id, f.location.binId, lateSku.skuId]);
    await expect(client.query("commit")).rejects.toThrow(/incomplete taproom correction graph/);
  } finally { await client.query("rollback"); await client.end(); }
  expect(sql(`select (select count(*) from public.taproom_count_lines where count_id='${root.id}')||'|'||
    (select count(*) from public.taproom_count_lines where count_id='${corrected.effective_id}')`)).toEqual(["2|2"]);
});

it("restores the recorded-before quantity with compensation only", async () => {
  const f = await fixture(); const adminCtx = await makeStaffCtx(f.brewery.id, "admin");
  const input = await args(f); input.p_lines[0].qty_counted = 2;
  const rootResult = await f.ctx.db.rpc("record_taproom_count", input); expect(rootResult.error).toBeNull();
  const root = rootResult.data;
  const corrected = await runCommand("correct_taproom_count", {
    countId: root.id, corrections: [{ lineId: root.lines[0].id, qtyCounted: 7 }], reason: "All seven kegs were present",
  }, adminCtx) as { effective_id: string; lines: { qty_counted: number; movement_id: string | null; bbl: number | null }[] };

  expect(corrected.lines).toMatchObject([{ qty_counted: 7, movement_id: null, bbl: null }]);
  expect((await admin.from("inventory_movements").select("qty,compensates_id,correction_source_id").eq("ref", corrected.effective_id)).data)
    .toEqual([{ qty: 5, compensates_id: root.lines[0].movement_id, correction_source_id: null }]);
  expect(sql(`select sum(qty)::numeric::float8 from public.inventory_movements where brewery_id='${f.brewery.id}'`)).toEqual(["7"]);
});

it("copies every root line and counts an unchanged shortage exactly once", async () => {
  const f = await fixture(); const adminCtx = await makeStaffCtx(f.brewery.id, "admin");
  const other = await seedCatalog(f.brewery.id, { product: "Pils", sku: "Pils keg", packageType: "keg", bblPerUnit: .25 });
  await ins("inventory_movements", { brewery_id: f.brewery.id, sku_id: other.skuId, location_id: f.location.id,
    bin_id: f.location.binId, qty: 5, type: "opening_balance", created_by: f.ctx.userId });
  const input = await args(f);
  input.p_lines.find(line => line.sku_id === f.cat.skuId)!.qty_counted = 2;
  input.p_lines.find(line => line.sku_id === other.skuId)!.qty_counted = 3;
  const rootResult = await f.ctx.db.rpc("record_taproom_count", input); expect(rootResult.error).toBeNull();
  const root = rootResult.data;
  const changed = root.lines.find((line: { sku_id: string }) => line.sku_id === f.cat.skuId)!;
  const corrected = await runCommand("correct_taproom_count", {
    countId: root.id, corrections: [{ lineId: changed.id, qtyCounted: 4 }], reason: "Found two full kegs",
  }, adminCtx) as { effective_id: string; lines: { sku_id: string; qty_counted: number; bbl: number | null }[] };

  expect(corrected.lines).toHaveLength(2);
  expect(corrected.lines.find(line => line.sku_id === f.cat.skuId)).toMatchObject({ qty_counted: 4, bbl: -1.5 });
  expect(corrected.lines.find(line => line.sku_id === other.skuId)).toMatchObject({ qty_counted: 3, bbl: -.5 });
  expect(sql(`select -sum(coalesce(bbl,0))::numeric::float8 from private.taproom_effective_counts where effective_id='${corrected.effective_id}'`)).toEqual(["2"]);
  expect((await admin.from("inventory_movements").select("id").eq("ref", corrected.effective_id)).data).toHaveLength(2);
});

it("uses a correction as the next baseline, posts it in the audit period, and leaves a filed snapshot byte-identical", async () => {
  const f = await fixture(); const adminCtx = await makeStaffCtx(f.brewery.id, "admin");
  const historical = sql(`select (date '${f.day}'-40)::text||'|'||date_trunc('month',date '${f.day}'-40)::date||'|'||(date_trunc('month',date '${f.day}'-40)+interval '1 month'-interval '1 day')::date`)[0].split("|");
  const observed = sql(`select ((date '${historical[0]}' + time '12:00') at time zone 'America/New_York')::text`)[0];
  const root = await ins("taproom_counts", { brewery_id: f.brewery.id, location_id: f.location.id, counted_on: historical[0],
    observed_at: observed, created_at: observed, counted_by: f.ctx.userId });
  const channel = (await admin.from("sale_channels").select("id,tax_treatment").eq("brewery_id", f.brewery.id).eq("system_code", "taproom").single()).data!;
  const movementRow = await ins("inventory_movements", { brewery_id: f.brewery.id, sku_id: f.cat.skuId, location_id: f.location.id,
    bin_id: f.location.binId, qty: -5, type: "depletion", sale_channel_id: channel.id, tax_treatment: channel.tax_treatment,
    ref: root.id, created_by: f.ctx.userId, created_at: observed });
  const line = await ins("taproom_count_lines", { brewery_id: f.brewery.id, count_id: root.id, location_id: f.location.id,
    bin_id: f.location.binId, sku_id: f.cat.skuId, qty_before: 7, qty_counted: 2, movement_id: movementRow.id });
  const filing = await runCommand("file_compliance_report", {
    jurisdiction: "TTB", periodStart: historical[1], periodEnd: historical[2], note: "frozen before count correction",
  }, adminCtx) as { id: string };
  const filedBefore = sql(`select figures::text from public.report_filings where id='${filing.id}'`)[0];
  const corrected = await runCommand("correct_taproom_count", {
    countId: root.id, corrections: [{ lineId: line.id, qtyCounted: 4 }], reason: "Found two kegs",
  }, adminCtx) as { effective_id: string };
  expect(sql(`select ((created_at at time zone 'America/New_York')::date between date '${historical[1]}' and date '${historical[2]}')::text
    from public.inventory_movements where id='${movementRow.id}'`)).toEqual(["true"]);
  expect(sql(`select bool_and((created_at at time zone 'America/New_York')::date > date '${historical[2]}')::text
    from public.inventory_movements where ref='${corrected.effective_id}'`)).toEqual(["true"]);
  expect(sql(`select figures::text from public.report_filings where id='${filing.id}'`)).toEqual([filedBefore]);
  const snapshot = await prepare(f);
  expect(snapshot.prior_count?.id).toBe(corrected.effective_id);
  expect(snapshot.lines).toMatchObject([{ qty_before: 4 }]);
  const next = await f.ctx.db.rpc("record_taproom_count", { p_brewery: f.brewery.id, p_location: f.location.id,
    p_counted_on: snapshot.counted_on, p_revision: snapshot.revision,
    p_lines: snapshot.lines.map(row => ({ bin_id: row.bin_id, sku_id: row.sku_id, lot_id: row.lot_id, qty_counted: row.qty_before })),
    p_request_id: crypto.randomUUID() });
  expect(next.error).toBeNull(); expect(next.data.prior_count_id).toBe(corrected.effective_id);
  expect(new Date((await admin.from("taproom_counts").select("observed_at").eq("id", corrected.effective_id).single()).data!.observed_at).toISOString()).toBe(new Date(observed).toISOString());
});

it("rejects invalid correction input, foreign provenance, later roots, and non-Admin callers atomically", async () => {
  const makeRoot = async () => {
    const f = await fixture(); const input = await args(f); input.p_lines[0].qty_counted = 2;
    const saved = await f.ctx.db.rpc("record_taproom_count", input); expect(saved.error).toBeNull();
    return { f, root: saved.data, adminCtx: await makeStaffCtx(f.brewery.id, "admin") };
  };
  const { f, root, adminCtx } = await makeRoot(); const other = await makeRoot(); const before = state(f);
  const bad = [
    [{ line_id: root.lines[0].id, qty_counted: 2 }],
    [{ line_id: root.lines[0].id, qty_counted: 1 }],
    [{ line_id: root.lines[0].id, qty_counted: 8 }],
    [{ line_id: root.lines[0].id, qty_counted: 4 }, { line_id: root.lines[0].id, qty_counted: 5 }],
    [{ line_id: other.root.lines[0].id, qty_counted: 4 }],
  ];
  for (const p_corrections of bad) {
    expect((await adminCtx.db.rpc("correct_taproom_count", { p_brewery: f.brewery.id, p_count: root.id,
      p_corrections, p_reason: "wrong", p_request_id: crypto.randomUUID() })).error).not.toBeNull();
    expect(state(f)).toEqual(before);
  }
  expect((await adminCtx.db.rpc("correct_taproom_count", { p_brewery: f.brewery.id, p_count: root.id,
    p_corrections: [{ line_id: root.lines[0].id, qty_counted: 4 }], p_reason: "   ", p_request_id: crypto.randomUUID() })).error).not.toBeNull();
  await expect(runCommand("correct_taproom_count", { countId: root.id, corrections: [{ lineId: root.lines[0].id, qtyCounted: 4 }], reason: "wrong" }, f.ctx))
    .rejects.toMatchObject({ code: "permission_denied" });
  expect(state(f)).toEqual(before);

  const later = await ins("taproom_counts", { brewery_id: f.brewery.id, location_id: f.location.id,
    counted_on: sql("select current_date+1")[0], observed_at: sql("select (now()+interval '1 day')::text")[0], counted_by: adminCtx.userId });
  expect(later.id).toBeTruthy();
  expect((await adminCtx.db.rpc("correct_taproom_count", { p_brewery: f.brewery.id, p_count: root.id,
    p_corrections: [{ line_id: root.lines[0].id, qty_counted: 4 }], p_reason: "late", p_request_id: crypto.randomUUID() })).error?.code).toBe("MG409");
  expect((await admin.from("taproom_counts").select("id").eq("corrects_count_id", root.id)).data).toEqual([]);

  const broken = await fixture(); const brokenAdmin = await makeStaffCtx(broken.brewery.id, "admin");
  const header = await ins("taproom_counts", { brewery_id: broken.brewery.id, location_id: broken.location.id, counted_on: broken.day, counted_by: broken.ctx.userId });
  const wrongMovement = await ins("inventory_movements", { brewery_id: broken.brewery.id, sku_id: broken.cat.skuId, location_id: broken.location.id,
    bin_id: broken.location.binId, qty: -5, type: "adjustment", ref: header.id, created_by: broken.ctx.userId });
  const brokenLine = await ins("taproom_count_lines", { brewery_id: broken.brewery.id, count_id: header.id, location_id: broken.location.id,
    bin_id: broken.location.binId, sku_id: broken.cat.skuId, qty_before: 7, qty_counted: 2, movement_id: wrongMovement.id });
  expect((await brokenAdmin.db.rpc("correct_taproom_count", { p_brewery: broken.brewery.id, p_count: header.id,
    p_corrections: [{ line_id: brokenLine.id, qty_counted: 4 }], p_reason: "bad provenance", p_request_id: crypto.randomUUID() })).error).not.toBeNull();
  expect((await admin.from("taproom_counts").select("id").eq("corrects_count_id", header.id)).data).toEqual([]);
});

it("replays exactly, rejects changed reuse and revoked Admin, and serializes two PostgreSQL corrections", async () => {
  const f = await fixture(); const adminCtx = await makeStaffCtx(f.brewery.id, "admin"); const input = await args(f); input.p_lines[0].qty_counted = 2;
  const rootResult = await f.ctx.db.rpc("record_taproom_count", input); expect(rootResult.error).toBeNull(); const root = rootResult.data;
  const correction = { countId: root.id, corrections: [{ lineId: root.lines[0].id, qtyCounted: 4 }], reason: "Found two kegs" };
  const requestId = crypto.randomUUID(); const execution = { requestId, correlationId: crypto.randomUUID() };
  const first = await runCommand("correct_taproom_count", correction, adminCtx, execution);
  expect(await runCommand("correct_taproom_count", correction, adminCtx, { requestId, correlationId: crypto.randomUUID() })).toEqual(first);
  await expect(runCommand("correct_taproom_count", { ...correction, reason: "Changed reason" }, adminCtx,
    { requestId, correlationId: crypto.randomUUID() })).rejects.toMatchObject({ status: 409 });
  await expect(runCommand("correct_taproom_count", correction, adminCtx)).rejects.toThrow(/already corrected/);
  await expect(runCommand("correct_taproom_count", { ...correction, countId: (first as { effective_id: string }).effective_id }, adminCtx)).rejects.toThrow(/original count/);
  expect((await admin.from("taproom_counts").select("id").eq("corrects_count_id", root.id)).data).toHaveLength(1);

  expect((await admin.from("brewery_users").update({ role: "warehouse" }).eq("brewery_id", f.brewery.id).eq("user_id", adminCtx.userId)).error).toBeNull();
  expect((await adminCtx.db.rpc("correct_taproom_count", { p_brewery: f.brewery.id, p_count: root.id,
    p_corrections: correction.corrections.map(row => ({ line_id: row.lineId, qty_counted: row.qtyCounted })),
    p_reason: correction.reason, p_request_id: requestId })).error?.code).toBe("42501");

  const race = await fixture(); const racer = await makeStaffCtx(race.brewery.id, "admin"); const raceInput = await args(race); raceInput.p_lines[0].qty_counted = 2;
  const raceRootResult = await race.ctx.db.rpc("record_taproom_count", raceInput); expect(raceRootResult.error).toBeNull(); const raceRoot = raceRootResult.data;
  const a = new Client({ connectionString: DB }), b = new Client({ connectionString: DB }); await Promise.all([a.connect(), b.connect()]);
  const values = [race.brewery.id, raceRoot.id, JSON.stringify([{ line_id: raceRoot.lines[0].id, qty_counted: 4 }]), "Found two kegs"];
  let pending: Promise<unknown> | undefined;
  try {
    await a.query("begin"); await a.query("select set_config('request.jwt.claim.sub',$1,true)", [racer.userId]); await a.query("set local role authenticated");
    await a.query("select public.correct_taproom_count($1,$2,$3::jsonb,$4,$5)", [...values, crypto.randomUUID()]);
    await a.query("reset role");
    await b.query("begin"); await b.query("select set_config('request.jwt.claim.sub',$1,true)", [racer.userId]); await b.query("set local role authenticated");
    const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
    pending = b.query("select public.correct_taproom_count($1,$2,$3::jsonb,$4,$5)", [...values, crypto.randomUUID()]);
    await expect.poll(async () => (await a.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type).toBe("Lock");
    await a.query("commit"); await expect(pending).rejects.toThrow(/already corrected/);
    expect((await admin.from("taproom_counts").select("id").eq("corrects_count_id", raceRoot.id)).data).toHaveLength(1);
  } finally { await a.query("rollback"); await b.query("rollback"); await Promise.all([a.end(), b.end()]); if (pending) await pending.catch(() => undefined); }
});

it("rejects incomplete or corrupted correction graphs at transaction commit", async () => {
  const f = await fixture(); const input = await args(f); input.p_lines[0].qty_counted = 2;
  const rootResult = await f.ctx.db.rpc("record_taproom_count", input); expect(rootResult.error).toBeNull(); const root = rootResult.data;
  const rootLine = root.lines[0];
  const extraSku = await seedCatalog(f.brewery.id, { product: "Extra", sku: "Extra keg", packageType: "keg", bblPerUnit: .5 });
  const historical = await ins("taproom_counts", { brewery_id: f.brewery.id, location_id: f.location.id,
    counted_on: sql(`select (date '${f.day}'-1)::text`)[0], observed_at: sql("select (now()-interval '1 day')::text")[0], counted_by: f.ctx.userId });
  const historicalLine = await ins("taproom_count_lines", { brewery_id: f.brewery.id, count_id: historical.id, location_id: f.location.id,
    bin_id: f.location.binId, sku_id: extraSku.skuId, qty_before: 0, qty_counted: 0 });

  async function rejectAtCommit(build: (client: Client, correctionId: string) => Promise<void>) {
    const client = new Client({ connectionString: DB }); await client.connect(); const correctionId = crypto.randomUUID();
    try {
      await client.query("begin");
      await client.query(`insert into public.taproom_counts(id,brewery_id,location_id,counted_on,counted_by,observed_at,prior_count_id,corrects_count_id,correction_reason)
        select $1,brewery_id,location_id,counted_on,$2,observed_at,prior_count_id,id,'bad graph' from public.taproom_counts where id=$3`,
        [correctionId, f.ctx.userId, root.id]);
      await build(client, correctionId);
      await expect(client.query("commit")).rejects.toThrow(/correction graph/);
    } finally { await client.query("rollback"); await client.end(); }
  }
  async function compensation(client: Client, correctionId: string) {
    const id = crypto.randomUUID();
    await client.query(`insert into public.inventory_movements(id,brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,sale_channel_id,tax_treatment,dest_state,compensates_id,ref,created_by)
      select $1,brewery_id,sku_id,location_id,bin_id,lot_id,-qty,type,sale_channel_id,tax_treatment,dest_state,id,$2,$3 from public.inventory_movements where id=$4`,
      [id, correctionId, f.ctx.userId, rootLine.movement_id]);
    return id;
  }
  async function replacement(client: Client, correctionId: string) {
    const id = crypto.randomUUID();
    await client.query(`insert into public.inventory_movements(id,brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,sale_channel_id,tax_treatment,dest_state,correction_source_id,ref,created_by)
      select $1,brewery_id,sku_id,location_id,bin_id,lot_id,-3,type,sale_channel_id,tax_treatment,dest_state,id,$2,$3 from public.inventory_movements where id=$4`,
      [id, correctionId, f.ctx.userId, rootLine.movement_id]);
    return id;
  }
  async function line(client: Client, correctionId: string, movementId: string | null, qty = 4) {
    await client.query(`insert into public.taproom_count_lines(brewery_id,count_id,location_id,bin_id,sku_id,lot_id,qty_before,qty_counted,movement_id,corrects_line_id)
      select brewery_id,$1,location_id,bin_id,sku_id,lot_id,qty_before,$2,$3,id from public.taproom_count_lines where id=$4`,
      [correctionId, qty, movementId, rootLine.id]);
  }

  const nullReasonClient = new Client({ connectionString: DB }); await nullReasonClient.connect();
  const nullReasonCorrection = crypto.randomUUID();
  try {
    await nullReasonClient.query("begin");
    const transaction = (async () => {
      await nullReasonClient.query(`insert into public.taproom_counts(id,brewery_id,location_id,counted_on,counted_by,observed_at,prior_count_id,corrects_count_id,correction_reason)
        select $1,brewery_id,location_id,counted_on,$2,observed_at,prior_count_id,id,null from public.taproom_counts where id=$3`,
        [nullReasonCorrection, f.ctx.userId, root.id]);
      await compensation(nullReasonClient, nullReasonCorrection);
      const replacementId = await replacement(nullReasonClient, nullReasonCorrection);
      await line(nullReasonClient, nullReasonCorrection, replacementId);
      await nullReasonClient.query("commit");
    })();
    await expect(transaction).rejects.toThrow(/taproom_counts_correction_shape/);
  } finally { await nullReasonClient.query("rollback"); await nullReasonClient.end(); }

  await rejectAtCommit(async () => {}); // header only / missing full replacement
  await rejectAtCommit(async (client, id) => { await compensation(client, id); await replacement(client, id); }); // orphan movements
  await rejectAtCommit(async (client, id) => { await compensation(client, id); await line(client, id, null, 2); }); // unchanged line owns movement
  await rejectAtCommit(async (client, id) => { const movement = await replacement(client, id); await line(client, id, movement); }); // replacement without compensation
  await rejectAtCommit(async (client, id) => {
    await compensation(client, id); const movement = await replacement(client, id); await line(client, id, movement);
    await client.query("update public.inventory_movements set bbl=bbl+1 where id=$1", [movement]);
  });
  await rejectAtCommit(async (client, id) => {
    await compensation(client, id); const movement = await replacement(client, id); await line(client, id, movement);
    await client.query(`insert into public.taproom_count_lines(brewery_id,count_id,location_id,bin_id,sku_id,lot_id,qty_before,qty_counted,corrects_line_id)
      select brewery_id,$1,location_id,bin_id,sku_id,lot_id,qty_before,qty_counted,id from public.taproom_count_lines where id=$2`, [id, historicalLine.id]);
  });
  expect((await admin.from("taproom_counts").select("id").eq("corrects_count_id", root.id)).data).toEqual([]);
});

it("replays the exact request after a committed count response is treated as an inner 500", async () => {
  const f = await fixture();
  const raw = await args(f);
  const input = { locationId: raw.p_location, countedOn: raw.p_counted_on, revision: raw.p_revision,
    lines: raw.p_lines.map(line => ({ binId: line.bin_id, skuId: line.sku_id, lotId: line.lot_id, qtyCounted: line.qty_counted })) };
  const first = await runCommand("record_taproom_count", input, f.ctx, { requestId: raw.p_request_id, correlationId: crypto.randomUUID() });
  expect(countFailureKind(500, "database error")).toBe("unknown");
  const replay = await runCommand("record_taproom_count", input, f.ctx, { requestId: raw.p_request_id, correlationId: crypto.randomUUID() });

  expect(replay).toEqual(first);
  expect(state(f)).toEqual(["1:1:1:1"]);
});

it("snapshot carries authoritative brand volume and a pre-submit format change stales its revision", async () => {
  const f = await fixture();
  const input = await args(f);
  const snapshot = await prepare(f);
  expect(snapshot.lines[0]).toMatchObject({ brand_id: f.cat.brandId, brand_name: "IPA", bbl_per_unit: .5 });
  await admin.from("formats").update({ bbl_per_unit: .25 }).eq("id", f.cat.formatId);
  const changed = await f.ctx.db.rpc("record_taproom_count", input);
  expect(changed.error?.code).toBe("MG409");
  expect(state(f)).toEqual(["0:0:1:0"]);
});

it("A4/B2/NULL0 counts A3/B2/NULL0: only A loses one, no raw lot metadata", async () => {
  const f = await fixture(0); const a = await lot(f, "SECRET-A"), b = await lot(f, "SECRET-B");
  await movement(f, 4, a); await movement(f, 2, b); await movement(f, 1); await movement(f, -1);
  const input = await args(f); expect(input.p_lines).toHaveLength(3);
  input.p_lines.find(l => l.lot_id === a)!.qty_counted = 3;
  const saved = await f.ctx.db.rpc("record_taproom_count", input); expect(saved.error).toBeNull();
  expect(saved.data.lines).toHaveLength(3);
  expect(saved.data.lines.map((line: { lot_id: string | null }) => line.lot_id)).toEqual([null, ...[a, b].sort()]);
  const movements = await admin.from("inventory_movements").select("qty,lot_id").eq("ref", saved.data.id);
  expect(movements.data).toEqual([{ qty: -1, lot_id: a }]);
  const snapshot = await prepare(f);
  expect(snapshot.lines.map(l => [l.lot_id, l.qty_before])).toEqual([[null, 0], ...[a, b].sort().map(id => [id, id === a ? 3 : 2])]);
  expect(JSON.stringify(snapshot)).not.toContain("SECRET");
  expect(Object.keys(snapshot.lines[0]).sort()).toEqual(["bbl_per_unit", "bin_id", "bin_name", "brand_id", "brand_name", "lot_id", "qty_before", "sku_id", "sku_name"]);
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
  const f = await fixture(); await admin.from("sale_channels").delete().eq("brewery_id", f.brewery.id).eq("system_code", "taproom");
  const input = await args(f), before = state(f);
  const failed = await f.ctx.db.rpc("record_taproom_count", { ...input, p_lines: [{ ...input.p_lines[0], qty_counted: 2 }] });
  expect(failed.error?.message).toContain("Taproom sale channel"); expect(state(f)).toEqual(before);
  expect((await f.ctx.db.rpc("record_taproom_count", input)).error).toBeNull();
  expect((await admin.from("pos_connections").select("id").eq("brewery_id", f.brewery.id)).data).toEqual([]);
});

it("depletes after the taproom channel is renamed", async () => {
  const f = await fixture();
  expect((await admin.from("sale_channels").update({ name: "Bar" }).eq("brewery_id", f.brewery.id).eq("system_code", "taproom")).error).toBeNull();
  const input = await args(f); input.p_lines[0].qty_counted = 2;
  const saved = await f.ctx.db.rpc("record_taproom_count", input);
  expect(saved.error).toBeNull();
  const channel = await admin.from("sale_channels").select("id").eq("brewery_id", f.brewery.id).eq("system_code", "taproom").single();
  const movements = await admin.from("inventory_movements").select("qty,sale_channel_id").eq("ref", saved.data.id);
  expect(movements.data).toEqual([{ qty: -5, sale_channel_id: channel.data!.id }]);
});

it("refuses a warehouse-location count header", async () => {
  const f = await fixture();
  const wh = await seedLocation(f.brewery.id, { name: "Count warehouse" });
  expect(() => insertFixture("taproom_counts", {
    brewery_id: f.brewery.id, location_id: wh.id, counted_on: f.day, counted_by: f.ctx.userId,
  })).toThrow();
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
  const receipt = (await f.ctx.db.rpc("get_taproom_count", { p_brewery: f.brewery.id, p_count: result.data.id })).data;
  expect(receipt.lines).toHaveLength(1002);
  expect(receipt.lines.every((line: { bin_name?: string; sku_name?: string }) => line.bin_name && line.sku_name)).toBe(true);
  expect(new Set(receipt.lines.map((line: { bin_name: string }) => line.bin_name)).size).toBe(1002);
  expect(await runCommand("list_taproom_counts", { locationId: f.location.id }, f.ctx)).toMatchObject([
    { id: result.data.id, observations: 1002, movements: 0, depleted_units: 0 },
  ]);
}, 30_000);

it("count tables are append-only with tenant-safe references and direct DML denied", async () => {
  const f = await fixture(), other = await fixture(); const result = await f.ctx.db.rpc("record_taproom_count", await args(f)); expect(result.error).toBeNull();
  for (const client of [f.ctx.db, admin]) for (const table of ["taproom_counts", "taproom_count_lines"]) {
    const id = table === "taproom_counts" ? result.data.id : result.data.lines[0].id;
    expect((await client.from(table).update(table === "taproom_counts" ? { counted_on: f.day } : { qty_counted: 1 }).eq("id", id)).error?.code).toBe("42501");
    expect((await client.from(table).delete().eq("id", id)).error?.code).toBe("42501");
  }
  const movementId = result.data.lines[0].movement_id ?? (await admin.from("inventory_movements").select("id").eq("brewery_id", f.brewery.id).limit(1).single()).data!.id;
  for (const client of [f.ctx.db, admin]) {
    expect((await client.from("inventory_movements").update({ qty: 99 }).eq("id", movementId)).error?.code).toBe("42501");
    expect((await client.from("inventory_movements").delete().eq("id", movementId)).error?.code).toBe("42501");
  }
  const row = { brewery_id: f.brewery.id, location_id: f.location.id, counted_on: "2000-01-01", counted_by: f.ctx.userId };
  expect((await f.ctx.db.from("taproom_counts").insert(row)).error?.code).toBe("42501");
  const foreignPrior = await ins("taproom_counts", { ...row, brewery_id: other.brewery.id, location_id: other.location.id });
  expect(() => insertFixture("taproom_counts", { ...row, prior_count_id: foreignPrior.id })).toThrow(/SQLSTATE 23503/);
  const line = { ...result.data.lines[0] }; delete line.id; delete line.bbl;
  delete line.effective_line_id;
  delete line.bin_name; delete line.sku_name;
  expect(() => insertFixture("taproom_count_lines", { ...line, count_id: crypto.randomUUID() })).toThrow(/SQLSTATE 23503/);
  expect((await other.ctx.db.rpc("get_taproom_count", { p_brewery: other.brewery.id, p_count: result.data.id })).error?.message).toBe("count not found");
  expect((await other.ctx.db.rpc("record_taproom_count", { ...await args(f) })).error?.code).toBe("42501");
  expect((await other.ctx.db.rpc("get_taproom_count_snapshot", { p_brewery: f.brewery.id, p_location: f.location.id })).error?.code).toBe("42501");
  expect(sql(`select has_table_privilege('authenticated','private.taproom_effective_counts','select'),
    has_table_privilege('service_role','private.taproom_effective_counts','select'),
    has_function_privilege('authenticated','private.validate_taproom_correction_graph(uuid)','execute'),
    has_function_privilege('service_role','private.validate_taproom_correction_graph(uuid)','execute')`)).toEqual(["f|f|f|f"]);
});

it("denies service-role INSERT and every mutation privilege on the count correction surfaces", async () => {
  const f = await fixture();
  const fixtureCountId = crypto.randomUUID();
  sql(`insert into public.taproom_counts(id,brewery_id,location_id,counted_on,counted_by)
    values ('${fixtureCountId}','${f.brewery.id}','${f.location.id}',date '1999-12-31','${f.ctx.userId}')`);
  expect((await admin.from("inventory_movements").insert({
    brewery_id: f.brewery.id, sku_id: f.cat.skuId, location_id: f.location.id, bin_id: f.location.binId,
    qty: 1, type: "opening_balance", created_by: f.ctx.userId,
  })).error?.code).toBe("42501");
  expect((await admin.from("taproom_counts").insert({
    brewery_id: f.brewery.id, location_id: f.location.id, counted_on: "1999-12-30", counted_by: f.ctx.userId,
  })).error?.code).toBe("42501");
  expect((await admin.from("taproom_count_lines").insert({
    brewery_id: f.brewery.id, count_id: fixtureCountId, location_id: f.location.id,
    bin_id: f.location.binId, sku_id: f.cat.skuId, qty_before: 7, qty_counted: 7,
  })).error?.code).toBe("42501");
  expect(sql(`select string_agg(relname||':'||
      has_table_privilege('service_role',format('public.%I',relname),'insert')||':'||
      has_table_privilege('service_role',format('public.%I',relname),'update')||':'||
      has_table_privilege('service_role',format('public.%I',relname),'delete')||':'||
      has_table_privilege('service_role',format('public.%I',relname),'truncate'),',' order by relname)
    from (values ('inventory_movements'),('taproom_count_lines'),('taproom_counts')) tables(relname)`))
    .toEqual(["inventory_movements:false:false:false:false,taproom_count_lines:false:false:false:false,taproom_counts:false:false:false:false"]);
  expect(sql(`select has_table_privilege('service_role','public.pos_sales','insert'),
    has_table_privilege('service_role','public.pos_sales','update'),has_table_privilege('service_role','public.pos_sales','delete'),
    has_table_privilege('service_role','public.pos_sales','truncate')`)).toEqual(["t|f|f|f"]);
});

it("uses the brewery's current date even when it differs from the database UTC day", async () => {
  const f = await fixture();
  const [zone, localDay, utcDay] = sql(`select zone||','||(now() at time zone zone)::date||','||(now() at time zone 'UTC')::date
    from (values ('Pacific/Kiritimati'),('Pacific/Pago_Pago')) zones(zone)
    where (now() at time zone zone)::date <> (now() at time zone 'UTC')::date limit 1`)[0].split(",");
  expect((await admin.from("breweries").update({ timezone: zone }).eq("id", f.brewery.id)).error).toBeNull();
  const input = await args(f); expect((await prepare(f)).counted_on).toBe(localDay);
  const expired = (await f.ctx.db.rpc("record_taproom_count", { ...input, p_counted_on: utcDay })).error;
  expect(expired).toMatchObject({ code: "MG409" });
  expect(expired?.message).toContain("brewery timezone");
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
    expect(() => insertFixture("taproom_count_lines", { ...line, ...change })).toThrow(/SQLSTATE 23503/);
  }
  expect((await f.ctx.db.from("taproom_count_lines").insert(line)).error?.code).toBe("42501");
  expect(() => insertFixture("taproom_count_lines", line)).not.toThrow();
  expect(() => insertFixture("taproom_count_lines", line)).toThrow(/SQLSTATE 23505/);
});
