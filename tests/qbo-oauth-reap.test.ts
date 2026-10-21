// tests/qbo-oauth-reap.test.ts — issue #1034: a QuickBooks connect whose
// callback dies after Intuit issued tokens must not stay 'exchanging' forever,
// and the issued refresh token must be revoked unless another stored
// connection uses that QuickBooks company.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { completeQboOAuth, QboOAuthClient, reapQboOAuthExchanges } from "@/lib/qbo";
import {
  claimQboOAuth,
  completeQboOAuthStore,
  discardQboOAuthTokens,
  failQboOAuth,
  holdQboOAuthTokens,
  qboRealmInUse,
  reapStaleQboOAuthExchanges,
} from "@/lib/supabase/integration-tokens";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};
const store = { claim: claimQboOAuth, hold: holdQboOAuthTokens, complete: completeQboOAuthStore, fail: failQboOAuth, realmInUse: qboRealmInUse };
const reapStore = { reap: reapStaleQboOAuthExchanges, realmInUse: qboRealmInUse, discard: discardQboOAuthTokens };
const reap = (revoke: (token: string) => Promise<void>) => reapQboOAuthExchanges(reapStore, { revoke });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const issued = (refresh: string) => new Response(JSON.stringify({
  access_token: `${refresh}-access`, refresh_token: refresh, expires_in: 3600, x_refresh_token_expires_in: 86400,
}), { status: 200 });

/**
 * Starts a connect and lets the callback exchange the code, then never answers
 * the CompanyInfo read: the process is gone between the exchange and the store.
 */
async function crashedConnect(realm = `realm-${crypto.randomUUID()}`) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "admin");
  const state = `state-${crypto.randomUUID()}`;
  expect((await ctx.db.rpc("begin_qbo_oauth", {
    p_brewery: brewery.id, p_redirect_uri: config.redirectUri, p_state_hash: hash(state),
    p_provider_intent: "connect", p_request_id: crypto.randomUUID(),
  })).error).toBeNull();
  const refresh = `issued-${crypto.randomUUID()}`;
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(issued(refresh))
    .mockReturnValueOnce(new Promise<Response>(() => {}));
  void completeQboOAuth({
    request: new Request(`${config.redirectUri}?code=code&state=${state}&realmId=${realm}`),
    actorId: ctx.userId, selectedBreweryId: brewery.id, redirectUri: config.redirectUri,
    client: new QboOAuthClient(config, fetch), store,
  });
  await expect.poll(() => fetch.mock.calls.length).toBe(2);
  const intentId = sql(`select id from private.qbo_oauth_intents where state_hash='${hash(state)}'`)[0];
  return { brewery, ctx, realm, refresh, intentId };
}

const intent = (id: string) => sql(`select exchange_state||':'||coalesce(issued_refresh_token,'none')
  from private.qbo_oauth_intents where id='${id}'`)[0];
const age = (id: string, interval = "11 minutes") =>
  sql(`update private.qbo_oauth_intents set consumed_at=now()-interval '${interval}',created_at=now()-interval '${interval}' where id='${id}'`);

