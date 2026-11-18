// tests/order-changes.test.ts — changes after confirm, read back (Phase C of
// docs/plans/portal-release-windows.md): the buyer's portal_order shows each
// change's reason code and line deltas but never who made it or the staff note,
// and list_order_changes filters the staff report by reason, staff member and
// customer in the query.
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand, type Ctx } from "../lib/commands/registry";
import "../lib/commands/all";

let adminCtx: Ctx, salesCtx: Ctx, warehouseCtx: Ctx, buyerCtx: Ctx;
let first: { customerId: string; shipToId: string }, second: { customerId: string; shipToId: string };
let whId: string, skuId: string, otherSkuId: string;
let changedId: string, preOrderId: string, otherCustomerOrderId: string;

async function confirmedOrder(customer: { customerId: string; shipToId: string }) {
  const { order_id: orderId } = await runCommand("create_order", {
    kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId, fromLocationId: whId,
    lines: [{ skuId, qty: 6 }, { skuId: otherSkuId, qty: 2 }],
  }, adminCtx) as { order_id: string };
  await runCommand("submit_order", { orderId }, adminCtx);
  await runCommand("confirm_order", { orderId }, adminCtx);
  return orderId;
}

beforeAll(async () => {
  const b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  salesCtx = await makeStaffCtx(b.id, "sales");
  warehouseCtx = await makeStaffCtx(b.id, "warehouse");
  whId = (await seedLocation(b.id)).id;
  const cat = await seedCatalog(b.id);
  const other = await seedCatalog(b.id, { product: "Pils", sku: "Pils case" });
  skuId = cat.skuId; otherSkuId = other.skuId;
  const c1 = await seedCustomer(b.id, { name: "First Taproom" });
  const c2 = await seedCustomer(b.id, { name: "Second Taproom", saleChannelId: c1.saleChannelId });
  first = c1; second = c2;
  for (const c of [cat, other]) await priceSku(b.id, { saleChannelId: c1.saleChannelId, brandId: c.brandId, formatId: c.formatId, cents: 3600 });

  changedId = await confirmedOrder(first);
  // Damaged: two of the first SKU gone; the second SKU dropped by the customer.
  await runCommand("adjust_order_lines", { orderId: changedId, reasonCode: "damaged", reason: "Dropped on the dock", lines: [{ skuId, qty: 4 }, { skuId: otherSkuId, qty: 2 }] }, adminCtx);
  await runCommand("adjust_order_lines", { orderId: changedId, reasonCode: "customer_request", lines: [{ skuId, qty: 4 }] }, salesCtx);

  otherCustomerOrderId = await confirmedOrder(second);
  await runCommand("adjust_order_lines", { orderId: otherCustomerOrderId, reasonCode: "short", lines: [{ skuId, qty: 5 }, { skuId: otherSkuId, qty: 2 }] }, adminCtx);

  // A pre-order change keeps free text and is not a change after confirm.
  const { order_id } = await runCommand("create_order", {
    kind: "wholesale", customerId: first.customerId, shipToId: first.shipToId, fromLocationId: whId, lines: [{ skuId, qty: 6 }],
  }, adminCtx) as { order_id: string };
  preOrderId = order_id;
  await runCommand("submit_order", { orderId: preOrderId }, adminCtx);
  await runCommand("adjust_order_lines", { orderId: preOrderId, reason: "Buyer trimmed", lines: [{ skuId, qty: 3 }] }, adminCtx);

  const buyer = await makeCustomerUser(first.customerId);
  buyerCtx = { db: await asUser(buyer.email), userId: buyer.id, breweryId: b.id, roles: ["customer"], customerId: first.customerId } as Ctx;
});

describe("the buyer sees changes after confirm", () => {
  it("portal_order returns each change's reason code and line deltas, oldest first, without actor or note", async () => {
    const got = await runCommand("portal_order", { orderId: changedId }, buyerCtx) as { changes: Record<string, unknown>[] };
    expect(got.changes.map(c => c.reason_code)).toEqual(["damaged", "customer_request"]);
    expect(got.changes[0].changes).toEqual([{ sku_id: skuId, name: expect.any(String), delta: -2 }]);
    expect(got.changes[1].changes).toEqual([{ sku_id: otherSkuId, name: expect.any(String), delta: -2 }]);
    for (const change of got.changes) expect(Object.keys(change).sort()).toEqual(["changes", "created_at", "id", "reason_code"]);
  });

  it("a pre-order change is not one, and another customer's order is not readable", async () => {
    expect((await runCommand("portal_order", { orderId: preOrderId }, buyerCtx) as { changes: unknown[] }).changes).toEqual([]);
    expect((await buyerCtx.db.rpc("portal_order_change_rows", { p_order: otherCustomerOrderId })).data).toEqual([]);
  });
});

describe("list_order_changes (staff report)", () => {
  type Row = { order_id: string; reason_code: string; actor: string; note: string | null; customer_name: string; changes: { delta: number }[] };
  const list = (input: Record<string, unknown>, ctx = adminCtx) => runCommand("list_order_changes", input, ctx) as Promise<{ rows: Row[]; nextCursor: string | null }>;

  it("lists every change after confirm, newest first, with who, why, the note and the line deltas", async () => {
    const { rows, nextCursor } = await list({});
    expect(rows.map(r => r.reason_code)).toEqual(["short", "customer_request", "damaged"]);
    expect(rows[2]).toMatchObject({ order_id: changedId, actor: adminCtx.userId, note: "Dropped on the dock", customer_name: "First Taproom" });
    expect(rows[1]).toMatchObject({ actor: salesCtx.userId, note: null });
    expect(nextCursor).toBeNull();
  });

  it("filters by reason, staff member and customer in the query", async () => {
    expect((await list({ reasonCode: "damaged" })).rows.map(r => r.order_id)).toEqual([changedId]);
    expect((await list({ staffId: salesCtx.userId })).rows.map(r => r.reason_code)).toEqual(["customer_request"]);
    expect((await list({ customerId: second.customerId })).rows.map(r => r.order_id)).toEqual([otherCustomerOrderId]);
    expect((await list({ customerId: first.customerId, staffId: adminCtx.userId })).rows.map(r => r.reason_code)).toEqual(["damaged"]);
  });

  it("pages with a cursor", async () => {
    const page = await list({ limit: 2 });
    expect(page.rows).toHaveLength(2);
    expect((await list({ limit: 2, cursor: page.nextCursor! })).rows.map(r => r.reason_code)).toEqual(["damaged"]);
  });

  it("is Admin and Sales only", async () => {
    await expect(list({}, warehouseCtx)).rejects.toMatchObject({ status: 403 });
    expect((await salesCtx.db.rpc("order_change_rows", { p_brewery: adminCtx.breweryId })).data).toHaveLength(3);
    expect((await warehouseCtx.db.rpc("order_change_rows", { p_brewery: adminCtx.breweryId })).data).toEqual([]);
  });
});
