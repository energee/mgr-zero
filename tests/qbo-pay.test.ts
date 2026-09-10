import { describe, expect, it, vi } from "vitest";
import { QboOAuthClient, resolvePortalInvoicePayment, validateQboPaymentUrl } from "@/lib/qbo";
import { compareAndSwapPortalInvoicePaymentTokens, readPortalInvoicePayment } from "@/lib/supabase/integration-tokens";
import { admin, asUser, insertFixture, makeBrewery, makeCustomerUser, seedCustomer, sql } from "./helpers";

const config = {
  clientId: "client",
  clientSecret: "secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};

describe("QuickBooks portal payment link", () => {
  it("reads InvoiceLink with a fixed authenticated request that refuses redirects", async () => {
    const transport = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      Invoice: { Id: "invoice-7", InvoiceLink: "https://pay.example.test/session/secret" },
    }));
    const client = new QboOAuthClient(config, transport);

    await expect(client.readInvoiceLink("realm-1", "invoice-7", "access-secret"))
      .resolves.toEqual({ ok: true, invoiceLink: "https://pay.example.test/session/secret" });
    const [url, init] = transport.mock.calls[0];
    expect(String(url)).toBe("https://sandbox-quickbooks.api.intuit.com/v3/company/realm-1/invoice/invoice-7?include=invoiceLink&minorversion=75");
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: { Authorization: "Bearer access-secret", Accept: "application/json" },
    });
  });

  it("fails closed for redirects and unsafe or unverified payment URLs", async () => {
    const transport = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://pay.example.test/session/secret" },
    }));
    const client = new QboOAuthClient(config, transport);

    await expect(client.readInvoiceLink("realm-1", "invoice-7", "access-secret"))
      .resolves.toEqual({ ok: false, status: 302 });

    const allowed = new Set(["pay.example.test"]);
    expect(validateQboPaymentUrl("https://pay.example.test/session/secret", allowed)?.href)
      .toBe("https://pay.example.test/session/secret");
    for (const value of [
      "", "not a url", "http://pay.example.test/session", "https://user@pay.example.test/session",
      "https://pay.example.test:8443/session", "https://evilpay.example.test/session",
      "https://pay.example.test.evil.test/session",
    ]) expect(validateQboPaymentUrl(value, allowed)).toBeNull();
    expect(validateQboPaymentUrl("https://pay.example.test/session/secret", new Set())).toBeNull();
  });

  it("authorizes only the current customer's live unpaid mapped invoice before provider work", async () => {
    const brewery = await makeBrewery();
    const customer = await seedCustomer(brewery.id);
    const user = await makeCustomerUser(customer.customerId);
    const ctx = {
      db: await asUser(user.email), userId: user.id, breweryId: brewery.id,
      role: "customer" as const, customerId: customer.customerId,
    };
    const connection = await admin.from("qbo_connections").insert({
      brewery_id: brewery.id, realm_id: `realm-${crypto.randomUUID()}`, state: "connected",
      granted_scopes: ["com.intuit.quickbooks.accounting"],
    }).select("id,realm_id").single();
    if (connection.error) throw connection.error;
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
      values('${brewery.id}','qbo','${connection.data.id}','pay-access-secret','pay-refresh-secret')`);
    const invoice = await admin.from("invoices").insert({
      brewery_id: brewery.id, customer_id: customer.customerId, qbo_invoice_id: "remote-pay-1", qbo_sync_status: "pushed",
      qbo_balance_cents: 100,
    }).select("id").single();
    if (invoice.error) throw invoice.error;
    insertFixture("qbo_pushes", {
      brewery_id: brewery.id, invoice_id: invoice.data.id, connection_id: connection.data.id,
      realm_id: connection.data.realm_id, entity_type: "Invoice", provider_request_id: crypto.randomUUID(),
      request_body: "{}", local_snapshot: {}, attempt_reason: "initial", status: "pushed",
      qbo_entity_id: "remote-pay-1", response: { Id: "remote-pay-1" }, finished_at: new Date().toISOString(),
    });

    await expect(readPortalInvoicePayment(ctx, invoice.data.id)).resolves.toMatchObject({
      connectionId: connection.data.id, realmId: connection.data.realm_id, remoteInvoiceId: "remote-pay-1",
      credentialVersion: 1, grantedScopes: ["com.intuit.quickbooks.accounting"],
    });

    expect(sql(`select r.role from pg_proc p cross join (values ('anon'),('authenticated'),('service_role')) r(role)
      where p.oid='public.read_portal_qbo_payment(uuid,uuid,uuid,uuid)'::regprocedure
        and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual(["service_role"]);
    expect((await ctx.db.rpc("read_portal_qbo_payment", {
      p_brewery: brewery.id, p_customer: customer.customerId, p_invoice: invoice.data.id, p_actor: user.id,
    })).error?.code).toBe("42501");

    const eligibilityFetch = vi.fn<typeof globalThis.fetch>();
    for (const unavailable of [
      { paid_at: "2026-09-09T12:00:00Z", qbo_balance_cents: 0, qbo_remote_state: "live", written_off_at: null },
      { paid_at: null, qbo_balance_cents: 0, qbo_remote_state: "live", written_off_at: null },
      { paid_at: null, qbo_balance_cents: null, qbo_remote_state: "live", written_off_at: null },
      { paid_at: null, qbo_balance_cents: 100, qbo_remote_state: "voided", written_off_at: null },
      { paid_at: null, qbo_balance_cents: 100, qbo_remote_state: "deleted", written_off_at: null },
      { paid_at: null, qbo_balance_cents: 100, qbo_remote_state: "deleted", written_off_at: "2026-09-09T12:00:00Z", written_off_by: user.id, written_off_reason: "Uncollectible" },
    ]) {
      expect((await admin.from("invoices").update(unavailable).eq("id", invoice.data.id)).error).toBeNull();
      await expect(readPortalInvoicePayment(ctx, invoice.data.id)).resolves.toBeNull();
      await expect(resolvePortalInvoicePayment(
        ctx, invoice.data.id, new QboOAuthClient(config, eligibilityFetch), new Set(["pay.example.test"]),
      )).resolves.toEqual({ kind: "unavailable", reason: "not_configured" });
      expect(eligibilityFetch).not.toHaveBeenCalled();
    }
    expect((await admin.from("invoices").update({
      paid_at: "2026-09-08T12:00:00Z", qbo_balance_cents: 100, qbo_remote_state: "live", written_off_at: null,
      written_off_by: null, written_off_reason: null,
    }).eq("id", invoice.data.id)).error).toBeNull();
    await expect(readPortalInvoicePayment(ctx, invoice.data.id)).resolves.toMatchObject({ remoteInvoiceId: "remote-pay-1" });
    const reopenedFetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      Invoice: { Id: "remote-pay-1", InvoiceLink: "https://pay.example.test/session/reopened" },
    }));
    await expect(resolvePortalInvoicePayment(
      ctx, invoice.data.id, new QboOAuthClient(config, reopenedFetch), new Set(["pay.example.test"]),
    )).resolves.toEqual({ kind: "redirect", url: "https://pay.example.test/session/reopened" });
    expect(reopenedFetch).toHaveBeenCalledOnce();
    expect((await admin.from("invoices").update({
      paid_at: null, qbo_balance_cents: 100, qbo_remote_state: "live", written_off_at: null,
      written_off_by: null, written_off_reason: null,
    }).eq("id", invoice.data.id)).error).toBeNull();
    expect((await admin.from("qbo_connections").update({
      allow_online_ach_payment: false, allow_online_credit_card_payment: false,
    }).eq("id", connection.data.id)).error).toBeNull();
    await expect(readPortalInvoicePayment(ctx, invoice.data.id)).resolves.toBeNull();
    expect((await admin.from("qbo_connections").update({
      allow_online_ach_payment: true,
    }).eq("id", connection.data.id)).error).toBeNull();

    const refreshClaim = await readPortalInvoicePayment(ctx, invoice.data.id);
    if (!refreshClaim) throw new Error("expected payment claim");
    sql(`delete from private.integration_tokens where brewery_id='${brewery.id}' and provider='qbo'`);
    expect((await admin.from("qbo_connections").update({ state: "disconnected" }).eq("id", connection.data.id)).error).toBeNull();
    await expect(compareAndSwapPortalInvoicePaymentTokens(ctx, invoice.data.id, refreshClaim, {
      accessToken: "late-access", refreshToken: "late-refresh", receivedAt: new Date().toISOString(),
      accessExpiresIn: 3600, refreshExpiresIn: null, refreshHardExpiresIn: null, grantedScopes: null,
    })).resolves.toBe(false);
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}' and provider='qbo'`)).toEqual(["0"]);

    const foreignCustomer = await seedCustomer(brewery.id, { name: "Other buyer" });
    const foreignUser = await makeCustomerUser(foreignCustomer.customerId);
    const foreignCtx = {
      db: await asUser(foreignUser.email), userId: foreignUser.id, breweryId: brewery.id,
      role: "customer" as const, customerId: foreignCustomer.customerId,
    };
    const noFetch = vi.fn<typeof globalThis.fetch>();
    await expect(resolvePortalInvoicePayment(
      ctx, "not-a-uuid", new QboOAuthClient(config, noFetch), new Set(["pay.example.test"]),
    )).rejects.toMatchObject({ status: 404 });
    await expect(resolvePortalInvoicePayment(
      foreignCtx, invoice.data.id, new QboOAuthClient(config, noFetch), new Set(["pay.example.test"]),
    )).rejects.toMatchObject({ status: 404 });
    expect(noFetch).not.toHaveBeenCalled();

    expect((await admin.from("customer_users").delete().eq("user_id", user.id)).error).toBeNull();
    await expect(resolvePortalInvoicePayment(
      ctx, invoice.data.id, new QboOAuthClient(config, noFetch), new Set(["pay.example.test"]),
    )).rejects.toMatchObject({ status: 404 });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("binds post-fetch confirmation to invoice and connection snapshots without persisting links", async () => {
    const brewery = await makeBrewery();
    const customer = await seedCustomer(brewery.id);
    const user = await makeCustomerUser(customer.customerId);
    const ctx = {
      db: await asUser(user.email), userId: user.id, breweryId: brewery.id,
      role: "customer" as const, customerId: customer.customerId,
    };
    const connection = await admin.from("qbo_connections").insert({
      brewery_id: brewery.id, realm_id: `realm-${crypto.randomUUID()}`, state: "connected",
      granted_scopes: ["com.intuit.quickbooks.accounting"],
    }).select("id,realm_id").single();
    if (connection.error) throw connection.error;
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
      values('${brewery.id}','qbo','${connection.data.id}','access-secret','refresh-secret')`);
    const invoice = await admin.from("invoices").insert({
      brewery_id: brewery.id, customer_id: customer.customerId, qbo_invoice_id: "remote-pay-2", qbo_sync_status: "pushed",
      qbo_balance_cents: 100,
    }).select("id").single();
    if (invoice.error) throw invoice.error;
    insertFixture("qbo_pushes", {
      brewery_id: brewery.id, invoice_id: invoice.data.id, connection_id: connection.data.id,
      realm_id: connection.data.realm_id, entity_type: "Invoice", provider_request_id: crypto.randomUUID(),
      request_body: "{}", local_snapshot: {}, attempt_reason: "initial", status: "pushed",
      qbo_entity_id: "remote-pay-2", response: { Id: "remote-pay-2" }, finished_at: new Date().toISOString(),
    });
    const paymentUrl = "https://pay.example.test/session/bearer-secret";
    const transport = vi.fn<typeof globalThis.fetch>(async () => {
      await admin.from("invoices").update({ qbo_balance_cents: 0 }).eq("id", invoice.data.id);
      return Response.json({ Invoice: { Id: "remote-pay-2", InvoiceLink: paymentUrl } });
    });
    await expect(resolvePortalInvoicePayment(
      ctx, invoice.data.id, new QboOAuthClient(config, transport), new Set(["pay.example.test"]),
    )).resolves.toEqual({ kind: "unavailable", reason: "context_changed" });

    expect((await admin.from("invoices").update({ qbo_balance_cents: 100 }).eq("id", invoice.data.id)).error).toBeNull();
    const rotatedTransport = vi.fn<typeof globalThis.fetch>(async () => {
      sql(`update private.integration_tokens set access_token='rotated-access',refresh_token='rotated-refresh',
        credential_version=credential_version+1 where brewery_id='${brewery.id}' and provider='qbo'`);
      expect((await admin.from("qbo_connections").update({ credential_version: 2 })
        .eq("id", connection.data.id)).error).toBeNull();
      return Response.json({ Invoice: { Id: "remote-pay-2", InvoiceLink: paymentUrl } });
    });
    await expect(resolvePortalInvoicePayment(
      ctx, invoice.data.id, new QboOAuthClient(config, rotatedTransport), new Set(["pay.example.test"]),
    )).resolves.toEqual({ kind: "unavailable", reason: "context_changed" });

    const narrowedTransport = vi.fn<typeof globalThis.fetch>(async () => {
      expect((await admin.from("qbo_connections").update({ granted_scopes: [] })
        .eq("id", connection.data.id)).error).toBeNull();
      return Response.json({ Invoice: { Id: "remote-pay-2", InvoiceLink: paymentUrl } });
    });
    await expect(resolvePortalInvoicePayment(
      ctx, invoice.data.id, new QboOAuthClient(config, narrowedTransport), new Set(["pay.example.test"]),
    )).resolves.toEqual({ kind: "unavailable", reason: "context_changed" });

    expect((await admin.from("qbo_connections").update({
      granted_scopes: ["com.intuit.quickbooks.accounting"], access_expires_at: "2026-09-08T12:00:00Z",
    }).eq("id", connection.data.id)).error).toBeNull();
    const refreshTransport = vi.fn<typeof globalThis.fetch>(async (_url, init) => init?.method === "POST"
      ? Response.json({ access_token: "refreshed-access", refresh_token: "refreshed-refresh", expires_in: 3600 })
      : Response.json({ Invoice: { Id: "remote-pay-2", InvoiceLink: paymentUrl } }));
    await expect(resolvePortalInvoicePayment(
      ctx, invoice.data.id, new QboOAuthClient(config, refreshTransport), new Set(["pay.example.test"]),
    )).resolves.toEqual({ kind: "redirect", url: paymentUrl });
    expect(refreshTransport).toHaveBeenCalledTimes(2);
    expect(sql(`select c.credential_version||':'||t.credential_version from public.qbo_connections c
      join private.integration_tokens t on t.brewery_id=c.brewery_id and t.connection_id=c.id
      where c.id='${connection.data.id}'`)).toEqual(["3:3"]);
    expect(JSON.stringify(sql(`select encode(payload_hash,'hex')||coalesce(result::text,'') from private.command_requests where actor_id='${user.id}'`)))
      .not.toContain("bearer-secret");
    expect(JSON.stringify(sql(`select request_body||coalesce(response::text,'') from qbo_pushes where invoice_id='${invoice.data.id}'`)))
      .not.toContain("bearer-secret");
  });
});
