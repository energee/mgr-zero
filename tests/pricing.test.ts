// tests/pricing.test.ts — price tiers price formats by default and override per
// SKU (schema §16.4, unification plan D5A). Orders snapshot the override when
// present, else the format default; a SKU with neither is not priced.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, channelId, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let ctx: Ctx; let skuId: string; let formatId: string; let priceListId: string; let customerId: string; let shipToId: string; let whId: string; let breweryId: string;

beforeAll(async () => {
  const b = await makeBrewery();
  breweryId = b.id;
  ctx = await makeStaffCtx(b.id, "admin");
  ({ skuId, formatId } = await seedCatalog(b.id));
  ({ customerId, shipToId, priceListId } = await seedCustomer(b.id));
  whId = (await seedLocation(b.id)).id;
});

const draftPrice = async () => {
  const { order_id } = await runCommand("create_order", { kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 1 }] }, ctx) as { order_id: string };
  const { data } = await admin.from("order_lines").select("unit_price_cents").eq("order_id", order_id).single();
  return data!.unit_price_cents;
};

describe("price tiers", () => {
  it("unpriced sku is refused; format default prices it; sku override wins; clearing the override falls back", async () => {
    await expect(draftPrice()).rejects.toThrow(/priced/);
    await runCommand("set_price_list_format", { priceListId, formatId, unitPriceCents: 18000 }, ctx);
    expect(await draftPrice()).toBe(18000);
    await runCommand("set_price_list_item", { priceListId, skuId, unitPriceCents: 18500 }, ctx);
    expect(await draftPrice()).toBe(18500);
    const cleared = await runCommand("clear_price_list_item", { priceListId, skuId }, ctx) as { cleared: boolean };
    expect(cleared.cleared).toBe(true);
    expect(await draftPrice()).toBe(18000);
    const lists = await runCommand("list_price_lists", {}, ctx) as { id: string; price_list_formats: { format_id: string; unit_price_cents: number }[]; price_list_items: unknown[] }[];
    const pl = lists.find((l) => l.id === priceListId)!;
    expect(pl.price_list_formats).toEqual([{ format_id: formatId, unit_price_cents: 18000, formats: { name: expect.any(String) } }]);
    expect(pl.price_list_items).toEqual([]);
    const { data: prices } = await admin.from("sku_prices").select("sku_id, unit_price_cents, source").eq("price_list_id", priceListId);
    expect(prices).toEqual([{ sku_id: skuId, unit_price_cents: 18000, source: "format" }]);
  });
});

// Program 4 Task 3: a price list belongs to exactly one sale channel, so the
// channel a list prices for is structural rather than convention.
describe("a price list belongs to a channel", () => {
  it("upsert_price_list without a channel is refused", async () => {
    await expect(runCommand("upsert_price_list", { name: "channelless" }, ctx)).rejects.toBeTruthy();
  });

  it("upsert_price_list carries the channel, and changing it on edit sticks", async () => {
    const wholesale = await channelId(breweryId, "Wholesale");
    const taproom = await channelId(breweryId, "Taproom");
    const made = (await runCommand("upsert_price_list", { name: "channelled", channelId: wholesale }, ctx)) as { id: string; channel_id: string };
    expect(made.channel_id).toBe(wholesale);
    const edited = (await runCommand("upsert_price_list", { id: made.id, name: "channelled", channelId: taproom }, ctx)) as { channel_id: string };
    expect(edited.channel_id).toBe(taproom);
    const lists = (await runCommand("list_price_lists", {}, ctx)) as { id: string; channel_id: string; sale_channels: { name: string } | null }[];
    const row = lists.find((l) => l.id === made.id)!;
    expect(row.channel_id).toBe(taproom);
    expect(row.sale_channels?.name).toBe("Taproom");
  });

  it("a channel a price list prices for cannot be deleted", async () => {
    const b = await makeBrewery();
    const c = await makeStaffCtx(b.id, "admin");
    const dtc = await channelId(b.id, "DTC");
    await runCommand("upsert_price_list", { name: "dtc list", channelId: dtc }, c);
    await expect(runCommand("delete_sale_channel", { channelId: dtc }, c))
      .rejects.toMatchObject({ message: "channel is in use" });
  });
});
