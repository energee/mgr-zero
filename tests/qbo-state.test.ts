import { describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { QboOAuthClient, syncQboInvoices } from "@/lib/qbo";
import { beginQboInvoiceSync, completeQboInvoiceSync } from "@/lib/supabase/integration-tokens";
import { invoiceBalanceCents, invoiceCurrentState, invoiceLedgerOwnsBalance } from "@/lib/mgr/invoice-state";
import { qboInvoicePresentation } from "@/lib/mgr/qbo-ui";
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
  kind: "invoice" | "credit_memo" = "invoice",
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
    kind,
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
      '${kind === "invoice" ? "Invoice" : "CreditMemo"}',gen_random_uuid(),'{"CustomerRef":{"value":"customer-42"},"DocNumber":"1","TxnDate":"2026-09-09","Line":[]}','{}','initial','pushed','${remoteId}',
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

function multiInvoicePaymentResponse(id: string, cash: number) {
  return new Response(JSON.stringify({
    Payment: {
      Id: id,
      TotalAmt: cash,
      UnappliedAmt: 0,
      TxnDate: "2026-09-09",
      Line: [
        { Amount: 80, LinkedTxn: [{ TxnId: "remote-one", TxnType: "Invoice" }] },
        { Amount: 80, LinkedTxn: [{ TxnId: "remote-two", TxnType: "Invoice" }] },
        ...(cash < 160 ? [{ Amount: -(160 - cash), LinkedTxn: [{ TxnId: "credit-1", TxnType: "CreditMemo" }] }] : []),
      ],
    },
  }), { status: 200 });
}

describe("QuickBooks current invoice state", () => {
  it("freezes credit entity type and reconciles deletion without invoice cash semantics", async () => {
    const f = await stateFixture("admin", undefined, undefined, "credit_memo");
    const requestId = crypto.randomUUID();
    const start = await beginQboInvoiceSync(f.ctx, requestId);
    expect("targets" in start && start.targets).toEqual([expect.objectContaining({ entityType: "CreditMemo" })]);
    const transport = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      CreditMemo: { Id: "remote-invoice", SyncToken: "1", TotalAmt: 0, RemainingCredit: 0, PrivateNote: "Voided", Line: [], MetaData: { LastUpdatedTime: "2026-09-09T15:00:00Z" } },
    })));
    expect(await syncQboInvoices(f.ctx, requestId, new QboOAuthClient(config, transport))).toMatchObject({ synced: 1, paid: 0, voided: 0, drifted: 1 });
    expect(String(transport.mock.calls[0][0])).toContain("/creditmemo/remote-invoice?");
    transport.mockResolvedValue(new Response(null, { status: 404 }));
    expect(await syncQboInvoices(f.ctx, crypto.randomUUID(), new QboOAuthClient(config, transport))).toMatchObject({ deleted: 1 });
    expect(sql(`select qbo_remote_state || ':' || coalesce(paid_at::text,'unpaid') from public.invoices where id='${f.invoice.id}'`)).toEqual(["deleted:unpaid"]);
  });

  it("validates remaining credit without presenting it as invoice money due", async () => {
    const transport = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      CreditMemo: { Id: "credit", SyncToken: "1", TotalAmt: 36, RemainingCredit: 12 },
    })));
    const read = await new QboOAuthClient(config, transport).readInvoice("realm", "credit", "access", new Map(), "CreditMemo");
    if (!read.ok) throw new Error("unexpected provider failure");
    expect(read.balanceCents).toBeNull();
    expect(qboInvoicePresentation({ kind: "credit_memo", roles: ["sales"], connected: true, syncStatus: "pushed", localPaidCents: 0,
      remoteState: "live", totalCents: read.totalCents, balanceCents: read.balanceCents, cashCollectedCents: read.cashCollectedCents }))
      .toEqual({ detail: "pushed to QuickBooks", actions: [] });
  });

  it("does not persist an invoice balance from a numeric credit observation", async () => {
    const f = await stateFixture("admin", undefined, undefined, "credit_memo");
    await admin.from("invoices").update({ qbo_balance_cents: 3600 }).eq("id", f.invoice.id).throwOnError();
    const requestId = crypto.randomUUID();
    const start = await beginQboInvoiceSync(f.ctx, requestId);
    if ("replayResult" in start) throw new Error("unexpected replay");
    await completeQboInvoiceSync(f.ctx, { actorId: start.actorId, connectionId: start.connectionId, realmId: start.realmId, requestId,
      observations: [{ invoiceId: f.invoice.id, remoteId: "remote-invoice", remoteState: "live", syncToken: "1", taxCents: 0,
        totalCents: 3600, balanceCents: 1200, cashCollectedCents: 0, paidAt: null, contentMatches: true }] });
    expect(sql(`select qbo_balance_cents is null from public.invoices where id='${f.invoice.id}'`)).toEqual(["t"]);
  });

  it.each([undefined, 12])("accepts optional RemainingCredit without invoice Balance (%s)", async (remaining) => {
    const f = await stateFixture("admin", undefined, undefined, "credit_memo");
    const transport = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      CreditMemo: { Id: "remote-invoice", SyncToken: "1", TotalAmt: 36, ...(remaining === undefined ? {} : { RemainingCredit: remaining }), MetaData: { LastUpdatedTime: "2026-09-09T15:00:00Z" } },
    })));
    expect(await syncQboInvoices(f.ctx, crypto.randomUUID(), new QboOAuthClient(config, transport))).toMatchObject({ synced: 1, paid: 0 });
    expect(sql(`select coalesce(qbo_balance_cents::text,'NULL') || ':' || coalesce(paid_at::text,'unpaid') from public.invoices where id='${f.invoice.id}'`)).toEqual(["NULL:unpaid"]);
  });

  it.each([
    { CreditMemo: { Id: "remote-invoice", SyncToken: "1", TotalAmt: 36, RemainingCredit: -1 } },
    { CreditMemo: { Id: "remote-invoice", SyncToken: "1", TotalAmt: 36, RemainingCredit: "12" } },
    { Invoice: { Id: "remote-invoice", SyncToken: "1", TotalAmt: 36, Balance: 0 } },
    { CreditMemo: { Id: "wrong", SyncToken: "1", TotalAmt: 36, RemainingCredit: 0 } },
    { CreditMemo: { Id: "remote-invoice", SyncToken: 1, TotalAmt: 36, RemainingCredit: 0 } },
    { CreditMemo: { Id: "remote-invoice", SyncToken: "1", TotalAmt: -36, RemainingCredit: 0 } },
  ])("keeps malformed credit observations unresolved (%j)", async (body) => {
    const f = await stateFixture("admin", undefined, undefined, "credit_memo");
    const id = crypto.randomUUID();
    const transport = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(syncQboInvoices(f.ctx, id, new QboOAuthClient(config, transport))).rejects.toThrow("QuickBooks is unavailable");
    expect(sql(`select qbo_remote_state from public.invoices where id='${f.invoice.id}'`)).toEqual(["live"]);
    expect(sql(`select result is null from private.command_requests where request_id='${id}'`)).toEqual(["t"]);
  });
  it("retries the same credit endpoint once after 401 and leaves uncertain errors unresolved", async () => {
    const f = await stateFixture("admin", undefined, undefined, "credit_memo");
    const transport = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "next-access", refresh_token: "next-refresh", expires_in: 3600, x_refresh_token_expires_in: 86400 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ CreditMemo: { Id: "remote-invoice", SyncToken: "1", TotalAmt: 36, RemainingCredit: 0, LinkedTxn: [{ TxnId: "not-cash", TxnType: "Payment" }] } })));
    const client = new QboOAuthClient(config, transport);
    expect(await syncQboInvoices(f.ctx, crypto.randomUUID(), client)).toMatchObject({ synced: 1, paid: 0 });
    expect(String(transport.mock.calls[0][0])).toBe(String(transport.mock.calls[2][0]));
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer next-access" });
    transport.mockReset()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "third-access", refresh_token: "third-refresh", expires_in: 3600, x_refresh_token_expires_in: 86400 })))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const deniedId = crypto.randomUUID();
    await expect(syncQboInvoices(f.ctx, deniedId, client)).rejects.toThrow("QuickBooks is unavailable");
    expect(transport).toHaveBeenCalledTimes(3);
    expect(String(transport.mock.calls[0][0])).toBe(String(transport.mock.calls[2][0]));
    expect(transport.mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer third-access" });
    expect(sql(`select result is null from private.command_requests where request_id='${deniedId}'`)).toEqual(["t"]);
    for (const status of [401, 429, 500]) {
      transport.mockResolvedValue(new Response(null, { status }));
      const id = crypto.randomUUID();
      await expect(syncQboInvoices(f.ctx, id, client)).rejects.toThrow();
      expect(sql(`select result is null from private.command_requests where request_id='${id}'`)).toEqual(["t"]);
      expect(sql(`select qbo_remote_state from public.invoices where id='${f.invoice.id}'`)).toEqual(["live"]);
    }
  });

  it.each(["local kind", "push type", "voided", "cash"])("rejects credit completion with changed %s", async (change) => {
    const f = await stateFixture("admin", undefined, undefined, "credit_memo");
    const requestId = crypto.randomUUID();
    const start = await beginQboInvoiceSync(f.ctx, requestId);
    if ("replayResult" in start) throw new Error("unexpected replay");
    if (change === "local kind") sql(`update public.invoices set kind='invoice' where id='${f.invoice.id}'`);
    if (change === "push type") sql(`update public.qbo_pushes set entity_type='Invoice' where invoice_id='${f.invoice.id}'`);
    await expect(completeQboInvoiceSync(f.ctx, {
      actorId: start.actorId, connectionId: start.connectionId, realmId: start.realmId, requestId,
      observations: [{ invoiceId: f.invoice.id, remoteId: "remote-invoice", remoteState: change === "voided" ? "voided" : "live",
        syncToken: "1", taxCents: 0, totalCents: 3600, balanceCents: 0, contentMatches: true,
        cashCollectedCents: change === "cash" ? 3600 : 0, paidAt: null }],
    })).rejects.toThrow();
    expect(sql(`select qbo_sync_token is null from public.invoices where id='${f.invoice.id}'`)).toEqual(["t"]);
    expect(sql(`select result is null from private.command_requests where request_id='${requestId}'`)).toEqual(["t"]);
  });

  it("replays only legacy invoice targets and rejects explicit invalid frozen types", async () => {
    const f = await stateFixture();
    const requestId = crypto.randomUUID();
    await beginQboInvoiceSync(f.ctx, requestId);
    sql(`update private.qbo_invoice_sync_batches set targets=(select jsonb_agg(t-'entityType') from jsonb_array_elements(targets) t) where request_id='${requestId}'`);
    const credit = await admin.from("invoices").insert({ brewery_id: f.brewery.id, customer_id: f.customer.customerId, kind: "credit_memo", qbo_sync_status: "pushed", qbo_invoice_id: "later-credit" }).select("id").single();
    if (credit.error) throw credit.error;
    sql(`insert into public.qbo_pushes(brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,request_body,local_snapshot,attempt_reason,status,qbo_entity_id,response)
      values('${f.brewery.id}','${credit.data.id}','${f.connection.id}','${f.connection.realm_id}','CreditMemo',gen_random_uuid(),'{}','{}','initial','pushed','later-credit','{}')`);
    const transport = vi.fn<typeof globalThis.fetch>().mockResolvedValue(invoiceResponse());
    expect(await syncQboInvoices(f.ctx, requestId, new QboOAuthClient(config, transport))).toMatchObject({ synced: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0][0])).toContain("/invoice/remote-invoice?");
    const invalidId = crypto.randomUUID();
    await beginQboInvoiceSync(f.ctx, invalidId);
    sql(`update private.qbo_invoice_sync_batches set targets=(select jsonb_agg(t || '{"entityType":null}'::jsonb) from jsonb_array_elements(targets) t) where request_id='${invalidId}'`);
    transport.mockClear();
    await expect(syncQboInvoices(f.ctx, invalidId, new QboOAuthClient(config, transport))).rejects.toThrow("entity type was invalid");
    expect(transport).not.toHaveBeenCalled();
  });

  it("retains successful sync history and a separate safe failure with operator-owned retry", async () => {
    const f = await stateFixture();
    const successId = crypto.randomUUID();
    const transport = vi.fn<typeof globalThis.fetch>().mockResolvedValue(invoiceResponse());
    await syncQboInvoices(f.ctx, successId, new QboOAuthClient(config, transport));
    const readStatus = () => runCommand("get_qbo_sync_status", {}, f.ctx) as Promise<{
      lastSuccess: { at: string; operator: string }; latestFailure: { at: string; operator: string } | null;
      retryRequestId: string | null;
    }>;
    const success = await readStatus();
    expect(success.lastSuccess.at).toBeTruthy();
    expect(success.lastSuccess.operator).toBeTruthy();
    expect(success.latestFailure).toBeNull();
    // An editable display name keeps the original account identity beside it.
    await admin.auth.admin.updateUserById(f.ctx.userId, { user_metadata: { full_name: "Pat Operator" } });
    const namedOperator = (await readStatus()).lastSuccess.operator;
    expect(namedOperator).toContain("Pat Operator");
    expect(namedOperator).toContain(success.lastSuccess.operator);
    await admin.auth.admin.updateUserById(f.ctx.userId, { user_metadata: { full_name: "" } });
    const failedId = crypto.randomUUID();
    transport.mockRejectedValue(new Error("secret provider response"));
    await expect(syncQboInvoices(f.ctx, failedId, new QboOAuthClient(config, transport))).rejects.toThrow("QuickBooks is unavailable");
    const failed = await readStatus();
    expect(failed.lastSuccess).toEqual(success.lastSuccess);
    expect(failed.latestFailure?.at).toBeTruthy();
    expect(JSON.stringify(failed)).not.toContain("secret");
    expect(failed.retryRequestId).toBe(failedId);
    const colleague = await makeStaffCtx(f.brewery.id, "sales");
    expect(await runCommand("get_qbo_sync_status", {}, colleague)).toMatchObject({ retryRequestId: null });
    const stranger = await stateFixture();
    expect(await runCommand("get_qbo_sync_status", {}, stranger.ctx)).toMatchObject({ lastSuccess: null, latestFailure: null, retryRequestId: null });
    const warehouse = await makeStaffCtx(f.brewery.id, "warehouse");
    await expect(runCommand("get_qbo_sync_status", {}, warehouse)).rejects.toThrow(/permission/i);
    transport.mockResolvedValue(invoiceResponse());
    await syncQboInvoices(f.ctx, failedId, new QboOAuthClient(config, transport));
    transport.mockClear();
    await syncQboInvoices(f.ctx, failedId, new QboOAuthClient(config, transport));
    expect(transport).not.toHaveBeenCalled();
    expect(await readStatus()).toMatchObject({ retryRequestId: null });
    const supersededId = crypto.randomUUID();
    await beginQboInvoiceSync(f.ctx, supersededId);
    expect(await readStatus()).toMatchObject({ retryRequestId: supersededId });
    await beginQboInvoiceSync(colleague, crypto.randomUUID());
    expect(await readStatus()).toMatchObject({ retryRequestId: supersededId });
    const beforeSuperseded = await readStatus();
    transport.mockClear();
    expect(await syncQboInvoices(f.ctx, supersededId, new QboOAuthClient(config, transport))).toEqual({ superseded: true });
    expect(await syncQboInvoices(f.ctx, supersededId, new QboOAuthClient(config, transport))).toEqual({ superseded: true });
    expect(transport).not.toHaveBeenCalled();
    expect(await readStatus()).toMatchObject({ lastSuccess: beforeSuperseded.lastSuccess, retryRequestId: null, latest: { superseded: true } });
    transport.mockResolvedValue(invoiceResponse());
    const fresh = await syncQboInvoices(f.ctx, crypto.randomUUID(), new QboOAuthClient(config, transport));
    expect(fresh).toMatchObject({ synced: 1 });
    expect((await warehouse.db.rpc("get_qbo_sync_status", { p_brewery: f.brewery.id })).error).not.toBeNull();
    expect((await stranger.ctx.db.rpc("get_qbo_sync_status", { p_brewery: f.brewery.id })).error).not.toBeNull();
  });

  it("durably records a timed-out provider read without replacing successful invoice observations", async () => {
    const f = await stateFixture();
    const transport = vi.fn<typeof fetch>().mockResolvedValue(invoiceResponse());
    const client = new QboOAuthClient(config, transport);
    await syncQboInvoices(f.ctx, crypto.randomUUID(), client);
    const before = await runCommand("get_qbo_sync_status", {}, f.ctx) as { lastSuccess: unknown };
    const invoiceBefore = sql(`select qbo_remote_state || '|' || qbo_balance_cents from invoices where id='${f.invoice.id}'`);
    const requestId = crypto.randomUUID();
    transport.mockImplementation((_input, init) => {
      const { promise, reject } = Promise.withResolvers<Response>();
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      return promise;
    });
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => nativeTimeout(ms === 20_000 ? 10 : ms));
    try {
      await expect(syncQboInvoices(f.ctx, requestId, client)).rejects.toThrow("QuickBooks is unavailable");
    } finally {
      timeout.mockRestore();
    }
    expect(await runCommand("get_qbo_sync_status", {}, f.ctx)).toMatchObject({
      lastSuccess: before.lastSuccess, latestFailure: { at: expect.any(String) }, retryRequestId: requestId,
    });
    expect(sql(`select qbo_remote_state || '|' || qbo_balance_cents from invoices where id='${f.invoice.id}'`)).toEqual(invoiceBefore);
    transport.mockResolvedValue(invoiceResponse());
    await expect(syncQboInvoices(f.ctx, requestId, client)).resolves.toMatchObject({ synced: 1 });
    expect(await runCommand("get_qbo_sync_status", {}, f.ctx)).toMatchObject({ retryRequestId: null });
  });

  it("stores sync confirmation rather than invoice modification time after cash payment", async () => {
    const f = await stateFixture();
    const transport = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(invoiceResponse({ Balance: 0, MetaData: { LastUpdatedTime: "2026-09-12T15:00:00Z" }, LinkedTxn: [{ TxnId: "paid-date", TxnType: "Payment" }] }))
      .mockResolvedValueOnce(paymentResponse("paid-date", 100));
    await syncQboInvoices(f.ctx, crypto.randomUUID(), new QboOAuthClient(config, transport));
    expect(sql(`select (paid_at is not null)::text || '|' || (paid_at <> '2026-09-12T15:00:00Z'::timestamptz)::text || '|' || qbo_cash_collected_cents from invoices where id='${f.invoice.id}'`))
      .toEqual(["true|true|10000"]);
  });

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

  it("fetches a shared Payment once and fails cash recognition closed when its invoice allocation is ambiguous", async () => {
    // Random ids keep reruns from colliding in the shared test DB; sorted so
    // the sync's `order by id` still visits remote-one first (#767).
    const [firstId, secondId] = [crypto.randomUUID(), crypto.randomUUID()].sort();
    const f = await stateFixture("admin", firstId, "remote-one");
    expect((await admin.from("invoices").insert({
      id: secondId, brewery_id: f.brewery.id, customer_id: f.customer.customerId,
      qbo_invoice_id: "remote-two", qbo_sync_status: "pushed",
    })).error).toBeNull();
    sql(`update public.qbo_pushes set response='{"Id":"remote-one","SyncToken":"0","TotalAmt":80,"TotalTax":10,"Balance":80}'
      where invoice_id='${firstId}'`);
    sql(`insert into public.qbo_pushes(
      brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,
      request_body,local_snapshot,attempt_reason,status,qbo_entity_id,response,finished_at)
      values('${f.brewery.id}','${secondId}','${f.connection.id}','${f.connection.realm_id}',
      'Invoice',gen_random_uuid(),'{"CustomerRef":{"value":"customer-42"},"DocNumber":"1","TxnDate":"2026-09-09","Line":[]}',
      '{}','initial','pushed','remote-two','{"Id":"remote-two","SyncToken":"0","TotalAmt":80,"TotalTax":10,"Balance":80}',now())`);

    const sharedFetch = (cash: number) => vi.fn<typeof globalThis.fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/payment/shared-payment")) return multiInvoicePaymentResponse("shared-payment", cash);
      const remoteId = path.split("/").at(-1)!;
      return invoiceResponse({
        Id: remoteId, TotalAmt: 80, Balance: 0,
        LinkedTxn: [{ TxnId: "shared-payment", TxnType: "Payment" }],
      });
    });

    const ambiguous = sharedFetch(100);
    await syncQboInvoices(f.ctx, crypto.randomUUID(), new QboOAuthClient(config, ambiguous));
    expect(sql(`select qbo_invoice_id||'|'||qbo_cash_collected_cents||'|'||(paid_at is not null)::text
      from invoices where id in ('${firstId}','${secondId}') order by id`))
      .toEqual(["remote-one|0|false", "remote-two|0|false"]);
    expect(ambiguous).toHaveBeenCalledTimes(3);

    const allCash = sharedFetch(160);
    await syncQboInvoices(f.ctx, crypto.randomUUID(), new QboOAuthClient(config, allCash));
    expect(allCash).toHaveBeenCalledTimes(3);
    expect(sql(`select qbo_invoice_id||'|'||qbo_cash_collected_cents from invoices
      where id in ('${firstId}','${secondId}') order by id`))
      .toEqual(["remote-one|8000", "remote-two|8000"]);

    const separate = vi.fn<typeof globalThis.fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/payment/credit-payment")) {
        return new Response(JSON.stringify({ Payment: {
          Id: "credit-payment", TotalAmt: 0, UnappliedAmt: 0,
          Line: [
            { Amount: 80, LinkedTxn: [{ TxnId: "remote-one", TxnType: "Invoice" }] },
            { Amount: -80, LinkedTxn: [{ TxnId: "credit-1", TxnType: "CreditMemo" }] },
          ],
        } }), { status: 200 });
      }
      if (path.endsWith("/payment/cash-payment")) {
        return new Response(JSON.stringify({ Payment: {
          Id: "cash-payment", TotalAmt: 80, UnappliedAmt: 0,
          Line: [{ Amount: 80, LinkedTxn: [{ TxnId: "remote-two", TxnType: "Invoice" }] }],
        } }), { status: 200 });
      }
      const remoteId = path.split("/").at(-1)!;
      return invoiceResponse({
        Id: remoteId, TotalAmt: 80, Balance: 0,
        LinkedTxn: [{ TxnId: remoteId === "remote-one" ? "credit-payment" : "cash-payment", TxnType: "Payment" }],
      });
    });
    await syncQboInvoices(f.ctx, crypto.randomUUID(), new QboOAuthClient(config, separate));
    expect(separate).toHaveBeenCalledTimes(4);
    expect(sql(`select qbo_invoice_id||'|'||qbo_cash_collected_cents from invoices
      where id in ('${firstId}','${secondId}') order by id`))
      .toEqual(["remote-one|0", "remote-two|8000"]);
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
    const { rows: list } = await runCommand("list_invoices", {}, f.ctx) as { rows: { id: string; subtotal_cents: number; total_cents: number }[] };
    expect(list.find((row) => row.id === f.invoice.id)).toMatchObject({ subtotal_cents: 10000, total_cents: 10500 });
    const invoice = detail.invoice;
    expect(toInvoiceViewProps({ ...detail, questions: [], timeZone: "America/New_York" }).summary).toMatchObject({
      total: { label: "Current invoice total", value: "$105.00" }, rows: expect.arrayContaining([{ label: "Frozen MGR line subtotal", value: "$100.00" }]),
    });
    const customerUser = await makeCustomerUser(f.customer.customerId);
    const portalCtx = {
      db: await asUser(customerUser.email), userId: customerUser.id, breweryId: f.brewery.id,
      roles: ["customer" as const], customerId: f.customer.customerId,
    };
    const portalDetail = await runCommand("portal_invoice", { invoiceId: f.invoice.id }, portalCtx) as Parameters<typeof toPortalInvoiceViewProps>[0];
    const { rows: portalList } = await runCommand("portal_invoices", {}, portalCtx) as { rows: Parameters<typeof toPortalInvoicesViewProps>[0]["invoices"] };
    expect(toPortalInvoiceViewProps(portalDetail)).toMatchObject({ total: "$105.00", payable: false, paid: false, status: "Review" });
    expect(toPortalInvoicesViewProps({ customerName: "Buyer", invoices: portalList }).rows[0])
      .toMatchObject({ total: "$105.00", unpaid: true });
    expect(toPortalOrderViewProps({
      ...portalOrderShipped,
      shipment: { id: "shipment-1", invoices: [{ ...invoice, invoice_lines: [{ amount_cents: 10000 }] }] },
    }).invoice).toMatchObject({ amount: "$105.00", detail: "unpaid", paid: false });

    const local = { ...invoice, qbo_total_cents: null, qbo_accountant_drift: false };
    expect(toInvoiceViewProps({ ...detail, invoice: local, questions: [], timeZone: "America/New_York" }).summary.total?.value).toBe("$100.00");
    const paid = { ...invoice, paid_at: "2026-09-10T12:00:00Z", qbo_balance_cents: 0 };
    expect(toPortalInvoiceViewProps({
      invoice: { ...paid, total_cents: 10000 }, lines: portalDetail.lines,
      brewery: { name: "Brewery", customer_phone: null },
    })).toMatchObject({ total: "$105.00", payable: false, paid: true });
  });

  it("applies a fetched batch atomically and replays its frozen target set without provider calls", async () => {
    // Random ids keep reruns from colliding in the shared test DB; sorted so
    // the sync's `order by id` still visits remote-one first (#767).
    const [firstId, secondId] = [crypto.randomUUID(), crypto.randomUUID()].sort();
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

    const lateId = crypto.randomUUID();
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

  // #758: a sync skips invoices settled (paid, voided or deleted) more than 90 days
  // ago, and still re-reads open and recently settled ones.
  it("skips invoices settled more than 90 days ago", async () => {
    const started = async (settled: "old" | "recent" | "open") => {
      const f = await stateFixture();
      if (settled !== "open") {
        sql(`update invoices set qbo_remote_state='voided', qbo_balance_cents=0 where id='${f.invoice.id}'`, true);
        // A separate statement: the trigger sets qbo_settled_at whenever state columns are written.
        sql(`update invoices set qbo_settled_at=now() - interval '${settled === "old" ? 100 : 10} days' where id='${f.invoice.id}'`, true);
      }
      const begin = await beginQboInvoiceSync(f.ctx, crypto.randomUUID());
      if ("replayResult" in begin) throw new Error("unexpected replay");
      return begin.targets.map(t => t.invoiceId);
    };
    expect(await started("old")).toEqual([]);
    expect(await started("recent")).toHaveLength(1);
    expect(await started("open")).toHaveLength(1);
  });

  // The settled time follows what each sync observed: set when it becomes paid,
  // voided or deleted, kept while a later sync rewrites the same settled state,
  // cleared when it reopens.
  it("records when an invoice became settled and clears it on reopen", async () => {
    const f = await stateFixture();
    const set = (fields: string) => sql(`update invoices set ${fields} where id='${f.invoice.id}'`, true);
    const settledAt = () => sql(`select coalesce(qbo_settled_at::text,'null') from invoices where id='${f.invoice.id}'`, true)[0];
    set("qbo_remote_state='live', qbo_balance_cents=0, paid_at=now()");
    const paid = settledAt();
    expect(paid).not.toBe("null");
    set("qbo_remote_state='live', qbo_balance_cents=0, paid_at=paid_at"); // a later sync, same paid state
    expect(settledAt()).toBe(paid);
    set("qbo_remote_state='live', qbo_balance_cents=5000, paid_at=null");
    expect(settledAt()).toBe("null");
    set("qbo_remote_state='voided', qbo_balance_cents=0");
    expect(settledAt()).not.toBe("null");
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
    expect(toInvoiceViewProps({
      invoice: { ...invoice, qbo_invoice_id: "qbo-1" }, lines: [], questions: [], timeZone: "America/New_York",
      payments: [], hasPendingPush: false, wasPushedToQbo: true, localPaidCents: 0, localCreditCents: 0,
    })).toMatchObject({ state: { label: "Voided", tone: "w" } });
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
    }
    expect(toPortalInvoicesViewProps({ customerName: "Buyer", invoices: [{ ...invoice, invoice_lines: [{ amount_cents: 10000 }] }] }).rows[0])
      .toMatchObject({ detail: "voided", unpaid: false });
  });
});

