import { beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import {
  admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx,
  priceSku, seedCatalog, seedCustomer, seedLocation,
} from "./helpers";

describe("portal order quote", () => {
  let fixture: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => { fixture = await setup(); });

  it("freezes the selected customer's price, deposit, addresses, and honest pending tax", async () => {
    const quote = await runCommand("portal_quote_order", {
      shipToId: fixture.customer.shipToId,
      requestedShipDate: "2026-10-10",
      lines: [{ skuId: fixture.catalog.skuId, qty: 2 }],
    }, fixture.ctx) as any;

    expect(quote).toMatchObject({
      taxStatus: "pending",
      subtotalCents: 7200,
      depositCents: 5000,
      amountBeforeTaxCents: 12200,
      source: { id: fixture.source.id, name: "Portal warehouse" },
      destination: { address1: "1 Main St", city: "Town", state: "PA", zip: "19100" },
      lines: [{ skuId: fixture.catalog.skuId, qty: 2, unitPriceCents: 3600, amountCents: 7200 }],
      deposits: [{ qty: 2, unitPriceCents: 2500, amountCents: 5000 }],
    });
    expect(quote.quoteId).toMatch(/^[0-9a-f-]{36}$/);
    expect(quote).not.toHaveProperty("totalCents");
  });
});

async function setup() {
  const brewery = await makeBrewery();
  const adminCtx = await makeStaffCtx(brewery.id);
  const source = await seedLocation(brewery.id, { name: "Portal warehouse" });
  const catalog = await seedCatalog(brewery.id, { product: "Quoted IPA", sku: "Quoted IPA keg", packageType: "keg", bblPerUnit: 0.5 });
  const customer = await seedCustomer(brewery.id);
  const pool = await admin.from("keg_pools").insert({ brewery_id: brewery.id, name: "Quoted pool", kind: "owned", deposit_cents: 2500 }).select("id").single();
  expect(pool.error).toBeNull();
  expect((await admin.from("skus").update({ container_source: "owned_fleet", keg_pool_id: pool.data!.id }).eq("id", catalog.skuId)).error).toBeNull();
  await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 3600 });
  const dtc = await admin.from("sale_channels").select("id").eq("brewery_id", brewery.id).eq("name", "DTC").single();
  expect(dtc.error).toBeNull();
  await priceSku(brewery.id, { saleChannelId: dtc.data!.id, brandId: catalog.brandId, formatId: catalog.formatId, cents: 9900 });
  await runCommand("set_portal_fulfillment_source", { locationId: source.id }, adminCtx);
  const buyer = await makeCustomerUser(customer.customerId);
  const db = await asUser(buyer.email);
  return { brewery, source, catalog, customer, ctx: { db, userId: buyer.id, breweryId: brewery.id, role: "customer" as const, customerId: customer.customerId } };
}
