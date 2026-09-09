import { beforeAll, describe, expect, it, vi } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import { quotePortalOrder } from "@/lib/commands/portal";
import { QboOAuthClient } from "@/lib/qbo";
import "@/lib/commands/all";
import {
  admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx,
  priceSku, seedCatalog, seedCustomer, seedLocation, sql,
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

  it("rejects price, ship-to, source, or deposit drift without writing an order", async () => {
    const submit = async () => {
      const quote = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as any;
      return runCommand("portal_submit_quote", { quoteId: quote.quoteId }, fixture.ctx);
    };
    const before = await orderCount(fixture.brewery.id);

    const price = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as any;
    await priceSku(fixture.brewery.id, { saleChannelId: fixture.customer.saleChannelId, brandId: fixture.catalog.brandId, formatId: fixture.catalog.formatId, cents: 3700 });
    await expect(runCommand("portal_submit_quote", { quoteId: price.quoteId }, fixture.ctx)).rejects.toThrow(/review the current quote/);
    await priceSku(fixture.brewery.id, { saleChannelId: fixture.customer.saleChannelId, brandId: fixture.catalog.brandId, formatId: fixture.catalog.formatId, cents: 3600 });

    const address = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as any;
    await admin.from("ship_tos").update({ address1: "2 Changed St" }).eq("id", fixture.customer.shipToId);
    await expect(runCommand("portal_submit_quote", { quoteId: address.quoteId }, fixture.ctx)).rejects.toThrow(/review the current quote/);
    await admin.from("ship_tos").update({ address1: "1 Main St" }).eq("id", fixture.customer.shipToId);

    const source = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as any;
    const otherSource = await seedLocation(fixture.brewery.id, { name: "Other portal warehouse" });
    await runCommand("set_portal_fulfillment_source", { locationId: otherSource.id }, fixture.adminCtx);
    await expect(runCommand("portal_submit_quote", { quoteId: source.quoteId }, fixture.ctx)).rejects.toThrow(/review the current quote/);
    await runCommand("set_portal_fulfillment_source", { locationId: fixture.source.id }, fixture.adminCtx);

    const deposit = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as any;
    await admin.from("keg_pools").update({ deposit_cents: 2600 }).eq("id", fixture.poolId);
    await expect(runCommand("portal_submit_quote", { quoteId: deposit.quoteId }, fixture.ctx)).rejects.toThrow(/review the current quote/);
    await admin.from("keg_pools").update({ deposit_cents: 2500 }).eq("id", fixture.poolId);

    expect(await orderCount(fixture.brewery.id)).toBe(before);
    await expect(submit()).resolves.toMatchObject({ order_id: expect.any(String) });
  });

  it("replays a committed submit after quote expiry and catalog change without a duplicate", async () => {
    const quote = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as any;
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const first = await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, fixture.ctx, execution) as any;
    await fixture.adminCtx.db.from("channel_prices").select("unit_price_cents");
    await priceSku(fixture.brewery.id, { saleChannelId: fixture.customer.saleChannelId, brandId: fixture.catalog.brandId, formatId: fixture.catalog.formatId, cents: 3900 });
    sql(`update private.portal_order_quotes set expires_at=now()-interval '1 second' where id='${quote.quoteId}'`);
    expect(await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, fixture.ctx, execution)).toEqual(first);
    expect((await admin.from("orders").select("id").eq("id", first.order_id)).data).toHaveLength(1);
    await priceSku(fixture.brewery.id, { saleChannelId: fixture.customer.saleChannelId, brandId: fixture.catalog.brandId, formatId: fixture.catalog.formatId, cents: 3600 });
  });

  it("calculates entitled tax through the narrow quote credential boundary", async () => {
    const realm = `realm-${crypto.randomUUID()}`;
    const connection = await admin.from("qbo_connections").insert({
      brewery_id: fixture.brewery.id, realm_id: realm, state: "connected",
      granted_scopes: ["com.intuit.quickbooks.accounting", "indirect-tax.tax-calculation.quickbooks"],
      qbo_deposit_item_id: "deposit-item",
    }).select("id").single();
    expect(connection.error).toBeNull();
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
      values('${fixture.brewery.id}','qbo','${connection.data!.id}','tax-access','tax-refresh')`);
    expect((await admin.from("locations").update({ address: "10 Brewery Rd, Town, PA 19000" }).eq("id", fixture.source.id)).error).toBeNull();
    expect((await admin.from("customers").update({ qbo_customer_id: "customer-item", qbo_realm_id: realm }).eq("id", fixture.customer.customerId)).error).toBeNull();
    expect((await admin.from("skus").update({ qbo_item_id: "beer-item", qbo_realm_id: realm }).eq("id", fixture.catalog.skuId)).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: { indirectTaxCalculateSaleTransactionTax: { taxCalculation: {
        taxTotals: { totalTaxAmountExcludingShipping: { value: "7.25", currency: "USD" } },
        shipping: { taxAmount: { value: "1.00", currency: "USD" } },
      } } },
    }), { status: 200 }));
    const client = new QboOAuthClient({
      clientId: "client", clientSecret: "secret", redirectUri: "https://mgr.test/qbo",
      apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com", taxApiBaseUrl: "https://qb-sandbox.api.intuit.com/graphql",
    }, fetch);
    await expect(quotePortalOrder(fixture.ctx, quoteInput(fixture), crypto.randomUUID(), client)).resolves.toMatchObject({
      taxStatus: "calculated", taxCents: 825, totalCents: 13025,
    });
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.variables.input.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ productVariantTaxability: { productVariantId: "beer-item" } }),
      expect.objectContaining({ productVariantTaxability: { productVariantId: "deposit-item" } }),
    ]));
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
  return { brewery, adminCtx, source, catalog, customer, poolId: pool.data!.id as string, ctx: { db, userId: buyer.id, breweryId: brewery.id, role: "customer" as const, customerId: customer.customerId } };
}

const quoteInput = (f: Awaited<ReturnType<typeof setup>>) => ({
  shipToId: f.customer.shipToId, requestedShipDate: "2026-10-10",
  poNumber: "quoted", note: "reviewed", lines: [{ skuId: f.catalog.skuId, qty: 2 }],
});
const orderCount = async (breweryId: string) => (await admin.from("orders").select("id", { count: "exact", head: true }).eq("brewery_id", breweryId)).count ?? 0;
