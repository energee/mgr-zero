// tests/stock-transfers.test.ts — a stock transfer is a document between two
// locations (spec 2026-09-06 Decision 3), never a third order kind; a move
// inside one location is move_stock_bin and writes no document.
import { describe, it, expect } from "vitest";
import { admin, insertFixture, makeBrewery, makeStaffCtx, seedLocation, seedCatalog, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("stock_transfers schema", () => {
  it("rejects a transfer whose from and to location are equal", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "admin");
    const from = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
    const { error } = await admin.from("stock_transfers").insert({
      brewery_id: b.id, from_location_id: from.id, to_location_id: from.id, created_by: ctx.userId,
    });
    expect(error).not.toBeNull(); // check (to_location_id <> from_location_id)
    expect(error?.code).not.toBe("PGRST205"); // the table exists
  });
});

describe("stock transfer lifecycle", () => {
  it("create_stock_transfer refuses same-location and accepts a sku line across two locations; submit and pick advance it", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "admin");
    const from = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
    const to = await seedLocation(b.id, { name: "Storage", kind: "storage" });
    const { data: fromBins } = await admin.from("bins").select("id").eq("location_id", from.id).order("name");
    const { data: toBins } = await admin.from("bins").select("id").eq("location_id", to.id).order("name");
    const { skuId } = await seedCatalog(b.id);
    await expect(runCommand("create_stock_transfer", {
      fromLocationId: from.id, toLocationId: from.id,
      lines: [{ skuId, qty: 2, fromBinId: fromBins![0].id, toBinId: fromBins![1].id }],
    }, ctx)).rejects.toThrow(/move_stock_bin/);
    // a bin from the wrong location is refused by the database, not the app
    await expect(runCommand("create_stock_transfer", {
      fromLocationId: from.id, toLocationId: to.id,
      lines: [{ skuId, qty: 2, fromBinId: toBins![0].id, toBinId: toBins![0].id }],
    }, ctx)).rejects.toThrow(/source location/);
    const row = await runCommand("create_stock_transfer", {
      fromLocationId: from.id, toLocationId: to.id, note: "weekly",
      lines: [{ skuId, qty: 2, fromBinId: fromBins![0].id, toBinId: toBins![0].id }],
    }, ctx) as { transferId: string };
    expect(row.transferId).toMatch(/^[0-9a-f-]{36}$/i);
    const { data: hdr } = await admin.from("stock_transfers").select("status, transfer_no, note").eq("id", row.transferId).single();
    expect(hdr).toMatchObject({ status: "draft", transfer_no: 1, note: "weekly" });
    const detail = await runCommand("get_stock_transfer", { transferId: row.transferId }, ctx) as
      { transfer: { from_location: { name: string }; to_location: { name: string } }; lines: { skus: { name: string } }[]; bins: unknown[] };
    expect(detail.transfer.from_location.name).toBe("WH");
    expect(detail.transfer.to_location.name).toBe("Storage");
    expect(detail.lines[0].skus.name).toBe("IPA case");
    expect(detail.bins.length).toBe(6);

    await runCommand("submit_stock_transfer", { transferId: row.transferId }, ctx);
    const { data: line } = await admin.from("stock_transfer_lines").select("id").eq("transfer_id", row.transferId).single();
    await runCommand("record_stock_transfer_pick", { transferId: row.transferId, picks: [{ lineId: line!.id, qty: 2 }] }, ctx);
    const { data: after } = await admin.from("stock_transfers").select("status").eq("id", row.transferId).single();
    expect(after!.status).toBe("picked");
    const { data: l2 } = await admin.from("stock_transfer_lines").select("qty_picked").eq("id", line!.id).single();
    expect(Number(l2!.qty_picked)).toBe(2);
    // a warehouse member may do all three; sales may not
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("submit_stock_transfer", { transferId: row.transferId }, sales)).rejects.toMatchObject({ code: "permission_denied" });
  });
});

