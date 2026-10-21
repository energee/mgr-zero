// tests/qbo-refresh-lease.test.ts — issue #1032: callers send a QuickBooks
// refresh token to Intuit one at a time per connection. Covers the lease's
// hand-offs (crash, failure, stale release), the waiter's limits, refusals
// that must never reach Intuit, and a holder whose store fails after Intuit
// answered. The plain two-caller race is in qbo-lifecycle-sql.test.ts and
// qbo-pay.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as IntegrationTokens from "@/lib/supabase/integration-tokens";
import { QboOAuthClient, refreshQboCredentials } from "@/lib/qbo";
import { readVersionedIntegrationTokens } from "@/lib/supabase/integration-tokens";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";

// Pass-through wrappers: count "held" answers so a test can wait for a caller
// to be parked on the lease, and fail the next store on request.
const spy = vi.hoisted(() => ({ held: 0, failNextStore: false }));
vi.mock("@/lib/supabase/integration-tokens", async (importOriginal) => {
  const real = await importOriginal<typeof IntegrationTokens>();
  return {
    ...real,
    leaseQboTokenRefresh: async (...args: Parameters<typeof real.leaseQboTokenRefresh>) => {
      const state = await real.leaseQboTokenRefresh(...args);
      if (state === "held") spy.held++;
      return state;
    },
    compareAndSwapQboTokens: async (...args: Parameters<typeof real.compareAndSwapQboTokens>) => {
      if (spy.failNextStore) {
        spy.failNextStore = false;
        throw new Error("QuickBooks token refresh storage failed");
      }
      return real.compareAndSwapQboTokens(...args);
    },
  };
});

afterEach(() => {
  spy.held = 0;
  spy.failNextStore = false;
  vi.useRealTimers();
});

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};

async function connection() {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "sales");
  const row = await admin.from("qbo_connections").insert({
    brewery_id: brewery.id, realm_id: `realm-${crypto.randomUUID()}`, state: "connected",
    access_expires_at: "2026-01-01T00:00:00Z", credential_version: 1,
  }).select("id").single();
  if (row.error) throw row.error;
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${brewery.id}','qbo','${row.data.id}','old-access','old-refresh',1)`);
  return { brewery, ctx, connectionId: row.data.id };
}

const rotated = (n: number) => Response.json({
  access_token: `rotated-access-${n}`, refresh_token: `rotated-refresh-${n}`, expires_in: 3600,
});
/** A token response the test releases by hand, with a count of requests started. */
function gatedFetch(responses: Array<() => Response>) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  let calls = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const response = responses[calls++];
    await gate;
    return response();
  });
  return { fetch, open, calls: () => calls };
}

const leaseState = (connectionId: string) => sql(`select coalesce(refresh_lease::text,'none')
  from private.integration_tokens where connection_id='${connectionId}'`)[0];
const connectionState = (connectionId: string) => sql(`select state from public.qbo_connections where id='${connectionId}'`)[0];