// #1045 Design 2: MGR's payment ledger owns the balance of an invoice QuickBooks never received.
describe("who owns an invoice balance", () => {
  const neverPushed = {
    kind: "invoice" as const, qbo_invoice_id: null, paid_at: null, qbo_balance_cents: null,
    has_pending_qbo_push: false, was_pushed_to_qbo: false, local_paid_cents: 0, local_credit_cents: 0,
  };

  it.each([
    // Also a rejected push, a never-pushed invoice a company change purged, and
    // one whose payments are all voided: each has exactly these facts.
    ["a never-pushed unpaid invoice", neverPushed],
    ["an invoice the ledger paid in full", { ...neverPushed, paid_at: "2026-10-20T04:00:00Z", local_paid_cents: 5000 }],
  ])("the ledger owns %s", (_name, invoice) => {
    expect(invoiceLedgerOwnsBalance(invoice)).toBe(true);
  });

  it.each([
    ["an invoice with a pending push (Q3)", { ...neverPushed, has_pending_qbo_push: true }],
    ["an invoice pushed and then purged by a company change (Q4)", { ...neverPushed, was_pushed_to_qbo: true }],
    ["an invoice with a QuickBooks identity", { ...neverPushed, qbo_invoice_id: "qbo-1042" }],
    ["a credit memo", { ...neverPushed, kind: "credit_memo" as const }],
    ["an invoice paid outside the ledger, such as a historical import (Q7)", { ...neverPushed, paid_at: "2026-09-01T04:00:00Z" }],
  ])("QuickBooks owns %s", (_name, invoice) => {
    expect(invoiceLedgerOwnsBalance(invoice)).toBe(false);
  });

  it("subtracts payments from the total when the ledger owns the balance", () => {
    expect(invoiceBalanceCents({ ...neverPushed, local_paid_cents: 3000 }, 10000)).toBe(7000);
  });

  it("subtracts live linked credit and retains excess after cash was collected", () => {
    expect(invoiceBalanceCents({ ...neverPushed, local_credit_cents: 2000 }, 10000)).toBe(8000);
    expect(invoiceBalanceCents({ ...neverPushed, local_credit_cents: 2000, local_paid_cents: 10000 }, 10000)).toBe(-2000);
    expect(invoiceBalanceCents({ ...neverPushed, qbo_invoice_id: "qbo", local_credit_cents: 2000, qbo_balance_cents: 7000 }, 10000)).toBe(7000);
    expect(invoiceLedgerOwnsBalance({ ...neverPushed, paid_at: "2026-10-20T00:00:00Z", local_credit_cents: 10000 })).toBe(true);
  });

  it("gives a ledger-owned $0.00 invoice a zero balance, never a negative one (Design 4)", () => {
    expect(invoiceBalanceCents(neverPushed, 0)).toBe(0);
    expect(invoiceBalanceCents(neverPushed, -500)).toBe(0);
  });

  it("never turns a null QuickBooks balance into zero", () => {
    expect(invoiceBalanceCents({ ...neverPushed, has_pending_qbo_push: true }, 10000)).toBeNull();
    expect(invoiceBalanceCents({ ...neverPushed, was_pushed_to_qbo: true, qbo_balance_cents: undefined }, 10000)).toBeNull();
    expect(invoiceBalanceCents({ ...neverPushed, qbo_invoice_id: "qbo-1042", qbo_balance_cents: 2500 }, 10000)).toBe(2500);
  });
});

