import { beforeAll, describe, expect, it, vi } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import { publishSquareMenu, SquareClient } from "@/lib/pos";
import { beginSquareCatalogSync, beginSquareMenuPublication, beginSquarePublication,
  recordSquareCatalogSnapshot } from "@/lib/supabase/integration-tokens";
import { admin, channelId, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation, sql } from "./helpers";
import "@/lib/commands/all";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const };
const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

async function fixture(brands = 1) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "admin");
  const location = await seedLocation(brewery.id, { name: "Taproom", kind: "taproom" });
  const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id,
    merchant_id: `merchant-${crypto.randomUUID()}`, state: "connected", credential_version: 1,
    catalog_sync_generation: 0 }).select("id").single();
  expect(connection.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${brewery.id}','square','${connection.data!.id}','publication-access','refresh-secret',1)`);
  expect((await admin.from("pos_locations").insert({ brewery_id: brewery.id, connection_id: connection.data!.id,
    external_location_id: "L1", external_name: "Taproom", available: true, location_id: location.id })).error).toBeNull();
  const channel = await channelId(brewery.id, "Taproom");
  const brandIds: string[] = [];
  for (let index = 0; index < brands; index += 1) {
    const keg = await seedCatalog(brewery.id, { product: `Brand ${index}`, sku: `Brand ${index} half`,
      packageType: "keg", bblPerUnit: 0.5 });
    const format = await admin.from("formats").insert({ brewery_id: brewery.id, brand_id: keg.brandId,
      name: `Brand ${index} Pint`, basis: "poured", ounces: 16 }).select("id").single();
    expect(format.error).toBeNull();
    await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: format.data!.id, cents: 700 });
    await runCommand("record_movement", { skuId: keg.skuId, locationId: location.id, binId: location.binId,
      qty: 1, type: "opening_balance" }, ctx, execution());
    brandIds.push(keg.brandId);
  }
  await runCommand("configure_pos_menu", { posLocationId: "L1", binId: location.binId, saleChannelId: channel }, ctx, execution());
  return { brewery, ctx, connectionId: connection.data!.id as string, brandIds };
}

function success(body: Record<string, any>, itemId = `ITEM-${crypto.randomUUID()}`) {
  const variations = body.object.item_data.variations.map((variation: Record<string, any>, index: number) => ({
    ...variation, id: `${itemId}-V${index}`, version: 2,
    item_variation_data: { ...variation.item_variation_data, item_id: itemId },
  }));
  return new Response(JSON.stringify({ catalog_object: { ...body.object, id: itemId, version: 2,
    item_data: { ...body.object.item_data, variations } }, id_mappings: [
    { client_object_id: body.object.id, object_id: itemId },
    ...body.object.item_data.variations.map((variation: Record<string, any>, index: number) => ({
      client_object_id: variation.id, object_id: `${itemId}-V${index}`,
    })),
  ] }), { status: 200 });
}

beforeAll(() => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
  expect(process.env.DATABASE_URL).toContain(":54352/");
});

