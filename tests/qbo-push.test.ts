import { createHash } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { completeQboOAuth, pushInvoiceToQbo, QboOAuthClient } from "@/lib/qbo";
import {
  claimQboOAuth,
  completeQboOAuthStore,
  disconnectQbo,
  failQboOAuth,
  readVersionedIntegrationTokens,
} from "@/lib/supabase/integration-tokens";
import { admin, DB, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, sql } from "./helpers";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

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
    issued_on: "2026-09-09", due_on: kind === "invoice" ? "2026-10-09" : null,
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
  it("persists the exact authoritative body and provider key before fetch, then replays both after a lost response", async () => {
    const f = await pushFixture();
    const remote = new Map<string, { Invoice: { Id: string; SyncToken: string; TotalAmt: number; Balance: number } }>();
    let loseFirstResponse = true;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const key = url.searchParams.get("requestid")!;
      const body = String(init?.body);
      const persisted = sql(`select provider_request_id::text || '|' || request_body from public.qbo_pushes where invoice_id='${f.invoice.id}'`)[0];
      expect(persisted).toBe(`${key}|${body}`);
      expect(body).toContain('"Amount": 9.99');
      expect(body).toContain('"UnitPrice": 3.33');
      expect(body).toContain('"Qty": 3');
      expect(body).toContain('"BillEmail"');
      expect(body).toContain('"AllowOnlineACHPayment": true');
      expect(body).toContain('"AllowOnlineCreditCardPayment": true');
      expect(body).toContain(f.buyer.email);
      const entity = remote.get(key) ?? { Invoice: { Id: "invoice-remote-1", SyncToken: "0", TotalAmt: 9.99, Balance: 9.99 } };
      remote.set(key, entity);
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new TypeError("socket closed after provider commit");
      }
      return new Response(JSON.stringify(entity), { status: 200 });
    });
    const client = new QboOAuthClient(config, fetch);
    const requestId = crypto.randomUUID();

    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).rejects.toThrow("QuickBooks is unavailable");
    expect(sql(`select status from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["pending"]);
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).resolves.toMatchObject({
      status: "pushed", remoteId: "invoice-remote-1",
    });
    const completedReplayFetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("completed push must not POST"));
    await expect(pushInvoiceToQbo(
      f.ctx, f.invoice.id, requestId, new QboOAuthClient(config, completedReplayFetch),
    )).resolves.toMatchObject({
      status: "pushed", remoteId: "invoice-remote-1",
    });

    expect(completedReplayFetch).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toBe(String(fetch.mock.calls[1][0]));
    expect(fetch.mock.calls[0][1]?.body).toBe(fetch.mock.calls[1][1]?.body);
    expect(remote).toHaveLength(1);
    expect(sql(`select status || ':' || qbo_entity_id from public.qbo_pushes where invoice_id='${f.invoice.id}'`))
      .toEqual(["pushed:invoice-remote-1"]);
  });

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

  it("recovers an unknown push through a verified same-realm reconnect without changing its identity", async () => {
    const f = await pushFixture("invoice", "admin");
    const beforeDisconnect = await readVersionedIntegrationTokens(f.ctx, "qbo");
    const remote = new Map<string, { Invoice: { Id: string; SyncToken: string } }>();
    let loseFirstResponse = true;
    const pushFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const key = new URL(String(input)).searchParams.get("requestid")!;
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
      store: { claim: claimQboOAuth, complete: completeQboOAuthStore, fail: failQboOAuth },
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
    expect(pushFetch).toHaveBeenCalledTimes(2);
    expect(String(pushFetch.mock.calls[0][0])).toBe(String(pushFetch.mock.calls[1][0]));
    expect(pushFetch.mock.calls[0][1]?.body).toBe(pushFetch.mock.calls[1][1]?.body);
    expect(`${new URL(String(pushFetch.mock.calls[1][0])).searchParams.get("requestid")}|${pushFetch.mock.calls[1][1]?.body}`).toBe(frozen);
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
    expect(a.data).toMatchObject({ pushId: b.data.pushId, providerRequestId: b.data.providerRequestId, requestBody: b.data.requestBody });
    const frozen = a.data.requestBody;
    expect((await f.ctx.db.rpc("set_qbo_item_mapping", {
      p_brewery: f.brewery.id, p_sku: f.catalog.skuId, p_qbo_item_id: "item-edited", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    expect((await admin.from("channel_prices").update({ unit_price_cents: 999 }).eq("brewery_id", f.brewery.id)).error).toBeNull();
    const retry = await f.ctx.db.rpc("start_qbo_push", {
      p_brewery: f.brewery.id, p_invoice: f.invoice.id, p_new_attempt_reason: null, p_request_id: crypto.randomUUID(),
    });
    expect(retry.error).toBeNull();
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

    const finish = await admin.rpc("finish_qbo_push", {
      p_brewery: f.brewery.id, p_push: started.data.pushId, p_actor: f.ctx.userId,
      p_status: "pushed", p_qbo_entity_id: "late-old-entity", p_error: null,
      p_response: { Id: "late-old-entity" }, p_request_id: started.data.finishRequestId,
    });
    expect(finish.error?.code).toBe("MG409");
    expect(sql(`select status from public.qbo_pushes where id='${started.data.pushId}'`)).toEqual(["pending"]);
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
      CreditMemo: { Id: "credit-remote-1", SyncToken: "0", TotalAmt: 9.99, Balance: 9.99, InvoiceLink: "https://secret", access_token: "secret" },
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
    expect((await admin.from("brewery_users").update({ role: "warehouse" }).eq("brewery_id", deposit.brewery.id).eq("user_id", deposit.ctx.userId)).error).toBeNull();
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
      const entity = remote.get(key) ?? { Invoice: { Id: "finish-recovery-1", SyncToken: "0" } };
      remote.set(key, entity);
      if (demote) {
        demote = false;
        expect((await admin.from("brewery_users").update({ role: "warehouse" })
          .eq("brewery_id", f.brewery.id).eq("user_id", f.ctx.userId)).error).toBeNull();
      }
      return new Response(JSON.stringify(entity), { status: 200 });
    });
    const client = new QboOAuthClient(config, fetch);
    const requestId = crypto.randomUUID();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).rejects.toThrow("QuickBooks push reconciliation failed");
    expect(sql(`select status from public.qbo_pushes where invoice_id='${f.invoice.id}'`)).toEqual(["pending"]);
    expect((await admin.from("brewery_users").update({ role: "admin" })
      .eq("brewery_id", f.brewery.id).eq("user_id", f.ctx.userId)).error).toBeNull();
    await expect(pushInvoiceToQbo(f.ctx, f.invoice.id, requestId, client)).resolves.toMatchObject({
      status: "pushed", remoteId: "finish-recovery-1",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toBe(String(fetch.mock.calls[1][0]));
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
