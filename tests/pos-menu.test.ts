// Program 14 P3: a menu is derived from one mapped location/bin/channel,
// while website readers see only explicitly published safe rows.
import { beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import {
  admin,
  channelId,
  makeBrewery,
  makeStaffCtx,
  priceSku,
  seedCatalog,
  seedLocation,
  sql,
} from "./helpers";

beforeAll(() => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
  expect(process.env.DATABASE_URL).toContain(":54352/");
});

async function connectedLocation(breweryId: string, externalLocationId: string, locationId: string) {
  const connection = await admin.from("pos_connections").insert({
    brewery_id: breweryId,
    merchant_id: `merchant-${crypto.randomUUID()}`,
    state: "connected",
    credential_version: 1,
  }).select("id").single();
  expect(connection.error).toBeNull();
  const location = await admin.from("pos_locations").insert({
    brewery_id: breweryId,
    connection_id: connection.data!.id,
    external_location_id: externalLocationId,
    external_name: `Square ${externalLocationId}`,
    external_status: "ACTIVE",
    location_id: locationId,
  });
  expect(location.error).toBeNull();
  return connection.data!.id as string;
}

async function pouredFormat(breweryId: string, brandId: string, name = "Pint", ounces = 16) {
  const row = await admin.from("formats").insert({
    brewery_id: breweryId,
    brand_id: brandId,
    name,
    basis: "poured",
    ounces,
  }).select("id").single();
  expect(row.error).toBeNull();
  return row.data!.id as string;
}

const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

