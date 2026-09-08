import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedCustomer, priceSku, admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("final screen parity", () => {
  it("uses actual query permissions for deep links and preserves allowed readers", async () => {
    const b = await makeBrewery();
    const brewer = await makeStaffCtx(b.id, "brewer");
    for (const query of ["get_atp", "list_orders", "list_invoices"]) {
      await expect(runPageQuery(query, {}, brewer)).rejects.toThrow(/redirect:\/denied\?/);
    }
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    expect(await runPageQuery("list_locations", {}, warehouse)).toEqual([]);
    expect(await runPageQuery("list_brands", {}, warehouse)).toEqual([]);
    await expect(runPageQuery("list_movements", { limit: 0 }, warehouse)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(runCommand("get_atp", {}, brewer)).rejects.toMatchObject({ code: "permission_denied" });
    expect(() => requirePagePermission(warehouse, "confirm_order")).toThrow(/redirect:\/denied\?/);
    expect(() => requirePagePermission(warehouse, "ship_order")).not.toThrow();
    const sales = await makeStaffCtx(b.id, "sales");
    expect(() => requirePagePermission(sales, "ship_order")).toThrow(/redirect:\/denied\?/);
    expect(() => requirePagePermission(sales, "confirm_restock")).toThrow(/redirect:\/denied\?/);
  });

  it("returns competing order and standing reservations only for the requested SKU and tenant", async () => {
    const b = await makeBrewery(), ctx = await makeStaffCtx(b.id);
    const cat = await seedCatalog(b.id), other = await seedCatalog(b.id, { product: "Other", sku: "Other case" });
    const wh = await seedLocation(b.id), tap = await seedLocation(b.id, { name: "Tap", kind: "taproom" });
    const customer = await seedCustomer(b.id);
    await priceSku(b.id, { saleChannelId: customer.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 100 });
    const orders: string[] = [];
    for (const qty of [2, 3]) {
      const o = await runCommand("create_order", { kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId, fromLocationId: wh.id, lines: [{ skuId: cat.skuId, qty }] }, ctx) as { order_id: string };
      orders.push(o.order_id);
      await runCommand("submit_order", { orderId: o.order_id }, ctx);
      await runCommand("confirm_order", { orderId: o.order_id }, ctx);
    }
    await runCommand("set_standing_allocation", { locationId: tap.id, skuId: cat.skuId, qty: 4 }, ctx);
    await runCommand("set_standing_allocation", { locationId: tap.id, skuId: other.skuId, qty: 9 }, ctx);
    const rows = await runCommand("get_shortfalls", { skuId: cat.skuId }, ctx) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ skuId: cat.skuId, allocated: 9, atp: -9 });
    expect(rows[0].reservations.map((r: any) => r.orderId).filter(Boolean).sort()).toEqual(orders.sort());
    expect(rows[0].reservations.find((r: any) => r.source === "taproom_standing")).toMatchObject({ ref: tap.id, qty: 4 });
    const stranger = await makeStaffCtx((await makeBrewery()).id);
    expect(await runCommand("get_shortfalls", { skuId: cat.skuId }, stranger)).toEqual([]);
  });

  it("reaches movement 51 with deterministic equal-time ordering and returns frozen receipt facts", async () => {
    const b = await makeBrewery(), ctx = await makeStaffCtx(b.id), cat = await seedCatalog(b.id), wh = await seedLocation(b.id);
    const receipt = await runCommand("record_movement", { skuId: cat.skuId, locationId: wh.id, binId: wh.binId, qty: 2, type: "opening_balance", note: "receipt" }, ctx) as any;
    const originalBbl = receipt.bbl;
    await runCommand("upsert_format", { id: cat.formatId, name: "Updated format", basis: "packaged", packageType: "can", bblPerUnit: 0.5 }, ctx);
    const stored = await runCommand("list_movements", { skuId: cat.skuId }, ctx) as any[];
    expect(stored.find(r => r.id === receipt.id)?.bbl).toBe(originalBbl);
    const insert = await admin.from("inventory_movements").insert(Array.from({ length: 51 }, () => ({ brewery_id: b.id, sku_id: cat.skuId, location_id: wh.id, bin_id: wh.binId, qty: 1, type: "opening_balance", created_at: "2026-09-09T12:00:00Z", created_by: ctx.userId })));
    expect(insert.error).toBeNull();
    const first = await runCommand("list_movements", { limit: 50 }, ctx) as any[];
    const second = await runCommand("list_movements", { limit: 50, offset: 50 }, ctx) as any[];
    expect(first).toHaveLength(50); expect(second).toHaveLength(2);
    expect(new Set([...first, ...second].map(r => r.id)).size).toBe(52);
    expect(receipt).toMatchObject({ bin_id: wh.binId, note: "receipt", bbl: originalBbl });
    expect(Number(originalBbl)).toBeGreaterThan(0);
  });
  it("sums and projects more than 1,000 filtered reservation and location rows", async () => {
    const b = await makeBrewery(), ctx = await makeStaffCtx(b.id), cat = await seedCatalog(b.id);
    const locations = Array.from({ length: 1001 }, (_, n) => ({ id: crypto.randomUUID(), brewery_id: b.id, name: `Tap ${n}`, kind: "taproom" }));
    expect((await admin.from("locations").insert(locations)).error).toBeNull();
    const bins = locations.map(l => ({ id: crypto.randomUUID(), brewery_id: b.id, location_id: l.id, name: "Count" }));
    expect((await admin.from("bins").insert(bins)).error).toBeNull();
    expect((await admin.from("inventory_movements").insert(bins.map(bin => ({ brewery_id: b.id, sku_id: cat.skuId, location_id: bin.location_id, bin_id: bin.id, qty: 1, type: "opening_balance", created_by: ctx.userId })))).error).toBeNull();
    expect((await admin.from("allocations").insert(locations.map(l => ({ brewery_id: b.id, sku_id: cat.skuId, qty: 2, source: "taproom_standing", ref: l.id })))).error).toBeNull();
    const rows = await runCommand("get_shortfalls", { skuId: cat.skuId }, ctx) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ onHand: 1001, allocated: 2002, atp: -1001 });
    expect(rows[0].reservations).toHaveLength(1001);
  });

});
