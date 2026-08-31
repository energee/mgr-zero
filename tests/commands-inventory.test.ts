// tests/commands-inventory.test.ts — exercises the command handlers with a real RLS-bound Ctx.
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("inventory commands", () => {
  let ctx: any;
  beforeAll(async () => {
    ctx = await makeStaffCtx((await makeBrewery()).id);
  });

  it("full flow: product -> sku -> location -> movement -> on_hand", async () => {
    const p = await runCommand("create_product", { name: "Pils" }, ctx);
    const s = await runCommand("create_sku", { productId: p.id, name: "1/6 bbl keg", packageType: "keg", bblPerUnit: "0.16666667" }, ctx);
    const l = await runCommand("create_location", { name: "WH", kind: "warehouse" }, ctx);
    await runCommand("record_movement", { skuId: s.id, locationId: l.id, qty: 12, type: "opening_balance" }, ctx);
    const oh = await runCommand("get_on_hand", { skuId: s.id }, ctx);
    expect(Number(oh[0].qty)).toBe(12);
  });

  it("record_movement surfaces CHECK failure for unclassified sale_removal", async () => {
    const p = await runCommand("create_product", { name: "Stout" }, ctx);
    const s = await runCommand("create_sku", { productId: p.id, name: "1/2 bbl keg", packageType: "keg", bblPerUnit: "0.5" }, ctx);
    const l = await runCommand("create_location", { name: "WH2", kind: "warehouse" }, ctx);
    await expect(runCommand("record_movement", { skuId: s.id, locationId: l.id, qty: -1, type: "sale_removal", channel: "wholesale" }, ctx))
      .rejects.toThrow();
  });
});
