import { squareUpsertSchema, type SquareUpsert } from "./provider-payloads";
import { describe, expect, it, vi } from "vitest";
import { getCommandDefinition, runCommand } from "@/lib/commands/registry";
import { prepareSquareCatalogPublication, publishSquareCatalogItem, publishSquareMenu, SquareClient } from "@/lib/pos";
import { beginSquarePublication, finishSquarePublication, leaseSquarePublication, prepareSquarePublication } from "@/lib/supabase/integration-tokens";
import { admin, channelId, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation, seedPour, sql } from "./helpers";
import "@/lib/commands/all";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/square", environment: "sandbox" as const };
const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

// sharedGroup puts the second brand on the first brand's price group, so both beers pour the same formats.
async function fixture(twoBrands = false, sharedGroup = false) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const location = await seedLocation(brewery.id, { name: "Taproom", uses: ["taproom"] });
  const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id,
    merchant_id: `merchant-${crypto.randomUUID()}`, state: "connected", credential_version: 1,
    catalog_sync_generation: 3 }).select("id").single();
  expect(connection.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${brewery.id}','square','${connection.data!.id}','publication-access-secret','refresh-secret',1)`);
  expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connection.data!.id,
    external_location_id: "L1", external_name: "Taproom", available: true, location_id: location.id })).error).toBeNull();
  const channel = await channelId(brewery.id, "Taproom");
  const addBrand = async (name: string, share?: { brandId: string; formats: string[] }) => {
    const priceGroupId = share ? (await admin.from("brands").select("price_group_id").eq("id", share.brandId).single()).data!.price_group_id as string : undefined;
    const keg = await seedCatalog(brewery.id, { product: name, sku: `${name} half`, packageType: "keg", bblPerUnit: 0.5, priceGroupId });
    const formats: string[] = share ? [...share.formats] : [];
    for (const [format, ounces, cents] of share ? [] : [["Pint", 16, 700], ["Taster", 5, 350]] as const) {
      const formatId = await seedPour(brewery.id, { brandId: keg.brandId, name: `${name} ${format}`, ounces });
      await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId, cents });
      formats.push(formatId);
    }
    await runCommand("record_movement", { skuId: keg.skuId, locationId: location.id, binId: location.binId,
      qty: 1, type: "opening_balance" }, ctx, execution());
    return { brandId: keg.brandId, formats };
  };
  const first = await addBrand("Hazy");
  const second = twoBrands ? await addBrand("Pils", sharedGroup ? first : undefined) : null;
  await runCommand("configure_pos_menu", { posLocationId: "L1", binId: location.binId, saleChannelId: channel }, ctx, execution());
  return { brewery, ctx, connectionId: connection.data!.id, first, second, location, channel };
}