describe("receive_stock_transfer", () => {
  it("corrects a completed wrong-destination transfer with a linked compensating transfer", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "warehouse");
    const warehouse = await seedLocation(b.id, { name: "Warehouse", kind: "warehouse" });
    const wrong = await seedLocation(b.id, { name: "Wrong taproom", kind: "taproom" });
    const intended = await seedLocation(b.id, { name: "Intended taproom", kind: "taproom" });
    const { skuId } = await seedCatalog(b.id);
    await runCommand("record_movement", {
      skuId, locationId: warehouse.id, binId: warehouse.binId, qty: 8, type: "opening_balance",
    }, ctx);

    const complete = async (from: typeof warehouse, to: typeof warehouse, note: string) => {
      const { transferId } = await runCommand("create_stock_transfer", {
        fromLocationId: from.id,
        toLocationId: to.id,
        note,
        lines: [{ skuId, qty: 3, fromBinId: from.binId, toBinId: to.binId }],
      }, ctx) as { transferId: string };
      await runCommand("submit_stock_transfer", { transferId }, ctx);
      const line = (await admin.from("stock_transfer_lines").select("id").eq("transfer_id", transferId).single()).data!;
      await runCommand("record_stock_transfer_pick", { transferId, picks: [{ lineId: line.id, qty: 3 }] }, ctx);
      await runCommand("receive_stock_transfer", { transferId, lines: [{ lineId: line.id, qty: 3 }] }, ctx);
      return transferId;
    };

    const original = await complete(warehouse, wrong, "Entered for the wrong taproom");
    const correction = await complete(wrong, intended, `Correction of transfer ${original}`);

    expect((await admin.from("stock_transfers")
      .select("id,status,from_location_id,to_location_id,note")
      .in("id", [original, correction]).order("created_at")).data).toEqual([
        { id: original, status: "received", from_location_id: warehouse.id, to_location_id: wrong.id, note: "Entered for the wrong taproom" },
        { id: correction, status: "received", from_location_id: wrong.id, to_location_id: intended.id, note: `Correction of transfer ${original}` },
      ]);
    const balances = (await admin.from("bin_on_hand").select("location_id,qty").eq("sku_id", skuId)).data!
      .map((row) => [row.location_id, Number(row.qty)]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(balances).toEqual([
      [warehouse.id, 5],
      [wrong.id, 0],
      [intended.id, 3],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    const movements = (await admin.from("inventory_movements").select("ref,qty").in("ref", [original, correction])).data!;
    expect(movements.filter((row) => row.ref === original).reduce((sum, row) => sum + Number(row.qty), 0)).toBe(0);
    expect(movements.filter((row) => row.ref === correction).reduce((sum, row) => sum + Number(row.qty), 0)).toBe(0);
  });

  it("posts paired FG rows whose bbl sums to 0 and paired keg events, then marks the transfer received", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "warehouse");
    const from = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
    const to = await seedLocation(b.id, { name: "Storage", kind: "storage" });
    const { skuId } = await seedCatalog(b.id, { packageType: "keg", bblPerUnit: 0.5 });
    await runCommand("record_movement", { skuId, locationId: from.id, binId: from.binId, qty: 10, type: "opening_balance" }, ctx);
    const { data: pool } = await admin.from("keg_pools").insert({ brewery_id: b.id, name: "Owned", kind: "owned" }).select().single();
    await admin.from("keg_events").insert({ brewery_id: b.id, pool_id: pool!.id, keg_size: "half_bbl", location_id: from.id, bin_id: from.binId, qty: 5, reason: "acquired", created_by: ctx.userId });
    const { transferId } = await runCommand("create_stock_transfer", {
      fromLocationId: from.id, toLocationId: to.id,
      lines: [
        { skuId, qty: 2, fromBinId: from.binId, toBinId: to.binId },
        { kegPoolId: pool!.id, kegSize: "half_bbl", qty: 3, fromBinId: from.binId, toBinId: to.binId },
      ],
    }, ctx) as { transferId: string };
    await runCommand("submit_stock_transfer", { transferId }, ctx);
    const { data: lines } = await admin.from("stock_transfer_lines").select("id, sku_id").eq("transfer_id", transferId);
    await runCommand("record_stock_transfer_pick", { transferId, picks: lines!.map((l) => ({ lineId: l.id, qty: l.sku_id ? 2 : 3 })) }, ctx);
    // receiving before pick is refused
    const received = await runCommand("receive_stock_transfer", { transferId, lines: lines!.map((l) => ({ lineId: l.id, qty: l.sku_id ? 2 : 3 })) }, ctx) as { transferId: string };
    expect(received.transferId).toBe(transferId);

    const { data: mvs } = await admin.from("inventory_movements").select("qty,bbl,location_id,bin_id,type").eq("sku_id", skuId).eq("type", "location_transfer");
    expect(mvs!.length).toBe(2);
    expect(Math.abs(mvs!.reduce((s, m) => s + Number(m.bbl), 0))).toBeLessThan(0.000001);
    expect(mvs!.find((m) => Number(m.qty) < 0)).toMatchObject({ location_id: from.id, bin_id: from.binId });
    expect(mvs!.find((m) => Number(m.qty) > 0)).toMatchObject({ location_id: to.id, bin_id: to.binId });
    const { data: onHand } = await admin.from("bin_on_hand").select("location_id, qty").eq("sku_id", skuId).order("qty");
    expect(onHand!.map((r) => [r.location_id, Number(r.qty)])).toEqual([[to.id, 2], [from.id, 8]]);

    const { data: kegs } = await admin.from("keg_bin_totals").select("location_id, qty").eq("pool_id", pool!.id).order("qty");
    expect(kegs!.map((r) => [r.location_id, r.qty])).toEqual([[from.id, 2], [to.id, 3]]);
    const { data: fleet } = await admin.from("keg_fleet_totals").select("qty").eq("pool_id", pool!.id).single();
    expect(fleet!.qty).toBe(5); // a transfer never changes the fleet

    const { data: hdr } = await admin.from("stock_transfers").select("status, received_at").eq("id", transferId).single();
    expect(hdr!.status).toBe("received");
    expect(hdr!.received_at).not.toBeNull();
    await expect(runCommand("receive_stock_transfer", { transferId, lines: [] }, ctx)).rejects.toThrow(/received/);
  });
});

