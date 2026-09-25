// #414: a credit memo refunds returned kegs' deposits. Crediting a keg_deposit
// invoice line writes a keg_deposit_refund line (negative whole kegs, the
// deposit's pool and size, the deposit's frozen price), which reduces
// keg_deposit_balances. Beer lines keep their return_in path.
import { beforeEach, describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { admin, asUser, ins, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";

describe("keg deposit refund credit memo", () => {
  let f: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { f = await setup(); });

  it("refunds one keg's deposit as a keg_deposit_refund line and reduces the customer's deposit balance", async () => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = (await admin.from("invoice_lines").select("id,keg_pool_id,keg_size,unit_price_cents").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single()).data!;
    expect(await balance(f)).toEqual({ kegs: 2, cents: 5000 });

    const result = await runCommand("return_shipment", {
      invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 1 }],
    }, f.adminCtx) as { credit_memo_id: string };
    const refund = await admin.from("invoice_lines").select("kind,keg_pool_id,keg_size,qty,unit_price_cents,amount_cents,credited_invoice_line_id,sku_id").eq("invoice_id", result.credit_memo_id);
    expect(refund.error).toBeNull();
    expect(refund.data).toEqual([{
      kind: "keg_deposit_refund", keg_pool_id: deposit.keg_pool_id, keg_size: deposit.keg_size, qty: -1,
      unit_price_cents: deposit.unit_price_cents, amount_cents: -2500, credited_invoice_line_id: deposit.id, sku_id: null,
    }]);
    const moved = await admin.from("inventory_movements").select("id").eq("ref", result.credit_memo_id);
    expect(moved.data).toEqual([]);
    expect(await balance(f)).toEqual({ kegs: 1, cents: 2500 });

    await expect(runCommand("return_shipment", {
      invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 2 }],
    }, f.adminCtx)).rejects.toThrow(/exceeds remaining/);
    await expect(runCommand("return_shipment", {
      invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 0.5 }],
    }, f.adminCtx)).rejects.toThrow(/whole kegs/);
    expect(await balance(f)).toEqual({ kegs: 1, cents: 2500 });
  });
});

async function setup() {
  const brewery = await makeBrewery();
  const adminCtx = await makeStaffCtx(brewery.id);
  const source = await seedLocation(brewery.id, { name: "Deposit warehouse" });
  const keg = await seedCatalog(brewery.id, { product: "Refund keg", sku: "Refund keg half", packageType: "keg", bblPerUnit: 0.5 });
  const customer = await seedCustomer(brewery.id);
  const pool = await admin.from("keg_pools").insert({ brewery_id: brewery.id, name: "Returnable fleet", kind: "owned", deposit_cents: 2500 }).select("id").single();
  expect(pool.error).toBeNull();
  expect((await admin.from("skus").update({ container_source: "owned_fleet", keg_pool_id: pool.data!.id }).eq("id", keg.skuId)).error).toBeNull();
  await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: keg.brandId, formatId: keg.formatId, cents: 3600 });
  await ins("inventory_movements", { brewery_id: brewery.id, sku_id: keg.skuId, location_id: source.id, bin_id: source.binId, qty: 20, type: "opening_balance", created_by: adminCtx.userId });
  await runCommand("set_portal_fulfillment_source", { locationId: source.id }, adminCtx);
  const buyer = await makeCustomerUser(customer.customerId);
  const db = await asUser(buyer.email);
  return { brewery, adminCtx, source, keg, customer,
    portalCtx: { db, userId: buyer.id, breweryId: brewery.id, role: "customer" as const, customerId: customer.customerId } };
}

async function shipTwoKegs(f: Awaited<ReturnType<typeof setup>>) {
  const quote = await runCommand("portal_quote_order", { shipToId: f.customer.shipToId, lines: [{ skuId: f.keg.skuId, qty: 2 }] }, f.portalCtx) as { quoteId: string };
  const { order_id: orderId } = await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, f.portalCtx) as { order_id: string };
  await runCommand("confirm_order", { orderId }, f.adminCtx);
  const lines = (await admin.from("order_lines").select("id,qty_ordered").eq("order_id", orderId)).data!;
  await runCommand("record_pick", { orderId, picks: lines.map(line => ({ lineId: line.id, qty: Number(line.qty_ordered) })) }, f.adminCtx);
  const shipped = await runCommand("ship_order", { orderId, invoiceTiming: "now", ship: lines.map(line => ({ lineId: line.id, qty: Number(line.qty_ordered) })) }, f.adminCtx) as { invoice_id: string };
  return shipped.invoice_id;
}

async function balance(f: Awaited<ReturnType<typeof setup>>) {
  const rows = await admin.from("keg_deposit_balances").select("kegs_on_deposit,deposit_cents").eq("customer_id", f.customer.customerId);
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(1);
  return { kegs: rows.data![0].kegs_on_deposit, cents: rows.data![0].deposit_cents };
}
