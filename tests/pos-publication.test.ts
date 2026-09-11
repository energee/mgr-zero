import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepareSquareCatalogPublication, publishSquareCatalogItem, SquareClient } from "@/lib/pos";
import { admin, channelId, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { beginSquarePublication, leaseSquarePublication } from "@/lib/supabase/integration-tokens";
import "@/lib/commands/all";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/square", environment: "sandbox" as const };
const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

async function publicationFixture() {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const location = await seedLocation(brewery.id, { name: "Taproom", kind: "taproom" });
  const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id,
    merchant_id: `merchant-${crypto.randomUUID()}`, state: "connected", credential_version: 1,
  }).select("id").single();
  expect(connection.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${brewery.id}','square','${connection.data!.id}','publication-access-secret','refresh-secret',1)`);
  expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connection.data!.id,
    external_location_id: "L1", external_name: "Square Taproom", external_status: "ACTIVE", location_id: location.id })).error).toBeNull();
  const channel = await channelId(brewery.id, "Taproom");
  const keg = await seedCatalog(brewery.id, { product: "Hazy", sku: "Hazy half", packageType: "keg", bblPerUnit: 0.5 });
  const poured = await admin.from("formats").insert({ brewery_id: brewery.id, brand_id: keg.brandId,
    name: "Pint", basis: "poured", ounces: 16 }).select("id").single();
  expect(poured.error).toBeNull();
  await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: poured.data!.id, cents: 700 });
  await runCommand("record_movement", { skuId: keg.skuId, locationId: location.id, binId: location.binId,
    qty: 1, type: "opening_balance" }, ctx, execution());
  await runCommand("configure_pos_menu", { posLocationId: "L1", binId: location.binId, saleChannelId: channel }, ctx, execution());
  return { brewery, ctx, location, connectionId: connection.data!.id, channel, keg, brandId: keg.brandId, formatId: poured.data!.id };
}

beforeAll(() => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
  expect(process.env.DATABASE_URL).toContain(":54352/");
});

