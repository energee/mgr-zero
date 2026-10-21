// tests/raise-atp-warnings.test.ts — issue #1088: a line raise and a standing
// allocation that leave a SKU's ATP negative still save, and return the same
// soft `warnings` confirm_order does ({ sku_id, atp } per touched SKU below zero).
import { describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Result = { warnings: { sku_id: string; atp: number }[] };

// 10 on hand of one SKU, and a confirmed wholesale order for 2 of it.
async function confirmedOrder() {
  const b = await makeBrewery();
  const ctx = await makeStaffCtx(b.id, "admin");
  const wh = await seedLocation(b.id);
  const taproom = await seedLocation(b.id, { name: "Taproom", uses: ["taproom"] });
  const { customerId, shipToId, saleChannelId } = await seedCustomer(b.id);
  const { skuId, brandId, formatId } = await seedCatalog(b.id);
  await priceSku(b.id, { saleChannelId, brandId, formatId, cents: 3600 });
  await runCommand("record_movement", { skuId, locationId: wh.id, binId: wh.binId, qty: 10, type: "opening_balance" }, ctx);
  const { order_id: orderId } = await runCommand("create_order", {
    kind: "wholesale", customerId, shipToId, fromLocationId: wh.id, lines: [{ skuId, qty: 2 }],
  }, ctx) as { order_id: string };
  await runCommand("submit_order", { orderId }, ctx);
  await runCommand("confirm_order", { orderId }, ctx);
  return { ctx, skuId, orderId, taproomId: taproom.id };
}

describe("ATP warnings on raises and standing allocations (#1088)", () => {
  it("a line raise past ATP saves and warns; one within ATP does not", async () => {
    const f = await confirmedOrder();
    const within = await runCommand("adjust_order_lines", { orderId: f.orderId, reason: "raise", lines: [{ skuId: f.skuId, qty: 10 }] }, f.ctx) as Result;
    expect(within.warnings).toEqual([]);
    const past = await runCommand("adjust_order_lines", { orderId: f.orderId, reason: "raise", lines: [{ skuId: f.skuId, qty: 12 }] }, f.ctx) as Result;
    expect(past.warnings).toEqual([{ sku_id: f.skuId, atp: -2 }]);
  });

  it("a standing allocation past ATP saves and warns; one within ATP does not", async () => {
    const f = await confirmedOrder();
    const within = await runCommand("set_standing_allocation", { locationId: f.taproomId, skuId: f.skuId, qty: 8 }, f.ctx) as Result;
    expect(within.warnings).toEqual([]);
    const past = await runCommand("set_standing_allocation", { locationId: f.taproomId, skuId: f.skuId, qty: 9 }, f.ctx) as Result & { status: string };
    expect(past).toMatchObject({ status: "open", warnings: [{ sku_id: f.skuId, atp: -1 }] });
  });
});
