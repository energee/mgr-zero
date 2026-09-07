// tests/pricing.test.ts — price tiers price formats by default and override per
// SKU (schema §16.4, unification plan D5A). Orders snapshot the override when
// present, else the format default; a SKU with neither is not priced.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let ctx: Ctx; let skuId: string; let formatId: string; let priceListId: string; let customerId: string; let shipToId: string; let whId: string;

beforeAll(async () => {
  const b = await makeBrewery();
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
