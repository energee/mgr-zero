// tests/landings.test.ts — Program 10 task 2: the Beer and Work landings read
// one registered query each. get_beer_overview is counts every staff role may
// read (zeros allowed); list_work unions Today's rows with the open purchase
// orders and routes the caller's role may open, each tagged with a Work chip.
import { beforeAll, describe, expect, it } from "vitest";
import { channelId, ins, makeBrewery, makeStaffCtx, priceSku } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import type { WorkRow } from "@/lib/commands/landings";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, sales: Ctx, warehouse: Ctx, brewer: Ctx;

beforeAll(async () => {
  b = await makeBrewery();
  [adminCtx, sales, warehouse, brewer] = await Promise.all([
    makeStaffCtx(b.id, "admin"), makeStaffCtx(b.id, "sales"), makeStaffCtx(b.id, "warehouse"), makeStaffCtx(b.id, "brewer"),
  ]);
});

describe("get_beer_overview", () => {
  it("returns numeric counts for every staff role", async () => {
    for (const ctx of [adminCtx, sales, warehouse, brewer]) {
      const o = await runCommand("get_beer_overview", {}, ctx) as Record<string, number>;
      for (const k of ["fgShortages", "taproomBelowPar", "openTaps", "openOccupancies", "materialShortages", "kegsOut"]) {
        expect(typeof o[k], `${ctx.role} ${k}`).toBe("number");
      }
    }
  });
});

describe("list_work", () => {
  it("unions Today rows with the open documents the role may open, tagged by chip", async () => {
    const wh = await ins("locations", { brewery_id: b.id, name: "WH", kind: "warehouse" });
    const brand = await ins("brands", { brewery_id: b.id, name: "IPA" });
    const format = await ins("formats", { brewery_id: b.id, name: "1/2 bbl keg", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: 0.5 });
    const sku = await ins("skus", { brewery_id: b.id, brand_id: brand.id, format_id: format.id, name: "IPA 1/2bbl" });
    const wholesale = await channelId(b.id, "Wholesale");
    const customer = await ins("customers", { brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", sale_channel_id: wholesale });
    await priceSku(b.id, { saleChannelId: wholesale, brandId: brand.id, formatId: format.id, cents: 12000 });
    const shipTo = await ins("ship_tos", { brewery_id: b.id, customer_id: customer.id, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" });
    const order = await runCommand("create_order", { kind: "wholesale", customerId: customer.id, shipToId: shipTo.id, fromLocationId: wh.id, requestedShipDate: "2026-09-09", lines: [{ skuId: sku.id, qty: 1 }] }, adminCtx) as { order_id: string };
    await runCommand("submit_order", { orderId: order.order_id }, adminCtx);
    const vendor = await runCommand("upsert_vendor", { name: "Malt Co" }, adminCtx) as { id: string };
    const malt = await runCommand("upsert_material", { name: "2-row", category: "malt", baseUom: "lb", purchaseUom: "lb" }, adminCtx) as { id: string };
    const po = await runCommand("create_purchase_order", { vendorId: vendor.id, lines: [{ materialId: malt.id, qtyOrdered: 5 }] }, adminCtx) as { id: string };

    const kinds = async (ctx: Ctx) => (await runCommand("list_work", {}, ctx) as WorkRow[]).map((r) => `${r.kind}:${r.href}`);
    expect(await kinds(sales)).toContain(`orders:/orders/${order.order_id}`);
    expect(await kinds(sales)).not.toContain(`POs:/purchase-orders/${po.id}`);
    expect(await kinds(warehouse)).toContain(`POs:/purchase-orders/${po.id}`);
    expect((await kinds(brewer)).some((k) => k.startsWith("routes:"))).toBe(false);
    const all = await runCommand("list_work", {}, adminCtx) as WorkRow[];
    for (const r of all) expect(["orders", "transfers", "batches", "runs", "POs", "routes"]).toContain(r.kind);
    expect(all.every((r) => typeof r.label === "string" && typeof r.verb === "string")).toBe(true);
  });
});