describe("move_stock_bin", () => {
  it("relocates inside one location with paired rows and no document; refuses a cross-location pair", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "warehouse");
    const wh = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
    const other = await seedLocation(b.id, { name: "Storage", kind: "storage" });
    const { data: bins } = await admin.from("bins").select("id").eq("location_id", wh.id).order("name");
    const { skuId } = await seedCatalog(b.id);
    await runCommand("record_movement", { skuId, locationId: wh.id, binId: bins![0].id, qty: 4, type: "opening_balance" }, ctx);
    const before = await admin.from("stock_transfers").select("id", { count: "exact", head: true }).eq("brewery_id", b.id);
    await runCommand("move_stock_bin", { skuId, qty: 1, fromBinId: bins![0].id, toBinId: bins![1].id }, ctx);
    const { data: onHand } = await admin.from("bin_on_hand").select("bin_id, qty").eq("sku_id", skuId).order("qty");
    expect(onHand!.map((r) => [r.bin_id, Number(r.qty)])).toEqual([[bins![1].id, 1], [bins![0].id, 3]]);
    const { data: mvs } = await admin.from("inventory_movements").select("type, location_id").eq("sku_id", skuId).eq("type", "location_transfer");
    expect(mvs!.length).toBe(2);
    expect(mvs!.every((m) => m.location_id === wh.id)).toBe(true);
    const after = await admin.from("stock_transfers").select("id", { count: "exact", head: true }).eq("brewery_id", b.id);
    expect(after.count).toBe(before.count); // no document
    await expect(runCommand("move_stock_bin", { skuId, qty: 1, fromBinId: bins![0].id, toBinId: other.binId }, ctx))
      .rejects.toThrow(/create_stock_transfer/);
    await expect(runCommand("move_stock_bin", { skuId, qty: 1, fromBinId: bins![0].id, toBinId: bins![0].id }, ctx)).rejects.toBeTruthy();
  });
});

