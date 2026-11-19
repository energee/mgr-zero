// tests/portal-cola-labels.test.ts — Shop shows a brand's COLA label when MGR
// already stores a copy (cola_label_images). Buyers read only stored copies,
// only for brands priced on their own sale channel, never another customer's
// or brewery's, and never through TTB.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, sql } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

type Buyer = { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; roles: ["customer"]; customerId: string };
const PNG = "iVBORw0KGgo=";
const url = (n: string) => `https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=${n}.png&filetype=l`;
let breweryId: string, buyer: Buyer, onChannel: string, unpriced: string, noImage: string, twoLabels: string;

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
  return cat.brandId;
}

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  await makeStaffCtx(breweryId, "admin");
  const customer = await seedCustomer(breweryId);
  buyer = await buyerFor(customer.customerId, breweryId);
  onChannel = await brand(breweryId, "Label Lager", customer.saleChannelId);
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
  it("lists one stored label per brand the buyer can order, the earliest approval first", async () => {
    const rows = await runCommand("portal_cola_labels", {}, buyer) as { brandId: string; brand: string; ttbId: string }[];
    expect(rows.toSorted((a, b) => a.brand.localeCompare(b.brand))).toEqual([
      { brandId: onChannel, brand: "Label Lager", ttbId: "26001001000001" },
      { brandId: twoLabels, brand: "Twin IPA", ttbId: "26001001000004" },
    ]);
  });

  it("serves the stored image as a data URL, and nothing for a brand the buyer cannot see or with no copy", async () => {
    expect(await runCommand("portal_cola_label_image", { brandId: onChannel }, buyer)).toEqual({ dataUrl: `data:image/png;base64,${PNG}` });
    for (const brandId of [unpriced, noImage]) expect(await runCommand("portal_cola_label_image", { brandId }, buyer)).toEqual({ dataUrl: null });
  });

  it("gives another brewery's buyer nothing, even by brand id", async () => {
    const other = await makeBrewery();
    const otherCustomer = await seedCustomer(other.id);
    const outsider = await buyerFor(otherCustomer.customerId, other.id);
    expect(await runCommand("portal_cola_labels", {}, outsider)).toEqual([]);
    expect(await runCommand("portal_cola_label_image", { brandId: onChannel }, outsider)).toEqual({ dataUrl: null });
    // Passing someone else's customer id to the RPC directly returns nothing too.
    expect((await outsider.db.rpc("portal_cola_labels", { p_customer: buyer.customerId })).data).toEqual([]);
  });
});