it("shows the account email beside an editable QuickBooks sync operator name", async () => {
  const f = await stateFixture();
  const requestId = crypto.randomUUID();
  const account = await admin.auth.admin.getUserById(f.ctx.userId);
  expect((await f.ctx.db.auth.updateUser({ data: { full_name: "Owner (Admin)" } })).error).toBeNull();
  await beginQboInvoiceSync(f.ctx, requestId);
  const email = account.data.user!.email!;
  const latest = await runCommand("get_qbo_sync_status", {}, f.ctx) as { latest: { operator: string } };
  expect(latest.latest.operator).toContain("Owner (Admin)");
  expect(latest.latest.operator).toContain(email);
  sql(`update private.qbo_invoice_sync_batches set failed_at=now() where actor_id='${f.ctx.userId}' and request_id='${requestId}'`);
  const failed = await runCommand("get_qbo_sync_status", {}, f.ctx) as { latestFailure: { operator: string } };
  expect(failed.latestFailure.operator).toContain("Owner (Admin)");
  expect(failed.latestFailure.operator).toContain(email);
  sql(`update private.qbo_invoice_sync_batches set completed_at=now() where actor_id='${f.ctx.userId}' and request_id='${requestId}'`);
  const completed = await runCommand("get_qbo_sync_status", {}, f.ctx) as { lastSuccess: { operator: string } };
  expect(completed.lastSuccess.operator).toContain("Owner (Admin)");
  expect(completed.lastSuccess.operator).toContain(email);
});
