// tests/rls-portal-order-columns.test.ts — a portal customer reads only buyer
// columns of orders, order_lines and skus: never orders.created_by (a staff
// uuid) or skus.qbo_item_id (QuickBooks bookkeeping). Same shape as #754's
// tests/rls-portal-columns.test.ts: no customer policy on the base table, a
// portal_* projection instead; staff reads are unchanged.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, makeCustomerUser, asUser, seedCustomer, seedLocation, seedCatalog, priceSku, channelId } from "./helpers";
import { rawDatabase } from "./raw-database";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

const HIDDEN_ORDER_COLUMNS = ["created_by", "from_location_id", "to_location_id", "sale_channel_id", "needs_restock"];

let customerDb: Awaited<ReturnType<typeof asUser>>;
let staffDb: Awaited<ReturnType<typeof asUser>>;
let orderId: string, skuId: string, retiredSkuId: string, otherChannelSkuId: string, staffId: string, foreignOrderId: string, depositLineId: string;
let custCtx: { db: typeof customerDb; userId: string; breweryId: string; role: "customer"; customerId: string };

beforeAll(async () => {
  const b = await makeBrewery();
  const staff = await makeStaffCtx(b.id, "admin");
  staffDb = staff.db;
  staffId = staff.userId;
  const mine = await seedCustomer(b.id, { name: "Buyer" });
  const other = await seedCustomer(b.id, { name: "Other buyer", saleChannelId: mine.saleChannelId });
  const wh = await seedLocation(b.id);
  const cat = await seedCatalog(b.id);
  skuId = cat.skuId;
  await priceSku(b.id, { saleChannelId: mine.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 1000 });
  const { error } = await admin.from("skus").update({ qbo_item_id: "QBO-ITEM-77" }).eq("id", skuId);
  if (error) throw error;
  // Same grid cell as the IPA case; retired below, after an order line names it.
  const retired = await seedCatalog(b.id, { product: "Amber", sku: "Amber retired" });
  retiredSkuId = retired.skuId;
  await priceSku(b.id, { saleChannelId: mine.saleChannelId, brandId: retired.brandId, formatId: retired.formatId, cents: 1000 });
  // A format of its own, priced only on Taproom: not on the buyer's channel.
  const lager = await seedCatalog(b.id, { product: "Lager", sku: "Lager bottles", format: "bottle case" });
  otherChannelSkuId = lager.skuId;
  await priceSku(b.id, { saleChannelId: await channelId(b.id, "Taproom"), brandId: lager.brandId, formatId: lager.formatId, cents: 900 });
  orderId = (await ins("orders", {
    brewery_id: b.id, kind: "wholesale", customer_id: mine.customerId, ship_to_id: mine.shipToId,
    sale_channel_id: mine.saleChannelId, from_location_id: wh.id, created_by: staff.userId, status: "submitted",
  })).id;
  const line = await ins("order_lines", { brewery_id: b.id, order_id: orderId, sku_id: skuId, qty_ordered: 2, qty_picked: 2, unit_price_cents: 1000 });
  await ins("order_lines", { brewery_id: b.id, order_id: orderId, sku_id: retiredSkuId, qty_ordered: 1, unit_price_cents: 1000 });
  const retire = await admin.from("skus").update({ active: false }).eq("id", retiredSkuId);
  if (retire.error) throw retire.error;
  const pool = await ins("keg_pools", { brewery_id: b.id, name: "Fleet", kind: "owned", deposit_cents: 3000 });
  depositLineId = (await ins("order_deposit_lines", {
    brewery_id: b.id, order_id: orderId, order_line_id: line.id, keg_pool_id: pool.id, keg_size: "half_bbl",
    description: "Keg deposit", qty_ordered: 2, unit_price_cents: 3000,
  })).id;
  foreignOrderId = (await ins("orders", {
    brewery_id: b.id, kind: "wholesale", customer_id: other.customerId, ship_to_id: other.shipToId,
    sale_channel_id: other.saleChannelId, from_location_id: wh.id, created_by: staff.userId, status: "submitted",
  })).id;
  const user = await makeCustomerUser(mine.customerId);
  customerDb = await asUser(user.email);
  custCtx = { db: customerDb, userId: user.id, breweryId: b.id, role: "customer", customerId: mine.customerId };
});

