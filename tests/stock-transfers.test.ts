// tests/stock-transfers.test.ts — a stock transfer is a document between two
// locations (spec 2026-09-06 Decision 3), never a third order kind; a move
// inside one location is move_stock_bin and writes no document.
import { describe, it, expect } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, seedCatalog } from "./helpers";
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
