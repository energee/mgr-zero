// tests/releases.test.ts — staff releases (docs/plans/portal-release-windows.md,
// Phase A tasks A1–A2): who may release, one open batch release per SKU, the
// stock release ATP ceiling, the confirmed floor on edits, and withdraw.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, ins, sql, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Release = { id: string; sku_id: string; qty: number };
let breweryId: string, adminCtx: Ctx, salesCtx: Ctx, warehouseCtx: Ctx, brewerCtx: Ctx;
let cat: Awaited<ReturnType<typeof seedCatalog>>, warehouse: Awaited<ReturnType<typeof seedLocation>>;
let batchId: string;

async function stock(skuId: string, qty: number) {
  await ins("inventory_movements", { brewery_id: breweryId, sku_id: skuId, location_id: warehouse.id, bin_id: warehouse.binId, qty, bbl: qty * 0.0645, type: "production_in", created_by: adminCtx.userId });
}

async function planBatch(brandId: string) {
  const { data, error } = await admin.from("batches").insert({ brewery_id: breweryId, intended_brand_id: brandId, planned_on: "2030-01-02", planned_bbl: 10, created_by: adminCtx.userId }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  [adminCtx, salesCtx, warehouseCtx, brewerCtx] = await Promise.all([
    makeStaffCtx(breweryId, "admin"), makeStaffCtx(breweryId, "sales"), makeStaffCtx(breweryId, "warehouse"), makeStaffCtx(breweryId, "brewer"),
  ]);
  warehouse = await seedLocation(breweryId);
  cat = await seedCatalog(breweryId, { product: "Release Lager", sku: "Release Lager case" });
  batchId = await planBatch(cat.brandId);
});

describe("releases table", () => {
  it("is read-only to staff: a brewer can read but not insert", async () => {
    const insert = await brewerCtx.db.from("releases").insert({ brewery_id: breweryId, sku_id: cat.skuId, qty: 5, ships_from: "2030-01-20" });
    expect(insert.error).not.toBeNull();
    const read = await brewerCtx.db.from("releases").select("id").eq("brewery_id", breweryId);
    expect(read.error).toBeNull();
  });

  it("keeps one open batch release per SKU", async () => {
    await runCommand("release_sku", { batchId, shipsFrom: "2030-01-16", lines: [{ skuId: cat.skuId, qty: 40 }] }, salesCtx);
    await expect(runCommand("release_sku", { batchId, shipsFrom: "2030-01-16", lines: [{ skuId: cat.skuId, qty: 5 }] }, adminCtx))
      .rejects.toMatchObject({ status: 409 });
  });
});