describe("portal customers cannot read internal order and SKU columns", () => {
  it("returns no base rows of orders, order lines, deposit lines, skus or sku_prices to a customer", async () => {
    const reads: [string, string, string][] = [
      ["orders", "id", orderId], ["order_lines", "order_id", orderId], ["order_deposit_lines", "id", depositLineId],
      ["skus", "id", skuId], ["sku_prices", "sku_id", skuId],
    ];
    for (const [table, key, id] of reads) {
      const { data, error } = await rawDatabase(customerDb).from(table).select("*").eq(key, id);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it("exposes buyer columns through portal_orders and portal_sku_prices, scoped to the caller", async () => {
    const o = await customerDb.from("portal_orders").select("*").eq("id", orderId).single();
    expect(o.error).toBeNull();
    for (const hidden of HIDDEN_ORDER_COLUMNS) expect(o.data, hidden).not.toHaveProperty(hidden);
    expect(o.data!.order_lines).toEqual([
      expect.not.objectContaining({ qty_picked: expect.anything() }),
      expect.not.objectContaining({ qty_picked: expect.anything() }),
    ]);
    const foreign = await customerDb.from("portal_orders").select("id").eq("id", foreignOrderId);
    expect(foreign.data).toEqual([]);
    // Inactive SKUs and prices on another channel stay out of the projection.
    const prices = await customerDb.from("portal_sku_prices").select("*").in("sku_id", [skuId, retiredSkuId, otherChannelSkuId]);
    expect(prices.data).toEqual([expect.objectContaining({ sku_id: skuId, unit_price_cents: 1000 })]);
    expect(prices.data![0]).not.toHaveProperty("qbo_item_id");
  });

  it("portal commands return no internal columns and still serve the buyer", async () => {
    const { rows } = await runCommand("portal_orders", {}, custCtx) as { rows: Record<string, unknown>[] };
    expect(rows.map((r) => r.id)).toEqual([orderId]);
    for (const hidden of HIDDEN_ORDER_COLUMNS) expect(rows[0], hidden).not.toHaveProperty(hidden);
    const detail = await runCommand("portal_order", { orderId }, custCtx) as { order: Record<string, unknown>; lines: Record<string, unknown>[] };
    for (const hidden of HIDDEN_ORDER_COLUMNS) expect(detail.order, hidden).not.toHaveProperty(hidden);
    expect(detail.order).not.toHaveProperty("order_lines");
    // Lines come back by SKU name; a retired SKU keeps its name in history.
    expect(detail.lines).toEqual([
      expect.objectContaining({ sku_id: retiredSkuId, skus: { name: "Amber retired" } }),
      expect.objectContaining({ sku_id: skuId, qty_ordered: 2, unit_price_cents: 1000, skus: { name: "IPA case" } }),
    ]);
    await expect(runCommand("portal_order", { orderId: foreignOrderId }, custCtx)).rejects.toMatchObject({ code: "not_found" });
    const catalog = await runCommand("portal_catalog", {}, custCtx) as { skuId: string; unitPriceCents: number }[];
    expect(catalog).toEqual([expect.objectContaining({ skuId, unitPriceCents: 1000 })]);
  });

  it("portal_order_rows(p_order) returns just that order, and only the caller's", async () => {
    const own = await customerDb.rpc("portal_order_rows", { p_order: orderId }).select("id");
    expect(own.data).toEqual([{ id: orderId }]);
    const foreign = await customerDb.rpc("portal_order_rows", { p_order: foreignOrderId }).select("id");
    expect(foreign.data).toEqual([]);
  });

  it("staff still read created_by and qbo_item_id", async () => {
    const o = await staffDb.from("orders").select("created_by").eq("id", orderId).single();
    expect(o.data!.created_by).toBe(staffId);
    const s = await staffDb.from("skus").select("qbo_item_id").eq("id", skuId).single();
    expect(s.data!.qbo_item_id).toBe("QBO-ITEM-77");
  });
});
