import { describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QboOAuthClient, syncQboInvoices } from "@/lib/qbo";
import { beginQboInvoiceSync, completeQboInvoiceSync } from "@/lib/supabase/integration-tokens";
import { PortalInvoiceView } from "@/components/mgr/views/portal-invoice";
import { invoiceCurrentState } from "@/lib/mgr/invoice-state";
import { toInvoiceViewProps } from "@/lib/mgr/invoice-view";
import { toPortalInvoiceViewProps } from "@/lib/mgr/portal-invoice-view";
import { toPortalInvoicesViewProps } from "@/lib/mgr/portal-invoices-view";
import { toPortalOrderViewProps } from "@/lib/mgr/portal-order-view";
import { portalOrderShipped } from "@/lib/mgr/fixtures/portal-orders";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { admin, asUser, DB, makeBrewery, makeCustomerUser, makeStaffCtx, seedCustomer, sql } from "./helpers";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};

async function stateFixture(
  role: "admin" | "sales" | "warehouse" = "admin",
  invoiceId = crypto.randomUUID(),
  remoteId = "remote-invoice",
) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, role);
  const customer = await seedCustomer(brewery.id);
  const connection = await admin.from("qbo_connections").insert({
    brewery_id: brewery.id,
    realm_id: `realm-${crypto.randomUUID()}`,
    state: "connected",
  }).select("id,realm_id").single();
  if (connection.error) throw connection.error;
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
    values('${brewery.id}','qbo','${connection.data.id}','access-secret','refresh-secret')`);
  const invoice = await admin.from("invoices").insert({
    id: invoiceId,
    brewery_id: brewery.id,
    customer_id: customer.customerId,
    qbo_invoice_id: remoteId,
    qbo_sync_status: "pushed",
  }).select("id").single();
  if (invoice.error) throw invoice.error;
  // The fixture has no mappings or lines, so create the already-pushed provider
  // identity through the baseline owner rather than weakening push validation.
  sql(`insert into public.qbo_pushes(
      brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,
      request_body,local_snapshot,attempt_reason,status,qbo_entity_id,response,finished_at)
    values('${brewery.id}','${invoice.data.id}','${connection.data.id}','${connection.data.realm_id}',
      'Invoice',gen_random_uuid(),'{"CustomerRef":{"value":"customer-42"},"DocNumber":"1","TxnDate":"2026-09-09","Line":[]}','{}','initial','pushed','${remoteId}',
      '{"Id":"${remoteId}","SyncToken":"0","TotalAmt":100,"TotalTax":10,"Balance":100}',now())`);
  return { brewery, ctx, customer, connection: connection.data, invoice: invoice.data };
}

function invoiceResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    Invoice: {
      Id: "remote-invoice",
      SyncToken: "1",
      TotalAmt: 100,
      Balance: 50,
      TxnTaxDetail: { TotalTax: 10 },
      LinkedTxn: [],
      MetaData: { LastUpdatedTime: "2026-09-09T15:00:00Z" },
      CustomerRef: { value: "customer-42" },
      DocNumber: "1",
      TxnDate: "2026-09-09",
      DueDate: "2026-10-09",
      Line: [],
      ...overrides,
    },
  }), { status: 200 });
}

function paymentResponse(id: string, cash: number) {
  return new Response(JSON.stringify({
    Payment: {
      Id: id,
      TotalAmt: cash,
      UnappliedAmt: 0,
      TxnDate: "2026-09-09",
      Line: [
        { Amount: 100, LinkedTxn: [{ TxnId: "remote-invoice", TxnType: "Invoice" }] },
        { Amount: -(100 - cash), LinkedTxn: [{ TxnId: "credit-1", TxnType: "CreditMemo" }] },
      ],
    },
  }), { status: 200 });
}

describe("QuickBooks current invoice state", () => {
  it("tracks partial, paid, reopened and voided states without mistaking credits for cash", async () => {
    const f = await stateFixture();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(invoiceResponse())
      .mockResolvedValueOnce(invoiceResponse({ Balance: 0, SyncToken: "2", LinkedTxn: [{ TxnId: "payment-2", TxnType: "Payment" }] }))
      .mockResolvedValueOnce(paymentResponse("payment-2", 100))
      .mockResolvedValueOnce(invoiceResponse({ Balance: 25, SyncToken: "3" }))
      .mockResolvedValueOnce(invoiceResponse({ Balance: 0, SyncToken: "4", LinkedTxn: [{ TxnId: "payment-4", TxnType: "Payment" }] }))
      .mockResolvedValueOnce(paymentResponse("payment-4", 100))
      .mockResolvedValueOnce(invoiceResponse({
        Balance: 0,
        TotalAmt: 0,
        SyncToken: "5",
        TxnTaxDetail: { TotalTax: 0 },
        PrivateNote: "Voided by accountant",
      }));
    const client = new QboOAuthClient(config, fetch);

    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    expect(sql(`select qbo_balance_cents || '|' || coalesce(paid_at::text,'NULL') from invoices where id='${f.invoice.id}'`))
      .toEqual(["5000|NULL"]);

    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    expect(sql(`select qbo_balance_cents || '|' || (paid_at is not null)::text || '|' || qbo_accountant_drift::text from invoices where id='${f.invoice.id}'`))
      .toEqual(["0|true|false"]);
    expect(sql(`select collected_cents from invoice_totals where invoice_id='${f.invoice.id}'`)).toEqual(["10000"]);

    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    expect(sql(`select qbo_balance_cents || '|' || coalesce(paid_at::text,'NULL') from invoices where id='${f.invoice.id}'`))
      .toEqual(["2500|NULL"]);

    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    const paidAt = sql(`select paid_at::text from invoices where id='${f.invoice.id}'`)[0];
    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    expect(sql(`select qbo_remote_state || '|' || paid_at::text from invoices where id='${f.invoice.id}'`))
      .toEqual([`voided|${paidAt}`]);
    expect(sql(`select collected_cents from invoice_totals where invoice_id='${f.invoice.id}'`)).toEqual(["0"]);
    expect(invoiceCurrentState({ qbo_remote_state: "voided", written_off_at: null, paid_at: paidAt, qbo_balance_cents: 0 }))
      .toBe("voided");

    const creditOnly = await stateFixture();
    const creditFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(invoiceResponse({
        Balance: 0,
        LinkedTxn: [{ TxnId: "zero-dollar-payment", TxnType: "Payment" }],
      }))
      .mockResolvedValueOnce(paymentResponse("zero-dollar-payment", 0));
    await syncQboInvoices(creditOnly.ctx, crypto.randomUUID(), new QboOAuthClient(config, creditFetch));
    expect(sql(`select coalesce(paid_at::text,'NULL') from invoices where id='${creditOnly.invoice.id}'`)).toEqual(["NULL"]);
    expect(sql(`select collected_cents from invoice_totals where invoice_id='${creditOnly.invoice.id}'`)).toEqual(["0"]);
    expect(creditFetch).toHaveBeenCalledTimes(2);

    const mixed = await stateFixture();
    const mixedFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(invoiceResponse({
        Balance: 0,
        LinkedTxn: [{ TxnId: "mixed-payment", TxnType: "Payment" }],
      }))
      .mockResolvedValueOnce(paymentResponse("mixed-payment", 40));
    await syncQboInvoices(mixed.ctx, crypto.randomUUID(), new QboOAuthClient(config, mixedFetch));
    expect(sql(`select (paid_at is not null)::text from invoices where id='${mixed.invoice.id}'`)).toEqual(["true"]);
    expect(sql(`select collected_cents from invoice_totals where invoice_id='${mixed.invoice.id}'`)).toEqual(["4000"]);
    expect(mixedFetch).toHaveBeenCalledTimes(2);
  });

  it("distinguishes payment-only SyncToken changes from accountant total drift", async () => {
    const f = await stateFixture();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(invoiceResponse({ SyncToken: "9" }))
      .mockResolvedValueOnce(invoiceResponse({ SyncToken: "10", TotalAmt: 105 }))
      .mockResolvedValueOnce(invoiceResponse({ SyncToken: "11", CustomerRef: { value: "edited-customer" } }));
    const client = new QboOAuthClient(config, fetch);
    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    expect(sql(`select qbo_sync_token || '|' || qbo_accountant_drift::text from invoices where id='${f.invoice.id}'`))
      .toEqual(["9|false"]);
    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    expect(sql(`select qbo_sync_token || '|' || qbo_accountant_drift::text from invoices where id='${f.invoice.id}'`))
      .toEqual(["10|true"]);
    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    expect(sql(`select qbo_sync_token || '|' || qbo_accountant_drift::text from invoices where id='${f.invoice.id}'`))
      .toEqual(["11|true"]);
  });

  it("renders a $105 synced edit over $100 frozen lines across staff and portal current views", async () => {
    const f = await stateFixture();
    expect((await admin.from("invoice_lines").insert({
      brewery_id: f.brewery.id, invoice_id: f.invoice.id, kind: "adjustment",
      qty: 1, unit_price_cents: 10000, description: "Frozen local line",
    })).error).toBeNull();
    await syncQboInvoices(f.ctx, crypto.randomUUID(), new QboOAuthClient(config,
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(invoiceResponse({ TotalAmt: 105 }))));
    const detail = await runCommand("get_invoice", { invoiceId: f.invoice.id }, f.ctx) as Parameters<typeof toInvoiceViewProps>[0];
    const list = await runCommand("list_invoices", {}, f.ctx) as { id: string; subtotal_cents: number; total_cents: number }[];
    expect(list.find((row) => row.id === f.invoice.id)).toMatchObject({ subtotal_cents: 10000, total_cents: 10500 });
    const invoice = detail.invoice;
    const lines = detail.lines;
    expect(toInvoiceViewProps({ invoice, lines, questions: [] })).toMatchObject({
      total: "$105.00", summary: expect.stringContaining("edited in QuickBooks"),
    });
    const customerUser = await makeCustomerUser(f.customer.customerId);
    const portalCtx = {
      db: await asUser(customerUser.email), userId: customerUser.id, breweryId: f.brewery.id,
      role: "customer" as const, customerId: f.customer.customerId,
    };
    const portalDetail = await runCommand("portal_invoice", { invoiceId: f.invoice.id }, portalCtx) as Parameters<typeof toPortalInvoiceViewProps>[0];
    const portalList = await runCommand("portal_invoices", {}, portalCtx) as Parameters<typeof toPortalInvoicesViewProps>[0]["invoices"];
    expect(toPortalInvoiceViewProps(portalDetail)).toMatchObject({ total: "$105.00", payable: false, paid: false, status: "Review" });
    expect(toPortalInvoicesViewProps({ customerName: "Buyer", invoices: portalList }).rows[0])
      .toMatchObject({ total: "$105.00", unpaid: true });
    expect(toPortalOrderViewProps({
      ...portalOrderShipped,
      shipment: { id: "shipment-1", invoices: [{ ...invoice, invoice_lines: [{ amount_cents: 10000 }] }] },
    }).invoice).toMatchObject({ amount: "$105.00", detail: "unpaid", paid: false });

    const local = { ...invoice, qbo_total_cents: null, qbo_accountant_drift: false };
    expect(toInvoiceViewProps({ invoice: local, lines, questions: [] }).total).toBe("$100.00");
    const paid = { ...invoice, paid_at: "2026-09-10T12:00:00Z", qbo_balance_cents: 0 };
    expect(toPortalInvoiceViewProps({
      invoice: { ...paid, total_cents: 10000 }, lines: portalDetail.lines,
      brewery: { name: "Brewery", customer_phone: null },
    })).toMatchObject({ total: "$105.00", payable: false, paid: true });
  });

  it("applies a fetched batch atomically and replays its frozen target set without provider calls", async () => {
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    const f = await stateFixture("admin", firstId, "remote-one");
    expect((await admin.from("invoices").insert({
      id: secondId, brewery_id: f.brewery.id, customer_id: f.customer.customerId,
      qbo_invoice_id: "remote-two", qbo_sync_status: "pushed",
    })).error).toBeNull();
    sql(`insert into public.qbo_pushes(
      brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,
      request_body,local_snapshot,attempt_reason,status,qbo_entity_id,response,finished_at)
      values('${f.brewery.id}','${secondId}','${f.connection.id}','${f.connection.realm_id}',
      'Invoice',gen_random_uuid(),'{"CustomerRef":{"value":"customer-42"},"DocNumber":"1","TxnDate":"2026-09-09","Line":[]}',
      '{}','initial','pushed','remote-two','{"Id":"remote-two","SyncToken":"0","TotalAmt":100,"TotalTax":10,"Balance":100}',now())`);
    const requestId = crypto.randomUUID();
    const failedFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(invoiceResponse({ Id: "remote-one", SyncToken: "one" }))
      .mockRejectedValueOnce(new TypeError("second invoice unavailable"));
    await expect(syncQboInvoices(f.ctx, requestId, new QboOAuthClient(config, failedFetch)))
      .rejects.toThrow("QuickBooks is unavailable");
    expect(sql(`select id || ':' || coalesce(qbo_sync_token,'NULL') from invoices where id in ('${firstId}','${secondId}') order by id`))
      .toEqual([`${firstId}:NULL`, `${secondId}:NULL`]);

    const lateId = "00000000-0000-4000-8000-000000000003";
    expect((await admin.from("invoices").insert({
      id: lateId, brewery_id: f.brewery.id, customer_id: f.customer.customerId,
      qbo_invoice_id: "remote-late", qbo_sync_status: "pushed",
    })).error).toBeNull();
    sql(`insert into public.qbo_pushes(
      brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,
      request_body,local_snapshot,attempt_reason,status,qbo_entity_id,response,finished_at)
      values('${f.brewery.id}','${lateId}','${f.connection.id}','${f.connection.realm_id}',
      'Invoice',gen_random_uuid(),'{}','{}','initial','pushed','remote-late','{"Id":"remote-late"}',now())`);
    const retryFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const remoteId = new URL(String(input)).pathname.split("/").at(-1)!;
      return invoiceResponse({ Id: remoteId, SyncToken: `synced-${remoteId}` });
    });
    const client = new QboOAuthClient(config, retryFetch);
    const result = await syncQboInvoices(f.ctx, requestId, client);
    expect(result).toMatchObject({ synced: 2 });
    expect(retryFetch).toHaveBeenCalledTimes(2);
    await expect(syncQboInvoices(f.ctx, requestId, client)).resolves.toEqual(result);
    expect(retryFetch).toHaveBeenCalledTimes(2);
    expect(sql(`select coalesce(qbo_sync_token,'NULL') from invoices where id='${lateId}'`)).toEqual(["NULL"]);

    const atomicRequestId = crypto.randomUUID();
    const pending = await beginQboInvoiceSync(f.ctx, atomicRequestId);
    if ("replayResult" in pending) throw new Error("unexpected replay");
    sql(`update invoices set qbo_invoice_id='changed-after-fetch' where id='${secondId}'`);
    await expect(completeQboInvoiceSync(f.ctx, {
      actorId: pending.actorId,
      connectionId: pending.connectionId,
      realmId: pending.realmId,
      requestId: atomicRequestId,
      observations: pending.targets.map((target) => ({
        invoiceId: target.invoiceId, remoteId: target.remoteId, remoteState: "live" as const,
        syncToken: "must-roll-back", taxCents: 1000, totalCents: 10000, balanceCents: 5000,
        contentMatches: true, cashCollectedCents: 10000, paidAt: "2026-09-09T15:00:00Z",
      })),
    })).rejects.toThrow("QuickBooks invoice identity changed");
    expect(sql(`select qbo_sync_token from invoices where id='${firstId}'`)).toEqual(["synced-remote-one"]);
  });

  it("rejects older out-of-order sync completions after a newer invoice observation commits", async () => {
    const sessions = [new Client({ connectionString: DB }), new Client({ connectionString: DB })];
    await Promise.all(sessions.map((client) => client.connect()));
    const complete = (
      client: Client,
      f: Awaited<ReturnType<typeof stateFixture>>,
      requestId: string,
      started: Exclude<Awaited<ReturnType<typeof beginQboInvoiceSync>>, { replayResult: unknown }>,
      observation: Record<string, unknown>,
    ) => client.query(
      "select public.complete_qbo_invoice_sync($1,$2,$3,$4,$5,$6::jsonb)",
      [f.brewery.id, started.actorId, requestId, started.connectionId, started.realmId,
        JSON.stringify(started.targets.map((target) => ({ invoiceId: target.invoiceId, remoteId: target.remoteId, ...observation })))],
    );
    const begin = async (f: Awaited<ReturnType<typeof stateFixture>>, requestId: string) => {
      const started = await beginQboInvoiceSync(f.ctx, requestId);
      if ("replayResult" in started) throw new Error("unexpected replay");
      return started;
    };
    try {
      const voided = await stateFixture();
      const olderVoidRequest = crypto.randomUUID();
      const newerVoidRequest = crypto.randomUUID();
      const olderVoid = await begin(voided, olderVoidRequest);
      const newerVoid = await begin(voided, newerVoidRequest);
      await complete(sessions[1], voided, newerVoidRequest, newerVoid, {
        remoteState: "voided", syncToken: "newer-void", taxCents: 0,
        totalCents: 0, balanceCents: 0, contentMatches: true, cashCollectedCents: 0, paidAt: null,
      });
      await expect(complete(sessions[0], voided, olderVoidRequest, olderVoid, {
        remoteState: "live", syncToken: "older-live", taxCents: 1000,
        totalCents: 10000, balanceCents: 10000, contentMatches: true, cashCollectedCents: 0, paidAt: null,
      })).rejects.toMatchObject({ code: "MG409" });
      expect(sql(`select qbo_remote_state||'|'||qbo_sync_token from invoices where id='${voided.invoice.id}'`))
        .toEqual(["voided|newer-void"]);

      const paid = await stateFixture();
      const olderPaidRequest = crypto.randomUUID();
      const newerPaidRequest = crypto.randomUUID();
      const olderPaid = await begin(paid, olderPaidRequest);
      const newerPaid = await begin(paid, newerPaidRequest);
      await complete(sessions[1], paid, newerPaidRequest, newerPaid, {
        remoteState: "live", syncToken: "newer-paid", taxCents: 1000,
        totalCents: 10000, balanceCents: 0, contentMatches: true, cashCollectedCents: 10000, paidAt: "2026-09-09T15:00:00Z",
      });
      await expect(complete(sessions[0], paid, olderPaidRequest, olderPaid, {
        remoteState: "live", syncToken: "older-unpaid", taxCents: 1000,
        totalCents: 10000, balanceCents: 10000, contentMatches: true, cashCollectedCents: 0, paidAt: null,
      })).rejects.toMatchObject({ code: "MG409" });
      expect(sql(`select qbo_sync_token||'|'||(paid_at is not null)::text from invoices where id='${paid.invoice.id}'`))
        .toEqual(["newer-paid|true"]);
    } finally {
      await Promise.all(sessions.map((client) => client.end()));
    }
  });

  it("marks only a definitive 404 from the original current realm as deleted", async () => {
    expect(sql(`select r.role from pg_proc p cross join (values ('anon'),('authenticated'),('service_role')) r(role)
      where p.oid='public.complete_qbo_invoice_sync(uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure
        and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual(["service_role"]);
    const deleted = await stateFixture();
    const notFound = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("missing", { status: 404 }));
    await syncQboInvoices(deleted.ctx, crypto.randomUUID(), new QboOAuthClient(config, notFound));
    expect(sql(`select qbo_remote_state from invoices where id='${deleted.invoice.id}'`)).toEqual(["deleted"]);

    const unavailable = await stateFixture();
    const transport = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("network down"));
    await expect(syncQboInvoices(unavailable.ctx, crypto.randomUUID(), new QboOAuthClient(config, transport)))
      .rejects.toThrow("QuickBooks is unavailable");
    expect(sql(`select qbo_remote_state from invoices where id='${unavailable.invoice.id}'`)).toEqual(["live"]);

    const wrongRealm = await stateFixture();
    sql(`update public.qbo_pushes set realm_id='other-realm' where invoice_id='${wrongRealm.invoice.id}'`);
    const noFetch = vi.fn<typeof globalThis.fetch>();
    await syncQboInvoices(wrongRealm.ctx, crypto.randomUUID(), new QboOAuthClient(config, noFetch));
    expect(noFetch).not.toHaveBeenCalled();
    expect(sql(`select qbo_remote_state from invoices where id='${wrongRealm.invoice.id}'`)).toEqual(["live"]);

    const warehouse = await stateFixture("warehouse");
    const forbiddenFetch = vi.fn<typeof globalThis.fetch>();
    await expect(syncQboInvoices(warehouse.ctx, crypto.randomUUID(), new QboOAuthClient(config, forbiddenFetch)))
      .rejects.toThrow("permission denied");
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it("sets future ACH/card defaults and writes off only eligible invoices with exact replay", async () => {
    const f = await stateFixture();
    const defaultsRequest = crypto.randomUUID();
    const defaults = await f.ctx.db.rpc("set_qbo_push_defaults", {
      p_brewery: f.brewery.id,
      p_allow_ach: true,
      p_allow_card: false,
      p_request_id: defaultsRequest,
    });
    expect(defaults.error).toBeNull();
    expect(defaults.data).toEqual({ allowAch: true, allowCard: false });
    expect(sql(`select allow_online_ach_payment::text || '|' || allow_online_credit_card_payment::text from qbo_connections where brewery_id='${f.brewery.id}'`))
      .toEqual(["true|false"]);

    sql(`update public.invoices set qbo_remote_state='voided',paid_at='2026-09-09T15:00:00Z' where id='${f.invoice.id}'`);
    const requestId = crypto.randomUUID();
    const input = {
      p_brewery: f.brewery.id,
      p_invoice: f.invoice.id,
      p_reason: "Accountant voided an uncollectible duplicate",
      p_request_id: requestId,
    };
    const first = await f.ctx.db.rpc("write_off_invoice", input);
    const replay = await f.ctx.db.rpc("write_off_invoice", input);
    expect(first.error).toBeNull();
    expect(replay.data).toEqual(first.data);
    expect(sql(`select (written_off_at is not null)::text || '|' || written_off_by || '|' || written_off_reason || '|' || paid_at::text from invoices where id='${f.invoice.id}'`))
      .toEqual([`true|${f.ctx.userId}|Accountant voided an uncollectible duplicate|2026-09-09 15:00:00+00`]);

    const live = await stateFixture();
    expect((await live.ctx.db.rpc("write_off_invoice", {
      p_brewery: live.brewery.id,
      p_invoice: live.invoice.id,
      p_reason: "Not eligible",
      p_request_id: crypto.randomUUID(),
    })).error).not.toBeNull();
    const sales = await makeStaffCtx(f.brewery.id, "sales");
    expect((await sales.db.rpc("write_off_invoice", {
      ...input,
      p_request_id: crypto.randomUUID(),
    })).error?.code).toBe("42501");
    const foreign = await stateFixture();
    expect((await foreign.ctx.db.rpc("write_off_invoice", {
      ...input,
      p_brewery: foreign.brewery.id,
      p_request_id: crypto.randomUUID(),
    })).error).not.toBeNull();
  });

  it("keeps nonlive historical payments out of staff, portal, and revenue current predicates", async () => {
    const invoice = {
      id: "invoice-1", invoice_no: 1, kind: "invoice" as const, issued_on: "2026-09-01", due_on: "2026-10-01",
      paid_at: "2026-09-09T15:00:00Z", qbo_remote_state: "voided" as const, qbo_balance_cents: 0,
      qbo_accountant_drift: false, written_off_at: null, customers: { name: "Buyer" },
    };
    expect(toInvoiceViewProps({ invoice, lines: [], questions: [] })).toMatchObject({ headerTone: "w", summary: expect.stringContaining("voided") });
    expect(toPortalInvoiceViewProps({
      invoice: { ...invoice, total_cents: 10000 }, lines: [], brewery: { name: "Brewery", customer_phone: null },
    })).toMatchObject({ paid: false, paidOn: undefined, status: "Voided" });
    for (const state of [
      { qbo_remote_state: "voided" as const, written_off_at: null, status: "Voided" },
      { qbo_remote_state: "deleted" as const, written_off_at: null, status: "Deleted" },
      { qbo_remote_state: "deleted" as const, written_off_at: "2026-09-09T16:00:00Z", status: "Written off" },
    ]) {
      const model = toPortalInvoiceViewProps({
        invoice: { ...invoice, ...state, total_cents: 10000 }, lines: [], brewery: { name: "Brewery", customer_phone: null },
      });
      expect(model).toMatchObject({ paid: false, paidOn: undefined, payable: false, status: state.status });
      const html = renderToStaticMarkup(createElement(PortalInvoiceView, { model, footer: null }));
      expect(html).toContain("This invoice is not payable.");
      expect(html).not.toMatch(/still due|arrange payment|>Due</);
    }
    expect(toPortalInvoicesViewProps({ customerName: "Buyer", invoices: [{ ...invoice, invoice_lines: [{ amount_cents: 10000 }] }] }).rows[0])
      .toMatchObject({ detail: "voided", unpaid: false });
  });
});
