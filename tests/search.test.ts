// tests/search.test.ts — Program 10 task 3: one registered search across the
// entity kinds the caller may read. A document number (ORD-0001) matches
// exactly and sorts first; names match on prefix; a customer role is refused.
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, channelId, ins, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku } from "./helpers";
import { runCommand, type Ctx as CommandCtx } from "@/lib/commands/registry";
import type { SearchHit } from "@/lib/commands/search";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, orderId: string, skuId: string, customerId: string;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  const wh = await ins("locations", { brewery_id: b.id, name: "WH", kind: "warehouse" });
  const brand = await ins("brands", { brewery_id: b.id, name: "Hazy IPA" });
  const format = await ins("formats", { brewery_id: b.id, name: "1/2 bbl keg", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: 0.5 });
  skuId = (await ins("skus", { brewery_id: b.id, brand_id: brand.id, format_id: format.id, name: "Hazy IPA 1/2 bbl" })).id;
  const wholesale = await channelId(b.id, "Wholesale");
  customerId = (await ins("customers", { brewery_id: b.id, name: "Ridgeline Tap Room", type: "retailer", state: "PA", sale_channel_id: wholesale })).id;
  await priceSku(b.id, { saleChannelId: wholesale, brandId: brand.id, formatId: format.id, cents: 12000 });
  const shipTo = await ins("ship_tos", { brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" });
  orderId = ((await runCommand("create_order", { kind: "wholesale", customerId, shipToId: shipTo.id, fromLocationId: wh.id, lines: [{ skuId, qty: 1 }] }, adminCtx)) as { order_id: string }).order_id;
});

const search = (q: string, ctx: CommandCtx = adminCtx, kinds?: string[]) => runCommand("search_entities", { q, kinds }, ctx) as Promise<SearchHit[]>;

describe("search_entities", () => {
  it("a document number matches exactly and sorts first", async () => {
    const hits = await search("ORD-0001");
    expect(hits[0]).toMatchObject({ kind: "order", id: orderId, href: `/orders/${orderId}` });
  });
  it("a name matches on prefix across kinds", async () => {
    const hits = await search("Haz");
    expect(hits.map((h) => `${h.kind}:${h.id}`)).toContain(`sku:${skuId}`);
    expect((await search("ridge")).map((h) => h.id)).toContain(customerId);
    expect(await search("zzz-nothing")).toEqual([]);
  });
  it("kinds narrow the search and never widen it", async () => {
    const hits = await search("Haz", adminCtx, ["customer"]);
    expect(hits.map((h) => h.kind)).not.toContain("sku");
  });
  it("refuses a customer role", async () => {
    const u = await makeCustomerUser(customerId);
    const db = await asUser(u.email);
    await expect(search("Haz", { db, userId: u.id, breweryId: b.id, role: "customer", customerId })).rejects.toThrow(/permission denied/);
  });
});
