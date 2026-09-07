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