describe("QuickBooks refresh lease (#1032)", { concurrent: false }, () => {
  it("refreshes past a lease that a crashed holder left behind once it expires", async () => {
    const { ctx, connectionId } = await connection();
    sql(`update private.integration_tokens set refresh_lease=gen_random_uuid(),
      refresh_leased_until=now()-interval '1 second' where connection_id='${connectionId}'`);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => rotated(1));
    await expect(refreshQboCredentials(ctx, new QboOAuthClient(config, fetch)))
      .resolves.toMatchObject({ refreshToken: "rotated-refresh-1" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("releases the lease when the provider refresh fails, so the next caller does not wait", async () => {
    const { ctx, connectionId } = await connection();
    const down = vi.fn<typeof globalThis.fetch>(async () => new Response("unavailable", { status: 503 }));
    await expect(refreshQboCredentials(ctx, new QboOAuthClient(config, down))).rejects.toThrow("QuickBooks is unavailable");
    expect(leaseState(connectionId)).toBe("none");
    const up = vi.fn<typeof globalThis.fetch>(async () => rotated(2));
    await expect(refreshQboCredentials(ctx, new QboOAuthClient(config, up)))
      .resolves.toMatchObject({ refreshToken: "rotated-refresh-2" });
  });

  it("lets a waiter refresh by itself when the holder's provider call fails", async () => {
    const { ctx } = await connection();
    const expected = await readVersionedIntegrationTokens(ctx, "qbo");
    const intuit = gatedFetch([() => new Response("unavailable", { status: 503 }), () => rotated(2)]);
    const client = new QboOAuthClient(config, intuit.fetch);
    const holder = refreshQboCredentials(ctx, client, expected);
    await expect.poll(() => intuit.calls()).toBe(1);
    const waiter = refreshQboCredentials(ctx, client, expected);
    await expect.poll(() => spy.held).toBeGreaterThan(0); // the waiter is parked on the lease
    expect(intuit.calls()).toBe(1);
    intuit.open();
    await expect(holder).rejects.toThrow("QuickBooks is unavailable");
    await expect(waiter).resolves.toMatchObject({ refreshToken: "rotated-refresh-2" });
    expect(intuit.fetch).toHaveBeenCalledTimes(2);
  });

  it("stops a waiter from resending a refresh token the holder found dead", async () => {
    const { ctx, connectionId } = await connection();
    const expected = await readVersionedIntegrationTokens(ctx, "qbo");
    const intuit = gatedFetch([() => Response.json({ error: "invalid_grant" }, { status: 400 })]);
    const client = new QboOAuthClient(config, intuit.fetch);
    const holder = refreshQboCredentials(ctx, client, expected);
    await expect.poll(() => intuit.calls()).toBe(1);
    const waiter = refreshQboCredentials(ctx, client, expected);
    await expect.poll(() => spy.held).toBeGreaterThan(0);
    intuit.open();
    await expect(holder).rejects.toThrow("QuickBooks is unavailable");
    await expect(waiter).rejects.toThrow("QuickBooks is unavailable");
    expect(intuit.fetch).toHaveBeenCalledTimes(1);
    expect(connectionState(connectionId)).toBe("recovery_required");
  });

  it("gives up waiting once the wait limit passes while another holder keeps the lease", async () => {
    const { ctx, connectionId } = await connection();
    const expected = await readVersionedIntegrationTokens(ctx, "qbo");
    sql(`update private.integration_tokens set refresh_lease=gen_random_uuid(),
      refresh_leased_until=now()+interval '1 hour' where connection_id='${connectionId}'`);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => rotated(1));
    vi.useFakeTimers({ toFake: ["Date"] });
    const waiting = refreshQboCredentials(ctx, new QboOAuthClient(config, fetch), expected);
    vi.setSystemTime(Date.now() + 60_000); // the deadline was fixed when the wait began
    await expect(waiting).rejects.toThrow("QuickBooks is unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses before Intuit when the connection is not connected or the actor may not store a refresh", async () => {
    const { brewery, ctx, connectionId } = await connection();
    const expected = await readVersionedIntegrationTokens(ctx, "qbo");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => rotated(1));
    const warehouse = await makeStaffCtx(brewery.id, "warehouse");
    await expect(refreshQboCredentials(warehouse, new QboOAuthClient(config, fetch), expected))
      .rejects.toThrow("QuickBooks is unavailable");
    expect((await admin.from("qbo_connections").update({ state: "recovery_required" }).eq("id", connectionId)).error).toBeNull();
    await expect(refreshQboCredentials(ctx, new QboOAuthClient(config, fetch), expected))
      .rejects.toThrow("QuickBooks is unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks the connection for recovery when the store fails after Intuit issued new tokens", async () => {
    const { ctx, connectionId } = await connection();
    spy.failNextStore = true;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => rotated(1));
    await expect(refreshQboCredentials(ctx, new QboOAuthClient(config, fetch))).rejects.toThrow("QuickBooks is unavailable");
    expect(connectionState(connectionId)).toBe("recovery_required");
    expect(leaseState(connectionId)).toBe("none");
  });

  it("does not let a holder whose lease expired release the next holder's lease", async () => {
    const { brewery, ctx, connectionId } = await connection();
    const { credentialVersion } = await readVersionedIntegrationTokens(ctx, "qbo");
    const stale = crypto.randomUUID();
    const next = crypto.randomUUID();
    const take = (lease: string) => admin.rpc("lease_qbo_token_refresh", {
      p_brewery: brewery.id, p_connection: connectionId, p_actor: ctx.userId, p_expected_version: credentialVersion, p_lease: lease,
    });
    expect((await take(stale)).data).toBe("leased");
    sql(`update private.integration_tokens set refresh_leased_until=now()-interval '1 second' where connection_id='${connectionId}'`);
    expect((await take(next)).data).toBe("leased");
    expect((await admin.rpc("release_qbo_token_refresh", {
      p_brewery: brewery.id, p_connection: connectionId, p_lease: stale,
    })).error).toBeNull();
    expect(leaseState(connectionId)).toBe(next);
  });

  it("clears a lease when a reconnect replaces the credential", async () => {
    const { brewery, connectionId } = await connection();
    sql(`update private.integration_tokens set refresh_lease=gen_random_uuid(),
      refresh_leased_until=now()+interval '1 hour' where connection_id='${connectionId}'`);
    const admins = await makeStaffCtx(brewery.id, "admin");
    const intent = sql(`insert into private.qbo_oauth_intents(brewery_id,actor_id,state_hash,redirect_uri,provider_intent,requested_scopes,expires_at,consumed_at,exchange_state)
      values('${brewery.id}','${admins.userId}','${crypto.randomUUID()}','${config.redirectUri}','reconnect',array['com.intuit.quickbooks.accounting'],now()+interval '10 minutes',now(),'exchanging')
      returning id`)[0];
    const { error } = await admin.rpc("complete_qbo_oauth", {
      p_intent: intent, p_actor: admins.userId, p_realm_id: `realm-${crypto.randomUUID()}`, p_realm_label: "Replacement",
      p_access_token: "new-access", p_refresh_token: "new-refresh", p_received_at: new Date().toISOString(),
      p_access_seconds: 3600, p_refresh_seconds: 86400, p_hard_seconds: null,
    });
    expect(error).toBeNull();
    expect(sql(`select coalesce(refresh_lease::text,'none')||':'||coalesce(refresh_leased_until::text,'none')
      from private.integration_tokens where brewery_id='${brewery.id}'`)).toEqual(["none:none"]);
  });

  it("keeps the lease functions service-only", () => {
    expect(sql(`select r.role from unnest(array['anon','authenticated']) r(role)
      where has_function_privilege(r.role,'public.lease_qbo_token_refresh(uuid,uuid,uuid,bigint,uuid,uuid,uuid)','execute')
         or has_function_privilege(r.role,'public.release_qbo_token_refresh(uuid,uuid,uuid)','execute')`)).toEqual([]);
  });
});
