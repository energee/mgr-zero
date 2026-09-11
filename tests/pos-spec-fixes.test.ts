import { describe, expect, it, vi } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { SquareClient, syncSquareCatalog } from "@/lib/pos";
import { beginSquareCatalogSync, recordSquareCatalogSnapshot } from "@/lib/supabase/integration-tokens";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const };

async function connected(breweryId: string) {
  const merchantId = `merchant-${crypto.randomUUID()}`;
  const connection = await admin.from("pos_connections").insert({ brewery_id: breweryId, merchant_id: merchantId,
    state: "connected", credential_version: 1, access_expires_at: "2099-01-01T00:00:00Z" }).select("id").single();
  expect(connection.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${breweryId}','square','${connection.data!.id}','access-secret','refresh-secret',1)`);
  return { connectionId: connection.data!.id as string, merchantId };
}

const facts = (suffix: string, version: number) => ({
  locations: [{ id: `L-${suffix}`, name: `Location ${suffix}`, status: "ACTIVE" }],
  variations: [{ itemId: `I-${suffix}`, itemName: `Item ${suffix}`, variationId: `V-${suffix}`,
    variationName: `Variation ${suffix}`, version, available: true }],
});

describe("Square reviewed sync invariants", () => {
  it("recovers an exact completed sync before reading credentials or contacting Square", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const { connectionId, merchantId } = await connected(brewery.id);
    const requestId = crypto.randomUUID();
    const firstFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ locations: [
        { id: "L1", name: "Taproom", status: "ACTIVE", merchant_id: merchantId },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ objects: [
        { type: "ITEM_VARIATION", id: "V1", version: 1, item_variation_data: { item_id: "I1", name: "Pint" } },
      ] }), { status: 200 }));
    const first = await syncSquareCatalog(ctx, requestId, new SquareClient(config, firstFetch));
    expect(first).toEqual({ locations: 1, variations: 1 });
    sql(`delete from private.integration_tokens where brewery_id='${brewery.id}' and provider='square';
      update public.pos_connections set state='disconnected',credential_version=credential_version+1 where id='${connectionId}'`);

    const retryFetch = vi.fn<typeof globalThis.fetch>();
    await expect(syncSquareCatalog(ctx, requestId, new SquareClient(config, retryFetch))).resolves.toEqual(first);
    expect(retryFetch).not.toHaveBeenCalled();
  });

  it("lets only the newest captured catalog generation write and rejects reconnect contamination", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const { connectionId } = await connected(brewery.id);
    const old = await beginSquareCatalogSync(ctx, crypto.randomUUID());
    const current = await beginSquareCatalogSync(ctx, crypto.randomUUID());
    if ("replayResult" in old || "replayResult" in current) throw new Error("unexpected replay");

    await expect(recordSquareCatalogSnapshot(ctx, old, facts("old", 1))).rejects.toMatchObject({ status: 409 });
    await expect(recordSquareCatalogSnapshot(ctx, current, facts("current", 2))).resolves.toEqual({ locations: 1, variations: 1 });
    expect(sql(`select external_variation_id from public.pos_catalog_variations where brewery_id='${brewery.id}'`)).toEqual(["V-current"]);

    const stale = await beginSquareCatalogSync(ctx, crypto.randomUUID());
    if ("replayResult" in stale) throw new Error("unexpected replay");
    sql(`delete from public.pos_catalog_variations where brewery_id='${brewery.id}';
      delete from public.pos_locations where brewery_id='${brewery.id}';
      update public.pos_connections set merchant_id='replacement-${crypto.randomUUID()}',credential_version=credential_version+1 where id='${connectionId}';
      insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
      select brewery_id,'square',id,'new-access','new-refresh',credential_version from public.pos_connections where id='${connectionId}'`);
    await expect(recordSquareCatalogSnapshot(ctx, stale, facts("foreign", 3))).rejects.toMatchObject({ status: 409 });
    expect(sql(`select count(*) from public.pos_catalog_variations where brewery_id='${brewery.id}'`)).toEqual(["0"]);
  });

  it("marks only the rejected current credential terminal while transient and stale failures stay connected", async () => {
    const terminalBrewery = await makeBrewery();
    const terminalCtx = await makeStaffCtx(terminalBrewery.id, "admin");
    const terminal = await connected(terminalBrewery.id);
    const terminalFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      errors: [{ category: "AUTHENTICATION_ERROR", code: "UNAUTHORIZED", detail: "access-secret must never persist" }],
    }), { status: 401 }));
    await expect(syncSquareCatalog(terminalCtx, crypto.randomUUID(), new SquareClient(config, terminalFetch))).rejects.toThrow("Square is unavailable");
    expect((await admin.from("pos_connections").select("state,last_error").eq("id", terminal.connectionId).single()).data)
      .toEqual({ state: "recovery_required", last_error: "Square authorization expired or was revoked" });

    const revokedBrewery = await makeBrewery();
    const revokedCtx = await makeStaffCtx(revokedBrewery.id, "admin");
    const revoked = await connected(revokedBrewery.id);
    expect((await admin.from("pos_connections").update({ access_expires_at: "2020-01-01T00:00:00Z" }).eq("id", revoked.connectionId)).error).toBeNull();
    const revokedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ type: "invalid_grant" }), { status: 400 }));
    await expect(syncSquareCatalog(revokedCtx, crypto.randomUUID(), new SquareClient(config, revokedFetch))).rejects.toThrow("Square is unavailable");
    expect((await admin.from("pos_connections").select("state,last_error").eq("id", revoked.connectionId).single()).data)
      .toEqual({ state: "recovery_required", last_error: "Square authorization expired or was revoked" });

    const transientBrewery = await makeBrewery();
    const transientCtx = await makeStaffCtx(transientBrewery.id, "admin");
    const transient = await connected(transientBrewery.id);
    const transientFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(syncSquareCatalog(transientCtx, crypto.randomUUID(), new SquareClient(config, transientFetch))).rejects.toThrow("Square is unavailable");
    expect((await admin.from("pos_connections").select("state,last_error").eq("id", transient.connectionId).single()).data)
      .toEqual({ state: "connected", last_error: null });

    const staleBrewery = await makeBrewery();
    const staleCtx = await makeStaffCtx(staleBrewery.id, "admin");
    const stale = await connected(staleBrewery.id);
    let release!: (response: Response) => void;
    const staleFetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => { release = resolve; }));
    const pending = syncSquareCatalog(staleCtx, crypto.randomUUID(), new SquareClient(config, staleFetch));
    await vi.waitFor(() => expect(staleFetch).toHaveBeenCalledTimes(1));
    sql(`update public.pos_connections set credential_version=2 where id='${stale.connectionId}';
      update private.integration_tokens set credential_version=2,access_token='replacement-access' where brewery_id='${staleBrewery.id}' and provider='square'`);
    release(new Response(JSON.stringify({ errors: [{ category: "AUTHENTICATION_ERROR", code: "UNAUTHORIZED" }] }), { status: 401 }));
    await expect(pending).rejects.toThrow("Square is unavailable");
    expect((await admin.from("pos_connections").select("state,last_error,credential_version").eq("id", stale.connectionId).single()).data)
      .toEqual({ state: "connected", last_error: null, credential_version: 2 });
  });

  it("advances a captured catalog attempt through a successful credential refresh", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connection = await connected(brewery.id);
    expect((await admin.from("pos_connections").update({ access_expires_at: "2020-01-01T00:00:00Z" })
      .eq("id", connection.connectionId)).error).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "refreshed-access", refresh_token: "refreshed-refresh",
        expires_at: "2026-10-10T00:00:00Z", merchant_id: connection.merchantId,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ locations: [
        { id: "L-refresh", name: "Refreshed taproom", status: "ACTIVE", merchant_id: connection.merchantId },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ objects: [
        { type: "ITEM_VARIATION", id: "V-refresh", version: 1,
          item_variation_data: { item_id: "I-refresh", name: "Pint" } },
      ] }), { status: 200 }));

    await expect(syncSquareCatalog(ctx, crypto.randomUUID(), new SquareClient(config, fetch)))
      .resolves.toEqual({ locations: 1, variations: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((await admin.from("pos_connections").select("state,credential_version").eq("id", connection.connectionId).single()).data)
      .toEqual({ state: "connected", credential_version: 2 });
    expect(sql(`select external_variation_id from public.pos_catalog_variations where brewery_id='${brewery.id}'`))
      .toEqual(["V-refresh"]);
  });

  it("returns stable complete location and variation projections beyond the PostgREST cap", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const warehouseCtx = await makeStaffCtx(brewery.id, "warehouse");
    const { connectionId } = await connected(brewery.id);
    const mappedLocation = await seedLocation(brewery.id, { name: "Mapped taproom", kind: "taproom" });
    const catalog = await seedCatalog(brewery.id, { product: "Paged", sku: "Paged case" });
    const ids = Array.from({ length: 1005 }, (_, index) => String(index).padStart(4, "0"));
    expect((await admin.from("pos_locations").insert(ids.map((id, index) => ({ brewery_id: brewery.id,
      connection_id: connectionId, external_location_id: `L${id}`, external_name: `Location ${id}`,
      location_id: index === ids.length - 1 ? mappedLocation.id : null })))).error).toBeNull();
    expect((await admin.from("pos_catalog_variations").insert(ids.map((id) => ({ brewery_id: brewery.id,
      connection_id: connectionId, external_item_id: `I${id}`, external_variation_id: `V${id}`,
      external_item_name: `Item ${id}`, external_variation_name: `Variation ${id}`, source_version: Number(id) })))).error).toBeNull();
    expect((await admin.from("pos_item_mappings").insert(ids.map((id, index) => ({ brewery_id: brewery.id,
      connection_id: connectionId, external_item_id: `I${id}`, external_variation_id: `V${id}`,
      ignored: index !== ids.length - 1, sku_id: index === ids.length - 1 ? catalog.skuId : null })))).error).toBeNull();

    const locations = await runCommand("list_pos_locations", {}, ctx) as Array<Record<string, unknown>>;
    const variations = await runCommand("list_pos_variations", {}, warehouseCtx) as Array<Record<string, unknown>>;
    expect(locations).toHaveLength(1005);
    expect(locations.at(-1)).toMatchObject({ externalLocationId: "L1004", mgrLocationId: mappedLocation.id,
      mappingLabel: "Mapped taproom" });
    expect(variations).toHaveLength(1005);
    expect(variations.at(-1)).toMatchObject({ externalVariationId: "V1004", disposition: "mapped",
      skuId: catalog.skuId, mappingLabel: "SKU · Paged case" });
  }, 30_000);
});
