// tests/portal-brand-alias.test.ts — buyers read each line's brand, the brand's
// alias and the format name, so the portal names a line "Brand · Format" with
// the alias muted under it rather than reading the SKU name (which may carry the
// alias in place of the brand). portal_catalog, portal_order and portal_invoice
// carry them; buyers still cannot read brands, formats or skus directly.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

type Buyer = { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; roles: ["customer"]; customerId: string };
let skuId: string, buyer: Buyer, shipToId: string;
const brand = { name: "Masai Giraffe", alias: "Animal #31" };

beforeAll(async () => {
  const breweryId = (await makeBrewery()).id;
  const adminCtx = await makeStaffCtx(breweryId, "admin");
  const b = (await admin.from("brands").insert({ brewery_id: breweryId, ...brand }).select("id").single()).data!;
  const f = (await admin.from("formats").insert({ brewery_id: breweryId, name: "Sixtel", basis: "packaged", package_type: "keg", keg_size: "sixth_bbl", bbl_per_unit: 1 / 6 }).select("id").single()).data!;
  // The SKU name carries the alias, as imported SKUs on dev do.
  skuId = (await admin.from("skus").insert({ brewery_id: breweryId, brand_id: b.id, format_id: f.id, name: "Animal #31 · Sixtel" }).select("id").single()).data!.id;
  const customer = await seedCustomer(breweryId);
  shipToId = customer.shipToId;
  await priceSku(breweryId, { saleChannelId: customer.saleChannelId, brandId: b.id, formatId: f.id, cents: 9000 });
  const warehouse = await seedLocation(breweryId);
  await runCommand("set_portal_fulfillment_source", { locationId: warehouse.id }, adminCtx);
  const user = await makeCustomerUser(customer.customerId);
  buyer = { db: await asUser(user.email), userId: user.id, breweryId, roles: ["customer"], customerId: customer.customerId };
});

describe("portal brand alias", () => {
  it("portal_catalog names the brand, its alias and the format", async () => {
    const items = await runCommand("portal_catalog", {}, buyer) as Record<string, unknown>[];
    expect(items.find((i) => i.skuId === skuId)).toMatchObject({ product: "Masai Giraffe", brandAlias: "Animal #31", formatName: "Sixtel" });
  });

  it("portal_order lines carry brand, alias and format beside the SKU name", async () => {
    const draft = await runCommand("portal_create_order", { shipToId, lines: [{ skuId, qty: 2 }] }, buyer) as { order_id: string };
    const { lines } = await runCommand("portal_order", { orderId: draft.order_id }, buyer) as { lines: { skus: unknown }[] };
    expect(lines[0].skus).toEqual({ name: "Animal #31 · Sixtel", brands: { id: expect.any(String), ...brand }, formats: { name: "Sixtel" } });
  });
});
