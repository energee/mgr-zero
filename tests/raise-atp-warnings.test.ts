// tests/raise-atp-warnings.test.ts — issue #1088: a line raise and a standing
// allocation that leave a SKU's ATP negative still save, and return the same
// soft `warnings` confirm_order does ({ sku_id, atp } per touched SKU below zero).
import { describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Result = { warnings: { sku_id: string; atp: number }[] };

// 10 on hand of each of two SKUs, and a confirmed wholesale order for 2 of the first.
async function confirmedOrder() {
  const b = await makeBrewery();
  const ctx = await makeStaffCtx(b.id, "admin");
  const wh = await seedLocation(b.id);
  const taproom = await seedLocation(b.id, { name: "Taproom", uses: ["taproom"] });
  const { customerId, shipToId, saleChannelId } = await seedCustomer(b.id);
  const skus: string[] = [];
  for (const product of ["IPA", "Lager"]) {
    const { skuId, brandId, formatId } = await seedCatalog(b.id, { product, sku: `${product} case` });
    await priceSku(b.id, { saleChannelId, brandId, formatId, cents: 3600 });
    await runCommand("record_movement", { skuId, locationId: wh.id, binId: wh.binId, qty: 10, type: "opening_balance" }, ctx);
    skus.push(skuId);
  }
  const { order_id: orderId } = await runCommand("create_order", {
    kind: "wholesale", customerId, shipToId, fromLocationId: wh.id, lines: [{ skuId: skus[0], qty: 2 }],
  }, ctx) as { order_id: string };
  await runCommand("submit_order", { orderId }, ctx);
  await runCommand("confirm_order", { orderId }, ctx);
  return { ctx, skuId: skus[0], otherSkuId: skus[1], orderId, taproomId: taproom.id };
}

async function openOrderQty(orderId: string, skuId: string) {
  const { data: line, error } = await admin.from("order_lines").select("id, qty_ordered").eq("order_id", orderId).eq("sku_id", skuId).single();
  if (error) throw error;
  const { data: allocations, error: ae } = await admin.from("allocations").select("qty").eq("ref", line.id).eq("status", "open");
  if (ae) throw ae;
  return { ordered: Number(line.qty_ordered), allocated: allocations.map(a => Number(a.qty)) };
}

describe("ATP warnings on raises and standing allocations (#1088)", () => {
  it("a line raise past ATP saves and warns; one within ATP does not", async () => {
    const f = await confirmedOrder();
    const within = await runCommand("adjust_order_lines", { orderId: f.orderId, reason: "raise", lines: [{ skuId: f.skuId, qty: 10 }] }, f.ctx) as Result;
    expect(within.warnings).toEqual([]);
    const past = await runCommand("adjust_order_lines", { orderId: f.orderId, reason: "raise", lines: [{ skuId: f.skuId, qty: 12 }] }, f.ctx) as Result;
    expect(past.warnings).toEqual([{ sku_id: f.skuId, atp: -2 }]);
    expect(await openOrderQty(f.orderId, f.skuId), "the warned raise is saved").toEqual({ ordered: 12, allocated: [12] });
  });

  it("warns only for the SKUs on the order that are below zero", async () => {
    const f = await confirmedOrder();
    const result = await runCommand("adjust_order_lines", {
      orderId: f.orderId, reason: "raise", lines: [{ skuId: f.skuId, qty: 12 }, { skuId: f.otherSkuId, qty: 3 }],
    }, f.ctx) as Result;
    expect(result.warnings).toEqual([{ sku_id: f.skuId, atp: -2 }]);
  });

  it("a standing allocation past ATP saves and warns; one within ATP does not", async () => {
    const f = await confirmedOrder();
    const within = await runCommand("set_standing_allocation", { locationId: f.taproomId, skuId: f.skuId, qty: 8 }, f.ctx) as Result;
    expect(within.warnings).toEqual([]);
    const past = await runCommand("set_standing_allocation", { locationId: f.taproomId, skuId: f.skuId, qty: 9 }, f.ctx) as Result & { status: string };
    expect(past).toMatchObject({ status: "open", warnings: [{ sku_id: f.skuId, atp: -1 }] });
  });

  // A release only raises ATP, so it never warns, even while the SKU stays below zero.
  it("releasing a standing allocation returns no warnings", async () => {
    const f = await confirmedOrder();
    await runCommand("adjust_order_lines", { orderId: f.orderId, reason: "raise", lines: [{ skuId: f.skuId, qty: 12 }] }, f.ctx);
    await runCommand("set_standing_allocation", { locationId: f.taproomId, skuId: f.skuId, qty: 1 }, f.ctx);
    const released = await runCommand("set_standing_allocation", { locationId: f.taproomId, skuId: f.skuId, qty: 0 }, f.ctx) as Result & { status: string };
    expect(released).toMatchObject({ status: "released", warnings: [] });
  });
});
