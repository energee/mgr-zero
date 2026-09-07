// tests/bins.test.ts — bins are brewery-configured subdivisions of a location; every
// location is born with a trio and can never drop below one. Spec:
// .agents/superpowers/specs/2026-09-06-mgr-locations-bins-transfers-design.md, Decision 1.
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, makeBrewery, makeStaffCtx, seedCatalog } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Row = { id: string; name: string };
type Ctx = { db: SupabaseClient; userId: string; breweryId: string; role: "admin" | "sales" | "warehouse" | "brewer" };

describe("bins", () => {
  let ctx: Ctx;
  beforeAll(async () => { ctx = await makeStaffCtx((await makeBrewery()).id, "admin"); });

  it("create_location seeds Walk-in, Cold and Dry, and accepts the storage kind", async () => {
    const loc = (await runCommand("create_location", { name: "Overflow", kind: "storage" }, ctx)) as Row;
    const { data } = await admin.from("bins").select("name").eq("location_id", loc.id).order("name");
    expect(data!.map((b) => b.name)).toEqual(["Cold", "Dry", "Walk-in"]);
  });

  it("bin names are unique per location, not per brewery", async () => {
    const a = (await runCommand("create_location", { name: "WH A", kind: "warehouse" }, ctx)) as Row;
    const b = (await runCommand("create_location", { name: "WH B", kind: "warehouse" }, ctx)) as Row;
    const dup = await admin.from("bins").insert({ brewery_id: ctx.breweryId, location_id: a.id, name: "Cold" });
    expect(dup.error?.code).toBe("23505");
    const ok = await admin.from("bins").insert({ brewery_id: ctx.breweryId, location_id: b.id, name: "Rack 3" });
    expect(ok.error).toBeNull();
  });

  it("a bin cannot point at another brewery's location", async () => {
    const other = await makeBrewery();
    const loc = (await runCommand("create_location", { name: "Mine", kind: "warehouse" }, ctx)) as Row;
    const { error } = await admin.from("bins").insert({ brewery_id: other.id, location_id: loc.id, name: "Stolen" });
    expect(error?.code).toBe("23503");
  });

  it("list_bins returns a location's bins alphabetically, warehouse can read", async () => {
    const wh = await makeStaffCtx(ctx.breweryId, "warehouse");
    const loc = (await runCommand("create_location", { name: "List WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, wh)) as Row[];
    expect(bins.map((b) => b.name)).toEqual(["Cold", "Dry", "Walk-in"]);
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    expect(((await runCommand("list_bins", { locationId: loc.id }, sales)) as Row[]).length).toBe(3);
  });

  it("create_bin and update_bin are warehouse-or-admin and idempotent by request", async () => {
    const wh = await makeStaffCtx(ctx.breweryId, "warehouse");
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    const loc = (await runCommand("create_location", { name: "Cmd WH", kind: "warehouse" }, ctx)) as Row;
    const bin = (await runCommand("create_bin", { locationId: loc.id, name: "Rack 3" }, wh)) as Row;
    expect(bin.name).toBe("Rack 3");
    const renamed = (await runCommand("update_bin", { binId: bin.id, name: "Rack 3 · top" }, wh)) as Row;
    expect(renamed.name).toBe("Rack 3 · top");
    await expect(runCommand("create_bin", { locationId: loc.id, name: "Nope" }, sales))
      .rejects.toMatchObject({ code: "permission_denied" });
  });

  it("delete_bin removes an empty bin but refuses the last one", async () => {
    const loc = (await runCommand("create_location", { name: "Del WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    await runCommand("delete_bin", { binId: bins[0].id }, ctx);
    await runCommand("delete_bin", { binId: bins[1].id }, ctx);
    await expect(runCommand("delete_bin", { binId: bins[2].id }, ctx))
      .rejects.toMatchObject({ message: expect.stringMatching(/at least one bin/i) });
    const left = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    expect(left).toHaveLength(1);
    const renamed = (await runCommand("update_bin", { binId: left[0].id, name: "Only" }, ctx)) as Row;
    expect(renamed.name).toBe("Only");
  });

  it("a bin belongs to the caller's brewery or the RPC refuses it", async () => {
    const otherCtx = await makeStaffCtx((await makeBrewery()).id, "admin");
    const loc = (await runCommand("create_location", { name: "Tenant WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    await expect(runCommand("update_bin", { binId: bins[0].id, name: "Hijack" }, otherCtx)).rejects.toBeTruthy();
    await expect(runCommand("delete_bin", { binId: bins[0].id }, otherCtx)).rejects.toBeTruthy();
  });
  it("every ledger row names a bin, and the bin must belong to the row's location", async () => {
    const a = (await runCommand("create_location", { name: "Ledger A", kind: "warehouse" }, ctx)) as Row;
    const b = (await runCommand("create_location", { name: "Ledger B", kind: "warehouse" }, ctx)) as Row;
    const [binB] = (await runCommand("list_bins", { locationId: b.id }, ctx)) as Row[];
    const { skuId } = await seedCatalog(ctx.breweryId, { product: "Bin Pils" });
    const { data: mat } = await admin.from("materials").insert({
      brewery_id: ctx.breweryId, name: "Bin malt", category: "malt", base_uom: "lb", purchase_uom: "lb", lot_tracked: false,
    }).select().single();
    const { data: pool } = await admin.from("keg_pools").insert({ brewery_id: ctx.breweryId, name: "Bin pool", kind: "owned" }).select().single();

    // the wrong location for the bin is a FK violation on every ledger, not app code
    const fg = await admin.from("inventory_movements").insert({
      brewery_id: ctx.breweryId, sku_id: skuId, location_id: a.id, bin_id: binB.id, qty: 1, bbl: 0, type: "opening_balance", created_by: ctx.userId,
    });
    expect(fg.error?.code).toBe("23503");
    const mm = await admin.from("material_movements").insert({
      brewery_id: ctx.breweryId, material_id: mat!.id, location_id: a.id, bin_id: binB.id, qty: 5, type: "opening_balance", created_by: ctx.userId,
    });
    expect(mm.error?.code).toBe("23503");
    const ke = await admin.from("keg_events").insert({
      brewery_id: ctx.breweryId, pool_id: pool!.id, keg_size: "sixth_bbl", location_id: a.id, bin_id: binB.id, qty: 3, reason: "acquired", created_by: ctx.userId,
    });
    expect(ke.error?.code).toBe("23503");

    // and a missing bin is rejected outright
    const noBin = await admin.from("material_movements").insert({
      brewery_id: ctx.breweryId, material_id: mat!.id, location_id: a.id, qty: 5, type: "opening_balance", created_by: ctx.userId,
    });
    expect(noBin.error?.code).toBe("23502");
  });

  it("the keg list reads back per pool × size × location: Microstar 36 here, 40 in storage", async () => {
    const wh = (await runCommand("create_location", { name: "Keg WH", kind: "warehouse" }, ctx)) as Row;
    const st = (await runCommand("create_location", { name: "Keg storage", kind: "storage" }, ctx)) as Row;
    const [binW] = (await runCommand("list_bins", { locationId: wh.id }, ctx)) as Row[];
    const [binS] = (await runCommand("list_bins", { locationId: st.id }, ctx)) as Row[];
    const { data: vendor } = await admin.from("vendors").insert({ brewery_id: ctx.breweryId, name: "Microstar" }).select().single();
    const { data: pool } = await admin.from("keg_pools").insert({
      brewery_id: ctx.breweryId, name: "Microstar", kind: "pay_per_fill", vendor_id: vendor!.id, per_fill_cents: 900,
    }).select().single();
    for (const [bin, loc, qty] of [[binW, wh, 36], [binS, st, 40]] as const) {
      const { error } = await admin.from("keg_events").insert({
        brewery_id: ctx.breweryId, pool_id: pool!.id, keg_size: "sixth_bbl", location_id: loc.id, bin_id: bin.id, qty, reason: "acquired", created_by: ctx.userId,
      });
      expect(error).toBeNull();
    }
    // neither keg view is granted to authenticated yet (no registered command reads them), so read as admin
    const { data: rows } = await admin.from("keg_bin_totals").select("location_id, qty").eq("pool_id", pool!.id).order("qty");
    expect(rows!.map((r) => [r.location_id, r.qty])).toEqual([[wh.id, 36], [st.id, 40]]);
    const { data: total } = await admin.from("keg_fleet_totals").select("qty").eq("pool_id", pool!.id).single();
    expect(total!.qty).toBe(76);
  });

  it("record_movement requires a bin and get_bin_on_hand reports per bin while on_hand stays per location", async () => {
    const loc = (await runCommand("create_location", { name: "Split WH", kind: "warehouse" }, ctx)) as Row;
    const [b1, b2] = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    const { skuId } = await seedCatalog(ctx.breweryId, { product: "Split Pils" });
    await expect(runCommand("record_movement", { skuId, locationId: loc.id, qty: 1, type: "opening_balance" }, ctx)).rejects.toBeTruthy();
    await runCommand("record_movement", { skuId, locationId: loc.id, binId: b1.id, qty: 10, type: "opening_balance" }, ctx);
    await runCommand("record_movement", { skuId, locationId: loc.id, binId: b2.id, qty: 5, type: "opening_balance" }, ctx);
    const perBin = (await runCommand("get_bin_on_hand", { skuId }, ctx)) as { bin_id: string; qty: number | string }[];
    expect(perBin.map((r) => [r.bin_id, Number(r.qty)]).sort()).toEqual([[b1.id, 10], [b2.id, 5]].sort());
    const perLoc = (await runCommand("get_on_hand", { skuId }, ctx)) as { qty: number | string }[];
    expect(perLoc).toHaveLength(1);
    expect(Number(perLoc[0].qty)).toBe(15);
  });

  it("delete_bin refuses a bin that ever recorded stock, even at net zero", async () => {
    const loc = (await runCommand("create_location", { name: "Stock WH", kind: "warehouse" }, ctx)) as Row;
    const [bin] = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    const { skuId } = await seedCatalog(ctx.breweryId, { product: "Stock Pils" });
    await runCommand("record_movement", { skuId, locationId: loc.id, binId: bin.id, qty: 2, type: "opening_balance" }, ctx);
    await expect(runCommand("delete_bin", { binId: bin.id }, ctx))
      .rejects.toMatchObject({ message: expect.stringMatching(/recorded stock/i) });
    // Moving it all back out does not lift the refusal: the ledgers are append-only.
    await runCommand("record_movement", { skuId, locationId: loc.id, binId: bin.id, qty: -2, type: "adjustment" }, ctx);
    await expect(runCommand("delete_bin", { binId: bin.id }, ctx))
      .rejects.toMatchObject({ message: expect.stringMatching(/recorded stock/i) });
  });
});