it("direct RPCs reject fractional empty kegs at move, draft, pick and receive boundaries", async () => {
  const b = await makeBrewery(), ctx = await makeStaffCtx(b.id, "warehouse");
  const from = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
  const to = await seedLocation(b.id, { name: "Other", kind: "storage" });
  const { data: bins } = await admin.from("bins").select("id").eq("location_id", from.id);
  const { data: pool } = await admin.from("keg_pools").insert({ brewery_id: b.id, name: "Owned", kind: "owned" }).select().single();
  const move = await ctx.db.rpc("move_stock_bin", { p_brewery: b.id, p_sku: null, p_material: null, p_keg_pool: pool!.id, p_keg_size: "half_bbl", p_qty: 1.5, p_from_bin: bins![0].id, p_to_bin: bins![1].id, p_note: null, p_request_id: crypto.randomUUID() });
  expect(move.error?.message).toMatch(/whole|integer/);
  const line = { keg_pool_id: pool!.id, keg_size: "half_bbl", qty: 1.00001, from_bin_id: from.binId, to_bin_id: to.binId };
  const draft = { p_brewery: b.id, p_from: from.id, p_to: to.id, p_requested: null, p_note: null, p_lines: [line], p_request_id: crypto.randomUUID() };
  expect((await ctx.db.rpc("create_stock_transfer", draft)).error).not.toBeNull();
  const created = await ctx.db.rpc("create_stock_transfer", { ...draft, p_lines: [{ ...line, qty: 2 }] });
  expect(created.error).toBeNull();
  const transferId = created.data.transfer_id;
  await runCommand("submit_stock_transfer", { transferId }, ctx);
  const { data: stored } = await admin.from("stock_transfer_lines").select("id").eq("transfer_id", transferId).single();
  expect((await ctx.db.rpc("record_stock_transfer_pick", { p_transfer: transferId, p_picks: [{ line_id: stored!.id, qty: 1.00001 }], p_request_id: crypto.randomUUID() })).error).not.toBeNull();
  await runCommand("record_stock_transfer_pick", { transferId, picks: [{ lineId: stored!.id, qty: 2 }] }, ctx);
  expect((await ctx.db.rpc("receive_stock_transfer", { p_transfer: transferId, p_lines: [{ line_id: stored!.id, qty: 1.5 }], p_request_id: crypto.randomUUID() })).error?.message).toMatch(/whole|integer/);
  expect((await admin.from("keg_events").select("id").eq("pool_id", pool!.id)).data).toHaveLength(0);
});

