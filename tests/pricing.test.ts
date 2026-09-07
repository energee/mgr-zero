// tests/pricing.test.ts — the price grid: channel × group × format (spec 2026-09-07-mgr-pricing-grid-naming).
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, seedPriceGroup, channelId, makeCustomerUser, asUser } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string }; let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let cat: Awaited<ReturnType<typeof seedCatalog>>; let wholesale: string; let taproom: string; let group: string;
beforeAll(async () => {
  b = await makeBrewery(); ctx = await makeStaffCtx(b.id, "sales"); cat = await seedCatalog(b.id);
  wholesale = await channelId(b.id, "Wholesale"); taproom = await channelId(b.id, "Taproom");
  group = await seedPriceGroup(b.id, "1", 1);   // the one row every describe below prices on
});

// The grid RPCs run as staff: assert_staff reads auth.uid(), which the service
// key does not carry, so these go through the sales user's client.
async function setCell(channel: string, group: string, cents: number) {
  return ctx.db.rpc("set_channel_price", { p_brewery: b.id, p_sale_channel: channel, p_price_group: group, p_format: cat.formatId, p_unit_price_cents: cents, p_request_id: crypto.randomUUID() });
}

const group_rpc = (p: Record<string, unknown>) => ctx.db.rpc("upsert_price_group", { p_brewery: b.id, p_id: null, p_cost_ceiling_cents: null, p_request_id: crypto.randomUUID(), ...p });

describe("price groups", () => {
  it("a group is unique by name and by position within a brewery", async () => {
    const dupName = await admin.from("price_groups").insert({ brewery_id: b.id, name: "1", position: 9 });
    const dupPos = await admin.from("price_groups").insert({ brewery_id: b.id, name: "9", position: 1 });
    expect(dupName.error?.code).toBe("23505"); expect(dupPos.error?.code).toBe("23505");
  });
  it("upsert_price_group creates, renames, and refuses a duplicate name or position", async () => {
    const made = await group_rpc({ p_name: "2", p_position: 2 });
    expect(made.error).toBeNull();
    expect(made.data).toMatchObject({ name: "2", position: 2, cost_ceiling_cents: null });
    const id = (made.data as { id: string }).id;

    // an update keeps the row and takes the ceiling (#189 D7: it only suggests)
    const renamed = await group_rpc({ p_id: id, p_name: "2A", p_position: 2, p_cost_ceiling_cents: 4200 });
    expect(renamed.error).toBeNull();
    expect(renamed.data).toMatchObject({ id, name: "2A", cost_ceiling_cents: 4200 });

    const dupName = await group_rpc({ p_name: "1", p_position: 7 });
    expect(dupName.error?.message).toBe("a price group with that name or position already exists");
    const dupPos = await group_rpc({ p_name: "7", p_position: 1 });
    expect(dupPos.error?.message).toBe("a price group with that name or position already exists");
    const dupOnUpdate = await group_rpc({ p_id: id, p_name: "1", p_position: 2 });
    expect(dupOnUpdate.error?.message).toBe("a price group with that name or position already exists");
  });
  it("upsert_price_group and delete_price_group refuse an unknown id", async () => {
    const unknown = crypto.randomUUID();
    const updated = await group_rpc({ p_id: unknown, p_name: "ghost", p_position: 99 });
    expect(updated.error?.message).toBe("price group not found");
    const deleted = await ctx.db.rpc("delete_price_group", { p_brewery: b.id, p_id: unknown, p_request_id: crypto.randomUUID() });
    expect(deleted.error?.message).toBe("price group not found");
  });
  it("delete_price_group removes an unused group but a group a brand sits on is held by the FK", async () => {
    const spare = await group_rpc({ p_name: "spare", p_position: 50 });
    const spareId = (spare.data as { id: string }).id;
    const gone = await ctx.db.rpc("delete_price_group", { p_brewery: b.id, p_id: spareId, p_request_id: crypto.randomUUID() });
    expect(gone.error).toBeNull();
    expect(gone.data).toEqual({ id: spareId, deleted: true });
    expect((await admin.from("price_groups").select("id").eq("id", spareId).maybeSingle()).data).toBeNull();

    // cat.brandId sits on `group` (set below); the composite FK raises 23503.
    await admin.from("brands").update({ price_group_id: group }).eq("id", cat.brandId);
    const held = await ctx.db.rpc("delete_price_group", { p_brewery: b.id, p_id: group, p_request_id: crypto.randomUUID() });
    expect(held.error?.code).toBe("23503");
  });
  it("a brand on another brewery's group is rejected by the composite FK", async () => {
    const other = await makeBrewery(); const foreign = await seedPriceGroup(other.id, "1", 1);
    const { error } = await admin.from("brands").update({ price_group_id: foreign }).eq("id", cat.brandId);
    expect(error?.code).toBe("23503");
  });
});