describe("derived POS menus", () => {
  it("offers poured formats only from active keg stock in the configured bin", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const taproom = await seedLocation(brewery.id, { name: "Taproom", kind: "taproom" });
    const other = await seedLocation(brewery.id, { name: "Other", kind: "taproom" });
    await connectedLocation(brewery.id, "L1", taproom.id);
    const channel = await channelId(brewery.id, "Taproom");
    const keg = await seedCatalog(brewery.id, { product: "Hazy", sku: "Hazy half", packageType: "keg", bblPerUnit: 0.5, format: "Half bbl" });
    const pintId = await pouredFormat(brewery.id, keg.brandId);
    await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: pintId, cents: 700 });

    await expect(runCommand("configure_pos_menu", {
      posLocationId: "L1", binId: taproom.binId, saleChannelId: channel,
    }, ctx, execution())).resolves.toMatchObject({ configured: true, publicId: expect.any(String) });

    const empty = await runCommand("get_pos_menu", { posLocationId: "L1" }, ctx) as any;
    expect(empty.items).toEqual([]);
    expect(empty.excluded).toContainEqual(expect.objectContaining({ formatId: pintId, reason: "out_of_stock" }));

    await runCommand("record_movement", {
      skuId: keg.skuId, locationId: other.id, binId: other.binId, qty: 2, type: "opening_balance",
    }, ctx, execution());
    expect((await runCommand("get_pos_menu", { posLocationId: "L1" }, ctx) as any).items).toEqual([]);

    await runCommand("record_movement", {
      skuId: keg.skuId, locationId: taproom.id, binId: taproom.binId, qty: 3, type: "opening_balance",
    }, ctx, execution());
    const stocked = await runCommand("get_pos_menu", { posLocationId: "L1" }, ctx) as any;
    expect(stocked.items).toContainEqual(expect.objectContaining({
      formatId: pintId,
      brand: "Hazy",
      format: "Pint",
      ounces: 16,
      priceCents: 700,
      priceSource: "format",
      available: true,
      sources: [expect.objectContaining({ skuId: keg.skuId, name: "Hazy half", format: "Half bbl", qty: 3 })],
    }));

    await runCommand("set_pos_price_override", {
      posLocationId: "L1", formatId: pintId, unitPriceCents: 650,
    }, ctx, execution());
    await runCommand("set_pos_website_publication", {
      posLocationId: "L1", formatId: pintId, published: true,
    }, ctx, execution());

    await admin.from("skus").update({ active: false }).eq("id", keg.skuId);
    const inactive = await runCommand("get_pos_menu", { posLocationId: "L1" }, ctx) as any;
    expect(inactive.items).toEqual([]);
    expect(inactive.excluded).toContainEqual({
      formatId: pintId,
      brand: "Hazy",
      format: "Pint",
      ounces: 16,
      priceCents: 650,
      priceOverrideCents: 650,
      priceSource: "override",
      available: false,
      websitePublished: true,
      sources: [],
      reason: "no_active_keg",
    });
    await expect(runCommand("get_pos_menu_item", { posLocationId: "L1", formatId: pintId }, ctx))
      .resolves.toEqual(inactive.excluded[0]);
  });

  it("keeps nullable price overrides independent per Square location and restores fallback when cleared", async () => {
    const brewery = await makeBrewery();
    const adminCtx = await makeStaffCtx(brewery.id, "admin");
    const warehouseCtx = await makeStaffCtx(brewery.id, "warehouse");
    const first = await seedLocation(brewery.id, { name: "Taproom" });
    const second = await seedLocation(brewery.id, { name: "Beer garden" });
    await connectedLocation(brewery.id, "L1", first.id);
    const secondConnection = (await admin.from("pos_connections").select("id").eq("brewery_id", brewery.id).single()).data!.id;
    expect((await admin.from("pos_locations").insert({
      brewery_id: brewery.id, connection_id: secondConnection, external_location_id: "L2",
      external_name: "Square L2", external_status: "ACTIVE", location_id: second.id,
    })).error).toBeNull();
    const channel = await channelId(brewery.id, "Taproom");
    const keg = await seedCatalog(brewery.id, { product: "Pils", sku: "Pils sixtel", packageType: "keg", bblPerUnit: 1 / 6, format: "Sixtel" });
    const pintId = await pouredFormat(brewery.id, keg.brandId);
    await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: pintId, cents: 700 });
    for (const location of [first, second]) {
      await runCommand("record_movement", { skuId: keg.skuId, locationId: location.id, binId: location.binId, qty: 1, type: "opening_balance" }, adminCtx, execution());
    }
    await runCommand("configure_pos_menu", { posLocationId: "L1", binId: first.binId, saleChannelId: channel }, warehouseCtx, execution());
    await runCommand("configure_pos_menu", { posLocationId: "L2", binId: second.binId, saleChannelId: channel }, warehouseCtx, execution());

    await runCommand("set_pos_price_override", { posLocationId: "L1", formatId: pintId, unitPriceCents: 650 }, warehouseCtx, execution());
    expect((await runCommand("get_pos_menu_item", { posLocationId: "L1", formatId: pintId }, warehouseCtx) as any))
      .toMatchObject({ priceCents: 650, priceSource: "override", priceOverrideCents: 650 });
    expect((await runCommand("get_pos_menu_item", { posLocationId: "L2", formatId: pintId }, warehouseCtx) as any))
      .toMatchObject({ priceCents: 700, priceSource: "format", priceOverrideCents: null });

    await runCommand("set_pos_price_override", { posLocationId: "L1", formatId: pintId, unitPriceCents: null }, warehouseCtx, execution());
    expect((await runCommand("get_pos_menu_item", { posLocationId: "L1", formatId: pintId }, warehouseCtx) as any))
      .toMatchObject({ priceCents: 700, priceSource: "format", priceOverrideCents: null });
  });

  it("keeps external rows separate and enforces tenant, role, and complete-read boundaries", async () => {
    const brewery = await makeBrewery();
    const adminCtx = await makeStaffCtx(brewery.id, "admin");
    const warehouseCtx = await makeStaffCtx(brewery.id, "warehouse");
    const location = await seedLocation(brewery.id, { name: "Taproom" });
    const connectionId = await connectedLocation(brewery.id, "L1", location.id);
    const channel = await channelId(brewery.id, "Taproom");
    const keg = await seedCatalog(brewery.id, { product: "Many", sku: "Many half", packageType: "keg", bblPerUnit: 0.5, format: "Half" });
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      brewery_id: brewery.id, brand_id: keg.brandId, name: `Pour ${String(index).padStart(4, "0")}`, basis: "poured", ounces: 4 + index / 100,
    }));
    expect((await admin.from("formats").insert(rows)).error).toBeNull();
    await runCommand("record_movement", { skuId: keg.skuId, locationId: location.id, binId: location.binId, qty: 1, type: "opening_balance" }, adminCtx, execution());
    await runCommand("configure_pos_menu", { posLocationId: "L1", binId: location.binId, saleChannelId: channel }, warehouseCtx, execution());
    expect((await runCommand("get_pos_menu", { posLocationId: "L1" }, warehouseCtx) as any).items).toHaveLength(1001);

    expect((await admin.from("pos_catalog_variations").insert([
      { brewery_id: brewery.id, connection_id: connectionId, external_item_id: "FOOD", external_variation_id: "PRETZEL", external_item_name: "Pretzel", external_variation_name: "Each", source_version: 1, available: true },
      { brewery_id: brewery.id, connection_id: connectionId, external_item_id: "GUEST", external_variation_id: "CIDER", external_item_name: "Guest cider", external_variation_name: "Pint", source_version: 1, available: false },
    ])).error).toBeNull();
    const menu = await runCommand("get_pos_menu", { posLocationId: "L1" }, warehouseCtx) as any;
    expect(menu.externalItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemName: "Pretzel", disposition: "queued", available: true }),
      expect.objectContaining({ itemName: "Guest cider", disposition: "queued", available: false }),
    ]));
    expect(menu.items.some((item: any) => /Pretzel|Guest cider/.test(item.brand))).toBe(false);

    await expect(runCommand("get_pos_menu", { posLocationId: "L1" }, await makeStaffCtx(brewery.id, "sales")))
      .rejects.toMatchObject({ status: 403 });
    const foreign = await makeBrewery();
    const foreignLocation = await seedLocation(foreign.id);
    const foreignChannel = await channelId(foreign.id, "Taproom");
    await expect(runCommand("configure_pos_menu", {
      posLocationId: "L1", binId: foreignLocation.binId, saleChannelId: foreignChannel,
    }, adminCtx, execution())).rejects.toMatchObject({ status: 403 });

    expect(sql(`select count(*) from public.pos_menu_lines where brewery_id='${brewery.id}'`)).toEqual(["0"]);
  });
});
