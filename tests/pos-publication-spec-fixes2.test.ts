import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import { beginSquareOAuth, publishSquareCatalogItem, publishSquareMenu, SquareClient } from "@/lib/pos";
import { beginSquareCatalogSync, beginSquarePublication, recordSquareCatalogSnapshot } from "@/lib/supabase/integration-tokens";
import { admin, channelId, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation, sql } from "./helpers";
import "@/lib/commands/all";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

async function fixture(role: "admin" | "warehouse" = "admin") {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, role);
  const location = await seedLocation(brewery.id, { name: "Taproom", kind: "taproom" });
  const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id,
    merchant_id: `merchant-${crypto.randomUUID()}`, state: "connected", credential_version: 1,
    catalog_sync_generation: 0 }).select("id,merchant_id").single();
  expect(connection.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${brewery.id}','square','${connection.data!.id}','publication-access','refresh-secret',1)`);
  expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connection.data!.id,
    external_location_id: "L1", external_name: "Taproom", available: true, location_id: location.id })).error).toBeNull();
  const channel = await channelId(brewery.id, "Taproom");
  await runCommand("configure_pos_menu", { posLocationId: "L1", binId: location.binId, saleChannelId: channel }, ctx, execution());
  const addBrand = async (name: string, poured = true) => {
    const keg = await seedCatalog(brewery.id, { product: name, sku: `${name} half`, packageType: "keg", bblPerUnit: 0.5 });
    let formatId: string | null = null;
    if (poured) {
      const format = await admin.from("formats").insert({ brewery_id: brewery.id, brand_id: keg.brandId,
        name: `${name} Pint`, basis: "poured", ounces: 16 }).select("id").single();
      expect(format.error).toBeNull();
      formatId = format.data!.id;
      await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: format.data!.id, cents: 700 });
    }
    await runCommand("record_movement", { skuId: keg.skuId, locationId: location.id, binId: location.binId,
      qty: 1, type: "opening_balance" }, ctx, execution());
    return { ...keg, formatId };
  };
  return { brewery, ctx, location, connectionId: connection.data!.id as string,
    merchantId: connection.data!.merchant_id as string, channel, addBrand };
}

const createResponse = (body: Record<string, any>, itemId: string) => {
  const variations = body.object.item_data.variations.map((variation: Record<string, any>, index: number) => ({
    ...variation, id: `${itemId}-V${index + 1}`, version: 2,
    item_variation_data: { ...variation.item_variation_data, item_id: itemId },
  }));
  return new Response(JSON.stringify({ catalog_object: { ...body.object, id: itemId, version: 2,
    item_data: { ...body.object.item_data, variations } }, id_mappings: [
    { client_object_id: body.object.id, object_id: itemId },
    ...body.object.item_data.variations.map((variation: Record<string, any>, index: number) => ({
      client_object_id: variation.id, object_id: `${itemId}-V${index + 1}`,
    })),
  ] }), { status: 200 });
};