describe("channel prices resolve one cell per channel × group × format", () => {
  beforeAll(async () => {
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
    // and the RPC says so in words rather than letting the not-null speak
    const rpc = await ctx.db.rpc("upsert_customer", {
      p_brewery: b.id, p_id: null, p_name: "NoChan RPC", p_type: "retailer", p_state: "PA",
      p_sale_channel: null, p_license_no: null, p_payment_terms: null, p_tax_treatment: null,
      p_request_id: crypto.randomUUID(),
    });
    expect(rpc.error?.message).toBe("customer needs a sale channel");
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

// The commands over those RPCs. Its own brewery: the describes above leave
// `b` with groups "1" and "2A", and these assert on the whole group list.
describe("pricing commands", () => {
  let cb: { id: string }; let cctx: Awaited<ReturnType<typeof makeStaffCtx>>;
  let ccat: Awaited<ReturnType<typeof seedCatalog>>; let cWholesale: string;
  beforeAll(async () => {
    cb = await makeBrewery(); cctx = await makeStaffCtx(cb.id, "sales"); ccat = await seedCatalog(cb.id);
    cWholesale = await channelId(cb.id, "Wholesale");
    await seedPriceGroup(cb.id, "1", 1);
  });

  it("upsert_price_group creates and renames; a duplicate position is refused with copy", async () => {
    const t = await runCommand("upsert_price_group", { name: "2", position: 2 }, cctx) as { id: string; name: string };
    expect(t.name).toBe("2");
    const renamed = await runCommand("upsert_price_group", { id: t.id, name: "two", position: 2, costCeilingCents: 900 }, cctx) as { name: string; cost_ceiling_cents: number };
    expect(renamed).toMatchObject({ name: "two", cost_ceiling_cents: 900 });
    await expect(runCommand("upsert_price_group", { name: "three", position: 1 }, cctx)).rejects.toThrow(/already exists/);
    const groups = await runCommand("list_price_groups", {}, cctx) as { name: string }[];
    expect(groups.map((x) => x.name)).toEqual(["1", "two"]);
  });

  it("set_channel_price fills a cell, list_channel_prices reads it, clear_channel_price empties it; a group in use cannot be deleted", async () => {
    const groups = await runCommand("list_price_groups", {}, cctx) as { id: string; name: string }[];
    const t2 = groups.find((x) => x.name === "two")!.id;
    await runCommand("set_channel_price", { saleChannelId: cWholesale, priceGroupId: t2, formatId: ccat.formatId, unitPriceCents: 15400 }, cctx);
    const cells = await runCommand("list_channel_prices", { saleChannelId: cWholesale }, cctx) as { price_group_id: string; unit_price_cents: number; price_groups: { name: string }; formats: { name: string } }[];
    const cell = cells.find((c) => c.price_group_id === t2)!;
    expect(cell.unit_price_cents).toBe(15400);
    expect(cell.price_groups.name).toBe("two");
    expect(cell.formats.name).toBeTruthy();
    await expect(runCommand("delete_price_group", { priceGroupId: t2 }, cctx)).rejects.toThrow(/in use/);
    await runCommand("clear_channel_price", { saleChannelId: cWholesale, priceGroupId: t2, formatId: ccat.formatId }, cctx);
    await runCommand("delete_price_group", { priceGroupId: t2 }, cctx);
    expect((await runCommand("list_price_groups", {}, cctx) as unknown[]).length).toBe(1);
  });

  it("upsert_customer requires a sale channel and upsert_brand takes a price group", async () => {
    await expect(runCommand("upsert_customer", { name: "X", type: "retailer", state: "PA" }, cctx)).rejects.toThrow();
    const c = await runCommand("upsert_customer", { name: "X", type: "retailer", state: "PA", saleChannelId: cWholesale }, cctx) as { id: string; sale_channel_id: string };
    expect(c.sale_channel_id).toBe(cWholesale);
    const listed = await runCommand("list_customers", {}, cctx) as { id: string; sale_channels: { name: string } }[];
    expect(listed.find((r) => r.id === c.id)!.sale_channels.name).toBe("Wholesale");
    const pg = (await runCommand("list_price_groups", {}, cctx) as { id: string }[])[0].id;
    const br = await runCommand("upsert_brand", { id: ccat.brandId, name: "Hazy", priceGroupId: pg }, cctx) as { price_group_id: string };
    expect(br.price_group_id).toBe(pg);
  });

  it("warehouse can list groups but not set a price", async () => {
    const wh = await makeStaffCtx(cb.id, "warehouse");
    await runCommand("list_price_groups", {}, wh);
    const pg = (await runCommand("list_price_groups", {}, cctx) as { id: string }[])[0].id;
    await expect(runCommand("set_channel_price", { saleChannelId: cWholesale, priceGroupId: pg, formatId: ccat.formatId, unitPriceCents: 1 }, wh)).rejects.toThrow();
  });
});