// A Square that accepts every new item and assigns ITEM-n / ITEM-n-VAR-m ids.
function createItemsFetch() {
  const bodies: Array<SquareUpsert> = [];
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => {
    const body = squareUpsertSchema.parse(JSON.parse(String(init?.body))); bodies.push(body);
    const itemId = `ITEM-${bodies.length}`;
    const mappings = [{ client_object_id: body.object.id, object_id: itemId },
      ...body.object.item_data.variations.map((variation, index) => ({
        client_object_id: variation.id, object_id: `${itemId}-VAR-${index + 1}`,
      }))];
    return new Response(JSON.stringify({ catalog_object: { ...body.object, id: itemId, version: 2,
      item_data: { ...body.object.item_data, variations: body.object.item_data.variations.map((variation, index) => ({
        ...variation, id: `${itemId}-VAR-${index + 1}`, version: 2,
        item_variation_data: { ...variation.item_variation_data, item_id: itemId },
      })) } }, id_mappings: mappings }), { status: 200 });
  });
  return { bodies, fetch };
}

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

  it("publishes every derived brand as one item containing all of its format variations", async () => {
    const { brewery, ctx } = await fixture(true);
    const { bodies, fetch } = createItemsFetch();
    await expect(publishSquareMenu(ctx, { posLocationId: "L1" }, crypto.randomUUID(), new SquareClient(config, fetch)))
      .resolves.toMatchObject({ published: true, items: [expect.any(Object), expect.any(Object)] });
    expect(bodies).toHaveLength(2);
    expect(bodies.map((body) => body.object.item_data.variations.length)).toEqual([2, 2]);
    expect(sql(`select count(*) from public.pos_catalog_items where brewery_id='${brewery.id}';
      select count(*) from public.pos_catalog_ownership where brewery_id='${brewery.id}'`)).toEqual(["2", "4"]);
  });

  it("publishes two beers on one price group as separate items that each own the shared pours", async () => {
    const { brewery, ctx, first, second } = await fixture(true, true);
    const { bodies, fetch } = createItemsFetch();
    await expect(publishSquareMenu(ctx, { posLocationId: "L1" }, crypto.randomUUID(), new SquareClient(config, fetch)))
      .resolves.toMatchObject({ published: true, items: [expect.any(Object), expect.any(Object)] });
    expect(bodies.map((body) => body.object.item_data.variations.length)).toEqual([2, 2]);
    // Each beer owns its own variation of each shared pour.
    expect(sql(`select brand_id||':'||format_id from public.pos_catalog_ownership where brewery_id='${brewery.id}' order by 1`))
      .toEqual([...first.formats.map((f) => `${first.brandId}:${f}`), ...first.formats.map((f) => `${second!.brandId}:${f}`)].sort());
  });

  it("terminally supersedes stale credential and catalog generations so current work can start", async () => {
    const { ctx, connectionId, first, second } = await fixture(true);
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
    await expect(finishSquarePublication(ctx, oldCatalog.attemptId, null, {
      catalogObject: { type: "ITEM", id: "LATE", version: 99, item_data: { variations: [] } }, idMappings: [],
    })).resolves.toMatchObject({ superseded: true, errorCode: "catalog_changed" });
    expect(sql(`select status||':'||error_code from private.square_publications where id='${oldCatalog.attemptId}'`))
      .toEqual(["superseded:catalog_changed"]);
    const currentCatalog = await beginSquarePublication(ctx, { posLocationId: "L1", brandId: second!.brandId },
      crypto.randomUUID(), "publish_pos_item");
    expect(currentCatalog.catalogGeneration).toBe(4);
    sql(`update public.pos_connections set catalog_sync_generation=catalog_sync_generation+1 where id='${connectionId}'`);
    await expect(prepareSquarePublication(ctx, currentCatalog.attemptId,
      JSON.stringify({ idempotency_key: "unused-after-supersession", object: {} }), null, {}))
      .rejects.toMatchObject({ status: 409 });
    expect(sql(`select status||':'||error_code from private.square_publications where id='${currentCatalog.attemptId}'`))
      .toEqual(["superseded:catalog_changed"]);
  });

  it("durably rejects a missing owned provider item and unblocks another brand", async () => {
    const { brewery, ctx, connectionId, first, second } = await fixture(true);
    sql(`insert into public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership)
      values('${brewery.id}','${connectionId}','${first.brandId}','poured','MISSING-ITEM','mgr');
      insert into public.pos_catalog_ownership(brewery_id,connection_id,brand_id,catalog_group,format_id,external_item_id,external_variation_id)
      values('${brewery.id}','${connectionId}','${first.brandId}','poured','${first.formats[0]}','MISSING-ITEM','MISSING-VAR')`);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ errors: [{ code: "NOT_FOUND" }] }), { status: 404 }));
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", brandId: first.brandId }, crypto.randomUUID(),
      new SquareClient(config, fetch), "publish_pos_item")).rejects.toMatchObject({ status: 409 });
    expect(sql(`select status||':'||error_code from private.square_publications where brand_id='${first.brandId}'`))
      .toEqual(["rejected:provider_missing"]);
    const missingVariation = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ object: {
      type: "ITEM", id: "MISSING-ITEM", version: 5, item_data: { name: "Hazy", variations: [
        { type: "ITEM_VARIATION", id: "OTHER", version: 5, item_variation_data: { item_id: "MISSING-ITEM", name: "Seller row" } },
      ] },
    } }), { status: 200 }));
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", brandId: first.brandId }, crypto.randomUUID(),
      new SquareClient(config, missingVariation), "publish_pos_item")).rejects.toMatchObject({ status: 409 });
    const malformed = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", brandId: first.brandId }, crypto.randomUUID(),
      new SquareClient(config, malformed), "publish_pos_item")).rejects.toMatchObject({ status: 409 });
    expect(sql(`select error_code from private.square_publications where brand_id='${first.brandId}' order by created_at,id`))
      .toEqual(["provider_missing", "provider_missing", "provider_invalid"]);
    const next = await beginSquarePublication(ctx, { posLocationId: "L1", brandId: second!.brandId },
      crypto.randomUUID(), "publish_pos_item");
    expect(next.status).toBe("needs_snapshot");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a transient provider read failure recoverable under the same attempt", async () => {
    const { brewery, ctx, connectionId, first } = await fixture();
    sql(`insert into public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership)
      values('${brewery.id}','${connectionId}','${first.brandId}','poured','RETRY-ITEM','mgr');
      insert into public.pos_catalog_ownership(brewery_id,connection_id,brand_id,catalog_group,format_id,external_item_id,external_variation_id)
      values('${brewery.id}','${connectionId}','${first.brandId}','poured','${first.formats[0]}','RETRY-ITEM','RETRY-VAR')`);
    const requestId = crypto.randomUUID();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("temporary", { status: 503 }));
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "L1", brandId: first.brandId }, requestId,
      new SquareClient(config, fetch), "publish_pos_item")).rejects.toThrow("Square is unavailable");
    const attemptId = sql(`select id from private.square_publications where brand_id='${first.brandId}'`)[0]!;
    expect(sql(`select status from private.square_publications where id='${attemptId}'`)).toEqual(["needs_snapshot"]);
    const replay = await beginSquarePublication(ctx, { posLocationId: "L1", brandId: first.brandId },
      requestId, "publish_pos_item");
    expect(replay.attemptId).toBe(attemptId);
    expect(replay.status).toBe("needs_snapshot");
  });
});

