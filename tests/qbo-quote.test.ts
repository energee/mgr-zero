import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { z } from "zod";
import { runCommand } from "@/lib/commands/registry";
import { quotePortalOrder } from "@/lib/commands/portal";
import { QboOAuthClient, refreshQboCredentials } from "@/lib/qbo";
import { readPortalQuoteTaxTokens } from "@/lib/supabase/integration-tokens";
import "@/lib/commands/all";
import {
  admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx,
  DB, priceSku, seedCatalog, seedCustomer, seedLocation, sql,
} from "./helpers";

describe("portal order quote", () => {
  let fixture: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => { fixture = await setup(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("freezes the selected customer's price, deposit, addresses, and honest pending tax", async () => {
    const quote = await runCommand("portal_quote_order", {
      shipToId: fixture.customer.shipToId,
      requestedShipDate: "2026-10-10",
      lines: [{ skuId: fixture.catalog.skuId, qty: 2 }],
    }, fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;

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
      const quote = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;
      return runCommand("portal_submit_quote", { quoteId: quote.quoteId }, fixture.ctx);
    };
    const before = await orderCount(fixture.brewery.id);

    const price = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;
    await priceSku(fixture.brewery.id, { saleChannelId: fixture.customer.saleChannelId, brandId: fixture.catalog.brandId, formatId: fixture.catalog.formatId, cents: 3700 });
    await expect(runCommand("portal_submit_quote", { quoteId: price.quoteId }, fixture.ctx)).rejects.toThrow(/review the current quote/);
    await priceSku(fixture.brewery.id, { saleChannelId: fixture.customer.saleChannelId, brandId: fixture.catalog.brandId, formatId: fixture.catalog.formatId, cents: 3600 });

    const address = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;
    await admin.from("ship_tos").update({ address1: "2 Changed St" }).eq("id", fixture.customer.shipToId);
    await expect(runCommand("portal_submit_quote", { quoteId: address.quoteId }, fixture.ctx)).rejects.toThrow(/review the current quote/);
    await admin.from("ship_tos").update({ address1: "1 Main St" }).eq("id", fixture.customer.shipToId);

    const source = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;
    const otherSource = await seedLocation(fixture.brewery.id, { name: "Other portal warehouse" });
    await runCommand("set_portal_fulfillment_source", { locationId: otherSource.id }, fixture.adminCtx);
    await expect(runCommand("portal_submit_quote", { quoteId: source.quoteId }, fixture.ctx)).rejects.toThrow(/review the current quote/);
    await runCommand("set_portal_fulfillment_source", { locationId: fixture.source.id }, fixture.adminCtx);

    const deposit = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;
    await admin.from("keg_pools").update({ deposit_cents: 2600 }).eq("id", fixture.poolId);
    await expect(runCommand("portal_submit_quote", { quoteId: deposit.quoteId }, fixture.ctx)).rejects.toThrow(/review the current quote/);
    await admin.from("keg_pools").update({ deposit_cents: 2500 }).eq("id", fixture.poolId);

    expect(await orderCount(fixture.brewery.id)).toBe(before);
    await expect(submit()).resolves.toMatchObject({ order_id: expect.any(String) });
  });

  it("replays a committed submit after quote expiry and catalog change without a duplicate", async () => {
    const quote = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const first = await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, fixture.ctx, execution) as { order_id: string };
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

  it.each([
    { outcome: "success", calls: 3 }, { outcome: "retry_401", calls: 3 }, { outcome: "tax_500", calls: 1 },
    { outcome: "invalid_grant", calls: 2 }, { outcome: "network", calls: 1 },
  ] as const)(
    "refreshes quote tax once on 401 and handles $outcome without losing the quote",
    async ({ outcome, calls }) => {
      const f = await setup();
      const { config, connectionId } = await enableTax(f);
      const logs = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, init) => {
        if (String(url).includes("/tokens/bearer")) {
          expect(String(init?.body)).toContain("tax-refresh");
          return outcome === "invalid_grant"
            ? new Response(JSON.stringify({ error: "invalid_grant", error_description: "provider-secret" }), { status: 400 })
            : new Response(JSON.stringify({ access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 3600 }), { status: 200 });
        }
        if (outcome === "network") throw new Error("Bearer tax-access provider-secret");
        if (outcome === "tax_500") return new Response("provider-secret", { status: 500 });
        if (new Headers(init?.headers).get("Authorization") === "Bearer rotated-access" && outcome === "success") return calculatedTax();
        return new Response("provider-secret", { status: 401 });
      });
      const quote = await quotePortalOrder(f.ctx, quoteInput(f), crypto.randomUUID(), new QboOAuthClient(config, fetch));
      expect(quote).toMatchObject(outcome === "success"
        ? { taxStatus: "calculated", taxCents: 100, totalCents: 12300 }
        : { taxStatus: "pending", amountBeforeTaxCents: 12200 });
      expect(fetch).toHaveBeenCalledTimes(calls);
      expect(logs).toHaveBeenCalledWith(outcome === "success" ? "portal_quote_tax_unauthorized" : "portal_quote_tax_failed", expect.any(Object));
      expect(JSON.stringify(logs.mock.calls)).not.toMatch(/tax-access|tax-refresh|rotated-access|rotated-refresh|provider-secret/);
      expect(sql(`select state from public.qbo_connections where id='${connectionId}'`))
        .toEqual([outcome === "invalid_grant" ? "recovery_required" : "connected"]);
      if (outcome === "success" || outcome === "retry_401") {
        expect(sql(`select refresh_token from private.integration_tokens where connection_id='${connectionId}'`)).toEqual(["rotated-refresh"]);
      }
    },
  );

  it("limits quote refresh credentials and mutations to the live buyer claim", async () => {
    const f = await setup();
    const { config, connectionId } = await enableTax(f);
    const result = await f.ctx.db.rpc("portal_quote_order", {
      p_brewery: f.brewery.id, p_customer: f.customer.customerId, p_ship_to: f.customer.shipToId,
      p_note: null, p_po: null, p_requested: null,
      p_lines: [{ sku_id: f.catalog.skuId, qty: 2 }], p_request_id: crypto.randomUUID(),
    });
    expect(result.error).toBeNull();
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(result.data);
    const tokens = await readPortalQuoteTaxTokens(f.ctx, quoteId);
    const args = { p_brewery: f.brewery.id, p_customer: f.customer.customerId, p_quote: quoteId,
      p_actor: f.ctx.userId, p_connection: connectionId, p_expected_version: tokens.credentialVersion };
    for (const denied of [
      { ...args, p_actor: f.adminCtx.userId }, { ...args, p_customer: crypto.randomUUID() },
      { ...args, p_brewery: crypto.randomUUID() }, { ...args, p_quote: crypto.randomUUID() },
      { ...args, p_connection: crypto.randomUUID() },
    ]) {
      expect(await admin.rpc("lease_portal_quote_tax_refresh", { ...denied, p_lease: crypto.randomUUID() }))
        .toMatchObject({ data: "unavailable", error: null });
      expect(await admin.rpc("cas_portal_quote_tax_tokens", { ...denied, p_access_token: "forbidden",
        p_refresh_token: "forbidden", p_received_at: new Date().toISOString(), p_access_seconds: 3600,
        p_refresh_seconds: null, p_hard_seconds: null, p_lease: crypto.randomUUID() })).toMatchObject({ data: false, error: null });
      expect(await admin.rpc("mark_portal_quote_tax_authorization_failed", denied)).toMatchObject({ data: false, error: null });
    }
    expect(await admin.rpc("cas_portal_quote_tax_tokens", { ...args, p_access_token: "forbidden",
      p_refresh_token: "forbidden", p_received_at: new Date().toISOString(), p_access_seconds: 3600,
      p_refresh_seconds: null, p_hard_seconds: null, p_lease: crypto.randomUUID() }))
      .toMatchObject({ data: false, error: null });
    expect((await f.ctx.db.rpc("read_portal_quote_tax_tokens", {
      p_brewery: args.p_brewery, p_customer: args.p_customer, p_quote: quoteId, p_actor: args.p_actor,
    })).error?.code).toBe("42501");
    expect(sql(`select p.proname||':'||r.role from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join (values ('anon'),('authenticated'),('service_role')) r(role)
      where n.nspname='public' and p.proname in ('read_portal_quote_tax_tokens','lease_portal_quote_tax_refresh',
        'cas_portal_quote_tax_tokens','mark_portal_quote_tax_authorization_failed')
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual([
      "cas_portal_quote_tax_tokens:service_role", "lease_portal_quote_tax_refresh:service_role",
      "mark_portal_quote_tax_authorization_failed:service_role", "read_portal_quote_tax_tokens:service_role",
    ]);
    sql(`update private.portal_order_quotes set expires_at=now()-interval '1 second' where id='${quoteId}'`);
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(refreshQboCredentials(f.ctx, new QboOAuthClient(config, fetch), tokens, quoteId)).rejects.toThrow("QuickBooks is unavailable");
    expect(fetch).not.toHaveBeenCalled();
    await expect(readPortalQuoteTaxTokens(f.ctx, quoteId)).rejects.toThrow("QuickBooks tax credentials unavailable");
  });

  it("shares the connection lease between concurrent quote refreshes", async () => {
    const f = await setup();
    const { config } = await enableTax(f);
    const result = await f.ctx.db.rpc("portal_quote_order", {
      p_brewery: f.brewery.id, p_customer: f.customer.customerId, p_ship_to: f.customer.shipToId,
      p_note: null, p_po: null, p_requested: null,
      p_lines: [{ sku_id: f.catalog.skuId, qty: 2 }], p_request_id: crypto.randomUUID(),
    });
    expect(result.error).toBeNull();
    const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(result.data);
    const tokens = await readPortalQuoteTaxTokens(f.ctx, quoteId);
    const { promise, resolve: release } = Promise.withResolvers<Response>();
    const fetch = vi.fn<typeof globalThis.fetch>(() => promise);
    const client = new QboOAuthClient(config, fetch);
    const holder = refreshQboCredentials(f.ctx, client, tokens, quoteId);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const waiter = refreshQboCredentials(f.ctx, client, tokens, quoteId);
    release(new Response(JSON.stringify({ access_token: "winner-access", refresh_token: "winner-refresh", expires_in: 3600 }), { status: 200 }));
    expect(await Promise.all([holder, waiter])).toEqual([
      expect.objectContaining({ refreshToken: "winner-refresh" }), expect.objectContaining({ refreshToken: "winner-refresh" }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes once when two overlapping quotes fail on the same stale token", async () => {
    const f = await setup();
    const { config } = await enableTax(f);
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Both quotes read the stale credential before either refreshes: the first
    // 401 waits for the second to arrive, and the second 401 waits for the first
    // quote to finish, so the second refresh starts after the credential rotated.
    const bothStale = Promise.withResolvers<void>();
    const firstDone = Promise.withResolvers<void>();
    let stale = 0, refreshes = 0;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, init) => {
      if (String(url).includes("/tokens/bearer")) {
        refreshes += 1;
        return new Response(JSON.stringify({ access_token: `rotated-access-${refreshes}`, refresh_token: `rotated-refresh-${refreshes}`, expires_in: 3600 }), { status: 200 });
      }
      if (new Headers(init?.headers).get("Authorization") !== "Bearer tax-access") return calculatedTax();
      stale += 1;
      if (stale === 1) await bothStale.promise;
      else { bothStale.resolve(); await firstDone.promise; }
      return new Response("provider-secret", { status: 401 });
    });
    const client = new QboOAuthClient(config, fetch);
    const quotes = [1, 2].map(() => quotePortalOrder(f.ctx, quoteInput(f), crypto.randomUUID(), client));
    await Promise.race(quotes);
    firstDone.resolve();
    expect(await Promise.all(quotes)).toEqual([
      expect.objectContaining({ taxStatus: "calculated", taxCents: 100 }),
      expect.objectContaining({ taxStatus: "calculated", taxCents: 100 }),
    ]);
    expect(stale).toBe(2);
    expect(refreshes).toBe(1);
  });

  it.each([200, 400])("finalizes an authorized refresh when the quote expires during provider response %s", async (status) => {
    const f = await setup();
    const { config, connectionId } = await enableTax(f);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
      if (!String(url).includes("/tokens/bearer")) return new Response("expired", { status: 401 });
      // Intuit may retire the old refresh token after the quote's review window.
      sql(`update private.portal_order_quotes set expires_at=now()-interval '1 second' where actor_id='${f.ctx.userId}'`);
      return new Response(JSON.stringify(status === 200
        ? { access_token: "late-access", refresh_token: "late-refresh", expires_in: 3600 }
        : { error: "invalid_grant" }), { status });
    });
    await expect(quotePortalOrder(f.ctx, quoteInput(f), crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .resolves.toMatchObject({ taxStatus: "pending", amountBeforeTaxCents: 12200 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sql(`select refresh_token from private.integration_tokens where connection_id='${connectionId}'`))
      .toEqual([status === 200 ? "late-refresh" : "tax-refresh"]);
    expect(sql(`select state from public.qbo_connections where id='${connectionId}'`))
      .toEqual([status === 200 ? "connected" : "recovery_required"]);
    expect(sql(`select refresh_lease is null from private.integration_tokens where connection_id='${connectionId}'`)).toEqual(["t"]);
  });

  it("persists the reviewed deposit and invoices its frozen cents through the mapped QBO line", async () => {
    const quote = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;
    const submitted = await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, fixture.ctx) as { order_id: string };
    expect(sql(`select qty_ordered::text||'|'||unit_price_cents::text||'|'||amount_cents::text
      from order_deposit_lines where order_id='${submitted.order_id}'`)).toEqual(["2.00|2500|5000"]);

    expect((await admin.from("keg_pools").update({ deposit_cents: 9900 }).eq("id", fixture.poolId)).error).toBeNull();
    sql(`insert into inventory_movements(brewery_id,sku_id,location_id,bin_id,qty,bbl,type,created_by)
      values('${fixture.brewery.id}','${fixture.catalog.skuId}','${fixture.source.id}','${fixture.source.binId}',2,1,'opening_balance','${fixture.adminCtx.userId}')`);
    await runCommand("confirm_order", { orderId: submitted.order_id }, fixture.adminCtx);
    const line = (await admin.from("order_lines").select("id").eq("order_id", submitted.order_id).single()).data!;
    await runCommand("record_pick", { orderId: submitted.order_id, picks: [{ lineId: line.id, qty: 2 }] }, fixture.adminCtx);
    const shipped = await runCommand("ship_order", { orderId: submitted.order_id, ship: [{ lineId: line.id, qty: 2 }] }, fixture.adminCtx) as { invoice_id: string | null };
    expect(sql(`select qty::text||'|'||unit_price_cents::text||'|'||amount_cents::text
      from invoice_lines where invoice_id='${shipped.invoice_id}' and kind='keg_deposit'`)).toEqual(["2.00|2500|5000"]);

    const started = await fixture.adminCtx.db.rpc("start_qbo_push", {
      p_brewery: fixture.brewery.id, p_invoice: shipped.invoice_id,
      p_new_attempt_reason: null, p_request_id: crypto.randomUUID(),
    });
    expect(started.error).toBeNull();
    const pushed: { Line: { SalesItemLineDetail: { ItemRef: { value: string } } }[] } = JSON.parse((started.data as { requestBody: string }).requestBody);
    expect(pushed.Line.find((line) => line.SalesItemLineDetail.ItemRef.value === "deposit-item")).toMatchObject({
      Amount: 50, SalesItemLineDetail: { Qty: 2, UnitPrice: 25 },
    });
    expect((await admin.from("keg_pools").update({ deposit_cents: 2500 }).eq("id", fixture.poolId)).error).toBeNull();
  });

  it("serializes a concurrent price change before drift validation and permits a safe retry", async () => {
    const quote = await runCommand("portal_quote_order", quoteInput(fixture), fixture.ctx) as import("@/lib/mgr/review-order-view").PortalQuote;
    const requestId = crypto.randomUUID();
    const before = await orderCount(fixture.brewery.id);
    const writer = new Client({ connectionString: DB, application_name: "q4-price-writer" });
    const submitter = new Client({ connectionString: DB, application_name: "q4-submit-race" });
    await writer.connect(); await submitter.connect();
    try {
      await writer.query("begin");
      await writer.query(`update channel_prices set unit_price_cents=3700
        where brewery_id=$1 and sale_channel_id=$2 and format_id=$3`, [fixture.brewery.id, fixture.customer.saleChannelId, fixture.catalog.formatId]);
      await submitter.query("begin");
      await submitter.query("set local role authenticated");
      await submitter.query("select set_config('request.jwt.claim.sub',$1,true)", [fixture.ctx.userId]);
      const outcome = submitter.query("select portal_submit_quote($1,$2,$3,$4,$5)", [
        fixture.brewery.id, fixture.customer.customerId, quote.quoteId, null, requestId,
      ]).then(value => ({ value, error: null }), error => ({ value: null, error }));
      let blocked = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        if (sql("select count(*) from pg_stat_activity where application_name='q4-submit-race' and wait_event_type='Lock'")[0] === "1") { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(blocked).toBe(true);
      await writer.query("commit");
      const result = await outcome;
      expect(String(result.error)).toMatch(/review the current quote/);
      await submitter.query("rollback");
      expect(await orderCount(fixture.brewery.id)).toBe(before);

      await priceSku(fixture.brewery.id, { saleChannelId: fixture.customer.saleChannelId, brandId: fixture.catalog.brandId, formatId: fixture.catalog.formatId, cents: 3600 });
      await expect(runCommand("portal_submit_quote", { quoteId: quote.quoteId }, fixture.ctx, { requestId, correlationId: crypto.randomUUID() }))
        .resolves.toMatchObject({ order_id: expect.any(String) });
      expect(sql(`select distinct unit_price_cents from order_lines where order_id=(select submitted_order_id from private.portal_order_quotes where id='${quote.quoteId}')`)).toEqual(["3600"]);
    } finally {
      await writer.query("rollback").catch(() => {}); await submitter.query("rollback").catch(() => {});
      await writer.end(); await submitter.end();
    }
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
  return { brewery, adminCtx, source, catalog, customer, poolId: pool.data!.id as string, ctx: { db, userId: buyer.id, breweryId: brewery.id, roles: ["customer" as const], customerId: customer.customerId } };
}

async function enableTax(f: {
  brewery: { id: string }; source: { id: string };
  customer: { customerId: string }; catalog: { skuId: string };
}) {
  const realm = `realm-${crypto.randomUUID()}`;
  const connection = await admin.from("qbo_connections").insert({
    brewery_id: f.brewery.id, realm_id: realm, state: "connected", credential_version: 1,
    access_expires_at: new Date(Date.now() - 3600_000).toISOString(),
    granted_scopes: ["com.intuit.quickbooks.accounting", "indirect-tax.tax-calculation.quickbooks"],
    qbo_deposit_item_id: "deposit-item",
  }).select("id").single();
  expect(connection.error).toBeNull();
  const connectionId = connection.data!.id;
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${f.brewery.id}','qbo','${connectionId}','tax-access','tax-refresh',1)`);
  expect((await admin.from("locations").update({ address: "10 Brewery Rd, Town, PA 19000" }).eq("id", f.source.id)).error).toBeNull();
  expect((await admin.from("customers").update({ qbo_customer_id: "customer-item", qbo_realm_id: realm }).eq("id", f.customer.customerId)).error).toBeNull();
  expect((await admin.from("skus").update({ qbo_item_id: "beer-item", qbo_realm_id: realm }).eq("id", f.catalog.skuId)).error).toBeNull();
  return { connectionId, config: {
    clientId: "client", clientSecret: "secret", redirectUri: "https://mgr.test/qbo",
    apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com", taxApiBaseUrl: "https://qb-sandbox.api.intuit.com/graphql",
  } };
}

const calculatedTax = () => new Response(JSON.stringify({ data: { indirectTaxCalculateSaleTransactionTax: { taxCalculation: {
  taxTotals: { totalTaxAmountExcludingShipping: { value: "1.00", currency: "USD" } },
  shipping: { taxAmount: { value: "0.00", currency: "USD" } },
} } } }), { status: 200 });

const quoteInput = (f: Awaited<ReturnType<typeof setup>>) => ({
  shipToId: f.customer.shipToId, requestedShipDate: "2026-10-10",
  poNumber: "quoted", note: "reviewed", lines: [{ skuId: f.catalog.skuId, qty: 2 }],
});
const orderCount = async (breweryId: string) => (await admin.from("orders").select("id", { count: "exact", head: true }).eq("brewery_id", breweryId)).count ?? 0;
