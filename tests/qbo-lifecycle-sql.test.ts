// Real isolated-Postgres proof for QBO state, realm replacement and credential races.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, sql } from "./helpers";
import { completeQboOAuth, QboOAuthClient } from "@/lib/qbo";
import {
  claimQboOAuth,
  completeQboOAuthStore,
  disconnectQbo,
  failQboOAuth,
  getQboHealth,
  readVersionedIntegrationTokens,
} from "@/lib/supabase/integration-tokens";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe("QuickBooks durable lifecycle", () => {
  it("rejects wrong-actor, expired, and replayed callbacks before the mocked token fetch", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const otherAdmin = await makeStaffCtx(brewery.id, "admin");
    const redirectUri = "https://mgr.test/api/integrations/qbo/oauth";
    const realmId = `realm-${crypto.randomUUID()}`;
    const config = { clientId: "client-id", clientSecret: "client-secret", redirectUri };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      x_refresh_token_expires_in: 8640000,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const store = { claim: claimQboOAuth, complete: completeQboOAuthStore, fail: failQboOAuth };
    const begin = (state: string) => ctx.db.rpc("begin_qbo_oauth", {
      p_brewery: brewery.id, p_redirect_uri: redirectUri, p_state_hash: hash(state),
      p_provider_intent: "connect", p_request_id: crypto.randomUUID(),
    });
    const callback = (state: string, actorId = ctx.userId) => completeQboOAuth({
      request: new Request(`${redirectUri}?code=one-time-code&state=${state}&realmId=${realmId}`),
      actorId, selectedBreweryId: brewery.id, redirectUri,
      client: new QboOAuthClient(config, fetch), store,
    });

    const wrongActorState = `wrong-${crypto.randomUUID()}`;
    expect((await begin(wrongActorState)).error).toBeNull();
    await expect(callback(wrongActorState, otherAdmin.userId)).rejects.toThrow("oauth state invalid");

    const expiredState = `expired-${crypto.randomUUID()}`;
    expect((await begin(expiredState)).error).toBeNull();
    sql(`update private.qbo_oauth_intents set expires_at=now()-interval '1 second' where state_hash='${hash(expiredState)}'`);
    await expect(callback(expiredState)).rejects.toThrow("oauth state invalid");
    expect(fetch).not.toHaveBeenCalled();

    const demotedState = `demoted-${crypto.randomUUID()}`;
    expect((await begin(demotedState)).error).toBeNull();
    expect((await admin.from("brewery_users").update({ role: "brewer" })
      .eq("brewery_id", brewery.id).eq("user_id", ctx.userId)).error).toBeNull();
    await expect(callback(demotedState)).rejects.toThrow("oauth state invalid");
    expect(fetch).not.toHaveBeenCalled();
    expect((await admin.from("brewery_users").update({ role: "admin" })
      .eq("brewery_id", brewery.id).eq("user_id", ctx.userId)).error).toBeNull();

    const validState = `valid-${crypto.randomUUID()}`;
    const supersededState = `superseded-${crypto.randomUUID()}`;
    expect((await begin(supersededState)).error).toBeNull();
    expect((await begin(validState)).error).toBeNull();
    await expect(callback(supersededState)).rejects.toThrow("oauth state invalid");
    expect(fetch).not.toHaveBeenCalled();
    await expect(callback(validState)).resolves.toEqual(expect.any(String));
    await expect(callback(validState)).rejects.toThrow("oauth state invalid");
    expect(fetch).toHaveBeenCalledTimes(1);

    const lostState = `lost-${crypto.randomUUID()}`;
    expect((await begin(lostState)).error).toBeNull();
    const lostFetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("socket closed"));
    await expect(completeQboOAuth({
      request: new Request(`${redirectUri}?code=lost-code&state=${lostState}&realmId=${realmId}`),
      actorId: ctx.userId, selectedBreweryId: brewery.id, redirectUri,
      client: new QboOAuthClient(config, lostFetch), store,
    })).rejects.toThrow("QuickBooks is unavailable");
    expect(lostFetch).toHaveBeenCalledTimes(1);
    expect(sql(`select exchange_state from private.qbo_oauth_intents where state_hash='${hash(lostState)}'`))
      .toEqual(["recovery_required"]);
    expect(sql(`select count(*) from private.qbo_connection_events where brewery_id='${brewery.id}' and kind='oauth_recovery_required'`))
      .toEqual(["1"]);

    const delayedState = `delayed-${crypto.randomUUID()}`;
    expect((await begin(delayedState)).error).toBeNull();
    let releaseExchange!: (response: Response) => void;
    const delayedFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise((resolve) => { releaseExchange = resolve; }));
    const delayedCallback = completeQboOAuth({
      request: new Request(`${redirectUri}?code=delayed-code&state=${delayedState}&realmId=${realmId}`),
      actorId: ctx.userId, selectedBreweryId: brewery.id, redirectUri,
      client: new QboOAuthClient(config, delayedFetch), store,
    });
    await vi.waitFor(() => expect(delayedFetch).toHaveBeenCalledTimes(1));
    const connection = await admin.from("qbo_connections").select("id").eq("brewery_id", brewery.id).single();
    expect(connection.error).toBeNull();
    await expect(disconnectQbo(ctx, connection.data!.id, vi.fn().mockResolvedValue(undefined), crypto.randomUUID()))
      .resolves.toMatchObject({ disconnected: true });
    releaseExchange(new Response(JSON.stringify({
      access_token: "late-access", refresh_token: "late-refresh", expires_in: 3600,
      x_refresh_token_expires_in: 8640000,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(delayedCallback).rejects.toThrow("QuickBooks is unavailable");
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}'`)).toEqual(["0"]);
    expect((await admin.from("qbo_connections").select("state").eq("brewery_id", brewery.id).single()).data?.state).toBe("disconnected");
  });

  it("consumes state once, replaces realm identity, and rejects stale refresh or a demoted actor", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const customer = await seedCustomer(brewery.id);
    const catalog = await seedCatalog(brewery.id);
    const redirect = "https://mgr.test/api/integrations/qbo/oauth";

    const connect = async (state: string, realm: string) => {
      const requestId = crypto.randomUUID();
      const receivedAt = "2026-09-09T18:00:00.000Z";
      expect((await ctx.db.rpc("begin_qbo_oauth", {
        p_brewery: brewery.id, p_redirect_uri: redirect, p_state_hash: hash(state),
        p_provider_intent: "reconnect", p_request_id: requestId,
      })).error).toBeNull();
      const claim = await admin.rpc("claim_qbo_oauth", {
        p_state_hash: hash(state), p_actor: ctx.userId, p_brewery: brewery.id, p_redirect_uri: redirect,
      });
      expect(claim.error).toBeNull();
      expect(claim.data).toHaveLength(1);
      expect((await admin.rpc("claim_qbo_oauth", {
        p_state_hash: hash(state), p_actor: ctx.userId, p_brewery: brewery.id, p_redirect_uri: redirect,
      })).data).toHaveLength(0);
      const result = await admin.rpc("complete_qbo_oauth", {
        p_intent: claim.data![0].intent_id, p_actor: ctx.userId, p_realm_id: realm, p_realm_label: realm,
        p_access_token: `access-${realm}`, p_refresh_token: `refresh-${realm}`,
        p_received_at: receivedAt,
        p_access_seconds: 3600, p_refresh_seconds: 86400, p_hard_seconds: null,
      });
      expect(result.error).toBeNull();
      const expiry = await admin.from("qbo_connections").select("access_expires_at,refresh_expires_at,refresh_hard_expires_at")
        .eq("brewery_id", brewery.id).single();
      expect(expiry.error).toBeNull();
      expect(new Date(expiry.data!.access_expires_at!).toISOString()).toBe("2026-09-09T19:00:00.000Z");
      expect(new Date(expiry.data!.refresh_expires_at!).toISOString()).toBe("2026-09-10T18:00:00.000Z");
      expect(expiry.data!.refresh_hard_expires_at).toBeNull();
      return result.data as string;
    };

    const run = crypto.randomUUID();
    const oldConnection = await connect(`state-one-${run}`, `realm-one-${run}`);
    const health = await getQboHealth(ctx);
    expect(health).toMatchObject({ connected: true, connectionId: oldConnection });
    expect(JSON.stringify(health)).not.toMatch(/access-|refresh-|token/i);
    expect((await admin.from("customers").update({ qbo_customer_id: "customer-old" }).eq("id", customer.customerId)).error).toBeNull();
    expect((await admin.from("skus").update({ qbo_item_id: "item-old" }).eq("id", catalog.skuId)).error).toBeNull();
    expect((await admin.from("invoices").insert({ brewery_id: brewery.id, customer_id: customer.customerId, qbo_invoice_id: "invoice-old" })).error).toBeNull();
    const old = await readVersionedIntegrationTokens(ctx, "qbo");

    const newConnection = await connect(`state-two-${run}`, `realm-two-${run}`);
    expect(newConnection).not.toBe(oldConnection);
    expect((await admin.from("customers").select("qbo_customer_id").eq("id", customer.customerId).single()).data?.qbo_customer_id).toBeNull();
    expect((await admin.from("skus").select("qbo_item_id").eq("id", catalog.skuId).single()).data?.qbo_item_id).toBeNull();
    expect((await admin.from("invoices").select("qbo_invoice_id").eq("brewery_id", brewery.id).single()).data?.qbo_invoice_id).toBeNull();

    const competingBrewery = await makeBrewery();
    const competingRealm = await admin.from("qbo_connections").insert({
      brewery_id: competingBrewery.id, realm_id: `realm-two-${run}`,
    });
    expect(competingRealm.error?.code).toBe("23505");

    const stale = await admin.rpc("cas_integration_tokens", {
      p_brewery: brewery.id, p_provider: "qbo", p_connection: old.connectionId, p_actor: ctx.userId,
      p_expected_version: old.credentialVersion, p_access_token: "stale-access", p_refresh_token: "stale-refresh",
      p_received_at: new Date().toISOString(),
      p_access_seconds: 3600, p_refresh_seconds: 86400, p_hard_seconds: null,
    });
    expect(stale).toMatchObject({ data: false, error: null });
    expect((await readVersionedIntegrationTokens(ctx, "qbo")).refreshToken).toBe(`refresh-realm-two-${run}`);

    expect((await admin.from("customers").update({ qbo_customer_id: "customer-current" }).eq("id", customer.customerId)).error).toBeNull();
    expect((await admin.from("skus").update({ qbo_item_id: "item-current" }).eq("id", catalog.skuId)).error).toBeNull();
    expect((await admin.from("invoices").update({
      qbo_invoice_id: "invoice-current", qbo_sync_status: "pushed",
      qbo_tax_cents: 100, qbo_total_cents: 1100, qbo_balance_cents: 600,
    }).eq("brewery_id", brewery.id)).error).toBeNull();

    const beforeDisconnect = await readVersionedIntegrationTokens(ctx, "qbo");
    const revoke = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const disconnectRequestId = crypto.randomUUID();
    await expect(disconnectQbo(ctx, newConnection, revoke, disconnectRequestId)).resolves.toEqual({
      disconnected: true, remoteRevocationState: "unresolved",
    });
    expect(revoke).toHaveBeenCalledWith(beforeDisconnect.refreshToken);
    // The first server execution committed but its HTTP response may be lost;
    // the exact retry reads the safe recorded result and never revokes twice.
    const replayRevoke = vi.fn();
    await expect(disconnectQbo(ctx, newConnection, replayRevoke, disconnectRequestId)).resolves.toEqual({
      disconnected: true, remoteRevocationState: "unresolved",
    });
    expect(replayRevoke).not.toHaveBeenCalled();
    expect(sql(`select result->>'remoteRevocationState' from private.command_requests where actor_id='${ctx.userId}' and request_id='${disconnectRequestId}'`))
      .toEqual(["unresolved"]);
    expect(sql(`select kind || ':' || count(*) from private.qbo_connection_events where connection_id='${newConnection}' and kind in ('disconnected','remote_revocation_unresolved') group by kind order by kind`))
      .toEqual(["disconnected:1", "remote_revocation_unresolved:1"]);
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}'`)).toEqual(["0"]);
    expect((await admin.from("qbo_connections").select("state,remote_revocation_state,last_error").eq("brewery_id", brewery.id).single()).data)
      .toMatchObject({ state: "disconnected", remote_revocation_state: "unresolved", last_error: "Remote revocation could not be confirmed" });
    const newestConnection = await connect(`state-three-${run}`, `realm-two-${run}`);
    expect(newestConnection).not.toBe(newConnection);
    expect((await admin.from("customers").select("qbo_customer_id").eq("id", customer.customerId).single()).data?.qbo_customer_id).toBe("customer-current");
    expect((await admin.from("skus").select("qbo_item_id").eq("id", catalog.skuId).single()).data?.qbo_item_id).toBe("item-current");
    expect((await admin.from("invoices").select("qbo_invoice_id,qbo_sync_status,qbo_tax_cents,qbo_total_cents,qbo_balance_cents").eq("brewery_id", brewery.id).single()).data)
      .toMatchObject({ qbo_invoice_id: "invoice-current", qbo_sync_status: "pushed", qbo_tax_cents: 100, qbo_total_cents: 1100, qbo_balance_cents: 600 });
    expect((await admin.rpc("cas_integration_tokens", {
      p_brewery: brewery.id, p_provider: "qbo", p_connection: beforeDisconnect.connectionId, p_actor: ctx.userId,
      p_expected_version: beforeDisconnect.credentialVersion, p_access_token: "late-access", p_refresh_token: "late-refresh",
      p_received_at: new Date().toISOString(),
      p_access_seconds: 3600, p_refresh_seconds: 86400, p_hard_seconds: null,
    }))).toMatchObject({ data: false, error: null });
    expect((await readVersionedIntegrationTokens(ctx, "qbo")).refreshToken).toBe(`refresh-realm-two-${run}`);

    const current = await readVersionedIntegrationTokens(ctx, "qbo");
    const refresh = (suffix: string) => admin.rpc("cas_integration_tokens", {
      p_brewery: brewery.id, p_provider: "qbo", p_connection: current.connectionId, p_actor: ctx.userId,
      p_expected_version: current.credentialVersion, p_access_token: `race-access-${suffix}`,
      p_refresh_token: `race-refresh-${suffix}`, p_received_at: new Date().toISOString(),
      p_access_seconds: 3600, p_refresh_seconds: 86400, p_hard_seconds: null,
    });
    const raced = await Promise.all([refresh("a"), refresh("b")]);
    expect(raced.map(({ data, error }) => [data, error]).sort()).toEqual([[false, null], [true, null]].sort());
    expect((await readVersionedIntegrationTokens(ctx, "qbo")).refreshToken).toMatch(/^race-refresh-[ab]$/);

    expect((await admin.from("brewery_users").update({ role: "brewer" }).eq("brewery_id", brewery.id).eq("user_id", ctx.userId)).error).toBeNull();
    await expect(readVersionedIntegrationTokens(ctx, "qbo")).rejects.toMatchObject({ status: 403 });
    expect((await ctx.db.schema("private").from("integration_tokens").select("refresh_token")).error).not.toBeNull();
  });
});