// A Square that keeps what it is sent: GET returns the stored item, an upsert
// of an existing item bumps its and its variations' versions.
function createCatalogFetch() {
  const created = createItemsFetch();
  const store = new Map<string, Record<string, unknown>>();
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
    if (!init?.method) {
      const id = decodeURIComponent(String(input).split("/v2/catalog/object/")[1]!.split("?")[0]!);
      return new Response(JSON.stringify({ object: store.get(id) }), { status: 200 });
    }
    const body = squareUpsertSchema.parse(JSON.parse(String(init.body)));
    if (body.object.id.startsWith("#")) {
      const response = await created.fetch(input, init);
      const data = await response.json() as { catalog_object: Record<string, unknown> };
      store.set(data.catalog_object.id as string, data.catalog_object);
      return new Response(JSON.stringify(data), { status: 200 });
    }
    const version = (body.object.version as number) + 1;
    const object = { ...body.object, version, item_data: { ...body.object.item_data,
      variations: body.object.item_data.variations.map((variation) => ({ ...variation, version: (variation.version as number) + 1 })) } };
    store.set(object.id, object); created.bodies.push(body);
    return new Response(JSON.stringify({ catalog_object: object, id_mappings: [] }), { status: 200 });
  });
  return { bodies: created.bodies, fetch };
}