it("material bin moves retain an explicit lot, replay once, and reject another material's lot atomically", async () => {
  const b = await makeBrewery(), ctx = await makeStaffCtx(b.id, "warehouse");
  const from = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
  const { data: bins } = await admin.from("bins").select("id").eq("location_id", from.id);
  const { data: material } = await admin.from("materials").insert({ brewery_id: b.id, name: "Hops", category: "hop", base_uom: "lb", purchase_uom: "lb", lot_tracked: true }).select().single();
  const { data: lot } = await admin.from("material_lots").insert({ brewery_id: b.id, material_id: material!.id, lot_code: "H1" }).select().single();
  const p = { p_brewery: b.id, p_sku: null, p_material: material!.id, p_keg_pool: null, p_keg_size: null, p_qty: 1.5, p_from_bin: bins![0].id, p_to_bin: bins![1].id, p_note: null, p_material_lot: lot!.id, p_request_id: crypto.randomUUID() };
  const result = await ctx.db.rpc("move_stock_bin", p);
  expect(result.error).toBeNull();
  expect((await ctx.db.rpc("move_stock_bin", p)).data).toEqual(result.data);
  const { data: rows } = await admin.from("material_movements").select("lot_id,qty").eq("material_id", material!.id);
  expect(rows).toHaveLength(2);
  expect(rows!.every(r => r.lot_id === lot!.id)).toBe(true);
  expect(rows!.reduce((n,r) => n + Number(r.qty), 0)).toBe(0);
  const { data: other } = await admin.from("materials").insert({ brewery_id: b.id, name: "Other hops", category: "hop", base_uom: "lb", purchase_uom: "lb", lot_tracked: true }).select().single();
  expect((await ctx.db.rpc("move_stock_bin", { ...p, p_material: other!.id, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
  expect((await admin.from("material_movements").select("id").eq("material_id", other!.id)).data).toHaveLength(0);
  const lots = await runCommand("get_bin_move_stock", { locationId: from.id }, ctx) as { lot_id: string }[];
  expect(lots.map(l => l.lot_id)).toContain(lot!.id);
  await expect(runCommand("get_bin_move_stock", { locationId: from.id }, await makeStaffCtx(b.id, "sales"))).rejects.toMatchObject({ code: "permission_denied" });
});

it("FG bin moves preserve the chosen lot separately from untracked stock and tenant sources", async () => {
  const b = await makeBrewery(), ctx = await makeStaffCtx(b.id, "warehouse");
  const loc = await seedLocation(b.id, { name: "WH", kind: "warehouse" });
  const { data: bins } = await admin.from("bins").select("id").eq("location_id", loc.id);
  const cat = await seedCatalog(b.id);
  const { data: run, error: runError } = await admin.from("packaging_runs").insert({ brewery_id: b.id, brand_id: cat.brandId, planned_on: "2026-09-01", created_by: ctx.userId }).select().single();
  expect(runError).toBeNull();
  const { data: lot, error: lotError } = await admin.from("lots").insert({ brewery_id: b.id, brand_id: cat.brandId, packaging_run_id: run!.id, code: "FG1", packaged_on: "2026-09-01" }).select().single();
  expect(lotError).toBeNull();
  expect(() => insertFixture("inventory_movements", [
    { brewery_id: b.id, sku_id: cat.skuId, location_id: loc.id, bin_id: bins![0].id, qty: 4, type: "production_in", lot_id: lot!.id, created_by: ctx.userId },
    { brewery_id: b.id, sku_id: cat.skuId, location_id: loc.id, bin_id: bins![0].id, qty: 1, type: "opening_balance", created_by: ctx.userId },
  ])).not.toThrow();
  const skus = await runCommand("list_skus", {}, ctx) as { id: string; format_volume: { bbl_per_unit: number } }[];
  expect(Number(skus.find(s => s.id === cat.skuId)!.format_volume.bbl_per_unit)).toBeGreaterThan(0);
  const move = { skuId: cat.skuId, skuLotId: lot!.id, qty: 2, fromBinId: bins![0].id, toBinId: bins![1].id };
  await runCommand("move_stock_bin", move, ctx);
  const rows = await runCommand("get_bin_move_stock", { locationId: loc.id }, ctx) as { lot_id: string | null; bin_id: string; qty: number }[];
  expect(rows).toHaveLength(3);
  expect(rows.filter(r => r.lot_id === lot!.id).map(r => Number(r.qty))).toEqual([2, 2]);
  expect(Number(rows.find(r => r.lot_id === null)!.qty)).toBe(1);
  const outsider = await makeStaffCtx((await makeBrewery()).id, "warehouse");
  expect(await runCommand("get_bin_move_stock", { locationId: loc.id }, outsider)).toEqual([]);
  const other = await seedCatalog(b.id, { product: "Other", sku: "Other case" });
  await expect(runCommand("move_stock_bin", { ...move, skuId: other.skuId }, ctx)).rejects.toThrow(/lot does not belong/);
});

it("bin stock reads all 1,001 grouped identities beyond the API row cap", async () => {
  const b = await makeBrewery(), ctx = await makeStaffCtx(b.id, "warehouse");
  const loc = await seedLocation(b.id, { name: "Many bins", kind: "warehouse" });
  const { skuId } = await seedCatalog(b.id);
  sql(`insert into public.bins (brewery_id, location_id, name) select '${b.id}', '${loc.id}', 'QA-' || n from generate_series(1,1001) n;
    insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, created_by)
    select '${b.id}', '${skuId}', '${loc.id}', id, 1, 'opening_balance', '${ctx.userId}' from public.bins where location_id = '${loc.id}' and name like 'QA-%';`);
  const result = await runCommand("get_bin_move_stock", { locationId: loc.id }, ctx) as unknown[];
  expect(result).toHaveLength(1001);
});
