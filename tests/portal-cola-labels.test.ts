// tests/portal-cola-labels.test.ts — Shop and orders show a brand's COLA label
// when MGR already stores a copy (cola_label_images), and a reference sheet of
// the brand's sell-sheet fields (portal_brands). Buyers read only stored
// copies, only for brands priced on their own sale channel, never another
// customer's or brewery's, and never through TTB.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

type Buyer = { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; roles: ["customer"]; customerId: string };
const PNG = "iVBORw0KGgo=";
const url = (n: string) => `https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=${n}.png&filetype=l`;
let breweryId: string, buyer: Buyer, onChannel: string, onChannelSku: string, unpriced: string, noImage: string, twoLabels: string, shipToId: string;

async function buyerFor(customerId: string, brewery: string): Promise<Buyer> {
  const user = await makeCustomerUser(customerId);
  return { db: await asUser(user.email), userId: user.id, breweryId: brewery, roles: ["customer"], customerId };
}

/** An approved COLA saved on the brand with its label image; `stored` also keeps MGR's copy. */
async function cola(brewery: string, brandId: string, ttbId: string, approvedOn: string, stored = true) {
  await admin.from("brand_approvals").insert({ brewery_id: brewery, brand_id: brandId, kind: "cola", ttb_id: ttbId, approved_on: approvedOn, image_url: url(ttbId) }).throwOnError();
  if (stored) await sql(`insert into public.cola_label_images (brewery_id, ttb_id, image_url, content_type, bytes) values ('${brewery}', '${ttbId}', '${url(ttbId)}', 'image/png', decode('${PNG}', 'base64'))`);
}

async function brand(brewery: string, name: string, saleChannelId?: string) {
  const cat = await seedCatalog(brewery, { product: name, sku: `${name} case` });
  if (saleChannelId) await priceSku(brewery, { saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 1000 });
  skus.set(cat.brandId, cat.skuId);
  return cat.brandId;
}
const skus = new Map<string, string>();

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  const adminCtx = await makeStaffCtx(breweryId, "admin");
  await runCommand("set_portal_fulfillment_source", { locationId: (await seedLocation(breweryId)).id }, adminCtx);
  const customer = await seedCustomer(breweryId);
  buyer = await buyerFor(customer.customerId, breweryId);
  shipToId = customer.shipToId;
  onChannel = await brand(breweryId, "Label Lager", customer.saleChannelId);
  onChannelSku = skus.get(onChannel)!;
  await cola(breweryId, onChannel, "26001001000001", "2026-01-05");
  // Not priced on the buyer's channel: its label stays hidden.
  unpriced = await brand(breweryId, "Unpriced Porter");
  await cola(breweryId, unpriced, "26001001000002", "2026-01-05");
  // Approved and saved, but MGR has no copy yet: nothing (never a TTB fetch).
  noImage = await brand(breweryId, "Unfetched Saison", customer.saleChannelId);
  await cola(breweryId, noImage, "26001001000003", "2026-01-05", false);
  // Two stored labels: the earliest approval wins.
  twoLabels = await brand(breweryId, "Twin IPA", customer.saleChannelId);
  await cola(breweryId, twoLabels, "26001001000005", "2026-03-01");
  await cola(breweryId, twoLabels, "26001001000004", "2026-02-01");
});

describe("portal COLA labels", () => {
  it("lists each brand the buyer can order, with its label's TTB id: the stored one, earliest approval first", async () => {
    const rows = await runCommand("portal_brands", {}, buyer) as { brandId: string; name: string; ttbId: string | null; hasLabel: boolean }[];
    expect(rows.map(({ brandId, name, ttbId, hasLabel }) => ({ brandId, name, ttbId, hasLabel }))).toEqual([
      { brandId: onChannel, name: "Label Lager", ttbId: "26001001000001", hasLabel: true },
      { brandId: twoLabels, name: "Twin IPA", ttbId: "26001001000004", hasLabel: true },
      // Approved COLA but no stored copy: the TTB id, no image.
      { brandId: noImage, name: "Unfetched Saison", ttbId: "26001001000003", hasLabel: false },
    ]);
  });

  it("carries the brand's sell-sheet fields, and nothing for unset ones", async () => {
    const style = (await admin.from("styles").insert({ brewery_id: breweryId, name: "Helles" }).select("id").single()).data!;
    await admin.from("brands").update({ alias: "Lager #1", style_id: style.id, abv: 4.8, description: "Soft and bready.", hops: "Tettnang" }).eq("id", onChannel).throwOnError();
    const rows = await runCommand("portal_brands", {}, buyer) as Record<string, unknown>[];
    expect(rows.find((r) => r.brandId === onChannel)).toEqual({ brandId: onChannel, name: "Label Lager", alias: "Lager #1", style: "Helles", abv: 4.8, description: "Soft and bready.", hops: "Tettnang", ttbId: "26001001000001", hasLabel: true });
    expect(rows.find((r) => r.brandId === twoLabels)).toMatchObject({ alias: null, style: null, abv: null, description: null, hops: null });
  });

  it("names each order line's brand by id, so an order groups lines under brand headings", async () => {
    const draft = await runCommand("portal_create_order", { shipToId, lines: [{ skuId: onChannelSku, qty: 1 }] }, buyer) as { order_id: string };
    const { lines } = await runCommand("portal_order", { orderId: draft.order_id }, buyer) as { lines: { skus: { brands: { id: string } } }[] };
    expect(lines[0].skus.brands.id).toBe(onChannel);
  });

  it("serves the stored image as a data URL, and nothing for a brand the buyer cannot see or with no copy", async () => {
    expect(await runCommand("portal_cola_label_image", { brandId: onChannel }, buyer)).toEqual({ dataUrl: `data:image/png;base64,${PNG}` });
    for (const brandId of [unpriced, noImage]) expect(await runCommand("portal_cola_label_image", { brandId }, buyer)).toEqual({ dataUrl: null });
  });

  it("gives another brewery's buyer nothing, even by brand id", async () => {
    const other = await makeBrewery();
    const otherCustomer = await seedCustomer(other.id);
    const outsider = await buyerFor(otherCustomer.customerId, other.id);
    expect(await runCommand("portal_brands", {}, outsider)).toEqual([]);
    expect(await runCommand("portal_cola_label_image", { brandId: onChannel }, outsider)).toEqual({ dataUrl: null });
    // Passing someone else's customer id to the RPC directly returns nothing too.
    expect((await outsider.db.rpc("portal_brand_rows", { p_customer: buyer.customerId })).data).toEqual([]);
  });
});