describe("Square publication residual specification fences", () => {
  it("freezes the complete top-level menu manifest, retires disappeared owned brands, and replays exactly", async () => {
    const f = await fixture();
    await f.addBrand("Active");
    const disappeared = await f.addBrand("Disappeared", false);
    sql(`insert into public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership)
      values('${f.brewery.id}','${f.connectionId}','${disappeared.brandId}','poured','OLD-DISAPPEARED','mgr')`);
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      if (String(input).includes("/v2/catalog/object/OLD-DISAPPEARED")) return new Response(JSON.stringify({ object: {
        type: "ITEM", id: "OLD-DISAPPEARED", version: 5, present_at_all_locations: false,
        present_at_location_ids: ["L1"], item_data: { name: "Disappeared", variations: [] },
      } }), { status: 200 });
      const body = JSON.parse(String(init?.body)) as Record<string, any>;
      if (String(body.object.id).startsWith("#")) return createResponse(body, "ACTIVE-ITEM");
      return new Response(JSON.stringify({ catalog_object: { ...body.object, version: 6 }, id_mappings: [] }), { status: 200 });
    });
    const requestId = crypto.randomUUID();
    const first = await publishSquareMenu(f.ctx, { posLocationId: "L1" }, requestId, new SquareClient(config, fetch));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sql(`select jsonb_array_length(manifest) from private.square_menu_publications
      where brewery_id='${f.brewery.id}'`)).toEqual(["2"]);
    expect(sql(`select retired_at is not null from public.pos_catalog_items where brewery_id='${f.brewery.id}'
      and external_item_id='OLD-DISAPPEARED'`)).toEqual(["t"]);

    await f.addBrand("Added later");
    await expect(publishSquareMenu(f.ctx, { posLocationId: "L1" }, requestId, new SquareClient(config, fetch))).resolves.toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("archives old-seller attempts and clears ownership before the replacement seller publishes", async () => {
    const f = await fixture();
    const owned = await f.addBrand("Owned");
    const pending = await f.addBrand("Pending");
    sql(`insert into public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership)
      values('${f.brewery.id}','${f.connectionId}','${owned.brandId}','poured','SELLER-A-ITEM','mgr');
      insert into public.pos_catalog_ownership(brewery_id,connection_id,brand_id,catalog_group,format_id,external_item_id,external_variation_id)
      values('${f.brewery.id}','${f.connectionId}','${owned.brandId}','poured','${owned.formatId}','SELLER-A-ITEM','SELLER-A-VAR')`);
    const prior = await beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: pending.brandId },
      crypto.randomUUID(), "publish_pos_item");
    const eventPublication = sql(`insert into private.square_publications(brewery_id,connection_id,actor_id,request_id,command_name,
      credential_version,catalog_generation,external_location_id,brand_id,catalog_group,ownership_intent,external_item_id,
      source_snapshot,status,result,finished_at)
      values('${f.brewery.id}','${f.connectionId}','${f.ctx.userId}','${crypto.randomUUID()}','publish_pos_item',1,0,'L1',
        '${owned.brandId}','poured','mgr','SELLER-A-ITEM','{}','succeeded','{"published":true}',now()) returning id`)[0]!;
    sql(`insert into private.square_publication_events(publication_id,brewery_id,connection_id,brand_id,catalog_group,
      format_id,external_item_id,external_variation_id,ownership,present)
      values('${eventPublication}','${f.brewery.id}','${f.connectionId}','${owned.brandId}','poured','${owned.formatId}',
        'SELLER-A-ITEM','SELLER-A-VAR','mgr',true)`);
    const staleSync = await beginSquareCatalogSync(f.ctx, crypto.randomUUID());
    if ("replayResult" in staleSync) throw new Error("unexpected replay");

    const oauth = new URL((await beginSquareOAuth(f.ctx, new SquareClient(config, vi.fn()), "reconnect", crypto.randomUUID())).authorizeUrl);
    const claim = await admin.rpc("claim_square_oauth", { p_state_hash: hash(oauth.searchParams.get("state")!),
      p_actor: f.ctx.userId, p_brewery: f.brewery.id, p_redirect_uri: config.redirectUri });
    const intentId = (claim.data as Array<{ intent_id: string }>)[0]!.intent_id;
    const replacement = await admin.rpc("complete_square_oauth", { p_intent: intentId, p_actor: f.ctx.userId,
      p_merchant_id: `seller-b-${crypto.randomUUID()}`, p_merchant_label: "Seller B", p_access_token: "seller-b-access",
      p_refresh_token: "seller-b-refresh", p_access_expires_at: "2026-10-10T00:00:00Z",
      p_granted_scopes: ["ITEMS_READ", "ITEMS_WRITE", "MERCHANT_PROFILE_READ", "ORDERS_READ"],
      p_locations: [{ id: "L1", name: "Seller B Taproom", status: "ACTIVE" }] });
    expect(replacement.error).toBeNull();
    expect(sql(`select count(*) from public.pos_catalog_items where connection_id='${f.connectionId}';
      select count(*) from public.pos_catalog_ownership where connection_id='${f.connectionId}';
      select count(*) from private.square_publication_events where connection_id='${f.connectionId}';
      select status||':'||error_code from private.square_publications where id='${prior.attemptId}'`))
      .toEqual(["0", "0", "1", "superseded:connection_changed"]);

    await runCommand("set_pos_location_mapping", { posLocationId: "L1", mgrLocationId: f.location.id }, f.ctx, execution());
    await runCommand("configure_pos_menu", { posLocationId: "L1", binId: f.location.binId, saleChannelId: f.channel }, f.ctx, execution());
    const requestId = crypto.randomUUID();
    const start = await beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: owned.brandId }, requestId, "publish_pos_item");
    expect(start.source.externalItemId).toBeNull();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) =>
      createResponse(JSON.parse(String(init?.body)), "SELLER-B-ITEM"));
    await expect(publishSquareCatalogItem(f.ctx, { posLocationId: "L1", brandId: owned.brandId }, requestId,
      new SquareClient(config, fetch), "publish_pos_item")).resolves.toMatchObject({ externalItemId: "SELLER-B-ITEM" });
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(recordSquareCatalogSnapshot(f.ctx, staleSync, {
      locations: [{ id: "SELLER-A-LATE", name: "Seller A late location", status: "ACTIVE" }],
      variations: [{ itemId: "SELLER-A-LATE-ITEM", itemName: "Seller A late item",
        variationId: "SELLER-A-LATE-VAR", variationName: "Seller A late variation", version: 9, available: true }],
    })).resolves.toEqual({ synced: false, superseded: true, errorCode: "connection_changed" });
    expect(sql(`select result->>'errorCode' from private.command_requests
        where actor_id='${f.ctx.userId}' and request_id='${staleSync.requestId}';
      select count(*) from public.pos_locations where connection_id='${f.connectionId}' and external_location_id='SELLER-A-LATE';
      select count(*) from public.pos_catalog_variations where connection_id='${f.connectionId}' and external_item_id='SELLER-A-LATE-ITEM'`))
      .toEqual(["connection_changed", "0", "0"]);
  });

  it("terminally settles an unfinished catalog sync when OAuth reconnects the same seller", async () => {
    const f = await fixture();
    const brand = await f.addBrand("Same seller reconnect");
    const staleSync = await beginSquareCatalogSync(f.ctx, crypto.randomUUID());
    if ("replayResult" in staleSync) throw new Error("unexpected replay");

    const oauth = new URL((await beginSquareOAuth(f.ctx, new SquareClient(config, vi.fn()), "reconnect", crypto.randomUUID())).authorizeUrl);
    const claim = await admin.rpc("claim_square_oauth", { p_state_hash: hash(oauth.searchParams.get("state")!),
      p_actor: f.ctx.userId, p_brewery: f.brewery.id, p_redirect_uri: config.redirectUri });
    const intentId = (claim.data as Array<{ intent_id: string }>)[0]!.intent_id;
    const reconnect = await admin.rpc("complete_square_oauth", { p_intent: intentId, p_actor: f.ctx.userId,
      p_merchant_id: f.merchantId, p_merchant_label: "Same seller", p_access_token: "same-seller-access-2",
      p_refresh_token: "same-seller-refresh-2", p_access_expires_at: "2026-10-10T00:00:00Z",
      p_granted_scopes: ["ITEMS_READ", "ITEMS_WRITE", "MERCHANT_PROFILE_READ", "ORDERS_READ"],
      p_locations: [{ id: "L1", name: "Taproom", status: "ACTIVE" }] });
    expect(reconnect.error).toBeNull();
    expect(sql(`select credential_version from public.pos_connections where id='${f.connectionId}';
      select result->>'errorCode' from private.command_requests
        where actor_id='${f.ctx.userId}' and request_id='${staleSync.requestId}'`)).toEqual(["2", "connection_changed"]);

    const provider = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) =>
      createResponse(JSON.parse(String(init?.body)), "SAME-SELLER-ITEM-2"));
    await expect(publishSquareCatalogItem(f.ctx, { posLocationId: "L1", brandId: brand.brandId }, crypto.randomUUID(),
      new SquareClient(config, provider), "publish_pos_item")).resolves.toMatchObject({ externalItemId: "SAME-SELLER-ITEM-2" });
    expect(provider).toHaveBeenCalledTimes(1);
    await expect(recordSquareCatalogSnapshot(f.ctx, staleSync, {
      locations: [{ id: "STALE-CREDENTIAL-L", name: "Stale credential location", status: "ACTIVE" }],
      variations: [{ itemId: "STALE-CREDENTIAL-I", itemName: "Stale credential item",
        variationId: "STALE-CREDENTIAL-V", variationName: "Stale credential variation", version: 3, available: true }],
    })).resolves.toEqual({ synced: false, superseded: true, errorCode: "connection_changed" });
    expect(sql(`select count(*) from public.pos_locations where connection_id='${f.connectionId}' and external_location_id='STALE-CREDENTIAL-L';
      select count(*) from public.pos_catalog_variations where connection_id='${f.connectionId}' and external_item_id='STALE-CREDENTIAL-I'`))
      .toEqual(["0", "0"]);
  });

  it("advances only the committed catalog generation and supersedes publication when a delayed snapshot lands", async () => {
    const f = await fixture();
    const brand = await f.addBrand("Concurrent");
    const publication = await beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: brand.brandId },
      crypto.randomUUID(), "publish_pos_item");
    expect(publication.catalogGeneration).toBe(0);
    const sync = await beginSquareCatalogSync(f.ctx, crypto.randomUUID());
    if ("replayResult" in sync) throw new Error("unexpected replay");
    expect(sql(`select catalog_sync_generation from public.pos_connections where id='${f.connectionId}'`)).toEqual(["0"]);

    sql(`insert into public.pos_catalog_variations(brewery_id,connection_id,external_item_id,external_variation_id,
      external_item_name,external_variation_name,source_version,available,last_seen_at)
      values('${f.brewery.id}','${f.connectionId}','I-OLD','V-OLD','Old','Old',7,true,now()),
        ('${f.brewery.id}','${f.connectionId}','I-NEW','V-NEW','New','New',9,true,now())`);
    await expect(recordSquareCatalogSnapshot(f.ctx, sync, { locations: [{ id: "L1", name: "Taproom", status: "ACTIVE" }],
      variations: [{ itemId: "I-OLD", itemName: "Old", variationId: "V-OLD", variationName: "Old",
        version: 6, available: true }] })).resolves.toEqual({ locations: 1, variations: 2 });
    expect(sql(`select catalog_sync_generation from public.pos_connections where id='${f.connectionId}';
      select status||':'||error_code from private.square_publications where id='${publication.attemptId}';
      select external_variation_id||':'||source_version||':'||available from public.pos_catalog_variations
        where connection_id='${f.connectionId}' order by external_variation_id`))
      .toEqual(["1", "superseded:catalog_changed", "V-NEW:9:true", "V-OLD:7:true"]);
    await expect(beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: brand.brandId },
      crypto.randomUUID(), "publish_pos_item")).resolves.toMatchObject({ catalogGeneration: 1 });
  });
});
