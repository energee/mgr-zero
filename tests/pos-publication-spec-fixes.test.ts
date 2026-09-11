import { beforeAll, describe, expect, it, vi } from "vitest";
import { getCommandDefinition, runCommand } from "@/lib/commands/registry";
import { prepareSquareCatalogPublication, publishSquareCatalogItem, SquareClient } from "@/lib/pos";
import { beginSquarePublication, leaseSquarePublication } from "@/lib/supabase/integration-tokens";
import { admin, channelId, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation, sql } from "./helpers";
import "@/lib/commands/all";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/square", environment: "sandbox" as const };
const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

async function fixture(twoBrands = false) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const location = await seedLocation(brewery.id, { name: "Taproom", kind: "taproom" });
  const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id,
    merchant_id: `merchant-${crypto.randomUUID()}`, state: "connected", credential_version: 1,
    catalog_sync_generation: 3 }).select("id").single();
  expect(connection.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${brewery.id}','square','${connection.data!.id}','publication-access-secret','refresh-secret',1)`);
  expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connection.data!.id,
    external_location_id: "L1", external_name: "Taproom", available: true, location_id: location.id })).error).toBeNull();
  const channel = await channelId(brewery.id, "Taproom");
  const addBrand = async (name: string) => {
    const keg = await seedCatalog(brewery.id, { product: name, sku: `${name} half`, packageType: "keg", bblPerUnit: 0.5 });
    const formats: string[] = [];
    for (const [format, ounces, cents] of [["Pint", 16, 700], ["Taster", 5, 350]] as const) {
      const row = await admin.from("formats").insert({ brewery_id: brewery.id, brand_id: keg.brandId,
        name: `${name} ${format}`, basis: "poured", ounces }).select("id").single();
      expect(row.error).toBeNull();
      await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: row.data!.id, cents });
      formats.push(row.data!.id);
    }
    await runCommand("record_movement", { skuId: keg.skuId, locationId: location.id, binId: location.binId,
      qty: 1, type: "opening_balance" }, ctx, execution());
    return { brandId: keg.brandId, formats };
  };
  const first = await addBrand("Hazy");
  const second = twoBrands ? await addBrand("Pils") : null;
  await runCommand("configure_pos_menu", { posLocationId: "L1", binId: location.binId, saleChannelId: channel }, ctx, execution());
  return { brewery, ctx, connectionId: connection.data!.id, first, second };
}

beforeAll(() => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
  expect(process.env.DATABASE_URL).toContain(":54352/");
});

describe("Square parent-item publication corrections", () => {
  it("creates one brand item containing every publishable format variation", () => {
    const prepared = prepareSquareCatalogPublication({ brandId: "BRAND", brand: "Hazy", catalogGroup: "poured",
      locationId: "L1", ownership: "mgr", externalItemId: null, variations: [
        { formatId: "PINT", format: "Pint", priceCents: 700, present: true, externalVariationId: null },
        { formatId: "TASTER", format: "Taster", priceCents: 350, present: true, externalVariationId: null },
      ] });
    expect(prepared.object).toMatchObject({ type: "ITEM", id: "#mgr-item-BRAND-poured", item_data: { variations: [
      { id: "#mgr-variation-PINT", item_variation_data: { item_id: "#mgr-item-BRAND-poured", price_money: { amount: 700 } } },
      { id: "#mgr-variation-TASTER", item_variation_data: { item_id: "#mgr-item-BRAND-poured", price_money: { amount: 350 } } },
    ] } });
  });

  it("exposes location-wide menu publication and brand-wide item publication inputs", () => {
    expect(getCommandDefinition("publish_pos_menu")!.input.safeParse({ posLocationId: "L1" }).success).toBe(true);
    expect(getCommandDefinition("publish_pos_menu")!.input.safeParse({ posLocationId: "L1", formatId: crypto.randomUUID() }).success).toBe(false);
    expect(getCommandDefinition("publish_pos_item")!.input.safeParse({ posLocationId: "L1", brandId: crypto.randomUUID() }).success).toBe(true);
  });

  it("terminally supersedes stale credential and catalog generations so current work can start", async () => {
    const { brewery, ctx, connectionId, first, second } = await fixture(true);
    const oldCredential = await beginSquarePublication(ctx, { posLocationId: "L1", brandId: first.brandId },
      crypto.randomUUID(), "publish_pos_item");
    sql(`update public.pos_connections set credential_version=2 where id='${connectionId}';
      update private.integration_tokens set credential_version=2 where connection_id='${connectionId}'`);
    const currentCredential = await beginSquarePublication(ctx, { posLocationId: "L1", brandId: second!.brandId },
      crypto.randomUUID(), "publish_pos_item");
    expect(currentCredential.credentialVersion).toBe(2);
    expect(sql(`select status||':'||error_code from private.square_publications where id='${oldCredential.attemptId}'`))
      .toEqual(["superseded:credential_changed"]);

    const oldCatalog = currentCredential;
    sql(`update public.pos_connections set catalog_sync_generation=catalog_sync_generation+1 where id='${connectionId}'`);
    await expect(leaseSquarePublication(ctx, oldCatalog.attemptId)).rejects.toMatchObject({ status: 409 });
    expect(sql(`select status||':'||error_code from private.square_publications where id='${oldCatalog.attemptId}'`))
      .toEqual(["superseded:catalog_changed"]);
    const currentCatalog = await beginSquarePublication(ctx, { posLocationId: "L1", brandId: second!.brandId },
      crypto.randomUUID(), "publish_pos_item");
    expect(currentCatalog.catalogGeneration).toBe(4);
  });

  it("durably rejects a missing owned provider item and unblocks another brand", async () => {
    const { brewery, ctx, connectionId, first, second } = await fixture(true);
    sql(`insert into public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership)
      values('${brewery.id}','${connectionId}','${first.brandId}','poured','MISSING-ITEM','mgr')`);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ errors: [{ code: "NOT_FOUND" }] }), { status: 404 }));
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", brandId: first.brandId }, crypto.randomUUID(),
      new SquareClient(config, fetch), "publish_pos_item")).rejects.toMatchObject({ status: 409 });
    expect(sql(`select status||':'||error_code from private.square_publications where brand_id='${first.brandId}'`))
      .toEqual(["rejected:provider_missing"]);
    const next = await beginSquarePublication(ctx, { posLocationId: "L1", brandId: second!.brandId },
      crypto.randomUUID(), "publish_pos_item");
    expect(next.status).toBe("needs_snapshot");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