describe("Square packaged (Four Pack) publication", () => {
  // Hazy pours plus a Case (= 6 × Four Pack) SKU with two cases in the menu bin.
  async function caseFixture() {
    const f = await fixture();
    const adminCtx = await makeStaffCtx(f.brewery.id, "admin");
    const formats = await admin.from("formats").insert([
      { brewery_id: f.brewery.id, name: "Four Pack", basis: "packaged", package_type: "can", bbl_per_unit: 0.01612903, units_per_case: 4 },
      { brewery_id: f.brewery.id, name: "Case", basis: "packaged", package_type: "can", bbl_per_unit: 0.09677419 },
    ]).select("id,name");
    expect(formats.error).toBeNull();
    const fourId = formats.data!.find((row) => row.name === "Four Pack")!.id as string;
    const caseId = formats.data!.find((row) => row.name === "Case")!.id as string;
    await runCommand("replace_format_components", { formatId: caseId, components: [{ childFormatId: fourId, qty: 6 }] }, adminCtx);
    const sku = await admin.from("skus").insert({ brewery_id: f.brewery.id, brand_id: f.first.brandId, format_id: caseId,
      name: "Hazy case" }).select("id").single();
    expect(sku.error).toBeNull();
    await priceSku(f.brewery.id, { saleChannelId: f.channel, brandId: f.first.brandId, formatId: fourId, cents: 1400 });
    const move = (qty: number, type: "opening_balance" | "adjustment") => runCommand("record_movement", { skuId: sku.data!.id,
      locationId: f.location.id, binId: f.location.binId, qty, type }, f.ctx, execution());
    await move(2, "opening_balance");
    return { ...f, fourId, caseSkuId: sku.data!.id as string, move };
  }

  it("publishes case stock as a separate '<Brand> Four Pack' item whose variation maps to the Case SKU", async () => {
    const f = await caseFixture();
    const { bodies, fetch } = createCatalogFetch();
    await expect(publishSquareMenu(f.ctx, { posLocationId: "L1" }, crypto.randomUUID(), new SquareClient(config, fetch)))
      .resolves.toMatchObject({ published: true, items: [expect.any(Object), expect.any(Object)] });
    const packaged = bodies.find((body) => body.object.id === `#mgr-item-${f.first.brandId}-packaged`);
    expect(packaged?.object).toMatchObject({ item_data: { name: "Hazy Four Pack", variations: [
      { id: `#mgr-variation-${f.fourId}`, item_variation_data: { name: "Four Pack", price_money: { amount: 1400 } } },
    ] } });
    expect(packaged!.object.item_data.variations).toHaveLength(1);
    expect(bodies.find((body) => body.object.id === `#mgr-item-${f.first.brandId}-poured`)?.object.item_data.variations).toHaveLength(2);
    expect(sql(`select catalog_group||':'||format_id from public.pos_catalog_ownership
      where brewery_id='${f.brewery.id}' and catalog_group='packaged'`)).toEqual([`packaged:${f.fourId}`]);
    expect(sql(`select coalesce(m.sku_id::text,'-')||':'||coalesce(m.format_id::text,'-') from public.pos_item_mappings m
      join public.pos_catalog_ownership o on o.connection_id=m.connection_id and o.external_variation_id=m.external_variation_id
      where o.brewery_id='${f.brewery.id}' and o.catalog_group='packaged'`)).toEqual([`${f.caseSkuId}:-`]);
  });

  it("removes the Four Pack from the location when the cases run out", async () => {
    const f = await caseFixture();
    const { bodies, fetch } = createCatalogFetch();
    await publishSquareMenu(f.ctx, { posLocationId: "L1" }, crypto.randomUUID(), new SquareClient(config, fetch));
    const itemId = sql(`select external_item_id from public.pos_catalog_items
      where brewery_id='${f.brewery.id}' and catalog_group='packaged'`)[0]!;
    await f.move(-2, "adjustment");
    bodies.length = 0;
    await expect(publishSquareMenu(f.ctx, { posLocationId: "L1" }, crypto.randomUUID(), new SquareClient(config, fetch)))
      .resolves.toMatchObject({ published: true });
    expect(bodies.find((body) => body.object.id === itemId)?.object).toMatchObject({ present_at_location_ids: [],
      item_data: { is_archived: true, variations: [expect.objectContaining({ present_at_location_ids: [] })] } });
    expect(sql(`select (i.retired_at is not null)::text||':'||(o.retired_at is not null)::text||':'||m.sku_id
      from public.pos_catalog_items i join public.pos_catalog_ownership o using (connection_id,brand_id,catalog_group)
      join public.pos_item_mappings m on m.connection_id=o.connection_id and m.external_variation_id=o.external_variation_id
      where i.brewery_id='${f.brewery.id}' and i.catalog_group='packaged'`)).toEqual([`true:true:${f.caseSkuId}`]);
  });

  it("brings the same Square item and variation back when cases return, so sales stay one product", async () => {
    const f = await caseFixture();
    const { bodies, fetch } = createCatalogFetch();
    const publish = () => publishSquareMenu(f.ctx, { posLocationId: "L1" }, crypto.randomUUID(), new SquareClient(config, fetch));
    const ids = () => sql(`select o.external_item_id||':'||o.external_variation_id||':'||(o.retired_at is null)::text
      from public.pos_catalog_ownership o where o.brewery_id='${f.brewery.id}' and o.catalog_group='packaged'`);
    await publish();
    const [before] = ids();
    await f.move(-2, "adjustment");
    await publish();
    await f.move(1, "adjustment");
    bodies.length = 0;
    await expect(publish()).resolves.toMatchObject({ published: true });
    expect(ids()).toEqual([before]);
    const [itemId, variationId] = before!.split(":");
    expect(bodies.some((body) => body.object.id.startsWith(`#mgr-item-${f.first.brandId}-packaged`))).toBe(false);
    expect(bodies.find((body) => body.object.id === itemId)?.object).toMatchObject({ present_at_location_ids: ["L1"],
      item_data: { is_archived: false, variations: [expect.objectContaining({ id: variationId, present_at_location_ids: ["L1"] })] } });
  });

  it("archives a poured beer's Square item when its last keg leaves the menu bin", async () => {
    const f = await fixture();
    const { bodies, fetch } = createCatalogFetch();
    const publish = () => publishSquareMenu(f.ctx, { posLocationId: "L1" }, crypto.randomUUID(), new SquareClient(config, fetch));
    await publish();
    const itemId = sql(`select external_item_id from public.pos_catalog_items
      where brewery_id='${f.brewery.id}' and catalog_group='poured'`)[0]!;
    const keg = sql(`select id from public.skus where brewery_id='${f.brewery.id}' and brand_id='${f.first.brandId}'`)[0]!;
    await runCommand("record_movement", { skuId: keg, locationId: f.location.id, binId: f.location.binId,
      qty: -1, type: "adjustment" }, f.ctx, execution());
    bodies.length = 0;
    await expect(publish()).resolves.toMatchObject({ published: true });
    expect(bodies.find((body) => body.object.id === itemId)?.object).toMatchObject({ present_at_location_ids: [],
      item_data: { is_archived: true } });
  });
});
