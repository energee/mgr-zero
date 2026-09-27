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

  // #577: the refund and the Returned keg event stay separate, so the balance
  // and the report flag a customer whose kegs on deposit disagree with kegs out.
  it("flags a refunded deposit whose kegs on deposit disagree with kegs out plus kegs lost", async () => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = (await admin.from("invoice_lines").select("id,keg_pool_id,keg_size").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single()).data!;
    const pool = deposit.keg_pool_id!, size = deposit.keg_size!;
    const wh = await makeStaffCtx(f.brewery.id, "warehouse");
    const keg = (qty: number, reason: string) => runCommand("record_keg_event", {
      poolId: pool, kegSize: size, qty, reason, locationId: f.source.id, binId: f.source.binId,
      ...(reason === "acquired" ? {} : { customerId: f.customer.customerId }),
    }, wh);
    const flagged = async () => {
      const b = await runCommand("get_customer_keg_balance", { customerId: f.customer.customerId }, wh) as { rows: { kegs_out: number; kegs_on_deposit: number; mismatch: boolean }[] };
      const r = await runCommand("get_keg_report", {}, wh) as { mismatches: { customer_id: string; kegs_out: number; kegs_on_deposit: number }[] };
      return { balance: b.rows.map((x) => [x.kegs_out, x.kegs_on_deposit, x.mismatch]), report: r.mismatches.map((m) => [m.customer_id, m.kegs_out, m.kegs_on_deposit]) };
    };

    // Two deposits invoiced, no keg recorded as shipped: a deposit-only row, not
    // flagged, since nothing was refunded; the Shipped event is just not entered yet.
    expect(await flagged()).toEqual({ balance: [[0, 2, false]], report: [] });
    await keg(10, "acquired");
    await keg(2, "shipped");
    expect(await flagged()).toEqual({ balance: [[2, 2, false]], report: [] });
    // One deposit refunded while both kegs are still out.
    await runCommand("return_shipment", { invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 1 }] }, f.adminCtx);
    expect(await flagged()).toEqual({ balance: [[2, 1, true]], report: [[f.customer.customerId, 2, 1]] });
    await keg(1, "returned");
    expect(await flagged()).toEqual({ balance: [[1, 1, false]], report: [] });
    // The last keg is lost at the customer: its deposit is kept, so still no flag.
    await keg(1, "lost");
    expect(await flagged()).toEqual({ balance: [[0, 1, false]], report: [] });
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