describe("Square publication final orchestration fences", () => {
  it("terminally rejects a partial menu after a definitive child failure and permits a corrected request", async () => {
    const f = await fixture(2);
    const requestId = crypto.randomUUID();
    const rejectedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "VERSION_MISMATCH" }],
    }), { status: 409 }));
    await expect(publishSquareMenu(f.ctx, { posLocationId: "L1" }, requestId,
      new SquareClient(config, rejectedFetch))).rejects.toMatchObject({ status: 409 });
    expect(sql(`select status from private.square_menu_publications where brewery_id='${f.brewery.id}';
      select status from private.square_publications where brewery_id='${f.brewery.id}' order by status`))
      .toEqual(["rejected", "rejected", "superseded"]);

    const exactReplayFetch = vi.fn<typeof globalThis.fetch>();
    await expect(publishSquareMenu(f.ctx, { posLocationId: "L1" }, requestId,
      new SquareClient(config, exactReplayFetch))).rejects.toMatchObject({ status: 409 });
    expect(exactReplayFetch).not.toHaveBeenCalled();

    const correctedFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) =>
      success(JSON.parse(String(init?.body))));
    await expect(publishSquareMenu(f.ctx, { posLocationId: "L1", retryConflict: true }, crypto.randomUUID(),
      new SquareClient(config, correctedFetch))).resolves.toMatchObject({ published: true, items: [expect.any(Object), expect.any(Object)] });
    expect(correctedFetch).toHaveBeenCalledTimes(2);
    expect(sql(`select status from private.square_menu_publications where brewery_id='${f.brewery.id}' order by created_at`))
      .toEqual(["rejected", "succeeded"]);
  });

  it("keeps a transient child outcome recoverable under the frozen top-level manifest", async () => {
    const f = await fixture();
    const requestId = crypto.randomUUID();
    const first = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("temporary", { status: 503 }));
    await expect(publishSquareMenu(f.ctx, { posLocationId: "L1" }, requestId,
      new SquareClient(config, first))).rejects.toThrow("Square is unavailable");
    expect(sql(`select status from private.square_menu_publications where brewery_id='${f.brewery.id}';
      select status from private.square_publications where brewery_id='${f.brewery.id}'`))
      .toEqual(["publishing", "prepared"]);
    const retry = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) =>
      success(JSON.parse(String(init?.body))));
    await expect(publishSquareMenu(f.ctx, { posLocationId: "L1" }, requestId,
      new SquareClient(config, retry))).resolves.toMatchObject({ published: true });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("holds the shared brand lock while creating the manifest so a concurrent standalone item cannot take it", async () => {
    const f = await fixture();
    sql(`create function private.test_square_menu_manifest_delay() returns trigger language plpgsql set search_path='' as $$
      begin perform pg_sleep(1.5); return new; end $$;
      create trigger test_square_menu_manifest_delay after insert on private.square_menu_publications
        for each row execute function private.test_square_menu_manifest_delay()`);
    let results: PromiseSettledResult<unknown>[];
    try {
      const menu = beginSquareMenuPublication(f.ctx, { posLocationId: "L1" }, crypto.randomUUID());
      let brandLockHeld = false;
      for (let attempt = 0; attempt < 20 && !brandLockHeld; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        brandLockHeld = sql(`select count(*) from pg_locks where locktype='advisory' and granted
          and classid=(((hashtextextended('square-publish:${f.connectionId}:${f.brandIds[0]}:poured',0)>>32)&4294967295)::oid)
          and objid=((hashtextextended('square-publish:${f.connectionId}:${f.brandIds[0]}:poured',0)&4294967295)::oid)`)[0] === "1";
      }
      expect(brandLockHeld).toBe(true);
      const item = beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: f.brandIds[0]! },
        crypto.randomUUID(), "publish_pos_item");
      results = await Promise.allSettled([menu, item]);
    } finally {
      sql(`drop trigger if exists test_square_menu_manifest_delay on private.square_menu_publications;
        drop function if exists private.test_square_menu_manifest_delay()`);
    }
    expect(results!.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(sql(`select count(*) from private.square_publications where brewery_id='${f.brewery.id}'`)).toEqual(["1"]);
  }, 15_000);

  it("blocks publication behind an unfinished newer catalog snapshot, then captures its committed generation", async () => {
    const f = await fixture();
    const sync = await beginSquareCatalogSync(f.ctx, crypto.randomUUID());
    if ("replayResult" in sync) throw new Error("unexpected replay");
    await expect(beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: f.brandIds[0]! },
      crypto.randomUUID(), "publish_pos_item")).rejects.toMatchObject({ status: 409 });
    expect(sql(`select count(*) from private.square_publications where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
    await recordSquareCatalogSnapshot(f.ctx, sync, { locations: [{ id: "L1", name: "Taproom", status: "ACTIVE" }], variations: [] });
    const publication = await beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: f.brandIds[0]! },
      crypto.randomUUID(), "publish_pos_item");
    expect(publication.catalogGeneration).toBe(1);
  });
});
