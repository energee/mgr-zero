import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { beginSquareOAuth, completeSquareOAuth, SquareClient } from "@/lib/pos";
import { disconnectSquare, failSquareOAuth } from "@/lib/supabase/integration-tokens";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

beforeAll(() => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
  expect(process.env.DATABASE_URL).toContain(":54352/");
});

async function connected(breweryId: string) {
  const row = await admin.from("pos_connections").insert({ brewery_id: breweryId,
    merchant_id: `merchant-${crypto.randomUUID()}`, state: "connected", credential_version: 1,
  }).select("id,merchant_id").single();
  expect(row.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${breweryId}','square','${row.data!.id}','old-access','old-refresh',1)`);
  return { connectionId: row.data!.id as string, merchantId: row.data!.merchant_id as string };
}

describe("Square quality-review lifecycle fences", () => {
  it.each([
    ["location verification", false, true, "confirmed"],
    ["durable adoption", true, true, "confirmed"],
    ["durable adoption with unavailable cleanup", true, false, "unresolved"],
  ] as const)("fully revokes an issued authorization after failed %s and records cleanup", async (_label, adoptionFailure, revokeSuccess, cleanupState) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "issued-access-secret",
        refresh_token: "issued-refresh-secret", expires_at: "2026-10-10T00:00:00Z", merchant_id: "merchant-1" }), { status: 200 }))
      .mockResolvedValueOnce(adoptionFailure
        ? new Response(JSON.stringify({ locations: [{ id: "L1", name: "Taproom", status: "ACTIVE", merchant_id: "merchant-1" }] }), { status: 200 })
        : new Response("location failure includes issued-access-secret", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: revokeSuccess }), { status: revokeSuccess ? 200 : 503 }));
    const fail = vi.fn().mockResolvedValue(undefined);
    const complete = vi.fn().mockRejectedValue(new Error("storage failure includes issued-refresh-secret"));

    await expect(completeSquareOAuth({
      request: new Request("https://mgr.test/callback?code=one-time&state=opaque"), actorId: "actor-1",
      selectedBreweryId: "brewery-1", redirectUri: config.redirectUri, client: new SquareClient(config, fetch),
      store: { claim: vi.fn().mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect", requestedScopes: [] }),
        complete, fail },
    })).rejects.toThrow("Square is unavailable");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toBe("https://connect.squareupsandbox.com/oauth2/revoke");
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({
      client_id: "sandbox-app", access_token: "issued-access-secret", revoke_only_access_token: false,
    });
    expect(fail.mock.calls).toEqual([
      ["intent-1", "actor-1", "pending", "merchant-1"],
      ["intent-1", "actor-1", cleanupState, "merchant-1"],
    ]);
    expect(JSON.stringify(fail.mock.calls)).not.toContain("issued-access-secret");
    expect(JSON.stringify(fail.mock.calls)).not.toContain("issued-refresh-secret");
  });

  it("blocks adoption during disconnect revoke and makes a late old finish an exact harmless replay", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connection = await connected(brewery.id);
    const oauth = new URL((await beginSquareOAuth(ctx, new SquareClient(config, vi.fn()), "reconnect", crypto.randomUUID())).authorizeUrl);
    const claim = await admin.rpc("claim_square_oauth", { p_state_hash: hash(oauth.searchParams.get("state")!),
      p_actor: ctx.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri });
    expect(claim.error).toBeNull();
    const intentId = (claim.data as Array<{ intent_id: string }>)[0].intent_id;

    let release!: () => void;
    const revoke = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const requestId = crypto.randomUUID();
    const pending = disconnectSquare(ctx, connection.connectionId, revoke, requestId);
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith("old-access"));
    expect((await admin.from("pos_connections").select("state,remote_revocation_state").eq("id", connection.connectionId).single()).data)
      .toEqual({ state: "recovery_required", remote_revocation_state: "pending" });
    const retryRevoke = vi.fn();
    await expect(disconnectSquare(ctx, connection.connectionId, retryRevoke, requestId)).rejects.toMatchObject({ status: 409 });
    expect(retryRevoke).not.toHaveBeenCalled();

    const adoption = await admin.rpc("complete_square_oauth", { p_intent: intentId, p_actor: ctx.userId,
      p_merchant_id: connection.merchantId, p_merchant_label: "replacement", p_access_token: "new-access",
      p_refresh_token: "new-refresh", p_access_expires_at: "2026-10-10T00:00:00Z",
      p_granted_scopes: ["ITEMS_READ", "ITEMS_WRITE", "MERCHANT_PROFILE_READ", "ORDERS_READ"], p_locations: [],
    });
    expect(adoption.error).not.toBeNull();
    await failSquareOAuth(intentId, ctx.userId, "pending", connection.merchantId);
    await failSquareOAuth(intentId, ctx.userId, "confirmed", connection.merchantId);
    expect(sql(`select cleanup_state from private.square_oauth_intents where id='${intentId}'`)).toEqual(["confirmed"]);
    expect((await admin.from("brewery_users").update({ role: "warehouse" }).eq("brewery_id", brewery.id).eq("user_id", ctx.userId)).error)
      .toBeNull();
    release();
    await expect(pending).resolves.toEqual({ disconnected: true, remoteRevocationState: "confirmed" });
    expect((await admin.from("brewery_users").update({ role: "admin" }).eq("brewery_id", brewery.id).eq("user_id", ctx.userId)).error)
      .toBeNull();

    const nextOauth = new URL((await beginSquareOAuth(ctx, new SquareClient(config, vi.fn()), "reconnect", crypto.randomUUID())).authorizeUrl);
    const nextClaim = await admin.rpc("claim_square_oauth", { p_state_hash: hash(nextOauth.searchParams.get("state")!),
      p_actor: ctx.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri });
    const nextIntent = (nextClaim.data as Array<{ intent_id: string }>)[0].intent_id;
    const completed = await admin.rpc("complete_square_oauth", { p_intent: nextIntent, p_actor: ctx.userId,
      p_merchant_id: connection.merchantId, p_merchant_label: "replacement", p_access_token: "new-access",
      p_refresh_token: "new-refresh", p_access_expires_at: "2026-10-10T00:00:00Z",
      p_granted_scopes: ["ITEMS_READ", "ITEMS_WRITE", "MERCHANT_PROFILE_READ", "ORDERS_READ"], p_locations: [],
    });
    expect(completed.error).toBeNull();

    const late = await admin.rpc("finish_square_disconnect", { p_brewery: brewery.id, p_connection: connection.connectionId,
      p_actor: ctx.userId, p_request_id: requestId, p_revoked: false });
    expect(late.data).toEqual({ disconnected: true, remoteRevocationState: "confirmed" });
    expect((await admin.from("pos_connections").select("state,remote_revocation_state,last_error").eq("id", connection.connectionId).single()).data)
      .toEqual({ state: "connected", remote_revocation_state: "not_requested", last_error: null });
    expect(sql(`select access_token from private.integration_tokens where brewery_id='${brewery.id}' and provider='square'`))
      .toEqual(["new-access"]);
  });

  it("purges the affected current generation and records unresolved OAuth cleanup honestly", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connection = await connected(brewery.id);
    const oauth = new URL((await beginSquareOAuth(ctx, new SquareClient(config, vi.fn()), "reconnect", crypto.randomUUID())).authorizeUrl);
    const claim = await admin.rpc("claim_square_oauth", { p_state_hash: hash(oauth.searchParams.get("state")!),
      p_actor: ctx.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri });
    const intentId = (claim.data as Array<{ intent_id: string }>)[0].intent_id;

    await failSquareOAuth(intentId, ctx.userId, "pending", connection.merchantId);
    expect((await admin.from("pos_connections").select("state,remote_revocation_state,credential_version,last_error")
      .eq("id", connection.connectionId).single()).data).toEqual({ state: "recovery_required",
      remote_revocation_state: "pending", credential_version: 2, last_error: "Square authorization cleanup is pending" });
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}' and provider='square'`)).toEqual(["0"]);

    await failSquareOAuth(intentId, ctx.userId, "unresolved", connection.merchantId);
    expect((await admin.from("pos_connections").select("state,remote_revocation_state,credential_version,last_error")
      .eq("id", connection.connectionId).single()).data).toEqual({ state: "recovery_required",
      remote_revocation_state: "unresolved", credential_version: 2, last_error: "Remote revocation could not be confirmed" });
    expect(sql(`select cleanup_state from private.square_oauth_intents where id='${intentId}'`)).toEqual(["unresolved"]);
  });

  it("serializes concurrent location and variation mappings and reconciles the sale exactly once", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connection = await connected(brewery.id);
    const location = await seedLocation(brewery.id, { name: "Concurrent taproom", kind: "taproom" });
    const catalog = await seedCatalog(brewery.id, { product: "Concurrent", sku: "Concurrent keg", packageType: "keg", bblPerUnit: 0.5 });
    const poured = await admin.from("formats").insert({ brewery_id: brewery.id, brand_id: catalog.brandId,
      name: "Concurrent pint", basis: "poured", ounces: 16 }).select("id").single();
    expect(poured.error).toBeNull();
    expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connection.connectionId,
      external_location_id: "CONCURRENT-L", external_name: "Unmapped" })).error).toBeNull();
    expect((await admin.from("pos_catalog_variations").insert({ brewery_id: brewery.id, connection_id: connection.connectionId,
      external_item_id: "CONCURRENT-I", external_variation_id: "CONCURRENT-V", external_item_name: "Concurrent",
      external_variation_name: "Pint", source_version: 1 })).error).toBeNull();
    expect((await admin.from("pos_item_mappings").insert({ brewery_id: brewery.id, connection_id: connection.connectionId,
      external_item_id: "CONCURRENT-I", external_variation_id: "CONCURRENT-V", ignored: true })).error).toBeNull();
    expect((await admin.from("pos_sales").insert({ brewery_id: brewery.id, connection_id: connection.connectionId,
      external_order_id: "CONCURRENT-O", external_line_id: "1", external_item_id: "CONCURRENT-I",
      external_variation_id: "CONCURRENT-V", external_location_id: "CONCURRENT-L",
      sold_at: "2026-09-10T12:00:00Z", qty: 1 })).error).toBeNull();

    sql(`create function private.test_square_mapping_delay() returns trigger language plpgsql set search_path='' as $$
      begin if coalesce(to_jsonb(new)->>'external_location_id',to_jsonb(new)->>'external_item_id') like 'CONCURRENT-%'
        then perform pg_sleep(0.5); end if; return new; end $$;
      create trigger test_square_location_delay after update on public.pos_locations
        for each row execute function private.test_square_mapping_delay();
      create trigger test_square_item_delay after update on public.pos_item_mappings
        for each row execute function private.test_square_mapping_delay()`);
    try {
      const results = await Promise.allSettled([
        runCommand("set_pos_location_mapping", { posLocationId: "CONCURRENT-L", mgrLocationId: location.id }, ctx,
          { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() }),
        runCommand("set_pos_item_mapping", { externalItemId: "CONCURRENT-I", externalVariationId: "CONCURRENT-V",
          formatId: poured.data!.id, disposition: "mapped" }, ctx,
        { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() }),
      ]);
      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    } finally {
      sql(`drop trigger if exists test_square_location_delay on public.pos_locations;
        drop trigger if exists test_square_item_delay on public.pos_item_mappings;
        drop function if exists private.test_square_mapping_delay()`);
    }
    expect((await admin.from("pos_sale_expectations").select("location_id,format_id,serving_ounces").eq("brewery_id", brewery.id)).data)
      .toEqual([{ location_id: location.id, format_id: poured.data!.id, serving_ounces: 16 }]);
    expect((await admin.from("inventory_movements").select("id").eq("brewery_id", brewery.id)).data).toEqual([]);
  }, 15_000);
});
