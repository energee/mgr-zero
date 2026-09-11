// tests/commands-inventory.test.ts — exercises the command handlers with a real RLS-bound Ctx.
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx, channelId } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type EntityWithId = { id: string };
type OnHandRow = { qty: number | string };

describe("inventory commands", () => {
  let ctx: any;
  beforeAll(async () => {
    ctx = await makeStaffCtx((await makeBrewery()).id);
  });

  it("full flow: brand -> format -> sku -> location -> movement -> on_hand", async () => {
    const p = (await runCommand("upsert_brand", { name: "Pils" }, ctx)) as EntityWithId;
    const f = (await runCommand("upsert_format", { name: "1/6 bbl keg", basis: "packaged", packageType: "keg", kegSize: "sixth_bbl", bblPerUnit: 0.16666667 }, ctx)) as EntityWithId;
    const s = (await runCommand("create_sku", { brandId: p.id, formatId: f.id }, ctx)) as EntityWithId;
    const l = (await runCommand("create_location", { name: "WH", kind: "warehouse" }, ctx)) as EntityWithId;
    const [bin] = (await runCommand("list_bins", { locationId: l.id }, ctx)) as EntityWithId[];
    await runCommand("record_movement", { skuId: s.id, locationId: l.id, binId: bin.id, qty: 12, type: "opening_balance" }, ctx);
    const oh = (await runCommand("get_on_hand", { skuId: s.id }, ctx)) as OnHandRow[];
    expect(Number(oh[0].qty)).toBe(12);
  });

  it("record_movement surfaces CHECK failure for unclassified sale_removal", async () => {
    const p = (await runCommand("upsert_brand", { name: "Stout" }, ctx)) as EntityWithId;
    const f = (await runCommand("upsert_format", { name: "1/2 bbl keg", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5 }, ctx)) as EntityWithId;
    const s = (await runCommand("create_sku", { brandId: p.id, formatId: f.id }, ctx)) as EntityWithId;
    const l = (await runCommand("create_location", { name: "WH2", kind: "warehouse" }, ctx)) as EntityWithId;
    const [bin] = (await runCommand("list_bins", { locationId: l.id }, ctx)) as EntityWithId[];
    const wholesale = await channelId(ctx.breweryId, "Wholesale");
    await expect(runCommand("record_movement", { skuId: s.id, locationId: l.id, binId: bin.id, qty: -1, type: "sale_removal", saleChannelId: wholesale }, ctx))
      .rejects.toThrow();
  });

  it("records every supported manual movement with exact signs, classification, and barrel volume", async () => {
    const brand = (await runCommand("upsert_brand", { name: "Movement matrix" }, ctx)) as EntityWithId;
    const format = (await runCommand("upsert_format", {
      name: "Movement matrix case", basis: "packaged", packageType: "can", unitsPerCase: 24, bblPerUnit: 0.05,
    }, ctx)) as EntityWithId;
    const sku = (await runCommand("create_sku", { brandId: brand.id, formatId: format.id }, ctx)) as EntityWithId;
    const location = (await runCommand("create_location", { name: "Movement matrix warehouse", kind: "warehouse" }, ctx)) as EntityWithId;
    const [bin] = (await runCommand("list_bins", { locationId: location.id }, ctx)) as EntityWithId[];
    const wholesale = await channelId(ctx.breweryId, "Wholesale");
    const movements = [
      { type: "opening_balance", qty: 20 },
      { type: "production_in", qty: 2 },
      { type: "adjustment", qty: 1 },
      { type: "depletion", qty: -1, saleChannelId: wholesale },
      { type: "return_in", qty: 1 },
      { type: "destruction", qty: -1 },
      { type: "loss", qty: -1 },
      { type: "sample", qty: -1, destState: "PA" },
      { type: "festival_removal", qty: -1, destState: "NJ" },
    ] as const;
    for (const movement of movements) {
      await runCommand("record_movement", { skuId: sku.id, locationId: location.id, binId: bin.id, ...movement }, ctx);
    }

    const { data, error } = await ctx.db.from("inventory_movements")
      .select("type, qty, bbl, sale_channel_id, tax_treatment, dest_state")
      .eq("brewery_id", ctx.breweryId).eq("sku_id", sku.id).order("created_at");
    expect(error).toBeNull();
    expect(data?.map((row: any) => ({
      type: row.type, qty: Number(row.qty), bbl: Number(row.bbl), channel: row.sale_channel_id, tax: row.tax_treatment, state: row.dest_state,
    }))).toEqual([
      { type: "opening_balance", qty: 20, bbl: 1, channel: null, tax: null, state: null },
      { type: "production_in", qty: 2, bbl: 0.1, channel: null, tax: null, state: null },
      { type: "adjustment", qty: 1, bbl: 0.05, channel: null, tax: null, state: null },
      { type: "depletion", qty: -1, bbl: -0.05, channel: wholesale, tax: "taxable", state: null },
      { type: "return_in", qty: 1, bbl: 0.05, channel: null, tax: null, state: null },
      { type: "destruction", qty: -1, bbl: -0.05, channel: null, tax: null, state: null },
      { type: "loss", qty: -1, bbl: -0.05, channel: null, tax: null, state: null },
      { type: "sample", qty: -1, bbl: -0.05, channel: null, tax: null, state: "PA" },
      { type: "festival_removal", qty: -1, bbl: -0.05, channel: null, tax: null, state: "NJ" },
    ]);

    const before = data!.length;
    const invalid = [
      { type: "opening_balance", qty: -1 },
      { type: "production_in", qty: -1 },
      { type: "return_in", qty: -1 },
      { type: "depletion", qty: 1, saleChannelId: wholesale },
      { type: "depletion", qty: -1 },
      { type: "loss", qty: -1, saleChannelId: wholesale },
      { type: "sample", qty: -1 },
      { type: "festival_removal", qty: -1, destState: "pa" },
      { type: "adjustment", qty: 1, destState: "PA" },
    ] as const;
    for (const movement of invalid) {
      await expect(runCommand("record_movement", {
        skuId: sku.id, locationId: location.id, binId: bin.id, ...movement,
      }, ctx)).rejects.toThrow();
    }
    expect((await ctx.db.from("inventory_movements").select("id", { count: "exact", head: true })
      .eq("brewery_id", ctx.breweryId).eq("sku_id", sku.id)).count).toBe(before);
  });

  it("keeps a referenced SKU, location, and bin legible after edits and blocks new movement on the inactive SKU", async () => {
    const brand = (await runCommand("upsert_brand", { name: "Archive history" }, ctx)) as EntityWithId;
    const format = (await runCommand("upsert_format", {
      name: "Archive case", basis: "packaged", packageType: "can", unitsPerCase: 24, bblPerUnit: 0.01,
    }, ctx)) as EntityWithId;
    const sku = (await runCommand("create_sku", { brandId: brand.id, formatId: format.id, name: "Archive IPA case" }, ctx)) as EntityWithId;
    const location = (await runCommand("create_location", { name: "Old warehouse", kind: "warehouse" }, ctx)) as EntityWithId;
    const [bin] = (await runCommand("list_bins", { locationId: location.id }, ctx)) as EntityWithId[];
    await runCommand("record_movement", { skuId: sku.id, locationId: location.id, binId: bin.id, qty: 3, type: "opening_balance" }, ctx);

    await runCommand("update_location", { locationId: location.id, name: "Historical warehouse", kind: "storage" }, ctx);
    await runCommand("update_bin", { binId: bin.id, name: "Historical rack" }, ctx);
    await runCommand("update_sku", { skuId: sku.id, active: false }, ctx);

    expect(await runCommand("get_inventory_sku", { skuId: sku.id }, ctx)).toMatchObject({
      id: sku.id, name: "Archive IPA case", active: false,
    });
    expect(await runCommand("list_movements", { skuId: sku.id, limit: 50, offset: 0 }, ctx)).toEqual([
      expect.objectContaining({
        sku_id: sku.id, qty: 3, type: "opening_balance",
        locations: { name: "Historical warehouse" }, bins: { name: "Historical rack" },
      }),
    ]);
    await expect(runCommand("delete_bin", { binId: bin.id }, ctx))
      .rejects.toThrow(/recorded stock|at least one bin/i);

    const before = (await ctx.db.from("inventory_movements").select("id", { count: "exact", head: true })
      .eq("brewery_id", ctx.breweryId).eq("sku_id", sku.id)).count;
    await expect(runCommand("record_movement", {
      skuId: sku.id, locationId: location.id, binId: bin.id, qty: 1, type: "adjustment",
    }, ctx)).rejects.toThrow(/inactive SKU/i);
    expect((await ctx.db.from("inventory_movements").select("id", { count: "exact", head: true })
      .eq("brewery_id", ctx.breweryId).eq("sku_id", sku.id)).count).toBe(before);
  });
});