describe("release commands", () => {
  it("lets admin and sales release, and refuses warehouse and brewer", async () => {
    const other = await seedCatalog(breweryId, { product: "Role Pils", sku: "Role Pils case" });
    await stock(other.skuId, 30);
    const made = await runCommand("release_sku", { lines: [{ skuId: other.skuId, qty: 5 }] }, salesCtx) as { releases: Release[] };
    expect(made.releases).toMatchObject([{ sku_id: other.skuId, qty: 5 }]);
    for (const ctx of [warehouseCtx, brewerCtx]) {
      await expect(runCommand("release_sku", { lines: [{ skuId: other.skuId, qty: 1 }] }, ctx)).rejects.toMatchObject({ code: "permission_denied" });
      const raw = await ctx.db.rpc("release_sku", { p_brewery: breweryId, p_batch: null, p_ships_from: null, p_orders_close_on: null, p_lines: [{ sku_id: other.skuId, qty: 1 }], p_request_id: crypto.randomUUID() });
      expect(raw.error).not.toBeNull();
    }
    // A stock release ships from the brewery's today.
    const row = (await salesCtx.db.from("releases").select("batch_id, ships_from").eq("id", made.releases[0].id).single()).data!;
    expect(row.batch_id).toBeNull();
    expect(row.ships_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("refuses a stock release above what is available to promise, counting other releases", async () => {
    const atp = await seedCatalog(breweryId, { product: "ATP Ale", sku: "ATP Ale case" });
    await stock(atp.skuId, 12);
    await expect(runCommand("release_sku", { lines: [{ skuId: atp.skuId, qty: 13 }] }, salesCtx)).rejects.toThrow(/available/);
    await runCommand("release_sku", { lines: [{ skuId: atp.skuId, qty: 8 }] }, salesCtx);
    // 12 on hand, 8 already set aside: 5 more is above the 4 left.
    await expect(runCommand("release_sku", { lines: [{ skuId: atp.skuId, qty: 5 }] }, salesCtx)).rejects.toThrow(/available/);
    await expect(runCommand("release_sku", { lines: [{ skuId: atp.skuId, qty: 4 }] }, salesCtx)).resolves.toBeTruthy();
  });

  it("refuses lowering a release below its confirmed quantity, and withdraw keeps the row", async () => {
    const sold = await seedCatalog(breweryId, { product: "Confirmed Stout", sku: "Confirmed Stout case" });
    await stock(sold.skuId, 50);
    const { customerId, shipToId, saleChannelId } = await seedCustomer(breweryId, { name: "Confirmed buyer" });
    await priceSku(breweryId, { saleChannelId, brandId: sold.brandId, formatId: sold.formatId, cents: 1000 });
    await runCommand("set_portal_fulfillment_source", { locationId: warehouse.id }, adminCtx);
    const user = await makeCustomerUser(customerId);
    const buyer = { db: await asUser(user.email), userId: user.id, breweryId, roles: ["customer" as const], customerId };
    const { releases: [release] } = await runCommand("release_sku", { lines: [{ skuId: sold.skuId, qty: 10 }] }, salesCtx) as { releases: Release[] };
    const quote = await runCommand("portal_quote_order", { shipToId, requestedShipDate: "2030-02-01", lines: [{ skuId: sold.skuId, qty: 6, releaseId: release.id }] }, buyer) as { quoteId: string };
    const order = await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, buyer) as { order_id: string };
    expect((await admin.from("order_lines").select("release_id").eq("order_id", order.order_id).single()).data?.release_id).toBe(release.id);
    await runCommand("confirm_order", { orderId: order.order_id }, salesCtx);

    await expect(runCommand("update_release", { releaseId: release.id, qty: 5, ordersCloseOn: null }, salesCtx)).rejects.toThrow(/confirmed/);
    await expect(runCommand("update_release", { releaseId: release.id, qty: 6, ordersCloseOn: "2030-01-30" }, salesCtx)).resolves.toMatchObject({ qty: 6, orders_close_on: "2030-01-30" });
    await expect(runCommand("update_release", { releaseId: release.id, qty: 6, ordersCloseOn: null }, warehouseCtx)).rejects.toMatchObject({ code: "permission_denied" });

    // A short shipment counts what shipped: the unshipped units stay claimed by the release.
    sql(`update public.orders set status = 'shipped' where id = '${order.order_id}'; update public.order_lines set qty_shipped = 4 where order_id = '${order.order_id}'`);
    const [shipped] = await runCommand("list_releases", { ids: [release.id] }, salesCtx) as { confirmed: number; remaining: number }[];
    expect(shipped).toMatchObject({ confirmed: 4, remaining: 2 });
    sql(`update public.order_lines set qty_shipped = null where order_id = '${order.order_id}'; update public.orders set status = 'confirmed' where id = '${order.order_id}'`);

    // Staff paths never store a release on a line, even through the raw RPCs.
    const staffCreate = await salesCtx.db.rpc("create_order", { p_brewery: breweryId, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId, p_from_location: warehouse.id, p_to_location: null as unknown as string, p_requested: null as unknown as string, p_po: null as unknown as string, p_note: null as unknown as string, p_lines: [{ sku_id: sold.skuId, qty: 1, release_id: release.id }], p_request_id: crypto.randomUUID() });
    expect(staffCreate.error?.message).toMatch(/portal buyer/);
    const taproom = await seedLocation(breweryId, { name: "Release taproom", uses: ["taproom"] });
    const replenish = await adminCtx.db.rpc("create_replenishment_order", { p_from: warehouse.id, p_to: taproom.id, p_lines: [{ sku_id: sold.skuId, qty: 1, release_id: release.id }], p_request_id: crypto.randomUUID() });
    expect(replenish.error?.message).toMatch(/portal buyer/);

    await runCommand("withdraw_release", { releaseId: release.id }, adminCtx);
    const kept = (await salesCtx.db.from("releases").select("id, withdrawn_at").eq("id", release.id).single()).data!;
    expect(kept.withdrawn_at).not.toBeNull();
    const [listed] = await runCommand("list_releases", { ids: [release.id] }, warehouseCtx) as { id: string; open: boolean; confirmed: number; remaining: number }[];
    expect(listed).toMatchObject({ id: release.id, open: false, confirmed: 6, remaining: 0 });
    // open filters in the query: a withdrawn release is only among the closed ones.
    expect(await runCommand("list_releases", { ids: [release.id], open: true }, warehouseCtx)).toEqual([]);
    expect(await runCommand("list_releases", { ids: [release.id], open: false }, warehouseCtx)).toHaveLength(1);
    await expect(runCommand("update_release", { releaseId: release.id, qty: 8, ordersCloseOn: null }, salesCtx)).rejects.toThrow(/withdrawn/);
  });

  it("releases a planned batch only for its own brand, and lists it with the batch's ready date", async () => {
    const stranger = await seedCatalog(breweryId, { product: "Stranger", sku: "Stranger case" });
    await expect(runCommand("release_sku", { batchId, shipsFrom: "2030-01-16", lines: [{ skuId: stranger.skuId, qty: 5 }] }, salesCtx)).rejects.toThrow(/brand/);
    const listed = await runCommand("list_releases", { batchIds: [batchId] }, brewerCtx) as { batch_id: string; sku_id: string; ready_on: string; open: boolean }[];
    // planned 2030-01-02 + the brewery's default 14 days to package.
    expect(listed).toMatchObject([{ batch_id: batchId, sku_id: cat.skuId, ready_on: "2030-01-16", open: true }]);
  });
});
