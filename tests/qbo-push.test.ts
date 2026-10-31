import { assert } from "vitest";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { completeQboOAuth, postReceiptBill, pushInvoiceToQbo, QboOAuthClient, syncQboInvoices } from "@/lib/qbo";
import {
  claimQboOAuth,
  completeQboOAuthStore,
  disconnectQbo,
  failQboOAuth,
  holdQboOAuthTokens,
  qboRealmInUse,
  readVersionedIntegrationTokens,
} from "@/lib/supabase/integration-tokens";
import { admin, DB, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
// The actionable 409s a pending push raises when QuickBooks holds a conflicting document.
const changedDocument = (document: string) => ({ status: 409, code: "conflict",
  message: `QuickBooks already has ${document} with different lines, due date, or payment options. Change it in QuickBooks to match MGR, or delete it there, then retry.` });
const conflictingDocument = (document: string) => ({ status: 409, code: "conflict",
  message: `QuickBooks already has ${document} for a different customer or date, or more than once. Fix or delete the conflicting copy in QuickBooks, then retry.` });

async function pushFixture(kind: "invoice" | "credit_memo" = "invoice", role: "admin" | "sales" = "sales") {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, role);
  const customer = await seedCustomer(brewery.id);
  const buyer = await makeCustomerUser(customer.customerId);
  const catalog = await seedCatalog(brewery.id);
  await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 333 });
  const realm = `realm-${crypto.randomUUID()}`;
  const connection = await admin.from("qbo_connections").insert({
    brewery_id: brewery.id, realm_id: realm, realm_label: "Fixture books", state: "connected",
  }).select("id").single();
  if (connection.error) throw connection.error;
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
    values('${brewery.id}','qbo','${connection.data.id}','access-secret','refresh-secret')`);
  expect((await ctx.db.rpc("set_qbo_customer_mapping", {
    p_brewery: brewery.id, p_customer: customer.customerId, p_qbo_customer_id: "customer-42", p_request_id: crypto.randomUUID(),
  })).error).toBeNull();
  expect((await ctx.db.rpc("set_qbo_item_mapping", {
    p_brewery: brewery.id, p_sku: catalog.skuId, p_qbo_item_id: "item-24", p_request_id: crypto.randomUUID(),
  })).error).toBeNull();
  expect((await admin.from("ship_tos").update({ is_default: true }).eq("id", customer.shipToId)).error).toBeNull();
  const invoice = await admin.from("invoices").insert({
    brewery_id: brewery.id, customer_id: customer.customerId, kind,
    issued_on: "2026-09-09",
  }).select("id,invoice_no,qbo_idempotency_key").single();
  if (invoice.error) throw invoice.error;
  const qty = kind === "invoice" ? 3 : -3;
  const line = await admin.from("invoice_lines").insert({
    brewery_id: brewery.id, invoice_id: invoice.data.id, kind: "sku", sku_id: catalog.skuId,
    qty, unit_price_cents: 333, description: "Frozen IPA case",
  });
  if (line.error) throw line.error;
  return { brewery, ctx, customer, buyer, catalog, realm, connectionId: connection.data.id, invoice: invoice.data };
}

describe("QuickBooks durable outbound push", () => {
  it.each(["invoice", "credit_memo"] as const)("reconciles a lost %s response after provider deduplication expires without another POST", async (kind) => {
    const f = await pushFixture(kind);
    const entityType = kind === "invoice" ? "Invoice" : "CreditMemo";
    const remote: Record<string, unknown>[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (init?.method === "GET") {
        expect(url.pathname).toBe(`/v3/company/${f.realm}/query`);
        expect(url.searchParams.get("query")).toBe(`select * from ${entityType} where DocNumber = '${f.invoice.invoice_no}'`);
        return Response.json({ QueryResponse: { [entityType]: remote } });
      }
      const key = url.searchParams.get("requestid")!;
      const body = String(init?.body);
      expect(sql(`select provider_request_id::text || '|' || request_body from public.qbo_pushes where invoice_id='${f.invoice.id}'`)[0])
        .toBe(`${key}|${body}`);
      expect(JSON.parse(body)).toMatchObject({
        DocNumber: String(f.invoice.invoice_no), CustomerRef: { value: "customer-42" },
        Line: [{ Amount: 9.99, SalesItemLineDetail: { Qty: 3, UnitPrice: 3.33 } }],
      });
      expect(JSON.parse(body)).toMatchObject({ BillEmail: { Address: f.buyer.email } });
      if (kind === "invoice") {
        expect(JSON.parse(body)).toMatchObject({
          DueDate: "2026-10-09", AllowOnlineACHPayment: true, AllowOnlineCreditCardPayment: true,
        });
      }
      // No request-id deduplication: a replayed POST would create a second transaction.
      remote.push({ ...JSON.parse(body), Id: `remote-${remote.length + 1}`, SyncToken: "0",
        TotalAmt: 9.99, Balance: 9.99, TxnTaxDetail: { TotalTax: 0 }, InvoiceLink: "https://secret" });
      throw new TypeError("socket closed after provider commit");
    });
    const client = new QboOAuthClient(config, fetch);
    const requestId = crypto.randomUUID();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).rejects.toThrow("QuickBooks is unavailable");
    expect(sql(`select status from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["pending"]);
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).resolves.toMatchObject({
      status: "pushed", remoteId: "remote-1",
    });
    const noFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, noFetch)))
      .resolves.toMatchObject({ status: "pushed", remoteId: "remote-1" });
    expect(noFetch).not.toHaveBeenCalled();
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
    expect(remote).toHaveLength(1);
    const saved = JSON.parse(sql(`select response::text from public.qbo_pushes where invoice_id='${f.invoice.id}'`)[0]);
    expect(saved).toEqual({ Id: "remote-1", SyncToken: "0", TotalAmt: 9.99, Balance: 9.99, TotalTax: 0 });
    expect(sql(`select status || ':' || qbo_entity_id from public.qbo_pushes where invoice_id='${f.invoice.id}'`))
      .toEqual(["pushed:remote-1"]);
  });

  it.each([
    ["invoice", 333, "voided"], ["invoice", 333, "live"], ["invoice", 0, "live"],
    ["credit_memo", 333, "live"],
  ] as const)("preserves %s state after adopting a zeroed document from a lost push (%s cents)", async (kind, unitPrice, expectedState) => {
    const f = await pushFixture(kind, "admin");
    if (unitPrice === 0) {
      expect((await admin.from("invoice_lines").update({ unit_price_cents: 0 })
        .eq("invoice_id", f.invoice.id)).error).toBeNull();
    }
    const entityType = kind === "invoice" ? "Invoice" : "CreditMemo";
    let remote: Record<string, unknown> | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      if (init?.method === "POST") {
        remote = { ...JSON.parse(String(init.body)), Id: "void-before-recovery", SyncToken: "1",
          TotalAmt: unitPrice * 3 / 100, Balance: unitPrice * 3 / 100, LinkedTxn: [] };
        throw new TypeError("lost response after provider committed");
      }
      if (new URL(String(input)).pathname.endsWith("/query")) {
        return Response.json({ QueryResponse: { [entityType]: [remote] } });
      }
      return Response.json({ [entityType]: remote });
    });
    const client = new QboOAuthClient(config, fetch);
    const requestId = crypto.randomUUID();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).rejects.toThrow("QuickBooks is unavailable");
    assert(remote);
    remote = { ...remote, SyncToken: "2", TotalAmt: expectedState === "voided" || unitPrice === 0 ? 0 : 9.99,
      Balance: 0, TxnTaxDetail: { TotalTax: 0 }, PrivateNote: "Voided by accountant; private details" };
    if (expectedState === "voided") {
      remote.Line = (remote.Line as Record<string, unknown>[]).map(line => ({
        ...line, Amount: 0, SalesItemLineDetail: {
          ...(line.SalesItemLineDetail as Record<string, unknown>), Qty: 0, UnitPrice: 0,
        },
      }));
    }
    const result = await pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client);
    expect(result).toMatchObject({ status: "pushed", remoteId: "void-before-recovery" });
    const state = () => sql(`select qbo_remote_state from public.invoices where id='${f.invoice.id}'`);
    expect(state()).toEqual([expectedState]);
    const saved = JSON.parse(sql(`select response::text from public.qbo_pushes where invoice_id='${f.invoice.id}'`)[0]);
    expect(saved).toMatchObject({ TotalAmt: expectedState === "voided" || unitPrice === 0 ? 0 : 9.99, Balance: 0 });
    expect(saved.PrivateNote).toBe(expectedState === "voided" ? "Voided" : undefined);
    expect(JSON.stringify(saved)).not.toContain("private details");

    expect(await syncQboInvoices(f.ctx, crypto.randomUUID(), client))
      .toMatchObject({ synced: 1, voided: expectedState === "voided" ? 1 : 0 });
    expect(state()).toEqual([expectedState]);
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "GET"]);
    const noFetch = vi.fn<typeof globalThis.fetch>();
    const replayClient = new QboOAuthClient(config, noFetch);
    expect(await pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, replayClient)).toEqual(result);
    if (expectedState === "voided") {
      await runCommand("write_off_invoice", { invoiceId: f.invoice.id, reason: "Provider void confirmed" }, f.ctx);
      expect(sql(`select written_off_at is not null from public.invoices where id='${f.invoice.id}'`)).toEqual(["t"]);
      expect(await pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, replayClient)).toEqual(result);
      expect(state()).toEqual(["voided"]);
    } else {
      await expect(runCommand("write_off_invoice", { invoiceId: f.invoice.id, reason: "Not a voided invoice" }, f.ctx))
        .rejects.toThrow(/only an invoice/);
    }
    expect(noFetch).not.toHaveBeenCalled();
  });

  it.each(["invoice", "credit_memo"] as const)("rejects changed frozen %s content without adopting or posting", async kind => {
    const f = await pushFixture(kind);
    const requestId = crypto.randomUUID();
    const start = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: requestId,
    });
    expect(start.error).toBeNull();
    assert(start.data && typeof start.data === "object" && !Array.isArray(start.data));
    assert(typeof start.data.requestBody === "string");
    const original = { ...JSON.parse(start.data.requestBody), Id: "existing", TotalAmt: 9.99, Balance: 0 };
    for (const mismatch of ["doc", "customer", "date", "item", "amount", "qty", "price", "lines", "due", "ach", "card"] as const) {
      if (kind === "credit_memo" && ["due", "ach", "card"].includes(mismatch)) continue;
      const row = structuredClone(original);
      if (mismatch === "doc") row.DocNumber = "0";
      if (mismatch === "customer") row.CustomerRef.value = "other";
      if (mismatch === "date") row.TxnDate = "2000-01-01";
      if (mismatch === "item") row.Line[0].SalesItemLineDetail.ItemRef.value = "other";
      if (mismatch === "amount") row.Line[0].Amount = 10;
      if (mismatch === "qty") row.Line[0].SalesItemLineDetail.Qty = 30;
      if (mismatch === "price") row.Line[0].SalesItemLineDetail.UnitPrice = 33.3;
      if (mismatch === "lines") delete row.Line;
      if (mismatch === "due") row.DueDate = "2000-01-01";
      if (mismatch === "ach") row.AllowOnlineACHPayment = false;
      if (mismatch === "card") row.AllowOnlineCreditCardPayment = false;
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
        QueryResponse: { [kind === "invoice" ? "Invoice" : "CreditMemo"]: [row] },
      }));
      const document = `${kind === "invoice" ? "invoice" : "credit memo"} ${f.invoice.invoice_no}`;
      // A row for another document number is an invalid answer, not a conflict staff can fix.
      await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, fetch))).rejects.toMatchObject(
        mismatch === "doc" ? { message: "QuickBooks is unavailable" }
          : mismatch === "customer" || mismatch === "date" ? conflictingDocument(document) : changedDocument(document));
      expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
      expect(sql(`select status || ':' || coalesce(qbo_entity_id,'') from public.qbo_pushes where invoice_id='${f.invoice.id}'`))
        .toEqual(["pending:"]);
    }
  });

  it.each(["credit_memo", "missing-marker", "nonzero-total", "nonzero-balance", "item", "amount", "qty", "price"] as const)(
    "rejects a zeroed positive document that is not an exact provider Invoice void: %s", async mismatch => {
      const f = await pushFixture(mismatch === "credit_memo" ? "credit_memo" : "invoice");
      const requestId = crypto.randomUUID();
      const start = await f.ctx.db.rpc("start_qbo_push", {
        p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: requestId,
      });
      expect(start.error).toBeNull();
      assert(start.data && typeof start.data === "object" && !Array.isArray(start.data));
      assert(typeof start.data.requestBody === "string");
      const row = { ...JSON.parse(start.data.requestBody), Id: "not-a-matching-void", TotalAmt: 0, Balance: 0, PrivateNote: "Voided" };
      row.Line[0].Amount = 0;
      row.Line[0].SalesItemLineDetail.Qty = 0;
      row.Line[0].SalesItemLineDetail.UnitPrice = 0;
      if (mismatch === "missing-marker") row.PrivateNote = "";
      if (mismatch === "nonzero-total") row.TotalAmt = 1;
      if (mismatch === "nonzero-balance") row.Balance = 1;
      if (mismatch === "item") row.Line[0].SalesItemLineDetail.ItemRef.value = "other";
      if (mismatch === "amount") row.Line[0].Amount = 1;
      if (mismatch === "qty") row.Line[0].SalesItemLineDetail.Qty = 1;
      if (mismatch === "price") row.Line[0].SalesItemLineDetail.UnitPrice = 1;
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
        QueryResponse: { [mismatch === "credit_memo" ? "CreditMemo" : "Invoice"]: [row] },
      }));
      await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, fetch)))
        .rejects.toMatchObject(changedDocument(`${mismatch === "credit_memo" ? "credit memo" : "invoice"} ${f.invoice.invoice_no}`));
      expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
      expect(sql(`select status from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["pending"]);
    },
  );

  it("queries even an original frozen request replay, then resends only its exact body and key when absent", async () => {
    const f = await pushFixture();
    const requestId = crypto.randomUUID();
    const start = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: requestId,
    });
    expect(start.error).toBeNull();
    assert(start.data && typeof start.data === "object" && !Array.isArray(start.data));
    const frozen = start.data;
    expect(frozen.mayPost).toBe(true);
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      if (init?.method === "GET") return Response.json({ QueryResponse: {} });
      expect(new URL(String(input)).searchParams.get("requestid")).toBe(frozen.providerRequestId);
      expect(init?.body).toBe(frozen.requestBody);
      return Response.json({ Invoice: { Id: "absent-then-created" } });
    });
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, fetch)))
      .resolves.toMatchObject({ status: "pushed", remoteId: "absent-then-created" });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "POST"]);
  });

  it.each([
    {}, { QueryResponse: [] }, { QueryResponse: { Invoice: {} } }, { QueryResponse: { Invoice: null } },
    { QueryResponse: {}, Fault: {} },
    { QueryResponse: { Invoice: [{ Id: "wrong", DocNumber: "foreign" }] } },
  ])("keeps an uncertain invoice pending when reconciliation is invalid: %j", async (payload) => {
    const f = await pushFixture();
    const requestId = crypto.randomUUID();
    expect((await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: requestId,
    })).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json(payload));
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, fetch)))
      .rejects.toThrow("QuickBooks is unavailable");
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
    expect(sql(`select status from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["pending"]);
  });

  it("refreshes a denied reconciliation read once and never posts when the existing invoice is found", async () => {
    const f = await pushFixture();
    expect((await admin.from("qbo_connections").update({ access_expires_at: "2099-01-01T00:00:00Z" })
      .eq("brewery_id", f.brewery.id)).error).toBeNull();
    const requestId = crypto.randomUUID();
    const start = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: requestId,
    });
    expect(start.error).toBeNull();
    assert(start.data && typeof start.data === "object" && !Array.isArray(start.data));
    assert(typeof start.data.requestBody === "string");
    const body = JSON.parse(start.data.requestBody);
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: "renewed", refresh_token: "rotated", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ QueryResponse: { Invoice: [{ ...body, Id: "found-after-refresh" }] } }));
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, fetch)))
      .resolves.toMatchObject({ status: "pushed", remoteId: "found-after-refresh" });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "POST", "GET"]);
    expect(String(fetch.mock.calls[1][0])).toContain("/tokens/bearer");
    expect(fetch.mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer renewed" });
  });

  it.each(["duplicate", "customer", "date", "missing-id", "unavailable", "lost-response"] as const)(
    "does not replay a pending document when its lookup is %s", async (failure) => {
      const f = await pushFixture();
      const requestId = crypto.randomUUID();
      const start = await f.ctx.db.rpc("start_qbo_push", {
        p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: requestId,
      });
      expect(start.error).toBeNull();
      assert(start.data && typeof start.data === "object" && !Array.isArray(start.data));
      assert(typeof start.data.requestBody === "string");
      const row = { ...JSON.parse(start.data.requestBody), Id: "existing" };
      if (failure === "customer") row.CustomerRef = { value: "someone-else" };
      if (failure === "date") row.TxnDate = "2000-01-01";
      if (failure === "missing-id") delete row.Id;
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
        if (failure === "lost-response") throw new TypeError("lost query response");
        if (failure === "unavailable") return new Response(null, { status: 503 });
        return Response.json({ QueryResponse: { Invoice: failure === "duplicate" ? [row, { ...row, Id: "duplicate" }] : [row] } });
      });
      // A different command request must reconcile the same pending snapshot too.
      await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
        .rejects.toMatchObject(["duplicate", "customer", "date"].includes(failure)
          ? conflictingDocument(`invoice ${f.invoice.invoice_no}`) : { message: "QuickBooks is unavailable" });
      expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
      expect(sql(`select status from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["pending"]);
    },
  );

  it("replays terminal push truth before later connection, invoice, catalog, or mapping state", async () => {
    const finish = async (f: Awaited<ReturnType<typeof pushFixture>>, requestId: string, remoteId: string) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
        Invoice: { Id: remoteId, SyncToken: "0" },
      }), { status: 200 }));
      const result = await pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, fetch));
      expect(fetch).toHaveBeenCalledTimes(1);
      return result;
    };
    const replay = async (f: Awaited<ReturnType<typeof pushFixture>>, requestId: string) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const result = await pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, fetch));
      expect(fetch).not.toHaveBeenCalled();
      return result;
    };

    const disconnected = await pushFixture("invoice", "admin");
    const disconnectedRequest = crypto.randomUUID();
    const disconnectedResult = await finish(disconnected, disconnectedRequest, "completed-before-disconnect");
    await disconnectQbo(disconnected.ctx, disconnected.connectionId, vi.fn().mockResolvedValue(undefined), crypto.randomUUID());

    const replaced = await pushFixture("invoice", "admin");
    const replacedRequest = crypto.randomUUID();
    const replacedResult = await finish(replaced, replacedRequest, "completed-before-replacement");
    expect((await admin.from("qbo_connections").update({
      id: crypto.randomUUID(), realm_id: `replacement-${replaced.realm}`,
    }).eq("brewery_id", replaced.brewery.id)).error).toBeNull();
    expect((await admin.from("channel_prices").update({ unit_price_cents: 999 })
      .eq("brewery_id", replaced.brewery.id)).error).toBeNull();
    expect((await admin.from("skus").update({ qbo_item_id: null, qbo_realm_id: null })
      .eq("id", replaced.catalog.skuId)).error).toBeNull();

    const writtenOff = await pushFixture("invoice", "admin");
    const writtenOffRequest = crypto.randomUUID();
    const writtenOffResult = await finish(writtenOff, writtenOffRequest, "completed-before-write-off");
    expect((await admin.from("invoices").update({ qbo_remote_state: "deleted" })
      .eq("id", writtenOff.invoice.id)).error).toBeNull();
    expect((await writtenOff.ctx.db.rpc("write_off_invoice", {
      p_brewery: writtenOff.brewery.id,
      p_invoice: writtenOff.invoice.id,
      p_reason: "Confirmed deleted after the original push",
      p_request_id: crypto.randomUUID(),
    })).error).toBeNull();

    await expect(replay(disconnected, disconnectedRequest)).resolves.toEqual(disconnectedResult);
    await expect(replay(replaced, replacedRequest)).resolves.toEqual(replacedResult);
    await expect(replay(writtenOff, writtenOffRequest)).resolves.toEqual(writtenOffResult);
    expect(sql(`select count(*) from public.qbo_pushes where invoice_id in (
      '${disconnected.invoice.id}','${replaced.invoice.id}','${writtenOff.invoice.id}')`)).toEqual(["3"]);

    const differentPayloadFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(
      replaced.ctx, replaced.invoice.id, replacedRequest,
      new QboOAuthClient(config, differentPayloadFetch), "corrected",
    )).rejects.toThrow("different payload");
    expect(differentPayloadFetch).not.toHaveBeenCalled();

    const otherActor = await makeStaffCtx(disconnected.brewery.id, "sales");
    const otherActorFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(
      otherActor, disconnected.invoice.id, disconnectedRequest, new QboOAuthClient(config, otherActorFetch),
    )).rejects.toThrow("QuickBooks connection required");
    expect(otherActorFetch).not.toHaveBeenCalled();

    const foreign = await pushFixture("invoice", "admin");
    const foreignFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(
      foreign.ctx, disconnected.invoice.id, disconnectedRequest, new QboOAuthClient(config, foreignFetch),
    )).rejects.toThrow("invoice not found");
    expect(foreignFetch).not.toHaveBeenCalled();
  });

  it("waits for an in-flight finish and replays its committed terminal result without another POST", async () => {
    const f = await pushFixture("invoice", "admin");
    const requestId = crypto.randomUUID();
    const started = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id,
      p_invoice: f.invoice.id,
      p_new_attempt_reason: null,
      p_request_id: requestId,
    });
    expect(started.error).toBeNull();

    const finishClient = new Client({ connectionString: DB });
    const retryClient = new Client({ connectionString: DB });
    await Promise.all([finishClient.connect(), retryClient.connect()]);
    let retrying: Promise<unknown> | undefined;
    try {
      await retryClient.query("set application_name='qbo_terminal_replay_race'");
      const retryPid = (await retryClient.query<{ pid: number }>("select pg_backend_pid() pid")).rows[0].pid;
      await retryClient.query("set role authenticated");
      await retryClient.query("select set_config('request.jwt.claim.sub',$1,false)", [f.ctx.userId]);

      await finishClient.query("begin");
      assert(started.data !== null);
      await finishClient.query(
        "select public.finish_qbo_push($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
        [
          f.brewery.id,
          started.data.pushId,
          f.ctx.userId,
          "pushed",
          "race-remote",
          null,
          JSON.stringify({ Id: "race-remote", SyncToken: "0", TotalAmt: 9.99, Balance: 9.99 }),
          started.data.finishRequestId,
        ],
      );

      const retryDb = new Proxy(f.ctx.db, {
        get(target, property, receiver) {
          if (property === "rpc") {
            return async (_name: string, args: Record<string, unknown>) => {
              try {
                const result = await retryClient.query<{ result: unknown }>(
                  "select public.start_qbo_push($1,$2,$3,$4) result",
                  [args.p_brewery, args.p_invoice, args.p_new_attempt_reason, args.p_request_id],
                );
                return { data: result.rows[0].result, error: null };
              } catch (error) {
                const pg = error as { message: string; code?: string };
                return { data: null, error: { message: pg.message, code: pg.code } };
              }
            };
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const noFetch = vi.fn<typeof globalThis.fetch>();
      retrying = pushInvoiceToQbo(
        { ...f.ctx, db: retryDb },
        f.invoice.id,
        requestId,
        new QboOAuthClient(config, noFetch),
      );

      await expect.poll(async () => (await finishClient.query(
        "select wait_event_type from pg_stat_activity where pid=$1",
        [retryPid],
      )).rows[0]?.wait_event_type, { timeout: 3000 }).toBe("Lock");
      await finishClient.query("commit");


      await expect(retrying).resolves.toEqual({
        pushId: started.data.pushId,
        status: "pushed",
        remoteId: "race-remote",
      });
      expect(noFetch).not.toHaveBeenCalled();
      expect(sql("select status||'|'||qbo_entity_id from qbo_pushes where id='" + started.data.pushId + "'"))
        .toEqual(["pushed|race-remote"]);
    } finally {
      await finishClient.query("rollback").catch(() => undefined);
      if (retrying) await Promise.allSettled([retrying]);
      await Promise.all([finishClient.end(), retryClient.end()]);
    }
  });

  it("recovers an unknown push through a verified same-realm reconnect without changing its identity", async () => {
    const f = await pushFixture("invoice", "admin");
    const beforeDisconnect = await readVersionedIntegrationTokens(f.ctx, "qbo");
    const remote = new Map<string, { Invoice: { Id: string; SyncToken: string } }>();
    let loseFirstResponse = true;
    const pushFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const key = new URL(String(input)).searchParams.get("requestid")!;
      if (new URL(String(input)).pathname.endsWith("/query")) return Response.json({ QueryResponse: {} });
      const entity = remote.get(key) ?? { Invoice: { Id: "reconnected-invoice", SyncToken: "0" } };
      remote.set(key, entity);
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new TypeError("socket closed after provider commit");
      }
      return new Response(JSON.stringify(entity), { status: 200 });
    });
    const pushClient = new QboOAuthClient(config, pushFetch);
    const pushRequestId = crypto.randomUUID();

    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, pushRequestId, pushClient))
      .rejects.toThrow("QuickBooks is unavailable");
    const frozen = sql(`select provider_request_id::text || '|' || request_body from public.qbo_pushes where invoice_id='${f.invoice.id}'`)[0];
    await expect(disconnectQbo(f.ctx, f.connectionId, vi.fn().mockResolvedValue(undefined), crypto.randomUUID()))
      .resolves.toMatchObject({ disconnected: true });

    const unavailableFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, pushRequestId, new QboOAuthClient(config, unavailableFetch)))
      .rejects.toThrow("QuickBooks connection required");
    expect(unavailableFetch).not.toHaveBeenCalled();

    const state = `same-realm-${crypto.randomUUID()}`;
    expect((await f.ctx.db.rpc("begin_qbo_oauth", {
      p_brewery: f.brewery.id, p_redirect_uri: config.redirectUri, p_state_hash: hash(state),
      p_provider_intent: "reconnect", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    const oauthFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "reconnected-access", refresh_token: "reconnected-refresh", expires_in: 3600,
        x_refresh_token_expires_in: 86400,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ CompanyInfo: { Id: "verified-company" } }), { status: 200 }));
    const reconnected = await completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=reconnect-code&state=${state}&realmId=${f.realm}`),
      actorId: f.ctx.userId, selectedBreweryId: f.brewery.id, redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, oauthFetch),
      store: { claim: claimQboOAuth, hold: holdQboOAuthTokens, complete: completeQboOAuthStore, fail: failQboOAuth, realmInUse: qboRealmInUse },
    });
    expect(reconnected).toBe(f.connectionId);
    const current = await readVersionedIntegrationTokens(f.ctx, "qbo");
    expect(current).toMatchObject({ connectionId: f.connectionId, refreshToken: "reconnected-refresh" });
    expect(current.credentialVersion).toBeGreaterThan(beforeDisconnect.credentialVersion);

    const stale = await admin.rpc("cas_integration_tokens", {
      p_brewery: f.brewery.id, p_provider: "qbo", p_connection: beforeDisconnect.connectionId,
      p_actor: f.ctx.userId, p_expected_version: beforeDisconnect.credentialVersion,
      p_access_token: "late-access", p_refresh_token: "late-refresh", p_received_at: new Date().toISOString(),
      p_access_seconds: 3600, p_refresh_seconds: 86400, p_hard_seconds: null,
    });
    expect(stale).toMatchObject({ data: false, error: null });

    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, pushRequestId, pushClient))
      .resolves.toMatchObject({ status: "pushed", remoteId: "reconnected-invoice" });
    expect(pushFetch.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "POST"]);
    expect(String(pushFetch.mock.calls[0][0])).toBe(String(pushFetch.mock.calls[2][0]));
    expect(pushFetch.mock.calls[0][1]?.body).toBe(pushFetch.mock.calls[2][1]?.body);
    expect(`${new URL(String(pushFetch.mock.calls[2][0])).searchParams.get("requestid")}|${pushFetch.mock.calls[2][1]?.body}`).toBe(frozen);
    expect(remote).toHaveLength(1);
    expect(sql(`select count(*) from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["1"]);
  });

  it("refreshes an expired access token before sending the frozen push and stores the rotated credential", async () => {
    const f = await pushFixture("invoice", "admin");
    const before = await readVersionedIntegrationTokens(f.ctx, "qbo");
    expect((await admin.from("qbo_connections").update({ access_expires_at: "2026-01-01T00:00:00Z" })
      .eq("brewery_id", f.brewery.id)).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      if (String(input).includes("/tokens/bearer")) {
        expect(String(init?.body)).toContain("refresh_token=refresh-secret");
        return new Response(JSON.stringify({
          access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 3600,
          x_refresh_token_expires_in: 86400, x_refresh_token_hard_expires_in: 172800,
        }), { status: 200 });
      }
      expect(init?.headers).toMatchObject({ Authorization: "Bearer rotated-access" });
      return new Response(JSON.stringify({ Invoice: { Id: "refreshed-invoice", SyncToken: "0" } }), { status: 200 });
    });

    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .resolves.toMatchObject({ status: "pushed", remoteId: "refreshed-invoice" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toContain("/tokens/bearer");
    const current = await readVersionedIntegrationTokens(f.ctx, "qbo");
    expect(current).toMatchObject({ accessToken: "rotated-access", refreshToken: "rotated-refresh" });
    expect(current.credentialVersion).toBeGreaterThan(before.credentialVersion);
    const expiry = await admin.from("qbo_connections")
      .select("access_expires_at,refresh_expires_at,refresh_hard_expires_at").eq("brewery_id", f.brewery.id).single();
    expect(expiry.error).toBeNull();
    expect(new Date(expiry.data!.refresh_hard_expires_at!).getTime() - new Date(expiry.data!.access_expires_at!).getTime())
      .toBe(47 * 60 * 60 * 1000);
  });

  it("refreshes once after a 401, resends the exact request, and leaves uncertainty pending if refresh fails", async () => {
    const f = await pushFixture("invoice", "admin");
    expect((await admin.from("qbo_connections").update({ access_expires_at: "2099-01-01T00:00:00Z" })
      .eq("brewery_id", f.brewery.id)).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "after-401-access", refresh_token: "after-401-refresh", expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Invoice: { Id: "after-401-invoice" } }), { status: 200 }));
    const client = new QboOAuthClient(config, fetch);

    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, crypto.randomUUID(), client))
      .resolves.toMatchObject({ status: "pushed", remoteId: "after-401-invoice" });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(fetch.mock.calls[0][0])).toBe(String(fetch.mock.calls[2][0]));
    expect(fetch.mock.calls[0][1]?.body).toBe(fetch.mock.calls[2][1]?.body);
    expect(fetch.mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer after-401-access" });

    const uncertain = await pushFixture("invoice", "admin");
    expect((await admin.from("qbo_connections").update({ access_expires_at: "2099-01-01T00:00:00Z" })
      .eq("brewery_id", uncertain.brewery.id)).error).toBeNull();
    const failedRefresh = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("refresh unavailable", { status: 503 }));
    await expect(pushInvoiceToQbo(uncertain.ctx, uncertain.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, failedRefresh)))
      .rejects.toThrow("QuickBooks is unavailable");
    expect(failedRefresh).toHaveBeenCalledTimes(2);
    expect(sql(`select status from public.qbo_pushes where invoice_id='${uncertain.invoice.id}'`)).toEqual(["pending"]);
  });

  it("shares one active attempt under concurrency and freezes it across mapping edits", async () => {
    const f = await pushFixture();
    const [a, b] = await Promise.all([
      f.ctx.db.rpc("start_qbo_push", { p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: crypto.randomUUID() }),
      f.ctx.db.rpc("start_qbo_push", { p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: crypto.randomUUID() }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    assert(b.data !== null);
    expect(a.data).toMatchObject({ pushId: b.data.pushId, providerRequestId: b.data.providerRequestId, requestBody: b.data.requestBody });
    assert(a.data !== null);
    const frozen = a.data.requestBody;
    expect((await f.ctx.db.rpc("set_qbo_item_mapping", {
      p_brewery: f.brewery.id, p_sku: f.catalog.skuId, p_qbo_item_id: "item-edited", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    expect((await admin.from("channel_prices").update({ unit_price_cents: 999 }).eq("brewery_id", f.brewery.id)).error).toBeNull();
    const retry = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: crypto.randomUUID(),
    });
    expect(retry.error).toBeNull();
    assert(retry.data !== null);
    expect(retry.data.requestBody).toBe(frozen);
    expect(retry.data.requestBody).toContain('"value": "item-24"');
    expect(retry.data.requestBody).toContain('"UnitPrice": 3.33');
    expect(sql(`select count(*) from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["1"]);

    expect((await admin.from("qbo_connections").update({ realm_id: `replacement-${f.realm}` }).eq("brewery_id", f.brewery.id)).error).toBeNull();
    const retarget = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: crypto.randomUUID(),
    });
    expect(retarget.error?.code).toBe("MG409");
  });

  it("refuses to resend or finish a pending attempt after a same-realm connection replacement", async () => {
    const f = await pushFixture("invoice", "admin");
    const started = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: crypto.randomUUID(),
    });
    expect(started.error).toBeNull();
    const replacementId = crypto.randomUUID();
    expect((await admin.from("qbo_connections").update({ id: replacementId }).eq("brewery_id", f.brewery.id)).error).toBeNull();
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
      values('${f.brewery.id}','qbo','${replacementId}','replacement-access','replacement-refresh')`);

    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("must not fetch"));
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .rejects.toMatchObject({ status: 409 });
    expect(fetch).not.toHaveBeenCalled();

    assert(started.data !== null);
    assert(started.data.pushId && started.data.finishRequestId);
    const finish = await admin.rpc("finish_qbo_push", {
      p_brewery: f.brewery.id, p_push: started.data.pushId, p_actor: f.ctx.userId,
      p_status: "pushed", p_qbo_entity_id: "late-old-entity", p_error: null,
      p_response: { Id: "late-old-entity" }, p_request_id: started.data.finishRequestId,
    });
    expect(finish.error?.code).toBe("MG409");
    expect(sql(`select status from public.qbo_pushes where id='${started.data.pushId}'`)).toEqual(["pending"]);
  });

  it("preserves the conflict and frozen pending push when the connection changes during reconciliation", async () => {
    const f = await pushFixture("invoice", "admin");
    const requestId = crypto.randomUUID();
    const started = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: requestId,
    });
    expect(started.error).toBeNull();
    assert(started.data && typeof started.data === "object" && !Array.isArray(started.data));
    assert(typeof started.data.requestBody === "string");
    const row = { ...JSON.parse(started.data.requestBody), Id: "old-company-entity" };
    const frozen = sql(`select connection_id::text || '|' || provider_request_id::text || '|' || request_body
      from public.qbo_pushes where invoice_id='${f.invoice.id}'`);
    const { promise: queryStarted, resolve: notifyQuery } = Promise.withResolvers<void>();
    const { promise: queryReleased, resolve: releaseQuery } = Promise.withResolvers<void>();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => {
      expect(init?.method).toBe("GET");
      notifyQuery();
      await queryReleased;
      return Response.json({ QueryResponse: { Invoice: [row] } });
    });
    const retry = pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, fetch));
    try {
      await Promise.race([queryStarted, retry]);
      expect((await admin.from("qbo_connections").update({ id: crypto.randomUUID() })
        .eq("brewery_id", f.brewery.id)).error).toBeNull();
    } finally {
      releaseQuery();
    }
    await expect(retry).rejects.toMatchObject({ status: 409, code: "conflict" });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
    expect(sql(`select status from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["pending"]);
    expect(sql(`select connection_id::text || '|' || provider_request_id::text || '|' || request_body
      from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(frozen);
    expect(sql(`select qbo_invoice_id is null from public.invoices where id='${f.invoice.id}'`)).toEqual(["t"]);
  });

  it("serializes finish with realm replacement so the old remote identity cannot return after purge", async () => {
    const f = await pushFixture("invoice", "admin");
    const started = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: crypto.randomUUID(),
    });
    expect(started.error).toBeNull();
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const delayFunction = `delay_qbo_finish_${suffix}`;
    const delayTrigger = `delay_qbo_finish_${suffix}`;
    const finishClient = new Client({ connectionString: DB });
    const replaceClient = new Client({ connectionString: DB });
    await Promise.all([finishClient.connect(), replaceClient.connect()]);
    const completionOrder: string[] = [];
    try {
      await replaceClient.query(`create function private.${delayFunction}() returns trigger language plpgsql set search_path='' as $$
        begin perform pg_catalog.pg_sleep(0.5); return new; end $$`);
      assert(started.data !== null);
      await replaceClient.query(`create trigger ${delayTrigger} before update on public.qbo_pushes
        for each row when (old.id='${started.data.pushId}'::uuid) execute function private.${delayFunction}()`);
      await finishClient.query("set application_name='qbo_finish_lock_regression'");
      const finishing = finishClient.query(
        "select public.finish_qbo_push($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
        [f.brewery.id, started.data.pushId, f.ctx.userId, "pushed", "old-realm-remote", null,
          JSON.stringify({ Id: "old-realm-remote", SyncToken: "0" }), started.data.finishRequestId],
      ).then(() => { completionOrder.push("finish"); });
      let sleeping = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const activity = await replaceClient.query(
          "select wait_event from pg_catalog.pg_stat_activity where application_name='qbo_finish_lock_regression'",
        );
        if (activity.rows[0]?.wait_event === "PgSleep") { sleeping = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(sleeping).toBe(true);
      const replacementId = crypto.randomUUID();
      const replacementRealm = `replacement-${f.realm}`;
      const replacing = replaceClient.query(
        "update public.qbo_connections set id=$1,realm_id=$2 where brewery_id=$3",
        [replacementId, replacementRealm, f.brewery.id],
      ).then(() => { completionOrder.push("replace"); });
      await Promise.all([finishing, replacing]);

      expect(completionOrder).toEqual(["finish", "replace"]);
      expect(sql(`select id::text || '|' || realm_id from public.qbo_connections where brewery_id='${f.brewery.id}'`))
        .toEqual([`${replacementId}|${replacementRealm}`]);
      expect(sql(`select coalesce(qbo_invoice_id,'NULL') from public.invoices where id='${f.invoice.id}'`)).toEqual(["NULL"]);
    } finally {
      await replaceClient.query(`drop trigger if exists ${delayTrigger} on public.qbo_pushes`);
      await replaceClient.query(`drop function if exists private.${delayFunction}()`);
      await Promise.all([finishClient.end(), replaceClient.end()]);
    }
  });

  it("uses CreditMemo with positive frozen quantities and refuses unsupported or unmapped lines before fetch", async () => {
    const credit = await pushFixture("credit_memo");
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      CreditMemo: { Id: "credit-remote-1", SyncToken: "0", TotalAmt: 9.99, RemainingCredit: 9.99, InvoiceLink: "https://secret", access_token: "secret" },
    }), { status: 200 }));
    await expect(pushInvoiceToQbo(credit.ctx, credit.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .resolves.toMatchObject({ status: "pushed", remoteId: "credit-remote-1" });
    expect(String(fetch.mock.calls[0][0])).toContain("/creditmemo?");
    expect(String(fetch.mock.calls[0][1]?.body)).toContain('"Qty": 3');
    expect(String(fetch.mock.calls[0][1]?.body)).toContain('"Amount": 9.99');
    expect(sql(`select response::text from public.qbo_pushes where invoice_id='${credit.invoice.id}'`)[0]).not.toMatch(/InvoiceLink|access_token|secret/);

    const unmapped = await pushFixture();
    expect((await admin.from("skus").update({ qbo_item_id: "foreign-item", qbo_realm_id: "foreign-realm" }).eq("id", unmapped.catalog.skuId)).error).toBeNull();
    const noFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(unmapped.ctx, unmapped.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, noFetch)))
      .rejects.toThrow("QuickBooks item mapping required");
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("requires a realm-bound deposit item and denies foreign or current-role-invalid callers before fetch", async () => {
    const deposit = await pushFixture("invoice", "admin");
    const pool = await admin.from("keg_pools").insert({ brewery_id: deposit.brewery.id, name: "House", kind: "owned" }).select("id").single();
    expect(pool.error).toBeNull();
    expect((await admin.from("invoice_lines").insert({
      brewery_id: deposit.brewery.id, invoice_id: deposit.invoice.id, kind: "keg_deposit",
      keg_pool_id: pool.data!.id, keg_size: "half_bbl", qty: 1, unit_price_cents: 3000, description: "Keg deposit",
    })).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(deposit.ctx, deposit.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .rejects.toThrow("QuickBooks deposit item mapping required");
    expect(fetch).not.toHaveBeenCalled();

    expect((await deposit.ctx.db.rpc("set_qbo_deposit_mapping", {
      p_brewery: deposit.brewery.id, p_qbo_item_id: "deposit-item", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    const depositFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ Invoice: { Id: "deposit-invoice" } }), { status: 200 }));
    await expect(pushInvoiceToQbo(deposit.ctx, deposit.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, depositFetch)))
      .resolves.toMatchObject({ remoteId: "deposit-invoice" });
    expect(String(depositFetch.mock.calls[0][1]?.body)).toContain('"value": "deposit-item"');
    expect((await admin.from("brewery_users").update({ roles: ["warehouse"] }).eq("brewery_id", deposit.brewery.id).eq("user_id", deposit.ctx.userId)).error).toBeNull();
    await expect(pushInvoiceToQbo(deposit.ctx, deposit.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .rejects.toMatchObject({ status: 403 });
    const foreign = await pushFixture();
    await expect(pushInvoiceToQbo(foreign.ctx, deposit.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .rejects.toThrow(/permission denied|invoice not found/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps a keg-deposit refund to a positive CreditMemo line and refuses missing mapping or invoice placement", async () => {
    const credit = await pushFixture("credit_memo", "admin");
    expect((await admin.from("invoice_lines").delete().eq("invoice_id", credit.invoice.id)).error).toBeNull();
    const pool = await admin.from("keg_pools").insert({ brewery_id: credit.brewery.id, name: "Refund pool", kind: "owned" }).select("id").single();
    expect(pool.error).toBeNull();
    expect((await admin.from("invoice_lines").insert({
      brewery_id: credit.brewery.id, invoice_id: credit.invoice.id, kind: "keg_deposit_refund",
      keg_pool_id: pool.data!.id, keg_size: "half_bbl", qty: -2, unit_price_cents: 3000, description: "Keg deposit refund",
    })).error).toBeNull();
    const noFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(credit.ctx, credit.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, noFetch)))
      .rejects.toThrow("QuickBooks deposit item mapping required");
    expect(noFetch).not.toHaveBeenCalled();

    expect((await credit.ctx.db.rpc("set_qbo_deposit_mapping", {
      p_brewery: credit.brewery.id, p_qbo_item_id: "deposit-refund-item", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ CreditMemo: { Id: "refund-1" } }), { status: 200 }));
    await expect(pushInvoiceToQbo(credit.ctx, credit.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .resolves.toMatchObject({ status: "pushed", remoteId: "refund-1" });
    const body = String(fetch.mock.calls[0][1]?.body);
    expect(String(fetch.mock.calls[0][0])).toContain("/creditmemo?");
    expect(body).toContain('"value": "deposit-refund-item"');
    expect(body).toContain('"Qty": 2');
    expect(body).toContain('"UnitPrice": 30.00');
    expect(body).toContain('"Amount": 60.00');

    const invoice = await pushFixture("invoice", "admin");
    expect((await invoice.ctx.db.rpc("set_qbo_deposit_mapping", {
      p_brewery: invoice.brewery.id, p_qbo_item_id: "deposit-refund-item", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    const invoicePool = await admin.from("keg_pools").insert({ brewery_id: invoice.brewery.id, name: "Invalid refund pool", kind: "owned" }).select("id").single();
    expect(invoicePool.error).toBeNull();
    expect((await admin.from("invoice_lines").insert({
      brewery_id: invoice.brewery.id, invoice_id: invoice.invoice.id, kind: "keg_deposit_refund",
      keg_pool_id: invoicePool.data!.id, keg_size: "half_bbl", qty: -1, unit_price_cents: 3000, description: "Invalid invoice refund",
    })).error).toBeNull();
    const invalidFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(invoice.ctx, invoice.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, invalidFetch)))
      .rejects.toThrow("QuickBooks does not support this invoice line shape");
    expect(invalidFetch).not.toHaveBeenCalled();
  });

  it("allows no direct authenticated push-log DML", async () => {
    const f = await pushFixture();
    const row = {
      brewery_id: f.brewery.id, invoice_id: f.invoice.id, connection_id: f.connectionId, realm_id: f.realm,
      entity_type: "Invoice", provider_request_id: crypto.randomUUID(), request_body: "{}", local_snapshot: {}, attempt_reason: "initial",
    };
    expect((await f.ctx.db.from("qbo_pushes").insert(row)).error?.code).toBe("42501");
    expect((await f.ctx.db.from("qbo_pushes").update({ request_body: "tampered" }).eq("brewery_id", f.brewery.id)).error?.code).toBe("42501");
    expect((await f.ctx.db.from("qbo_pushes").delete().eq("brewery_id", f.brewery.id)).error?.code).toBe("42501");
    expect((await admin.from("qbo_pushes").update({ request_body: "tampered" }).eq("brewery_id", f.brewery.id)).error?.code).toBe("42501");
    expect(sql(`select r.role from pg_proc p cross join (values ('anon'),('authenticated'),('service_role')) r(role)
      where p.oid='public.finish_qbo_push(uuid,uuid,uuid,text,text,text,jsonb,uuid)'::regprocedure
        and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual(["service_role"]);
  });

  it("recovers a provider create whose first local finish is denied with the same remote identity", async () => {
    const f = await pushFixture("invoice", "admin");
    const remote = new Map<string, { Invoice: { Id: string; SyncToken: string } }>();
    let demote = true;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const key = new URL(String(input)).searchParams.get("requestid")!;
      if (new URL(String(input)).pathname.endsWith("/query")) return Response.json({ QueryResponse: {} });
      const entity = remote.get(key) ?? { Invoice: { Id: "finish-recovery-1", SyncToken: "0" } };
      remote.set(key, entity);
      if (demote) {
        demote = false;
        expect((await admin.from("brewery_users").update({ roles: ["warehouse"] })
          .eq("brewery_id", f.brewery.id).eq("user_id", f.ctx.userId)).error).toBeNull();
      }
      return new Response(JSON.stringify(entity), { status: 200 });
    });
    const client = new QboOAuthClient(config, fetch);
    const requestId = crypto.randomUUID();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).rejects.toThrow("QuickBooks push reconciliation failed");
    expect(sql(`select status from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["pending"]);
    expect((await admin.from("brewery_users").update({ roles: ["admin"] })
      .eq("brewery_id", f.brewery.id).eq("user_id", f.ctx.userId)).error).toBeNull();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).resolves.toMatchObject({
      status: "pushed", remoteId: "finish-recovery-1",
    });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "POST"]);
    expect(String(fetch.mock.calls[0][0])).toBe(String(fetch.mock.calls[2][0]));
    expect(remote.size).toBe(1);
  });

  it("only creates a fresh key after a definitive correction or explicit deleted-document recreation", async () => {
    const f = await pushFixture();
    const validationFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ Fault: { Error: [{ Message: "bad mapping" }] } }), { status: 400 }));
    const firstRequest = crypto.randomUUID();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, firstRequest, new QboOAuthClient(config, validationFetch)))
      .rejects.toThrow("QuickBooks rejected the invoice");
    const firstKey = sql(`select provider_request_id::text from public.qbo_pushes where invoice_id='${f.invoice.id}'`)[0];
    const storedFailure = sql(`select error from public.qbo_pushes where invoice_id='${f.invoice.id}'`)[0];
    expect((await admin.from("customers").update({ qbo_customer_id: null, qbo_realm_id: null })
      .eq("id", f.customer.customerId)).error).toBeNull();
    const failedReplayFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, firstRequest, new QboOAuthClient(config, failedReplayFetch)))
      .rejects.toThrow(storedFailure);
    expect(failedReplayFetch).not.toHaveBeenCalled();
    expect(sql(`select count(*) from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["1"]);
    expect((await admin.from("customers").update({ qbo_customer_id: "customer-42", qbo_realm_id: f.realm })
      .eq("id", f.customer.customerId)).error).toBeNull();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, vi.fn())))
      .rejects.toThrow("choose corrected");

    const successFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ Invoice: { Id: "fixed-1", SyncToken: "0" } }), { status: 200 }));
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, successFetch), "corrected"))
      .resolves.toMatchObject({ status: "pushed", remoteId: "fixed-1" });
    const rejectedReplayFetch = vi.fn<typeof globalThis.fetch>();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, firstRequest, new QboOAuthClient(config, rejectedReplayFetch)))
      .rejects.toThrow("QuickBooks rejected the invoice");
    expect(rejectedReplayFetch).not.toHaveBeenCalled();
    const keys = sql(`select provider_request_id::text from public.qbo_pushes where invoice_id='${f.invoice.id}' order by created_at,id`);
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(firstKey);

    expect((await admin.from("invoices").update({ qbo_remote_state: "deleted" }).eq("id", f.invoice.id)).error).toBeNull();
    const recreateFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ Invoice: { Id: "fixed-2", SyncToken: "0" } }), { status: 200 }));
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, crypto.randomUUID(), new QboOAuthClient(config, recreateFetch), "remote_deleted"))
      .resolves.toMatchObject({ status: "pushed", remoteId: "fixed-2" });
    expect(sql(`select count(distinct provider_request_id) from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["3"]);
  });
});

async function receiptBillFixture(options: {
  vendorMapping?: boolean;
  accountMapping?: boolean;
  unitCostCents?: number | null;
  receiveUnitCostCents?: number;
} = {}) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, ["sales", "admin"]);
  const location = await seedLocation(brewery.id);
  const vendor = await runCommand("upsert_vendor", { name: "Receipt Bill supplier" }, ctx) as { id: string };
  const material = await runCommand("upsert_material", {
    name: "Receipt Bill malt", category: "malt", baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 5,
  }, ctx) as { id: string };
  const unitCostCents = options.unitCostCents === undefined ? 333 : options.unitCostCents;
  const po = await runCommand("create_purchase_order", {
    vendorId: vendor.id,
    lines: [{ materialId: material.id, qtyOrdered: 10, ...(unitCostCents === null ? {} : { unitCostCents }) }],
  }, ctx) as { id: string };
  await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, ctx);
  const detail = await runCommand("get_purchase_order", { poId: po.id }, ctx) as { lines: { id: string }[] };
  const lineId = detail.lines[0].id;
  const receipt = await runCommand("receive_purchase_order", {
    poId: po.id, locationId: location.id, binId: location.binId, receivedOn: "2026-09-20",
    lines: [{ poLineId: lineId, qtyCounted: 3, unitCostCents: options.receiveUnitCostCents }],
  }, ctx) as { receipt_id: string };
  const realm = `receipt-realm-${crypto.randomUUID()}`;
  const connection = await admin.from("qbo_connections").insert({
    brewery_id: brewery.id, realm_id: realm, realm_label: "Receipt fixture books", state: "connected",
  }).select("id").single();
  if (connection.error) throw connection.error;
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
    values('${brewery.id}','qbo','${connection.data.id}','receipt-access','receipt-refresh')`);
  if (options.vendorMapping !== false) {
    await runCommand("set_qbo_vendor_mapping", { vendorId: vendor.id, qboVendorId: "vendor-exact-42" }, ctx);
  }
  if (options.accountMapping !== false) {
    await runCommand("set_qbo_purchase_account", { qboAccountId: "purchase-account-24" }, ctx);
  }
  return { brewery, ctx, location, vendor, material, po, lineId, receiptId: receipt.receipt_id, realm };
}

