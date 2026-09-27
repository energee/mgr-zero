// tests/ship-short-reason.test.ts — #624: a wholesale line shipped below its
// picked quantity needs a reason, saved on order_lines.short_reason in the
// ship transaction, so staff (get_order) and the buyer (portal_order) read it.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, makeCustomerUser, asUser, seedCatalog, seedLocation, seedCustomer, priceSku } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { toPortalOrderViewProps, type PortalOrderSnapshot } from "@/lib/mgr/portal-order-view";
import "@/lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let custCtx: { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; role: "customer"; customerId: string };
let customerId: string, shipToId: string, whId: string, skuId: string;

beforeAll(async () => {
  const b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "admin");
  const wh = await seedLocation(b.id); whId = wh.id;
  const cat = await seedCatalog(b.id, { sku: "IPA 1/2bbl", packageType: "keg", bblPerUnit: 0.5 });
  skuId = cat.skuId;
  const cust = await seedCustomer(b.id);
  ({ customerId, shipToId } = cust);
  await priceSku(b.id, { saleChannelId: cust.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 12000 });
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: wh.binId, qty: 100, type: "opening_balance", created_by: ctx.userId });
  const user = await makeCustomerUser(customerId);
  custCtx = { db: await asUser(user.email), userId: user.id, breweryId: b.id, role: "customer", customerId };
});

/** A confirmed wholesale order of `qty`, picked at `picked`; returns ids. */
async function pickedOrder(qty: number, picked: number) {
  const { order_id: orderId } = await runCommand("create_order", {
    kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty }],
  }, ctx) as { order_id: string };
  await runCommand("submit_order", { orderId }, ctx);
  await runCommand("confirm_order", { orderId }, ctx);
  const { data: line } = await admin.from("order_lines").select("id").eq("order_id", orderId).single();
  await runCommand("record_pick", { orderId, picks: [{ lineId: line!.id, qty: picked }] }, ctx);
  return { orderId, lineId: line!.id };
}

const reasonOf = async (lineId: string) =>
  (await admin.from("order_lines").select("short_reason").eq("id", lineId).single()).data!.short_reason;

describe("ship_order short reason", () => {
  it("saves the reason with a short ship; staff and buyer both read it", async () => {
    const { orderId, lineId } = await pickedOrder(5, 5);
    await runCommand("ship_order", { orderId, ship: [{ lineId, qty: 3, shortReason: "two kegs leaking" }] }, ctx);
    expect(await reasonOf(lineId)).toBe("two kegs leaking");

    const staff = await runCommand("get_order", { orderId }, ctx) as { lines: { id: string; short_reason: string | null }[] };
    expect(staff.lines.find(l => l.id === lineId)!.short_reason).toBe("two kegs leaking");

    const buyer = await runCommand("portal_order", { orderId }, custCtx) as Omit<PortalOrderSnapshot, "backHref">;
    expect(buyer.lines.find(l => l.id === lineId)!.short_reason).toBe("two kegs leaking");
    expect(toPortalOrderViewProps({ ...buyer, backHref: "/portal/orders" }).shortageExplanation).toMatch(/Reason: two kegs leaking\./);
  });

  it("refuses a short wholesale ship without a reason, at the command and at the RPC", async () => {
    const { orderId, lineId } = await pickedOrder(5, 5);
    await expect(runCommand("ship_order", { orderId, ship: [{ lineId, qty: 3 }] }, ctx)).rejects.toThrow(/reason/i);
    for (const short_reason of [undefined, "   "]) {
      const direct = await ctx.db.rpc("ship_order", {
        p_order: orderId, p_ship: [{ line_id: lineId, qty_shipped: 3, ...(short_reason === undefined ? {} : { short_reason }) }],
        p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID(),
      });
      expect(direct.error?.message).toMatch(/shortage reason is required/);
    }
    const { data: o } = await admin.from("orders").select("status").eq("id", orderId).single();
    expect(o!.status).toBe("picked");
  });

  it("a full ship needs no reason and keeps the short-pick reason", async () => {
    const { orderId, lineId } = await pickedOrder(10, 10);
    await runCommand("resolve_short_pick", { orderId, lineId, qtyPicked: 7, reason: "short in pick face", resolution: "adjust_down" }, ctx);
    await runCommand("ship_order", { orderId, ship: [{ lineId, qty: 7 }] }, ctx);
    expect(await reasonOf(lineId)).toBe("short in pick face");
  });

  it("keeps an unchanged short-pick reason and replaces a changed one", async () => {
    const kept = await pickedOrder(10, 10);
    await runCommand("resolve_short_pick", { orderId: kept.orderId, lineId: kept.lineId, qtyPicked: 7, reason: "short in pick face", resolution: "keep_owed" }, ctx);
    await runCommand("ship_order", { orderId: kept.orderId, ship: [{ lineId: kept.lineId, qty: 6, shortReason: "short in pick face" }] }, ctx);
    expect(await reasonOf(kept.lineId)).toBe("short in pick face");

    const changed = await pickedOrder(10, 10);
    await runCommand("resolve_short_pick", { orderId: changed.orderId, lineId: changed.lineId, qtyPicked: 7, reason: "short in pick face", resolution: "keep_owed" }, ctx);
    await runCommand("ship_order", { orderId: changed.orderId, ship: [{ lineId: changed.lineId, qty: 6, shortReason: "one keg dented" }] }, ctx);
    expect(await reasonOf(changed.lineId)).toBe("one keg dented");
  });
});
