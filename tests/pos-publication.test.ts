import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepareSquareCatalogPublication, publishSquareCatalogItem, SquareClient } from "@/lib/pos";
import { admin, channelId, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/square", environment: "sandbox" as const };
const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

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

    const prepared = prepareSquareCatalogPublication({ brandId: "brand-1", formatId: "format-1",
      brand: "Hazy IPA", format: "Pint", locationId: "L1", priceCents: 700, present: true,
      ownership: "adopted", externalItemId: "ITEM-1", externalVariationId: "VAR-1" }, current);

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

    const retired = prepareSquareCatalogPublication({ brandId: "brand-1", formatId: "format-1",
      brand: "Hazy IPA", format: "Pint", locationId: "L1", priceCents: 700, present: false,
      ownership: "mgr", externalItemId: "ITEM-1", externalVariationId: "VAR-1" }, current);
    expect(retired.object).toMatchObject({ id: "VAR-1", present_at_all_locations: false, present_at_location_ids: ["L2"] });
    expect(retired.object).not.toHaveProperty("is_archived");
  });

  it("persists the exact body and key before I/O, replays unknown outcomes, and records owned identity", async () => {
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

    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", formatId: poured.data!.id }, requestId, client, "publish_pos_menu"))
      .rejects.toThrow("Square is unavailable");
    expect(sql(`select status from private.square_publications where brewery_id='${brewery.id}'`)).toEqual(["prepared"]);
    expect((await admin.from("channel_prices").update({ unit_price_cents: 999 }).eq("brewery_id", brewery.id)).error).toBeNull();
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", formatId: poured.data!.id }, requestId, client, "publish_pos_menu"))
      .resolves.toMatchObject({ published: true, externalItemId: "ITEM-REMOTE", externalVariationId: "VAR-REMOTE" });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]?.body).toBe(fetch.mock.calls[1][1]?.body);
    expect(String(fetch.mock.calls[1][1]?.body)).toContain('"amount":700');
    expect(remote).toHaveLength(1);
    expect(sql(`select ownership||'|'||external_item_id||'|'||external_variation_id from public.pos_catalog_ownership where format_id='${poured.data!.id}'`))
      .toEqual(["mgr|ITEM-REMOTE|VAR-REMOTE"]);
  });
});