describe("Square durable catalog publication", () => {
  it("preserves seller fields and unrelated locations while changing one owned variation", () => {
    const current = {
      type: "ITEM", id: "ITEM-1", version: 7, updated_at: "readonly", is_deleted: false,
      present_at_all_locations: false, present_at_location_ids: ["L1", "L2"],
      custom_attribute_values: { seller: { string_value: "keep" } },
      item_data: {
        name: "Old name", tax_ids: ["TAX-1"], categories: [{ id: "CAT-1", ordinal: 0 }],
        modifier_list_info: [{ modifier_list_id: "MOD-1" }],
        variations: [
          { type: "ITEM_VARIATION", id: "VAR-1", version: 6, updated_at: "readonly", is_deleted: false,
            present_at_all_locations: false, present_at_location_ids: ["L1", "L2"],
            item_variation_data: { item_id: "ITEM-1", name: "Pint", pricing_type: "FIXED_PRICING",
              price_money: { amount: 600, currency: "USD" }, track_inventory: true,
              location_overrides: [
                { location_id: "L1", price_money: { amount: 625, currency: "USD" }, pricing_type: "FIXED_PRICING",
                  track_inventory: true, sold_out: true, sold_out_valid_until: "2099-01-01T00:00:00Z" },
                { location_id: "L2", price_money: { amount: 650, currency: "USD" }, pricing_type: "FIXED_PRICING", track_inventory: false },
              ] } },
          { type: "ITEM_VARIATION", id: "SELLER-VAR", version: 4, item_variation_data: {
            item_id: "ITEM-1", name: "Food", pricing_type: "VARIABLE_PRICING", user_data: "keep" } },
        ],
      },
    };

    const prepared = prepareSquareCatalogPublication({ brandId: "brand-1", brand: "Hazy IPA", catalogGroup: "poured",
      locationId: "L1", ownership: "adopted", externalItemId: "ITEM-1", variations: [{ formatId: "format-1",
        format: "Pint", priceCents: 700, present: true, externalVariationId: "VAR-1" }] }, current);

    expect(prepared.object).toMatchObject({
      type: "ITEM_VARIATION", id: "VAR-1", version: 6,
      present_at_all_locations: false, present_at_location_ids: ["L1", "L2"],
      item_variation_data: {
        item_id: "ITEM-1", name: "Pint", pricing_type: "FIXED_PRICING",
        price_money: { amount: 600, currency: "USD" }, track_inventory: true,
        location_overrides: [
          { location_id: "L1", price_money: { amount: 700, currency: "USD" }, pricing_type: "FIXED_PRICING", track_inventory: true },
          { location_id: "L2", price_money: { amount: 650, currency: "USD" }, pricing_type: "FIXED_PRICING", track_inventory: false },
        ],
      },
    });
    expect(JSON.stringify(prepared.object)).not.toContain("sold_out");
    expect(current.item_data.tax_ids).toEqual(["TAX-1"]);
    expect(current.item_data.variations[1]).toMatchObject({ id: "SELLER-VAR", item_variation_data: { user_data: "keep" } });

    const addedLocation = prepareSquareCatalogPublication({ brandId: "brand-1", brand: "Hazy IPA", catalogGroup: "poured",
      locationId: "L3", ownership: "adopted", externalItemId: "ITEM-1", variations: [{ formatId: "format-1",
        format: "Pint", priceCents: 725, present: true, externalVariationId: "VAR-1" }] }, current);
    expect(addedLocation.object).toMatchObject({ type: "ITEM", present_at_location_ids: ["L1", "L2", "L3"],
      custom_attribute_values: { seller: { string_value: "keep" } }, item_data: {
        tax_ids: ["TAX-1"], categories: [{ id: "CAT-1", ordinal: 0 }],
        modifier_list_info: [{ modifier_list_id: "MOD-1" }],
        variations: [expect.objectContaining({ id: "VAR-1", present_at_location_ids: ["L1", "L2", "L3"] }),
          expect.objectContaining({ id: "SELLER-VAR", item_variation_data: expect.objectContaining({ user_data: "keep" }) })],
      } });

    const retired = prepareSquareCatalogPublication({ brandId: "brand-1", brand: "Hazy IPA", catalogGroup: "poured",
      locationId: "L1", ownership: "mgr", externalItemId: "ITEM-1", variations: [{ formatId: "format-1",
        format: "Pint", priceCents: 700, present: false, externalVariationId: "VAR-1" }] }, current);
    expect(retired.object).toMatchObject({ id: "VAR-1", present_at_all_locations: false, present_at_location_ids: ["L2"] });
    expect(retired.object).not.toHaveProperty("is_archived");
  });

  it("persists the exact body and key before I/O, replays unknown outcomes, and records owned identity", async () => {
    const { brewery, ctx, brandId, formatId } = await publicationFixture();

    const remote = new Map<string, unknown>();
    let lose = true;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => {
      const body = String(init?.body);
      const parsed = JSON.parse(body);
      const persisted = sql(`select provider_key::text||'|'||request_body from private.square_publications where brewery_id='${brewery.id}'`)[0];
      expect(persisted).toBe(`${parsed.idempotency_key}|${body}`);
      expect(body).not.toContain("publication-access-secret");
      const response = remote.get(parsed.idempotency_key) ?? {
        catalog_object: { ...parsed.object, id: "ITEM-REMOTE", version: 11,
          item_data: { ...parsed.object.item_data, variations: parsed.object.item_data.variations.map((v: any) => ({ ...v, id: "VAR-REMOTE", version: 11,
            item_variation_data: { ...v.item_variation_data, item_id: "ITEM-REMOTE" } })) } },
        id_mappings: [{ client_object_id: parsed.object.id, object_id: "ITEM-REMOTE" },
          { client_object_id: parsed.object.item_data.variations[0].id, object_id: "VAR-REMOTE" }],
      };
      remote.set(parsed.idempotency_key, response);
      if (lose) { lose = false; throw new TypeError("socket closed after commit"); }
      return new Response(JSON.stringify(response), { status: 200 });
    });
    const client = new SquareClient(config, fetch);
    const requestId = crypto.randomUUID();

    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", brandId }, requestId, client, "publish_pos_menu"))
      .rejects.toThrow("Square is unavailable");
    expect(sql(`select status from private.square_publications where brewery_id='${brewery.id}'`)).toEqual(["prepared"]);
    expect((await admin.from("channel_prices").update({ unit_price_cents: 999 }).eq("brewery_id", brewery.id)).error).toBeNull();
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", brandId }, requestId, client, "publish_pos_menu"))
      .resolves.toMatchObject({ published: true, externalItemId: "ITEM-REMOTE",
        variations: [expect.objectContaining({ formatId, externalVariationId: "VAR-REMOTE" })] });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]?.body).toBe(fetch.mock.calls[1][1]?.body);
    expect(String(fetch.mock.calls[1][1]?.body)).toContain('"amount":700');
    expect(remote).toHaveLength(1);
    expect(sql(`select i.ownership||'|'||o.external_item_id||'|'||o.external_variation_id from public.pos_catalog_ownership o
      join public.pos_catalog_items i on i.connection_id=o.connection_id and i.brand_id=o.brand_id and i.catalog_group=o.catalog_group
      where o.format_id='${formatId}'`))
      .toEqual(["mgr|ITEM-REMOTE|VAR-REMOTE"]);
    expect(sql(`select present::text from private.square_publication_events where brewery_id='${brewery.id}'`)).toEqual(["true"]);
  });

  it("requires verified adoption and a new snapshot/key after a known version conflict", async () => {
    const { brewery, ctx, connectionId, brandId, formatId } = await publicationFixture();
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", brandId,
      adoptItemId: "UNKNOWN", adoptVariationId: "UNKNOWN-VAR" }, crypto.randomUUID(), new SquareClient(config, vi.fn()), "publish_pos_item"))
      .rejects.toThrow("Square adoption must select one observed mapped brand variation");
    expect((await admin.from("pos_catalog_variations").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_item_id: "SELLER-ITEM", external_variation_id: "SELLER-VAR", external_item_name: "Seller name",
      external_variation_name: "Old pint", source_version: 6, available: true })).error).toBeNull();
    expect((await admin.from("pos_item_mappings").insert({ brewery_id: brewery.id, connection_id: connectionId,
      external_item_id: "SELLER-ITEM", external_variation_id: "SELLER-VAR", external_item_name: "Seller name",
      format_id: formatId, ignored: false })).error).toBeNull();

    let generation = 1;
    const bodies: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      if (!init?.method) return new Response(JSON.stringify({ object: {
        type: "ITEM", id: "SELLER-ITEM", version: generation === 1 ? 7 : 8,
        present_at_all_locations: false, present_at_location_ids: ["L1", "L2"],
        item_data: { name: "Seller name", tax_ids: ["TAX-1"], modifier_list_info: [{ modifier_list_id: "MOD-1" }], variations: [
          { type: "ITEM_VARIATION", id: "SELLER-VAR", version: generation === 1 ? 6 : 7,
            present_at_all_locations: false, present_at_location_ids: ["L1", "L2"], item_variation_data: {
              item_id: "SELLER-ITEM", name: "Old pint", pricing_type: "FIXED_PRICING",
              price_money: { amount: 600, currency: "USD" }, track_inventory: true,
              location_overrides: [{ location_id: "L2", pricing_type: "FIXED_PRICING", price_money: { amount: 650, currency: "USD" }, track_inventory: false }],
            } },
          { type: "ITEM_VARIATION", id: "FOOD", version: 2, item_variation_data: { item_id: "SELLER-ITEM", name: "Food" } },
        ] },
      } }), { status: 200 });
      bodies.push(String(init.body));
      if (generation === 1) return new Response(JSON.stringify({ errors: [{ code: "VERSION_MISMATCH" }] }), { status: 409 });
      return new Response(JSON.stringify({ catalog_object: { type: "ITEM_VARIATION", id: "SELLER-VAR", version: 8,
        item_variation_data: { item_id: "SELLER-ITEM" } } }), { status: 200 });
    });
    const client = new SquareClient(config, fetch);
    const adoption = { posLocationId: "L1", brandId, adoptItemId: "SELLER-ITEM", adoptVariationId: "SELLER-VAR" };
    await expect(publishSquareCatalogItem(ctx, adoption, crypto.randomUUID(), client, "publish_pos_item"))
      .rejects.toMatchObject({ status: 409 });
    await expect(publishSquareCatalogItem(ctx, adoption, crypto.randomUUID(), client, "publish_pos_item"))
      .rejects.toMatchObject({ status: 409 });
    expect(bodies).toHaveLength(1);

    generation = 2;
    await expect(publishSquareCatalogItem(ctx, { ...adoption, retryConflict: true }, crypto.randomUUID(), client, "publish_pos_item"))
      .resolves.toMatchObject({ published: true, ownership: "adopted" });
    expect(bodies).toHaveLength(2);
    expect(JSON.parse(bodies[0]).object).toMatchObject({ id: "SELLER-VAR", version: 6,
      item_variation_data: { location_overrides: [{ location_id: "L2", track_inventory: false }, { location_id: "L1", price_money: { amount: 700 } }] } });
    expect(JSON.parse(bodies[1]).object.version).toBe(7);
    expect(JSON.parse(bodies[0]).idempotency_key).not.toBe(JSON.parse(bodies[1]).idempotency_key);
    expect(sql(`select status||':'||coalesce(error_code,'') from private.square_publications where brewery_id='${brewery.id}' order by created_at,id`))
      .toEqual(["rejected:version_mismatch", "succeeded:"]);
  });

  it("serializes concurrent publication to one frozen provider identity", async () => {
    const { brewery, ctx, brandId } = await publicationFixture();
    const bodies: string[] = [];
    const client = new SquareClient(config, vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => {
      const body = String(init?.body); bodies.push(body); const parsed = JSON.parse(body);
      await Promise.resolve();
      return new Response(JSON.stringify({ catalog_object: { ...parsed.object, id: "ONE-ITEM", version: 2,
        item_data: { ...parsed.object.item_data, variations: [{ ...parsed.object.item_data.variations[0], id: "ONE-VAR", version: 2,
          item_variation_data: { ...parsed.object.item_data.variations[0].item_variation_data, item_id: "ONE-ITEM" } }] } },
        id_mappings: [{ client_object_id: parsed.object.id, object_id: "ONE-ITEM" },
          { client_object_id: parsed.object.item_data.variations[0].id, object_id: "ONE-VAR" }] }), { status: 200 });
    }));
    const results = await Promise.all([1, 2].map(() => publishSquareCatalogItem(ctx,
      { posLocationId: "L1", brandId }, crypto.randomUUID(), client, "publish_pos_menu")));
    expect(results).toEqual([results[0], results[0]]);
    expect(bodies.length).toBeGreaterThan(0);
    expect([...new Set(bodies)]).toHaveLength(1);
    expect(sql(`select count(*) from private.square_publications where brewery_id='${brewery.id}'`)).toEqual(["1"]);
  });

  it.each(["role", "connection", "token"] as const)("denies the publication lease after a stale %s", async (stale) => {
    const { brewery, ctx, connectionId, brandId } = await publicationFixture();
    const start = await beginSquarePublication(ctx, { posLocationId: "L1", brandId }, crypto.randomUUID(), "publish_pos_item");
    if (stale === "role") expect((await admin.from("brewery_users").update({ role: "sales" })
      .eq("brewery_id", brewery.id).eq("user_id", ctx.userId)).error).toBeNull();
    if (stale === "connection") expect((await admin.from("pos_connections").update({ state: "disconnected" })
      .eq("id", connectionId)).error).toBeNull();
    if (stale === "token") sql(`delete from private.integration_tokens where connection_id='${connectionId}'`);
    await expect(leaseSquarePublication(ctx, start.attemptId)).rejects.toMatchObject({ status: stale === "role" ? 403 : 409 });
  });
});
