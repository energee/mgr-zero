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
});
