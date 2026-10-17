import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { beginSquareOAuth, prepareSquareCatalogPublication, refreshSquareCredentials, SquareClient } from "@/lib/pos";
import {
  beginSquareMenuPublication, beginSquarePublication, disconnectSquare, finishSquarePublication,
  leaseSquarePublication, prepareSquarePublication, readVersionedIntegrationTokens,
} from "@/lib/supabase/integration-tokens";
import { runCommand, type StaffRole } from "@/lib/commands/registry";
import { admin, channelId, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation, seedPour, sql } from "./helpers";
import "@/lib/commands/all";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const };

async function multiRolePublicationFixture() {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, ["sales", "warehouse"]);
  const location = await seedLocation(brewery.id, { name: "Multi-role Taproom", uses: ["taproom"] });
  const connection = await admin.from("pos_connections").insert({
    brewery_id: brewery.id, merchant_id: `multi-role-${crypto.randomUUID()}`, state: "connected", credential_version: 1,
  }).select("id").single();
  expect(connection.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${brewery.id}','square','${connection.data!.id}','multi-square-access','multi-square-refresh',1)`);
  expect((await admin.from("pos_locations").insert({
    brewery_id: brewery.id, connection_id: connection.data!.id, external_location_id: "L1",
    external_name: "Square Taproom", external_status: "ACTIVE", location_id: location.id,
  })).error).toBeNull();
  const channel = await channelId(brewery.id, "Taproom");
  const catalog = await seedCatalog(brewery.id, { product: "Multi-role beer", packageType: "keg", bblPerUnit: 0.5 });
  const formatId = await seedPour(brewery.id, { brandId: catalog.brandId, name: "Pint", ounces: 16 });
  await priceSku(brewery.id, { saleChannelId: channel, brandId: catalog.brandId, formatId, cents: 700 });
  await runCommand("record_movement", {
    skuId: catalog.skuId, locationId: location.id, binId: location.binId, qty: 1, type: "opening_balance",
  }, ctx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
  await runCommand("configure_pos_menu", { posLocationId: "L1", binId: location.binId, saleChannelId: channel },
    ctx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
  return { brewery, ctx, connectionId: connection.data!.id, brandId: catalog.brandId, formatId };
}

describe("Square durable credential lifecycle", () => {
  it("publishes through the sales plus warehouse union without contacting Square", async () => {
    const f = await multiRolePublicationFixture();
    const started = await beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: f.brandId },
      crypto.randomUUID(), "publish_pos_item");
    const prepared = prepareSquareCatalogPublication(started.source);
    const body = JSON.stringify({ idempotency_key: started.providerKey, object: prepared.object });
    await prepareSquarePublication(f.ctx, started.attemptId, body, prepared.itemVersion, prepared.variationVersions);
    expect(await leaseSquarePublication(f.ctx, started.attemptId))
      .toMatchObject({ accessToken: "multi-square-access", credentialVersion: 1, requestBody: body });
    const object = JSON.parse(body).object;
    const variation = object.item_data.variations[0];
    expect(await finishSquarePublication(f.ctx, started.attemptId, null, {
      catalogObject: { ...object, id: "MULTI-ITEM", version: 1, item_data: {
        ...object.item_data, variations: [{ ...variation, id: "MULTI-VAR", version: 1,
          item_variation_data: { ...variation.item_variation_data, item_id: "MULTI-ITEM" } }],
      } },
      idMappings: [{ client_object_id: object.id, object_id: "MULTI-ITEM" },
        { client_object_id: variation.id, object_id: "MULTI-VAR" }],
    })).toMatchObject({ published: true, externalItemId: "MULTI-ITEM" });
    expect(sql(`select status from private.square_publications where id='${started.attemptId}';
      select external_variation_id from public.pos_catalog_ownership
        where connection_id='${f.connectionId}' and format_id='${f.formatId}'`)).toEqual(["succeeded", "MULTI-VAR"]);
  });

  it.each([
    { remainingRoles: ["sales"] as StaffRole[], superseded: true },
    { remainingRoles: ["sales", "admin"] as StaffRole[], superseded: false },
  ])("rechecks menu and item role unions after warehouse removal: $remainingRoles", async ({ remainingRoles, superseded }) => {
    const f = await multiRolePublicationFixture();
    const owner = await makeStaffCtx(f.brewery.id, "admin");
    const menuRequest = crypto.randomUUID();
    const menu = await beginSquareMenuPublication(f.ctx, { posLocationId: "L1" }, menuRequest);
    const child = menu.manifest.find((entry) => entry.brandId === f.brandId)!;
    const started = await beginSquarePublication(f.ctx, {
      posLocationId: "L1", brandId: f.brandId, menuPublicationId: menu.menuAttemptId,
    }, child.requestId, "publish_pos_menu");
    const prepared = prepareSquareCatalogPublication(started.source);
    await prepareSquarePublication(f.ctx, started.attemptId,
      JSON.stringify({ idempotency_key: started.providerKey, object: prepared.object }),
      prepared.itemVersion, prepared.variationVersions);
    expect((await admin.from("brewery_users").update({ roles: remainingRoles })
      .eq("brewery_id", f.brewery.id).eq("user_id", f.ctx.userId)).error).toBeNull();
    if (superseded) {
      expect((await admin.rpc("lease_square_publication", {
        p_brewery: f.brewery.id, p_publication: started.attemptId, p_actor: f.ctx.userId,
      })).error?.code).toBe("42501");
      // A current operator reconciles work whose initiating actor lost access.
      await expect(leaseSquarePublication(owner, started.attemptId)).rejects.toMatchObject({ status: 409 });
      expect(sql(`select status||':'||error_code from private.square_publications where id='${started.attemptId}';
        select status||':'||(result->>'errorCode') from private.square_menu_publications where id='${menu.menuAttemptId}';
        select result->'result'->>'errorCode' from private.command_requests
          where actor_id='${f.ctx.userId}' and request_id='${child.requestId}'`))
        .toEqual(["superseded:role_changed", "superseded:role_changed", "role_changed"]);
    } else {
      expect(await leaseSquarePublication(f.ctx, started.attemptId)).toMatchObject({ accessToken: "multi-square-access" });
      expect(sql(`select status from private.square_publications where id='${started.attemptId}';
        select status from private.square_menu_publications where id='${menu.menuAttemptId}'`))
        .toEqual(["prepared", "publishing"]);
    }
  });

  it("returns newest order versions for warehouse unions and no rows for sales-only or foreign staff", async () => {
    const brewery = await makeBrewery();
    const operator = await makeStaffCtx(brewery.id, ["sales", "warehouse"]);
    const sales = await makeStaffCtx(brewery.id, "sales");
    const foreign = await makeBrewery();
    const outsider = await makeStaffCtx(foreign.id, ["admin", "warehouse"]);
    const connection = await admin.from("pos_connections").insert({
      brewery_id: brewery.id, merchant_id: `versions-${crypto.randomUUID()}`, state: "connected",
    }).select("id").single();
    expect(connection.error).toBeNull();
    sql(`insert into private.square_order_snapshots(brewery_id,connection_id,merchant_id,external_order_id,source_version,snapshot_hash)
      select c.brewery_id,c.id,c.merchant_id,'multi-role-order',v.version,'fixture-'||v.version::text
      from public.pos_connections c cross join (values (1::bigint),(3::bigint)) v(version)
      where c.id='${connection.data!.id}'`);
    expect(await operator.db.rpc("pos_order_versions")).toMatchObject({
      error: null, data: [{ brewery_id: brewery.id, connection_id: connection.data!.id,
        external_order_id: "multi-role-order", source_version: 3 }],
    });
    expect(await sales.db.rpc("pos_order_versions")).toMatchObject({ error: null, data: [] });
    expect(await outsider.db.rpc("pos_order_versions")).toMatchObject({ error: null, data: [] });
  });

  it("binds OAuth state to its initiating Admin and current role", async () => {
    const brewery = await makeBrewery();
    const adminCtx = await makeStaffCtx(brewery.id, ["sales", "admin"]);
    const other = await makeStaffCtx(brewery.id, "admin");
    const authorize = new URL((await beginSquareOAuth(adminCtx, new SquareClient(config, vi.fn()), "connect", crypto.randomUUID())).authorizeUrl);

    expect((await admin.rpc("claim_square_oauth", { p_state_hash: hash(authorize.searchParams.get("state")!),
      p_actor: other.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri })).data).toEqual([]);
    expect((await admin.from("brewery_users").update({ roles: ["sales", "warehouse"] }).eq("brewery_id", brewery.id).eq("user_id", adminCtx.userId)).error).toBeNull();
    expect((await admin.rpc("claim_square_oauth", { p_state_hash: hash(authorize.searchParams.get("state")!),
      p_actor: adminCtx.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri })).data).toEqual([]);
  });

  it("purges locally before revoke and rejects a refresh response arriving after disconnect", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, ["admin", "warehouse"]);
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

  it("withholds tokenless merchant revocation while another brewery owns the connected seller (#640)", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, ["admin", "warehouse"]);
    const merchantId = `merchant-${crypto.randomUUID()}`;
    const connection = await admin.from("pos_connections").insert({
      brewery_id: brewery.id, merchant_id: merchantId, state: "connected", credential_version: 1,
    }).select("id").single();
    expect(connection.error).toBeNull();
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
      values('${brewery.id}','square','${connection.data!.id}','old-access','old-refresh',1)`);

    const failedRequest = crypto.randomUUID();
    const failedRevoke = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(disconnectSquare(ctx, connection.data!.id, failedRevoke, failedRequest))
      .resolves.toEqual({ disconnected: true, remoteRevocationState: "unresolved" });
    expect(failedRevoke).toHaveBeenCalledExactlyOnceWith({ accessToken: "old-access" });
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}' and provider='square'`))
      .toEqual(["0"]);

    const owner = await makeBrewery();
    const ownerCtx = await makeStaffCtx(owner.id, ["admin", "sales"]);
    const oauthFetch = vi.fn<typeof globalThis.fetch>();
    const oauth = new URL((await beginSquareOAuth(ownerCtx, new SquareClient(config, oauthFetch),
      "connect", crypto.randomUUID())).authorizeUrl);
    const claim = await admin.rpc("claim_square_oauth", {
      p_state_hash: hash(oauth.searchParams.get("state")!), p_actor: ownerCtx.userId,
      p_brewery: owner.id, p_redirect_uri: config.redirectUri,
    });
    expect(claim.error).toBeNull();
    const completed = await admin.rpc("complete_square_oauth", {
      p_intent: claim.data![0].intent_id, p_actor: ownerCtx.userId,
      p_merchant_id: merchantId, p_merchant_label: "Replacement owner",
      p_access_token: "owner-access", p_refresh_token: "owner-refresh",
      p_access_expires_at: "2030-01-01T00:00:00Z",
      p_granted_scopes: ["ITEMS_READ", "ITEMS_WRITE", "MERCHANT_PROFILE_READ", "ORDERS_READ"], p_locations: [],
    });
    expect(completed.error).toBeNull();
    expect(oauthFetch).not.toHaveBeenCalled();
    const ownerConnection = await admin.from("pos_connections").select("*").eq("brewery_id", owner.id).single();
    expect(ownerConnection.error).toBeNull();
    expect(ownerConnection.data).toMatchObject({
      merchant_id: merchantId, state: "connected", remote_revocation_state: "not_requested",
    });
    const ownerCredentials = await readVersionedIntegrationTokens(ownerCtx, "square");
    expect(ownerCredentials).toMatchObject({
      connectionId: ownerConnection.data!.id, accessToken: "owner-access", refreshToken: "owner-refresh",
    });

    const denied = await admin.rpc("begin_square_disconnect", {
      p_brewery: brewery.id, p_connection: connection.data!.id,
      p_actor: ownerCtx.userId, p_request_id: crypto.randomUUID(),
    });
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
    const oldConnection = await admin.from("pos_connections").select("state,remote_revocation_state,last_error")
      .eq("id", connection.data!.id).single();
    expect(oldConnection.error).toBeNull();
    expect(oldConnection.data).toEqual({
      state: "recovery_required", remote_revocation_state: "unresolved",
      last_error: "Remote revocation could not be confirmed",
    });
    const unchangedOwner = await admin.from("pos_connections").select("*").eq("id", ownerConnection.data!.id).single();
    expect(unchangedOwner.error).toBeNull();
    expect(unchangedOwner.data).toEqual(ownerConnection.data);
    expect(await readVersionedIntegrationTokens(ownerCtx, "square")).toEqual(ownerCredentials);

    // Removing the connected replacement releases the merchant-wide retry fence.
    const ownerRevoke = vi.fn().mockResolvedValue(undefined);
    await expect(disconnectSquare(ownerCtx, ownerConnection.data!.id, ownerRevoke, crypto.randomUUID()))
      .resolves.toEqual({ disconnected: true, remoteRevocationState: "confirmed" });
    expect(ownerRevoke).toHaveBeenCalledExactlyOnceWith({ accessToken: "owner-access" });
    const confirmedRequest = crypto.randomUUID();
    await expect(disconnectSquare(ctx, connection.data!.id, retryRevoke, confirmedRequest))
      .resolves.toEqual({ disconnected: true, remoteRevocationState: "confirmed" });
    expect(retryRevoke).toHaveBeenCalledExactlyOnceWith({ merchantId });
    // Completed requests retain their original result even after ownership changes.
    for (const requestId of [failedRequest, retryRequest, confirmedRequest]) {
      await expect(disconnectSquare(ctx, connection.data!.id, retryRevoke, requestId)).resolves.toEqual({
        disconnected: true, remoteRevocationState: requestId === confirmedRequest ? "confirmed" : "unresolved",
      });
    }
    expect(retryRevoke).toHaveBeenCalledExactlyOnceWith({ merchantId });
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