type ReceiptBillBody = {
  VendorRef: { value: string };
  TxnDate: string;
  DocNumber: string;
  PrivateNote: string;
  Line: { Amount: number; DetailType: string; AccountBasedExpenseLineDetail: { AccountRef: { value: string } } }[];
};

function syntheticReceiptBills() {
  const bills = new Map<string, ReceiptBillBody & { Id: string; SyncToken: string }>();
  const posts: { requestId: string; body: string }[] = [];
  const queries: string[] = [];
  const state = { visible: true, loseNextResponse: false };
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "POST" && url.pathname.endsWith("/bill")) {
      const requestId = url.searchParams.get("requestid");
      assert(requestId);
      const body = String(init.body);
      posts.push({ requestId, body });
      // Match Intuit's requestid semantics, but keep every attempted POST visible
      // so reconciliation tests can separately enforce the no-second-POST path.
      const bill = [...bills.values()].find(row => row.PrivateNote === `MGR receipt bill ${requestId}`)
        ?? { ...JSON.parse(body) as ReceiptBillBody, Id: `bill-${posts.length}`, SyncToken: "0" };
      bills.set(bill.Id, bill);
      if (state.loseNextResponse) {
        state.loseNextResponse = false;
        throw new TypeError("socket closed after Bill committed");
      }
      return new Response(JSON.stringify({ Bill: bill }), { status: 200 });
    }
    if (init?.method === "GET" && url.pathname.endsWith("/query")) {
      const query = url.searchParams.get("query")!;
      queries.push(query);
      const found = state.visible ? [...bills.values()].filter(bill => query.includes(`'${bill.DocNumber}'`)) : [];
      return new Response(JSON.stringify({ QueryResponse: { Bill: found } }), { status: 200 });
    }
    throw new Error(`Unexpected synthetic Bill request: ${init?.method} ${url.pathname}`);
  });
  return { fetch, bills, posts, queries, state };
}

