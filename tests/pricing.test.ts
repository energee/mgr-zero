// tests/pricing.test.ts — the price grid: channel × group × format (spec 2026-09-07-mgr-pricing-grid-naming).
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, seedPriceGroup, channelId, makeCustomerUser, asUser } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string }; let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let cat: Awaited<ReturnType<typeof seedCatalog>>; let wholesale: string; let taproom: string;
beforeAll(async () => {
  b = await makeBrewery(); ctx = await makeStaffCtx(b.id, "sales"); cat = await seedCatalog(b.id);
  wholesale = await channelId(b.id, "Wholesale"); taproom = await channelId(b.id, "Taproom");
});

// The grid RPCs run as staff: assert_staff reads auth.uid(), which the service
// key does not carry, so these go through the sales user's client.
async function setCell(channel: string, group: string, cents: number) {
  return ctx.db.rpc("set_channel_price", { p_brewery: b.id, p_sale_channel: channel, p_price_group: group, p_format: cat.formatId, p_unit_price_cents: cents, p_request_id: crypto.randomUUID() });
}

describe("price groups", () => {
  it("a group is unique by name and by position within a brewery", async () => {
    const t = await seedPriceGroup(b.id, "1", 1);
    const dupName = await admin.from("price_groups").insert({ brewery_id: b.id, name: "1", position: 9 });
    const dupPos = await admin.from("price_groups").insert({ brewery_id: b.id, name: "9", position: 1 });
    expect(dupName.error?.code).toBe("23505"); expect(dupPos.error?.code).toBe("23505");
    expect(t).toBeTruthy();
  });
  it("a brand on another brewery's group is rejected by the composite FK", async () => {
    const other = await makeBrewery(); const foreign = await seedPriceGroup(other.id, "1", 1);
    const { error } = await admin.from("brands").update({ price_group_id: foreign }).eq("id", cat.brandId);
    expect(error?.code).toBe("23503");
  });
});

describe("channel prices resolve one cell per channel × group × format", () => {
  let group: string;
  beforeAll(async () => {
    group = (await admin.from("price_groups").select("id").eq("brewery_id", b.id).eq("name", "1").single()).data!.id;
    await admin.from("brands").update({ price_group_id: group }).eq("id", cat.brandId);
  });
  it("an unpriced sku is not in sku_prices; a cell prices every sku of that brand's group on that channel", async () => {
    const before = await admin.from("sku_prices").select("sku_id").eq("brewery_id", b.id);
    expect(before.data).toEqual([]);
    const { error } = await setCell(wholesale, group, 13200); expect(error).toBeNull();
    const rows = await admin.from("sku_prices").select("sale_channel_id, sku_id, unit_price_cents").eq("brewery_id", b.id);
    expect(rows.data).toEqual([{ sale_channel_id: wholesale, sku_id: cat.skuId, unit_price_cents: 13200 }]);
  });
  it("the same sku prices differently per channel and repricing a cell replaces it", async () => {
    await setCell(taproom, group, 700);
    await setCell(wholesale, group, 13500);
    const rows = await admin.from("sku_prices").select("sale_channel_id, unit_price_cents").eq("sku_id", cat.skuId).order("unit_price_cents");
    expect(rows.data).toEqual([{ sale_channel_id: taproom, unit_price_cents: 700 }, { sale_channel_id: wholesale, unit_price_cents: 13500 }]);
  });
  it("clearing a cell unprices the sku on that channel only", async () => {
    const { error } = await ctx.db.rpc("clear_channel_price", { p_brewery: b.id, p_sale_channel: taproom, p_price_group: group, p_format: cat.formatId, p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    const rows = await admin.from("sku_prices").select("sale_channel_id").eq("sku_id", cat.skuId);
    expect(rows.data).toEqual([{ sale_channel_id: wholesale }]);
  });
  it("a channel, group or format with a cell cannot be deleted", async () => {
    const t = await admin.from("price_groups").delete().eq("id", group); expect(t.error?.code).toBe("23503");
    const f = await admin.from("formats").delete().eq("id", cat.formatId); expect(f.error?.code).toBe("23503");
    const c = await admin.from("sale_channels").delete().eq("id", wholesale); expect(c.error?.code).toBe("23503");
  });
});

describe("customers and orders carry the channel", () => {
  it("a customer needs a sale channel", async () => {
    const { error } = await admin.from("customers").insert({ brewery_id: b.id, name: "NoChan", type: "retailer", state: "PA" });
    expect(error?.code).toBe("23502");
  });
  it("create_order copies the customer's channel and prices lines from it; an unpriced sku is refused", async () => {
    const cust = await seedCustomer(b.id, { name: "Grid Bar" });
    const loc = await seedLocation(b.id);
    const created = await runCommand("create_order", { kind: "wholesale", customerId: cust.customerId, shipToId: cust.shipToId, fromLocationId: loc.id, lines: [{ skuId: cat.skuId, qty: 2 }] }, ctx) as { order_id: string };
    const o = await admin.from("orders").select("sale_channel_id, order_lines(unit_price_cents)").eq("id", created.order_id).single();
    expect(o.data!.sale_channel_id).toBe(wholesale);
    expect(o.data!.order_lines).toEqual([{ unit_price_cents: 13500 }]);
    const dtc = await seedCustomer(b.id, { name: "DTC Buyer", saleChannelId: await channelId(b.id, "DTC") });
    await expect(runCommand("create_order", { kind: "wholesale", customerId: dtc.customerId, shipToId: dtc.shipToId, fromLocationId: loc.id, lines: [{ skuId: cat.skuId, qty: 1 }] }, ctx))
      .rejects.toThrow(/not active and priced/);
  });
  it("a portal customer reads only its own channel's cells", async () => {
    const cust = await seedCustomer(b.id, { name: "Portal Co" });
    const email = (await makeCustomerUser(cust.customerId)).email; const db = await asUser(email);
    const cells = await db.from("channel_prices").select("sale_channel_id");
    expect(cells.data!.every((r) => r.sale_channel_id === wholesale)).toBe(true);
    expect(cells.data!.length).toBeGreaterThan(0);
    const chans = await db.from("sale_channels").select("id"); expect(chans.data).toEqual([]);
  });
});
