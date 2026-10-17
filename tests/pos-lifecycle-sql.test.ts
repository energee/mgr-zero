import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { beginSquareOAuth, refreshSquareCredentials, SquareClient } from "@/lib/pos";
import { disconnectSquare, readVersionedIntegrationTokens } from "@/lib/supabase/integration-tokens";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const };

describe("Square durable credential lifecycle", () => {
  it("binds OAuth state to its initiating Admin and current role", async () => {
    const brewery = await makeBrewery();
    const adminCtx = await makeStaffCtx(brewery.id, "admin");
    const other = await makeStaffCtx(brewery.id, "admin");
    const authorize = new URL((await beginSquareOAuth(adminCtx, new SquareClient(config, vi.fn()), "connect", crypto.randomUUID())).authorizeUrl);

    expect((await admin.rpc("claim_square_oauth", { p_state_hash: hash(authorize.searchParams.get("state")!),
      p_actor: other.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri })).data).toEqual([]);
    expect((await admin.from("brewery_users").update({ role: "warehouse" }).eq("brewery_id", brewery.id).eq("user_id", adminCtx.userId)).error).toBeNull();
    expect((await admin.rpc("claim_square_oauth", { p_state_hash: hash(authorize.searchParams.get("state")!),
      p_actor: adminCtx.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri })).data).toEqual([]);
  });

  it("purges locally before revoke and rejects a refresh response arriving after disconnect", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id, merchant_id: `merchant-${crypto.randomUUID()}`,
      state: "connected", credential_version: 1, access_expires_at: "2026-01-01T00:00:00Z" }).select("id,merchant_id").single();
    expect(connection.error).toBeNull();
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
      values('${brewery.id}','square','${connection.data!.id}','old-access','old-refresh',1)`);

    let release!: (response: Response) => void;
    const refreshFetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => { release = resolve; }));
    const pending = refreshSquareCredentials(ctx, new SquareClient(config, refreshFetch));
    await vi.waitFor(() => expect(refreshFetch).toHaveBeenCalledTimes(1));

    const requestId = crypto.randomUUID();
    const revoke = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(disconnectSquare(ctx, connection.data!.id, revoke, requestId)).resolves.toEqual({
      disconnected: true, remoteRevocationState: "unresolved",
    });
    expect(revoke).toHaveBeenCalledWith({ accessToken: "old-access" });
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}' and provider='square'`)).toEqual(["0"]);

    release(new Response(JSON.stringify({ access_token: "late-access", refresh_token: "late-refresh",
      expires_at: "2026-11-01T00:00:00Z", merchant_id: connection.data!.merchant_id }), { status: 200 }));
    await expect(pending).rejects.toThrow("Square is unavailable");
    await expect(readVersionedIntegrationTokens(ctx, "square")).rejects.toMatchObject({ status: 404 });

    const replayRevoke = vi.fn();
    await expect(disconnectSquare(ctx, connection.data!.id, replayRevoke, requestId)).resolves.toEqual({
      disconnected: true, remoteRevocationState: "unresolved",
    });
    expect(replayRevoke).not.toHaveBeenCalled();
    expect((await admin.from("pos_connections").select("state,remote_revocation_state,last_error").eq("id", connection.data!.id).single()).data)
      .toEqual({ state: "recovery_required", remote_revocation_state: "unresolved", last_error: "Remote revocation could not be confirmed" });

    // #640: with the token gone, a new disconnect retries revocation by merchant id.
    const retryRevoke = vi.fn().mockResolvedValue(undefined);
    await expect(disconnectSquare(ctx, connection.data!.id, retryRevoke, crypto.randomUUID())).resolves.toEqual({
      disconnected: true, remoteRevocationState: "confirmed",
    });
    expect(retryRevoke).toHaveBeenCalledWith({ merchantId: connection.data!.merchant_id });
    expect((await admin.from("pos_connections").select("state,remote_revocation_state,last_error").eq("id", connection.data!.id).single()).data)
      .toEqual({ state: "disconnected", remote_revocation_state: "confirmed", last_error: null });
  });

  it("does not revoke a seller now connected to another brewery (#640)", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const merchantId = `merchant-${crypto.randomUUID()}`;
    const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id, merchant_id: merchantId,
      state: "connected", credential_version: 1 }).select("id").single();
    expect(connection.error).toBeNull();
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
      values('${brewery.id}','square','${connection.data!.id}','old-access','old-refresh',1)`);

    const failedRequest = crypto.randomUUID();
    const failedRevoke = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(disconnectSquare(ctx, connection.data!.id, failedRevoke, failedRequest))
      .resolves.toEqual({ disconnected: true, remoteRevocationState: "unresolved" });
    expect(failedRevoke).toHaveBeenCalledWith({ accessToken: "old-access" });
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}' and provider='square'`)).toEqual(["0"]);

    const owner = await makeBrewery();
    const ownerCtx = await makeStaffCtx(owner.id, "admin");
    const oauth = new URL((await beginSquareOAuth(ownerCtx, new SquareClient(config, vi.fn()), "connect", crypto.randomUUID())).authorizeUrl);
    const claim = await admin.rpc("claim_square_oauth", { p_state_hash: hash(oauth.searchParams.get("state")!),
      p_actor: ownerCtx.userId, p_brewery: owner.id, p_redirect_uri: config.redirectUri });
    expect(claim.error).toBeNull();
    const completed = await admin.rpc("complete_square_oauth", { p_intent: claim.data![0].intent_id, p_actor: ownerCtx.userId,
      p_merchant_id: merchantId, p_merchant_label: "Replacement owner", p_access_token: "owner-access",
      p_refresh_token: "owner-refresh", p_access_expires_at: "2030-01-01T00:00:00Z",
      p_granted_scopes: ["ITEMS_READ", "ITEMS_WRITE", "MERCHANT_PROFILE_READ", "ORDERS_READ"], p_locations: [],
    });
    expect(completed.error).toBeNull();

    const denied = await admin.rpc("begin_square_disconnect", { p_brewery: brewery.id, p_connection: connection.data!.id,
      p_actor: ownerCtx.userId, p_request_id: crypto.randomUUID() });
    expect(denied.error?.code).toBe("42501");

    const retryRequest = crypto.randomUUID();
    const retryRevoke = vi.fn().mockResolvedValue(undefined);
    await expect(disconnectSquare(ctx, connection.data!.id, retryRevoke, retryRequest))
      .resolves.toEqual({ disconnected: true, remoteRevocationState: "unresolved" });
    expect(retryRevoke).not.toHaveBeenCalled();
    for (const requestId of [failedRequest, retryRequest]) {
      await expect(disconnectSquare(ctx, connection.data!.id, retryRevoke, requestId))
        .resolves.toEqual({ disconnected: true, remoteRevocationState: "unresolved" });
    }
    expect(retryRevoke).not.toHaveBeenCalled();
    expect((await admin.from("pos_connections").select("state,remote_revocation_state,last_error")
      .eq("id", connection.data!.id).single()).data)
      .toEqual({ state: "recovery_required", remote_revocation_state: "unresolved", last_error: "Remote revocation could not be confirmed" });
    const ownerConnection = await admin.from("pos_connections").select("id,state,remote_revocation_state")
      .eq("brewery_id", owner.id).single();
    expect(ownerConnection.data).toMatchObject({ state: "connected", remote_revocation_state: "not_requested" });
    expect(sql(`select access_token from private.integration_tokens where brewery_id='${owner.id}' and provider='square'`)).toEqual(["owner-access"]);

    // Once the replacement owner disconnects, an old unresolved retry can proceed.
    const ownerRevoke = vi.fn().mockResolvedValue(undefined);
    await expect(disconnectSquare(ownerCtx, ownerConnection.data!.id, ownerRevoke, crypto.randomUUID()))
      .resolves.toEqual({ disconnected: true, remoteRevocationState: "confirmed" });
    expect(ownerRevoke).toHaveBeenCalledWith({ accessToken: "owner-access" });
    await expect(disconnectSquare(ctx, connection.data!.id, retryRevoke, crypto.randomUUID()))
      .resolves.toEqual({ disconnected: true, remoteRevocationState: "confirmed" });
    expect(retryRevoke).toHaveBeenCalledTimes(1);
    expect(retryRevoke).toHaveBeenCalledWith({ merchantId });
  });

  it("disconnects a recovery-required connection that still holds its credential (#620)", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id, merchant_id: `merchant-${crypto.randomUUID()}`,
      state: "connected", credential_version: 1, access_expires_at: "2026-01-01T00:00:00Z" }).select("id").single();
    expect(connection.error).toBeNull();
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
      values('${brewery.id}','square','${connection.data!.id}','expired-access','expired-refresh',1)`);
    expect((await admin.rpc("mark_square_authorization_failed", { p_brewery: brewery.id, p_connection: connection.data!.id,
      p_actor: ctx.userId, p_expected_version: 1 })).data).toBe(true);

    const revoke = vi.fn().mockResolvedValue(undefined);
    await expect(disconnectSquare(ctx, connection.data!.id, revoke, crypto.randomUUID()))
      .resolves.toEqual({ disconnected: true, remoteRevocationState: "confirmed" });
    expect(revoke).toHaveBeenCalledWith({ accessToken: "expired-access" });
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}' and provider='square'`)).toEqual(["0"]);
    expect((await admin.from("pos_connections").select("state,remote_revocation_state").eq("id", connection.data!.id).single()).data)
      .toEqual({ state: "disconnected", remote_revocation_state: "confirmed" });
  });
});