function receiptBillAttempts(breweryId: string) {
  return sql(`select jsonb_build_object('receiptId',receipt_id,'providerRequestId',provider_request_id,
    'requestBody',request_body)::text from private.qbo_receipt_bills where brewery_id='${breweryId}' order by created_at,id`)
    .map(row => JSON.parse(row) as { receiptId: string; providerRequestId: string; requestBody: string });
}

describe("QuickBooks receipt Bills", () => {
  it("post_receipt_bill retries with the same request id and never creates a second Bill", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    remote.state.loseNextResponse = true;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      if (init?.method === "POST") {
        const attempts = receiptBillAttempts(f.brewery.id);
        expect(attempts).toEqual([{
          receiptId: f.receiptId,
          providerRequestId: new URL(String(input)).searchParams.get("requestid"),
          requestBody: init.body,
        }]);
      }
      return remote.fetch(input, init);
    });
    const client = new QboOAuthClient(config, fetch);
    const requestId = crypto.randomUUID();
    await expect(postReceiptBill(f.ctx, f.receiptId, requestId, client))
      .rejects.toThrow(/Bill outcome is uncertain.*retry/i);
    const [frozen] = receiptBillAttempts(f.brewery.id);
    const body = JSON.parse(frozen.requestBody) as ReceiptBillBody;
    expect(body.PrivateNote).toBe(`MGR receipt bill ${frozen.providerRequestId}`);
    expect(body.DocNumber).toBe(`MGR-${frozen.providerRequestId.replaceAll("-", "").slice(0, 17)}`);
    expect((await admin.from("receipts").select("qbo_bill_status,qbo_bill_request_id,qbo_bill_id")
      .eq("id", f.receiptId).single()).data).toEqual({
      qbo_bill_status: "pending", qbo_bill_request_id: frozen.providerRequestId, qbo_bill_id: null,
    });

    await expect(postReceiptBill(f.ctx, f.receiptId, requestId, client))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    const noFetch = vi.fn<typeof globalThis.fetch>();
    for (const replayId of [requestId, crypto.randomUUID()]) {
      await expect(postReceiptBill(f.ctx, f.receiptId, replayId, new QboOAuthClient(config, noFetch)))
        .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    }
    expect(noFetch).not.toHaveBeenCalled();
    expect(remote.posts).toEqual([{ requestId: frozen.providerRequestId, body: frozen.requestBody }]);
    expect(remote.queries).toEqual([`select * from Bill where DocNumber = '${body.DocNumber}'`]);
    expect(remote.bills.size).toBe(1);
    expect(receiptBillAttempts(f.brewery.id)).toEqual([frozen]);
    const detail = await runCommand("get_purchase_order", { poId: f.po.id }, f.ctx) as {
      vendor: Record<string, unknown>; receipts: Record<string, unknown>[];
    };
    expect(detail.vendor).toMatchObject({ qbo_vendor_id: "vendor-exact-42", qbo_realm_id: f.realm });
    expect(detail.receipts.find(receipt => receipt.id === f.receiptId)).toMatchObject({
      qbo_bill_status: "pushed", qbo_bill_id: "bill-1", qbo_bill_request_id: frozen.providerRequestId,
      qbo_bill_error: null, qbo_bill_receipt_id: f.receiptId,
    });
  });

  it("replays the exact frozen payload and provider key only after an empty reconciliation query", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    remote.state.loseNextResponse = true;
    const client = new QboOAuthClient(config, remote.fetch);
    const requestId = crypto.randomUUID();
    await expect(postReceiptBill(f.ctx, f.receiptId, requestId, client)).rejects.toThrow(/uncertain/i);
    const [frozen] = receiptBillAttempts(f.brewery.id);
    remote.state.visible = false;
    await runCommand("set_qbo_vendor_mapping", { vendorId: f.vendor.id, qboVendorId: "later-vendor" }, f.ctx);
    await runCommand("set_qbo_purchase_account", { qboAccountId: "later-account" }, f.ctx);
    await expect(postReceiptBill(f.ctx, f.receiptId, requestId, client))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    expect(remote.posts).toEqual([
      { requestId: frozen.providerRequestId, body: frozen.requestBody },
      { requestId: frozen.providerRequestId, body: frozen.requestBody },
    ]);
    expect(remote.fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "POST"]);
    expect(remote.bills.size).toBe(1);
    expect(receiptBillAttempts(f.brewery.id)).toEqual([frozen]);
  });

  it("keeps differently marked or ambiguous Bills pending without POSTing again", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    remote.state.loseNextResponse = true;
    const client = new QboOAuthClient(config, remote.fetch);
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client)).rejects.toMatchObject({ status: 409, code: "conflict" });
    const frozen = receiptBillAttempts(f.brewery.id);
    const bill = remote.bills.get("bill-1")!;
    const originalMarker = bill.PrivateNote;
    bill.PrivateNote = "A different payable happens to have the same document number";
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client)).rejects.toMatchObject({ status: 409, code: "conflict" });
    bill.PrivateNote = originalMarker;
    remote.bills.set("ambiguous-bill", { ...bill, Id: "ambiguous-bill" });
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client)).rejects.toMatchObject({ status: 409, code: "conflict" });
    expect(remote.posts).toHaveLength(1);
    expect(receiptBillAttempts(f.brewery.id)).toEqual(frozen);
    expect((await admin.from("receipts").select("qbo_bill_status,qbo_bill_id").eq("id", f.receiptId).single()).data)
      .toEqual({ qbo_bill_status: "pending", qbo_bill_id: null });
    for (const malformed of [{}, { QueryResponse: [] }, { QueryResponse: { Bill: {} } }]) {
      const malformedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
      await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, malformedFetch)))
        .rejects.toMatchObject({ status: 409, code: "conflict" });
      expect(malformedFetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
      expect(receiptBillAttempts(f.brewery.id)).toEqual(frozen);
    }
    remote.bills.delete("ambiguous-bill");
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    expect(remote.posts).toHaveLength(1);
  });

  it("freezes the vendor, account and receipt costs across mapping edits and a pending receipt correction", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    remote.state.loseNextResponse = true;
    const client = new QboOAuthClient(config, remote.fetch);
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client)).rejects.toThrow(/uncertain/i);
    const [frozen] = receiptBillAttempts(f.brewery.id);
    await runCommand("set_qbo_vendor_mapping", { vendorId: f.vendor.id, qboVendorId: "vendor-edited" }, f.ctx);
    await runCommand("set_qbo_purchase_account", { qboAccountId: "account-edited" }, f.ctx);
    // Later PO/master cost edits must not rewrite the already reserved payable.
    expect((await admin.from("purchase_order_lines").update({ unit_cost_cents: 9999 }).eq("id", f.lineId)).error).toBeNull();
    const corrected = await runCommand("correct_purchase_receipt", {
      receiptId: f.receiptId, reason: "Actually two bags", lines: [{ poLineId: f.lineId, qtyCounted: 2 }],
    }, f.ctx) as { receipt_id: string };
    await expect(postReceiptBill(f.ctx, corrected.receipt_id, crypto.randomUUID(), client))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1", receiptId: f.receiptId });
    expect(receiptBillAttempts(f.brewery.id)).toEqual([frozen]);
    expect(remote.posts).toEqual([{ requestId: frozen.providerRequestId, body: frozen.requestBody }]);
    expect(JSON.parse(frozen.requestBody)).toMatchObject({
      VendorRef: { value: "vendor-exact-42" },
      Line: [{ Amount: 9.99, AccountBasedExpenseLineDetail: { AccountRef: { value: "purchase-account-24" } } }],
    });
    expect(remote.bills.size).toBe(1);
  });

  it("allows exactly one Bill POST while concurrent and repeated requests reconcile the shared attempt", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    let releasePost!: () => void;
    let notifyPost!: () => void;
    const postStarted = new Promise<void>(resolve => { notifyPost = resolve; });
    const postReleased = new Promise<void>(resolve => { releasePost = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      const response = await remote.fetch(input, init);
      if (init?.method === "POST") {
        notifyPost();
        await postReleased;
      }
      return response;
    });
    const client = new QboOAuthClient(config, fetch);
    const requestId = crypto.randomUUID();
    const first = postReceiptBill(f.ctx, f.receiptId, requestId, client);
    try {
      await Promise.race([postStarted, first.then(() => { throw new Error("Bill POST was not held"); })]);
      const concurrent = await Promise.all([requestId, crypto.randomUUID(), crypto.randomUUID()]
        .map(id => postReceiptBill(f.ctx, f.receiptId, id, client)));
      for (const result of concurrent) {
        expect(result).toMatchObject({ status: "pushed", remoteId: "bill-1" });
      }
      expect(remote.posts).toHaveLength(1);
      expect(receiptBillAttempts(f.brewery.id)).toHaveLength(1);
    } finally {
      releasePost();
      await first;
    }
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    expect(remote.posts).toHaveLength(1);
    expect(remote.bills.size).toBe(1);
  });

  it.each([
    { vendorMapping: false, accountMapping: true, message: /map this vendor/i },
    { vendorMapping: true, accountMapping: false, message: /map the purchase account/i },
  ])("requires explicit vendor/account mapping before reserving or sending ($vendorMapping/$accountMapping)", async options => {
    const f = await receiptBillFixture(options);
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .rejects.toThrow(options.message);
    expect(fetch).not.toHaveBeenCalled();
    expect(receiptBillAttempts(f.brewery.id)).toEqual([]);
    expect((await admin.from("receipts").select("qbo_bill_request_id,qbo_bill_status").eq("id", f.receiptId).single()).data)
      .toEqual({ qbo_bill_request_id: null, qbo_bill_status: null });
  });

  it("blocks a missing movement cost rather than using a later PO price or sending a zero-dollar line", async () => {
    const f = await receiptBillFixture({ unitCostCents: null });
    expect((await admin.from("purchase_order_lines").update({ unit_cost_cents: 333 }).eq("id", f.lineId)).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, fetch)))
      .rejects.toThrow(/no recorded unit cost/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(receiptBillAttempts(f.brewery.id)).toEqual([]);
  });

  it("prices the counted base movement, preserving fractional per-base cents and ignoring later PO costs", async () => {
    const f = await receiptBillFixture();
    const movement = await admin.from("receipt_lines").select("movement_id").eq("receipt_id", f.receiptId).single();
    expect(movement.error).toBeNull();
    const cost = await admin.from("material_movements").select("qty,unit_cost_cents").eq("id", movement.data!.movement_id!).single();
    expect(cost.error).toBeNull();
    expect(cost.data).toEqual({ qty: 15, unit_cost_cents: 66.6 });
    expect((await admin.from("purchase_order_lines").update({ unit_cost_cents: 9999 }).eq("id", f.lineId)).error).toBeNull();
    const remote = syntheticReceiptBills();
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, remote.fetch)))
      .resolves.toMatchObject({ status: "pushed" });
    const body = JSON.parse(remote.posts[0].body) as ReceiptBillBody;
    expect(body).toMatchObject({ VendorRef: { value: "vendor-exact-42" }, TxnDate: "2026-09-20" });
    expect(body.Line).toEqual([expect.objectContaining({
      DetailType: "AccountBasedExpenseLineDetail", Amount: 9.99,
      AccountBasedExpenseLineDetail: { AccountRef: { value: "purchase-account-24" } },
    })]);
  });

  it("keeps all posted receipt corrections attached to the original Bill and never sends another", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    const client = new QboOAuthClient(config, remote.fetch);
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    const frozen = receiptBillAttempts(f.brewery.id);
    const firstCorrection = await runCommand("correct_purchase_receipt", {
      receiptId: f.receiptId, reason: "Two bags not three", lines: [{ poLineId: f.lineId, qtyCounted: 2 }],
    }, f.ctx) as { receipt_id: string };
    const secondCorrection = await runCommand("correct_purchase_receipt", {
      receiptId: firstCorrection.receipt_id, reason: "One bag after final recount", lines: [{ poLineId: f.lineId, qtyCounted: 1 }],
    }, f.ctx) as { receipt_id: string };
    const noFetch = vi.fn<typeof globalThis.fetch>();
    for (const receiptId of [f.receiptId, firstCorrection.receipt_id, secondCorrection.receipt_id]) {
      await expect(postReceiptBill(f.ctx, receiptId, crypto.randomUUID(), new QboOAuthClient(config, noFetch)))
        .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1", receiptId: f.receiptId });
    }
    expect(noFetch).not.toHaveBeenCalled();
    expect(receiptBillAttempts(f.brewery.id)).toEqual(frozen);
    expect(remote.posts).toHaveLength(1);
    const detail = await runCommand("get_purchase_order", { poId: f.po.id }, f.ctx) as { receipts: Record<string, unknown>[] };
    for (const receipt of detail.receipts) {
      expect(receipt).toMatchObject({
        qbo_bill_status: "pushed", qbo_bill_id: "bill-1", qbo_bill_receipt_id: f.receiptId,
        qbo_bill_request_id: frozen[0].providerRequestId,
      });
    }
    // OAuth changes both the realm and current connection ID. History must not
    // keep a foreign key to that mutable identity or connecting another company fails.
    expect((await admin.from("qbo_connections").update({ id: crypto.randomUUID(), realm_id: `replacement-${f.realm}` })
      .eq("brewery_id", f.brewery.id)).error).toBeNull();
    await expect(postReceiptBill(f.ctx, secondCorrection.receipt_id, crypto.randomUUID(), new QboOAuthClient(config, noFetch)))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("creates separate Bills for separate receipts on the same PO, not one Bill per purchase order", async () => {
    const f = await receiptBillFixture();
    const second = await runCommand("receive_purchase_order", {
      poId: f.po.id, locationId: f.location.id, binId: f.location.binId, receivedOn: "2026-09-21",
      lines: [{ poLineId: f.lineId, qtyCounted: 2 }],
    }, f.ctx) as { receipt_id: string };
    const remote = syntheticReceiptBills();
    const client = new QboOAuthClient(config, remote.fetch);
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client))
      .resolves.toMatchObject({ remoteId: "bill-1" });
    await expect(postReceiptBill(f.ctx, second.receipt_id, crypto.randomUUID(), client))
      .resolves.toMatchObject({ remoteId: "bill-2" });
    expect(receiptBillAttempts(f.brewery.id)).toHaveLength(2);
    expect(new Set(remote.posts.map(post => post.requestId)).size).toBe(2);
    expect(remote.posts.map(post => (JSON.parse(post.body) as ReceiptBillBody).Line[0].Amount)).toEqual([9.99, 6.66]);
    expect(remote.bills.size).toBe(2);
  });

  it("denies non-admins, forged admin contexts and foreign tenant receipts before provider access", async () => {
    const f = await receiptBillFixture();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new QboOAuthClient(config, fetch);
    for (const roles of [["sales"], ["warehouse"], ["brewer"], ["taproom"], ["sales", "warehouse"]] as const) {
      const denied = await makeStaffCtx(f.brewery.id, [...roles]);
      await expect(postReceiptBill(denied, f.receiptId, crypto.randomUUID(), client)).rejects.toThrow(/permission/i);
      await expect(postReceiptBill({ ...denied, roles: ["admin"] }, f.receiptId, crypto.randomUUID(), client))
        .rejects.toThrow(/permission/i);
    }
    const foreign = await receiptBillFixture();
    await expect(postReceiptBill(foreign.ctx, f.receiptId, crypto.randomUUID(), client)).rejects.toThrow(/receipt not found/i);
    await expect(postReceiptBill({ ...foreign.ctx, breweryId: f.brewery.id }, f.receiptId, crypto.randomUUID(), client))
      .rejects.toThrow(/permission|member/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(receiptBillAttempts(f.brewery.id)).toEqual([]);
    expect(receiptBillAttempts(foreign.brewery.id)).toEqual([]);
  });

  it("keeps the central explicit-actor role check private and false for absent membership or allowed roles", async () => {
    const f = await receiptBillFixture();
    const foreign = await makeBrewery();
    const results = sql(`select jsonb_build_array(
      private.actor_has_staff_roles('${f.brewery.id}','${f.ctx.userId}',array['admin']::public.staff_role[]),
      private.actor_has_staff_roles('${f.brewery.id}',null,array['admin']::public.staff_role[]),
      private.actor_has_staff_roles('${foreign.id}','${f.ctx.userId}',array['admin']::public.staff_role[]),
      private.actor_has_staff_roles('${f.brewery.id}','${crypto.randomUUID()}',array['admin']::public.staff_role[]),
      private.actor_has_staff_roles('${f.brewery.id}','${f.ctx.userId}',array[]::public.staff_role[]),
      private.actor_has_staff_roles('${f.brewery.id}','${f.ctx.userId}',null))::text`);
    expect(JSON.parse(results[0])).toEqual([true, false, false, false, false, false]);
    expect(sql(`select r.role from (values ('anon'),('authenticated'),('service_role')) r(role)
      where has_function_privilege(r.role,'private.actor_has_staff_roles(uuid,uuid,public.staff_role[])','execute')`)).toEqual([]);
  });

  it("rechecks the current actor role at completion and recovers the same Bill after permission returns", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      const response = await remote.fetch(input, init);
      if (init?.method === "POST") {
        expect((await admin.from("brewery_users").update({ roles: ["warehouse"] })
          .eq("brewery_id", f.brewery.id).eq("user_id", f.ctx.userId)).error).toBeNull();
      }
      return response;
    });
    const client = new QboOAuthClient(config, fetch);
    const requestId = crypto.randomUUID();
    await expect(postReceiptBill(f.ctx, f.receiptId, requestId, client)).rejects.toThrow(/reconciliation failed/i);
    expect((await admin.from("receipts").select("qbo_bill_status,qbo_bill_id").eq("id", f.receiptId).single()).data)
      .toEqual({ qbo_bill_status: "pending", qbo_bill_id: null });
    expect((await admin.from("brewery_users").update({ roles: ["warehouse", "admin"] })
      .eq("brewery_id", f.brewery.id).eq("user_id", f.ctx.userId)).error).toBeNull();
    await expect(postReceiptBill(f.ctx, f.receiptId, requestId, client)).resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    expect(remote.posts).toHaveLength(1);
    expect(remote.bills.size).toBe(1);
  });

  it("only permits an explicitly corrected fresh attempt after a definite rejection and preserves the rejected snapshot", async () => {
    const f = await receiptBillFixture();
    const rejectedFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => {
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify({ Fault: { Error: [{ Message: "Account is inactive" }] } }), { status: 400 });
    });
    const rejectedRequest = crypto.randomUUID();
    await expect(postReceiptBill(f.ctx, f.receiptId, rejectedRequest, new QboOAuthClient(config, rejectedFetch)))
      .rejects.toThrow(/QuickBooks rejected/i);
    const [rejected] = receiptBillAttempts(f.brewery.id);
    expect((await admin.from("receipts").select("qbo_bill_status,qbo_bill_id,qbo_bill_error").eq("id", f.receiptId).single()).data)
      .toMatchObject({ qbo_bill_status: "push_failed", qbo_bill_id: null, qbo_bill_error: expect.stringMatching(/rejected/i) });
    await runCommand("set_qbo_vendor_mapping", { vendorId: f.vendor.id, qboVendorId: "corrected-vendor" }, f.ctx);
    await runCommand("set_qbo_purchase_account", { qboAccountId: "corrected-account" }, f.ctx);
    const noFetch = vi.fn<typeof globalThis.fetch>();
    for (const requestId of [rejectedRequest, crypto.randomUUID()]) {
      await expect(postReceiptBill(f.ctx, f.receiptId, requestId, new QboOAuthClient(config, noFetch)))
        .rejects.toThrow(/rejected/i);
    }
    expect(noFetch).not.toHaveBeenCalled();
    const remote = syntheticReceiptBills();
    const correctedRequest = crypto.randomUUID();
    const client = new QboOAuthClient(config, remote.fetch);
    await expect(postReceiptBill(f.ctx, f.receiptId, correctedRequest, client, "corrected"))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    const attempts = receiptBillAttempts(f.brewery.id);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(rejected);
    expect(attempts[1].providerRequestId).not.toBe(rejected.providerRequestId);
    expect(JSON.parse(attempts[1].requestBody)).toMatchObject({
      VendorRef: { value: "corrected-vendor" },
      Line: [{ Amount: 9.99, AccountBasedExpenseLineDetail: { AccountRef: { value: "corrected-account" } } }],
    });
    await expect(postReceiptBill(f.ctx, f.receiptId, correctedRequest, client, "corrected"))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    await expect(postReceiptBill(f.ctx, f.receiptId, rejectedRequest, new QboOAuthClient(config, noFetch)))
      .rejects.toThrow(/rejected/i);
    expect(noFetch).not.toHaveBeenCalled();
    expect(remote.posts).toHaveLength(1);
    expect(rejectedFetch).toHaveBeenCalledTimes(1);
    expect(sql(`select status from private.qbo_receipt_bills where brewery_id='${f.brewery.id}' order by created_at,id`))
      .toEqual(["push_failed", "pushed"]);
  });

  it("allows a corrected attempt in a reconnected company after a definite rejection", async () => {
    const f = await receiptBillFixture();
    const rejectedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ Fault: { Error: [{ Message: "Vendor is inactive" }] } }), { status: 400 }));
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, rejectedFetch)))
      .rejects.toThrow(/QuickBooks rejected/i);
    const newConnectionId = crypto.randomUUID();
    expect((await admin.from("qbo_connections").update({ id: newConnectionId, realm_id: `replacement-${f.realm}` })
      .eq("brewery_id", f.brewery.id)).error).toBeNull();
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
      values('${f.brewery.id}','qbo','${newConnectionId}','new-access','new-refresh')
      on conflict (brewery_id,provider) do update set connection_id=excluded.connection_id`);
    await runCommand("set_qbo_vendor_mapping", { vendorId: f.vendor.id, qboVendorId: "new-company-vendor" }, f.ctx);
    await runCommand("set_qbo_purchase_account", { qboAccountId: "new-company-account" }, f.ctx);
    const remote = syntheticReceiptBills();
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, remote.fetch), "corrected"))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    expect(JSON.parse(remote.posts[0].body)).toMatchObject({ VendorRef: { value: "new-company-vendor" } });
    expect(sql(`select realm_id || '|' || status from private.qbo_receipt_bills where brewery_id='${f.brewery.id}' order by created_at,id`))
      .toEqual([`${f.realm}|push_failed`, `replacement-${f.realm}|pushed`]);
  });

  it("refuses a corrected attempt while the original provider outcome is unknown", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    remote.state.loseNextResponse = true;
    const client = new QboOAuthClient(config, remote.fetch);
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client)).rejects.toThrow(/uncertain/i);
    const frozen = receiptBillAttempts(f.brewery.id);
    await runCommand("set_qbo_purchase_account", { qboAccountId: "changed-during-uncertainty" }, f.ctx);
    const noFetch = vi.fn<typeof globalThis.fetch>();
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, noFetch), "corrected"))
      .rejects.toThrow(/definitive|pending/i);
    expect(noFetch).not.toHaveBeenCalled();
    expect(receiptBillAttempts(f.brewery.id)).toEqual(frozen);
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), client))
      .resolves.toMatchObject({ status: "pushed", remoteId: "bill-1" });
    expect(remote.posts).toHaveLength(1);
  });

  it("records an invoice price on a sent unpriced PO while receiving and freezes that price for the Bill", async () => {
    const f = await receiptBillFixture({ unitCostCents: null, receiveUnitCostCents: 1251 });
    const { data, error } = await admin.from("receipt_lines").select("purchase_unit_cost_cents, material_movements(unit_cost_cents)").eq("receipt_id", f.receiptId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ purchase_unit_cost_cents: 1251, material_movements: { unit_cost_cents: 250.2 } });
    const remote = syntheticReceiptBills();
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, remote.fetch)))
      .resolves.toMatchObject({ status: "pushed" });
    expect((JSON.parse(remote.posts[0].body) as ReceiptBillBody).Line[0].Amount).toBe(37.53);
    expect((await admin.from("purchase_order_lines").select("unit_cost_cents").eq("id", f.lineId).single()).data?.unit_cost_cents).toBeNull();
  });

  it.each([{ original: null, corrected: 1251 }, { original: 333, corrected: 0 }])("corrects receipt price $original to $corrected without rewriting the original or duplicating stock", async ({ original, corrected: cost }) => {
    const f = await receiptBillFixture({ unitCostCents: original });
    const requestId = crypto.randomUUID();
    const input = { receiptId: f.receiptId, reason: "Vendor invoice price arrived", lines: [{ poLineId: f.lineId, qtyCounted: 3, unitCostCents: cost }] };
    const execution = { requestId, correlationId: requestId };
    const corrected = await runCommand("correct_purchase_receipt", input, f.ctx, execution) as { receipt_id: string };
    expect(await runCommand("correct_purchase_receipt", input, f.ctx, execution)).toEqual(corrected);
    await expect(runCommand("correct_purchase_receipt", { ...input, lines: [{ ...input.lines[0], unitCostCents: cost + 1 }] }, f.ctx, execution)).rejects.toThrow(/request|different|conflict/i);
    expect((await admin.from("receipt_lines").select("purchase_unit_cost_cents").eq("receipt_id", f.receiptId).single()).data?.purchase_unit_cost_cents).toBe(original);
    const detail = await runCommand("get_purchase_order", { poId: f.po.id, correctionReceiptId: corrected.receipt_id }, f.ctx) as { correction_lines: { unit_cost_cents: number }[] };
    expect(detail.correction_lines[0].unit_cost_cents).toBe(cost);
    expect(sql(`select sum(qty) from public.material_movements where material_id='${f.material.id}'`)).toEqual(["15.0000"]);
    const remote = syntheticReceiptBills();
    await expect(postReceiptBill(f.ctx, corrected.receipt_id, crypto.randomUUID(), new QboOAuthClient(config, remote.fetch)))
      .resolves.toMatchObject({ status: "pushed" });
    expect((JSON.parse(remote.posts[0].body) as ReceiptBillBody).Line[0].Amount).toBe(cost * 3 / 100);
  });

  it("uses the single purchase account for every counted material and skips uncounted uncosted lines", async () => {
    const f = await receiptBillFixture();
    const free = await runCommand("upsert_material", {
      name: "Complimentary samples", category: "malt", baseUom: "lb", purchaseUom: "lb",
    }, f.ctx) as { id: string };
    const absent = await runCommand("upsert_material", {
      name: "Not delivered", category: "malt", baseUom: "lb", purchaseUom: "lb",
    }, f.ctx) as { id: string };
    const po = await runCommand("create_purchase_order", {
      vendorId: f.vendor.id, lines: [
        { materialId: f.material.id, qtyOrdered: 4, unitCostCents: 125 },
        { materialId: free.id, qtyOrdered: 2, unitCostCents: 0 },
        { materialId: absent.id, qtyOrdered: 1 },
      ],
    }, f.ctx) as { id: string };
    await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, f.ctx);
    const detail = await runCommand("get_purchase_order", { poId: po.id }, f.ctx) as { lines: { id: string; material_id: string }[] };
    const receipt = await runCommand("receive_purchase_order", {
      poId: po.id, locationId: f.location.id, binId: f.location.binId,
      lines: detail.lines.map(line => ({ poLineId: line.id, qtyCounted: line.material_id === absent.id ? 0 : line.material_id === free.id ? 2 : 3 })),
    }, f.ctx) as { receipt_id: string };
    const remote = syntheticReceiptBills();
    await expect(postReceiptBill(f.ctx, receipt.receipt_id, crypto.randomUUID(), new QboOAuthClient(config, remote.fetch)))
      .resolves.toMatchObject({ status: "pushed" });
    const body = JSON.parse(remote.posts[0].body) as ReceiptBillBody;
    expect(body.Line.map(line => line.Amount).sort((a, b) => a - b)).toEqual([0, 3.75]);
    for (const line of body.Line) {
      expect(line.AccountBasedExpenseLineDetail.AccountRef.value).toBe("purchase-account-24");
    }
    expect(remote.posts).toHaveLength(1);
  });

  it("clears realm-scoped vendor and account mappings before an unposted receipt can target another company", async () => {
    const f = await receiptBillFixture();
    expect(await runCommand("get_qbo_connection", {}, f.ctx)).toMatchObject({ purchaseAccountId: "purchase-account-24" });
    expect(await runCommand("list_vendors", {}, f.ctx)).toEqual([
      expect.objectContaining({ id: f.vendor.id, qbo_vendor_id: "vendor-exact-42" }),
    ]);
    expect((await admin.from("qbo_connections").update({ realm_id: `replacement-${f.realm}` })
      .eq("brewery_id", f.brewery.id)).error).toBeNull();
    expect(await runCommand("get_qbo_connection", {}, f.ctx)).toMatchObject({ purchaseAccountId: null });
    expect(await runCommand("list_vendors", {}, f.ctx)).toEqual([
      expect.objectContaining({ id: f.vendor.id, qbo_vendor_id: null }),
    ]);
    const noFetch = vi.fn<typeof globalThis.fetch>();
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, noFetch)))
      .rejects.toThrow(/map this vendor/i);
    expect(noFetch).not.toHaveBeenCalled();
    expect(receiptBillAttempts(f.brewery.id)).toEqual([]);
  });

  it("never retargets a frozen pending Bill to replacement company mappings", async () => {
    const f = await receiptBillFixture();
    const remote = syntheticReceiptBills();
    remote.state.loseNextResponse = true;
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, remote.fetch)))
      .rejects.toThrow(/uncertain/i);
    const frozen = receiptBillAttempts(f.brewery.id);
    expect((await admin.from("qbo_connections").update({ id: crypto.randomUUID(), realm_id: `replacement-${f.realm}` })
      .eq("brewery_id", f.brewery.id)).error).toBeNull();
    await runCommand("set_qbo_vendor_mapping", { vendorId: f.vendor.id, qboVendorId: "new-company-vendor" }, f.ctx);
    await runCommand("set_qbo_purchase_account", { qboAccountId: "new-company-account" }, f.ctx);
    const noFetch = vi.fn<typeof globalThis.fetch>();
    await expect(postReceiptBill(f.ctx, f.receiptId, crypto.randomUUID(), new QboOAuthClient(config, noFetch)))
      .rejects.toThrow(/original company|connection changed/i);
    expect(noFetch).not.toHaveBeenCalled();
    expect(receiptBillAttempts(f.brewery.id)).toEqual(frozen);
    expect(remote.posts).toHaveLength(1);
  });
});

describe("QuickBooks pending transaction lookup deadlines", () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  let origin: string;
  let stallBody = false;
  const server = createServer((_request, response) => {
    if (stallBody) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"QueryResponse":');
    }
    // Otherwise leave headers pending to exercise native fetch cancellation.
  });

  beforeAll(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    server.listen(0, "127.0.0.1", resolve);
    await promise;
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server has no TCP address");
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    server.closeAllConnections();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    server.close(error => error ? reject(error) : resolve());
    await promise;
  });

  it.each([
    ["Invoice", "headers"], ["Invoice", "body"], ["CreditMemo", "headers"], ["CreditMemo", "body"],
  ] as const)("aborts a %s reconciliation lookup with stalled %s", async (entityType, stalled) => {
    stallBody = stalled === "body";
    // Exercise the real native fetch abort without waiting the production 20 seconds.
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(50));
    const client = new QboOAuthClient({ ...config, apiBaseUrl: origin });
    const body = JSON.stringify({ DocNumber: "42", CustomerRef: { value: "customer-42" }, TxnDate: "2026-10-30" });
    await expect(client.findInvoice("realm", entityType, body, "access")).rejects.toMatchObject({
      name: stalled === "body" ? expect.stringMatching(/^(Abort|Timeout)Error$/) : "TimeoutError",
    });
  });
});