describe("QuickBooks OAuth exchange reap (#1034)", { concurrent: false }, () => {
  it("holds the issued refresh token while exchanging, then revokes and discards it once the exchange is stale", async () => {
    const stuck = await crashedConnect();
    expect(intent(stuck.intentId)).toBe(`exchanging:${stuck.refresh}`);

    const revoke = vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    await reap(revoke);
    expect(revoke).not.toHaveBeenCalledWith(stuck.refresh); // a fresh exchange may still finish
    expect(intent(stuck.intentId)).toBe(`exchanging:${stuck.refresh}`);

    age(stuck.intentId);
    await reap(revoke);
    expect(revoke).toHaveBeenCalledWith(stuck.refresh);
    expect(intent(stuck.intentId)).toBe("recovery_required:none");
  });

  it("does not revoke when a stored connection uses the realm, but still discards the token", async () => {
    const stuck = await crashedConnect();
    const other = await makeBrewery();
    expect((await admin.from("qbo_connections").insert({
      brewery_id: other.id, realm_id: stuck.realm, realm_label: "Other books", state: "connected",
    })).error).toBeNull();
    age(stuck.intentId);
    const revoke = vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    await reap(revoke);
    expect(revoke).not.toHaveBeenCalledWith(stuck.refresh);
    expect(intent(stuck.intentId)).toBe("recovery_required:none");
  });

  it("waits for age and for a newer connect to finish before revoking a token a newer attempt moved to recovery", async () => {
    const stuck = await crashedConnect();
    const newerState = hash(crypto.randomUUID());
    expect((await stuck.ctx.db.rpc("begin_qbo_oauth", {
      p_brewery: stuck.brewery.id, p_redirect_uri: config.redirectUri, p_state_hash: newerState,
      p_provider_intent: "connect", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    expect(intent(stuck.intentId)).toBe(`recovery_required:${stuck.refresh}`);
    const revoke = vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    await reap(revoke); // under ten minutes old
    age(stuck.intentId);
    await reap(revoke); // old enough, but the newer connect is still pending
    expect(revoke).not.toHaveBeenCalledWith(stuck.refresh);
    expect(intent(stuck.intentId)).toBe(`recovery_required:${stuck.refresh}`);
    sql(`update private.qbo_oauth_intents set expires_at=now()-interval '1 second' where state_hash='${newerState}'`);
    await reap(revoke);
    expect(revoke).toHaveBeenCalledWith(stuck.refresh);
    expect(intent(stuck.intentId)).toBe("recovery_required:none");
  });

  it("keeps the token when the revoke fails, and discards it unrevoked once the reap gives up after seven days", async () => {
    const stuck = await crashedConnect();
    age(stuck.intentId);
    const down = vi.fn<(token: string) => Promise<void>>().mockRejectedValue(new Error("QuickBooks revoke failed"));
    // Other tests' rows may share the database, so count only this token's revokes.
    const attempts = () => down.mock.calls.filter(([token]) => token === stuck.refresh).length;
    await reap(down);
    expect(attempts()).toBe(1);
    expect(intent(stuck.intentId)).toBe(`recovery_required:${stuck.refresh}`);
    age(stuck.intentId, "8 days");
    await reap(down);
    expect(attempts()).toBe(2);
    expect(intent(stuck.intentId)).toBe("recovery_required:none");
  });

  it("revokes again after a callback whose own failure path already revoked (a harmless double revoke)", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const state = `state-${crypto.randomUUID()}`;
    expect((await ctx.db.rpc("begin_qbo_oauth", {
      p_brewery: brewery.id, p_redirect_uri: config.redirectUri, p_state_hash: hash(state),
      p_provider_intent: "connect", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(issued("failed-refresh"))
      .mockResolvedValueOnce(new Response("denied", { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=code&state=${state}&realmId=realm-${crypto.randomUUID()}`),
      actorId: ctx.userId, selectedBreweryId: brewery.id, redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, fetch), store,
    })).rejects.toThrow("QuickBooks is unavailable");
    expect(String(fetch.mock.calls[2][1]?.body)).toContain("failed-refresh"); // the callback revoked it
    const id = sql(`select id from private.qbo_oauth_intents where state_hash='${hash(state)}'`)[0];
    age(id);
    const revoke = vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    await reap(revoke);
    expect(revoke).toHaveBeenCalledWith("failed-refresh");
    expect(intent(id)).toBe("recovery_required:none");
  });

  it("keeps no copy of the token once the connection is stored", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const state = `state-${crypto.randomUUID()}`;
    expect((await ctx.db.rpc("begin_qbo_oauth", {
      p_brewery: brewery.id, p_redirect_uri: config.redirectUri, p_state_hash: hash(state),
      p_provider_intent: "connect", p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(issued("stored-refresh"))
      .mockResolvedValueOnce(Response.json({ CompanyInfo: { Id: "company", CompanyName: "Books" } }));
    await completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=code&state=${state}&realmId=realm-${crypto.randomUUID()}`),
      actorId: ctx.userId, selectedBreweryId: brewery.id, redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, fetch), store,
    });
    expect(sql(`select exchange_state||':'||coalesce(issued_refresh_token,'none') from private.qbo_oauth_intents
      where state_hash='${hash(state)}'`)).toEqual(["completed:none"]);
  });

  it("keeps the hold and reap functions service-only", () => {
    expect(sql(`select r.role from unnest(array['anon','authenticated']) r(role)
      where has_function_privilege(r.role,'public.hold_qbo_oauth_tokens(uuid,uuid,text,text)','execute')
         or has_function_privilege(r.role,'public.reap_qbo_oauth_exchanges()','execute')
         or has_function_privilege(r.role,'public.discard_qbo_oauth_tokens(uuid,text)','execute')`)).toEqual([]);
  });
});
