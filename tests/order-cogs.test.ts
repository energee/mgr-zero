// tests/order-cogs.test.ts — per-order cost, revenue and margin from shipped lots (#810 PR 2).
import { describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCustomer, priceSku } from "./helpers";
import { costedBatch } from "./costed-batch-fixture";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Cogs = { cost_cents: number; revenue_cents: number; uncosted_qty: number; margin_pct: number | null };

/** A costed batch closed into 4 kegs, plus a customer priced at $120 a keg. */
async function shippable(receiptCost: number | null = 100) {
  const f = await costedBatch(receiptCost);
  const saved = await f.close();
  const customer = await seedCustomer(f.brewery.id);
  await priceSku(f.brewery.id, { saleChannelId: customer.saleChannelId, brandId: f.catalog.brandId, formatId: f.catalog.formatId, cents: 12000 });
  const lot = (await admin.from("lots").select("id").eq("packaging_run_id", saved.runId).single().throwOnError()).data!;
  /** Orders, picks and (when `ship`) ships `qty` kegs from the packaged lot. */
  async function order(qty: number, ship = true) {
    const o = await runCommand("create_order", { kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId, fromLocationId: f.location.id, lines: [{ skuId: f.catalog.skuId, qty }] }, f.ctx) as { order_id: string };
    await runCommand("submit_order", { orderId: o.order_id }, f.ctx);
    await runCommand("confirm_order", { orderId: o.order_id }, f.ctx);
    const line = (await admin.from("order_lines").select("id").eq("order_id", o.order_id).single().throwOnError()).data!;
    if (!ship) return { orderId: o.order_id, invoiceId: null as string | null };
    await runCommand("record_pick", { orderId: o.order_id, picks: [{ lineId: line.id, qty }] }, f.ctx);
    const shipped = await runCommand("ship_order", { orderId: o.order_id, ship: [{ lineId: line.id, qty, sources: [{ binId: f.location.binId, lotId: lot.id, qty }] }] }, f.ctx) as { invoice_id: string };
    return { orderId: o.order_id, invoiceId: shipped.invoice_id };
  }
  return { ...f, order, cogs: (orderId: string, ctx = f.ctx) => runCommand("get_order_cogs", { orderId }, ctx) as Promise<Cogs> };
}

describe("order COGS (#810 PR2)", () => {
  it("costs a shipped order at the frozen cost of the lots it shipped", async () => {
    const f = await shippable();
    const { orderId } = await f.order(3);
    // 3 kegs x 500c cost; 3 x $120 revenue; margin (36000 - 1500) / 36000.
    expect(await f.cogs(orderId)).toEqual({ cost_cents: 1500, revenue_cents: 36000, uncosted_qty: 0, margin_pct: 95.8 });
  });

  it("nets a credited return out of cost and revenue", async () => {
    const f = await shippable();
    const { orderId, invoiceId } = await f.order(3);
    const movement = (await admin.from("inventory_movements").select("id").eq("ref", orderId).eq("type", "sale_removal").single().throwOnError()).data!.id;
    const invoiceLine = (await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId!).single().throwOnError()).data!.id;
    await runCommand("create_credit_memo", { invoiceId: invoiceId!, locationId: f.location.id, reason: "unsold", lines: [{ invoiceLineId: invoiceLine, qty: 1, sources: [{ movementId: movement, binId: f.location.binId, qty: 1 }] }] }, f.ctx);
    expect(await f.cogs(orderId)).toEqual({ cost_cents: 1000, revenue_cents: 24000, uncosted_qty: 0, margin_pct: 95.8 });
  });

  it("counts lot-less shipped units as uncosted and withholds the margin", async () => {
    const f = await shippable(null);
    const { orderId } = await f.order(2);
    expect(await f.cogs(orderId)).toEqual({ cost_cents: 0, revenue_cents: 24000, uncosted_qty: 2, margin_pct: null });
  });

  it("reports an order that has not shipped as nothing costed", async () => {
    const f = await shippable();
    const { orderId } = await f.order(2, false);
    expect(await f.cogs(orderId)).toEqual({ cost_cents: 0, revenue_cents: 0, uncosted_qty: 0, margin_pct: null });
  });

  it("is readable by Admin and Sales only", async () => {
    const f = await shippable();
    const { orderId } = await f.order(1);
    expect((await f.cogs(orderId, await makeStaffCtx(f.brewery.id, "sales"))).cost_cents).toBe(500);
    for (const role of ["warehouse", "brewer"] as const) {
      await expect(f.cogs(orderId, await makeStaffCtx(f.brewery.id, role))).rejects.toThrow(/permission|role|allowed|forbidden/i);
    }
  });

  it("keeps another brewery's orders and view rows out of reach", async () => {
    const f = await shippable();
    const { orderId } = await f.order(1);
    const outsider = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(f.cogs(orderId, outsider)).rejects.toThrow(/not found/i);
    expect((await outsider.db.from("order_line_cogs").select("*").eq("order_id", orderId).throwOnError()).data).toEqual([]);
  });
});
