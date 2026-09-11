import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { runCommand } from "@/lib/commands/registry";
import { publishSquareCatalogItem, publishSquareMenu, SquareClient } from "@/lib/pos";
import { advanceSquareCatalogSync, beginSquareCatalogSync, beginSquareMenuPublication, beginSquarePublication,
  compareAndSwapSquareTokens, readVersionedIntegrationTokens, recordSquareCatalogSnapshot } from "@/lib/supabase/integration-tokens";
import { admin, channelId, DB, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedLocation, sql } from "./helpers";
import "@/lib/commands/all";

const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const };
const nativeFetch = globalThis.fetch;
const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

async function fixture(brandCount = 1) {
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
  const brands: Array<{ brandId: string; skuId: string; formatId: string }> = [];
  for (let index = 0; index < brandCount; index += 1) {
    const keg = await seedCatalog(brewery.id, { product: `Brand ${index}`, sku: `Brand ${index} half`,
      packageType: "keg", bblPerUnit: 0.5 });
    const format = await admin.from("formats").insert({ brewery_id: brewery.id, brand_id: keg.brandId,
      name: `Brand ${index} Pint`, basis: "poured", ounces: 16 }).select("id").single();
    expect(format.error).toBeNull();
    await priceSku(brewery.id, { saleChannelId: channel, brandId: keg.brandId, formatId: format.data!.id, cents: 700 });
    await runCommand("record_movement", { skuId: keg.skuId, locationId: location.id, binId: location.binId,
      qty: 1, type: "opening_balance" }, ctx, execution());
    brandIds.push(keg.brandId);
    brands.push({ brandId: keg.brandId, skuId: keg.skuId, formatId: format.data!.id });
  }
  await runCommand("configure_pos_menu", { posLocationId: "L1", binId: location.binId, saleChannelId: channel }, ctx, execution());
  return { brewery, ctx, connectionId: connection.data!.id as string, brandIds, brands, location, channel };
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function commandSquare(fetcher: typeof globalThis.fetch) {
  vi.stubEnv("SQUARE_APPLICATION_ID", config.applicationId);
  vi.stubEnv("SQUARE_APPLICATION_SECRET", config.applicationSecret);
  vi.stubEnv("SQUARE_REDIRECT_URI", config.redirectUri);
  vi.stubEnv("SQUARE_ENVIRONMENT", config.environment);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).startsWith("http://127.0.0.1:54351") ? nativeFetch(input, init) : fetcher(input, init));
}

describe("Square publication final orchestration fences", () => {
  it("refuses to coalesce an unresolved standalone publication across locations", async () => {
    const f = await fixture();
    const second = await seedLocation(f.brewery.id, { name: "Beer garden", kind: "taproom" });
    expect((await admin.from("pos_locations").insert({ brewery_id: f.brewery.id, connection_id: f.connectionId,
      external_location_id: "L2", external_name: "Beer garden", available: true, location_id: second.id })).error).toBeNull();
    await runCommand("record_movement", { skuId: f.brands[0]!.skuId, locationId: second.id, binId: second.binId,
      qty: 1, type: "opening_balance" }, f.ctx, execution());
    await runCommand("configure_pos_menu", { posLocationId: "L2", binId: second.binId, saleChannelId: f.channel }, f.ctx, execution());

    const firstRequest = crypto.randomUUID();
    const first = await beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: f.brandIds[0]! }, firstRequest, "publish_pos_item");
    const incompatibleRequest = crypto.randomUUID();
    await expect(beginSquarePublication(f.ctx, { posLocationId: "L2", brandId: f.brandIds[0]! },
      incompatibleRequest, "publish_pos_item")).rejects.toMatchObject({ status: 409 });
    expect(sql(`select count(*) from private.command_requests where actor_id='${f.ctx.userId}' and request_id='${incompatibleRequest}'`))
      .toEqual(["0"]);

    await expect(publishSquareCatalogItem(f.ctx, { posLocationId: "L1", brandId: f.brandIds[0]! }, firstRequest,
      new SquareClient(config, vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) =>
        success(JSON.parse(String(init?.body)), "LOCATION-ITEM"))), "publish_pos_item"))
      .resolves.toMatchObject({ externalItemId: "LOCATION-ITEM" });
    const secondStart = await beginSquarePublication(f.ctx, { posLocationId: "L2", brandId: f.brandIds[0]! },
      crypto.randomUUID(), "publish_pos_item");
    expect(secondStart.attemptId).not.toBe(first.attemptId);
    expect(secondStart.source).toMatchObject({ locationId: "L2", externalItemId: "LOCATION-ITEM" });
  });

  it("serializes menu ownership capture with an in-flight standalone finish", async () => {
    const f = await fixture();
    let enteredProvider!: () => void, releaseProvider!: () => void;
    const providerEntered = new Promise<void>((resolve) => { enteredProvider = resolve; });
    const providerReleased = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const standalone = publishSquareCatalogItem(f.ctx, { posLocationId: "L1", brandId: f.brandIds[0]! },
      crypto.randomUUID(), new SquareClient(config, vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => {
        enteredProvider(); await providerReleased; return success(JSON.parse(String(init?.body)), "RACE-ITEM");
      })), "publish_pos_item");
    await providerEntered;

    const blocker = new Client({ connectionString: DB });
    await blocker.connect();
    const lockName = `square-publish:${f.connectionId}:${f.brandIds[0]}:poured`;
    let blocking = true;
    try {
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [lockName]);
      const menu = beginSquareMenuPublication(f.ctx, { posLocationId: "L1" }, crypto.randomUUID());
      await vi.waitFor(() => expect(Number(sql(`select count(*) from pg_locks where locktype='advisory' and not granted
        and classid=(((hashtextextended('${lockName}',0)>>32)&4294967295)::oid)
        and objid=((hashtextextended('${lockName}',0)&4294967295)::oid)`)[0])).toBeGreaterThanOrEqual(1));
      releaseProvider();
      await vi.waitFor(() => {
        const ownership = Number(sql(`select count(*) from public.pos_catalog_items where connection_id='${f.connectionId}'
          and brand_id='${f.brandIds[0]}'`)[0]);
        const waiters = Number(sql(`select count(*) from pg_locks where locktype='advisory' and not granted
          and classid=(((hashtextextended('${lockName}',0)>>32)&4294967295)::oid)
          and objid=((hashtextextended('${lockName}',0)&4294967295)::oid)`)[0]);
        expect(ownership > 0 || waiters >= 2).toBe(true);
      });
      await blocker.query("commit"); blocking = false;
      const results = await Promise.allSettled([menu, standalone]);
      expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
    } finally {
      if (blocking) await blocker.query("rollback");
      await blocker.end();
      releaseProvider?.();
    }
    expect(sql(`select count(*) from private.square_menu_publications where brewery_id='${f.brewery.id}';
      select external_item_id from public.pos_catalog_items where connection_id='${f.connectionId}' and brand_id='${f.brandIds[0]}'`))
      .toEqual(["0", "RACE-ITEM"]);
  }, 15_000);

  it("uses one frozen candidate set for menu brand locks and manifest children", async () => {
    const f = await fixture();
    const blocker = new Client({ connectionString: DB });
    await blocker.connect();
    const lockName = `square-publish:${f.connectionId}:${f.brandIds[0]}:poured`;
    let blocking = true;
    try {
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [lockName]);
      const menu = beginSquareMenuPublication(f.ctx, { posLocationId: "L1" }, crypto.randomUUID());
      await vi.waitFor(() => expect(Number(sql(`select count(*) from pg_locks where locktype='advisory' and not granted
        and classid=(((hashtextextended('${lockName}',0)>>32)&4294967295)::oid)
        and objid=((hashtextextended('${lockName}',0)&4294967295)::oid)`)[0])).toBeGreaterThanOrEqual(1));

      const late = await seedCatalog(f.brewery.id, { product: "Late brand", sku: "Late brand half",
        packageType: "keg", bblPerUnit: 0.5 });
      const format = await admin.from("formats").insert({ brewery_id: f.brewery.id, brand_id: late.brandId,
        name: "Late brand Pint", basis: "poured", ounces: 16 }).select("id").single();
      expect(format.error).toBeNull();
      await priceSku(f.brewery.id, { saleChannelId: f.channel, brandId: late.brandId, formatId: format.data!.id, cents: 800 });
      await runCommand("record_movement", { skuId: late.skuId, locationId: f.location.id, binId: f.location.binId,
        qty: 1, type: "opening_balance" }, f.ctx, execution());

      await blocker.query("commit"); blocking = false;
      const result = await menu;
      expect(result.manifest.map((entry) => entry.brandId)).toEqual([f.brandIds[0]]);
      expect(sql(`select count(*) from private.square_publications where menu_publication_id='${result.menuAttemptId}'`))
        .toEqual(["1"]);
    } finally {
      if (blocking) await blocker.query("rollback");
      await blocker.end();
    }
  }, 15_000);

  it("returns the durable terminal publication contract from the real command handlers", async () => {
    const succeeded = await fixture();
    const successFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://connect.squareupsandbox.com/v2/catalog/object");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        "Square-Version": "2026-08-19", Authorization: "Bearer publication-access",
        "Content-Type": "application/json", Accept: "application/json",
      });
      const body = JSON.parse(String(init?.body));
      expect(Object.keys(body).sort()).toEqual(["idempotency_key", "object"]);
      return success(body, "COMMAND-SUCCESS");
    });
    commandSquare(successFetch);
    const successRequest = crypto.randomUUID();
    await expect(runCommand("publish_pos_item", { posLocationId: "L1", brandId: succeeded.brandIds[0] }, succeeded.ctx,
      { requestId: successRequest, correlationId: crypto.randomUUID() })).resolves.toEqual({
      publication: { attemptId: expect.any(String), status: "succeeded", errorCode: null },
      result: expect.objectContaining({ published: true, externalItemId: "COMMAND-SUCCESS" }),
    });
    expect(successFetch).toHaveBeenCalledTimes(1);

    const rejected = await fixture();
    const rejectedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ errors: [{ code: "VERSION_MISMATCH" }] }), { status: 409 }));
    commandSquare(rejectedFetch);
    const rejectedRequest = crypto.randomUUID();
    const rejectedResult = await runCommand("publish_pos_item", { posLocationId: "L1", brandId: rejected.brandIds[0] }, rejected.ctx,
      { requestId: rejectedRequest, correlationId: crypto.randomUUID() }) as { publication: { attemptId: string; status: string; errorCode: string | null } };
    expect(rejectedResult.publication).toEqual({ attemptId: expect.any(String), status: "rejected", errorCode: "version_mismatch" });
    expect(rejectedResult.publication.attemptId).not.toBe(rejectedRequest);

    const superseded = await fixture();
    const supersededRequest = crypto.randomUUID();
    const started = await beginSquarePublication(superseded.ctx, { posLocationId: "L1", brandId: superseded.brandIds[0]! }, supersededRequest, "publish_pos_item");
    sql(`update private.square_publications set status='superseded',error_code='connection_changed',
      result='{"published":false,"superseded":true}'::jsonb,finished_at=now() where id='${started.attemptId}'`);
    commandSquare(vi.fn());
    await expect(runCommand("publish_pos_item", { posLocationId: "L1", brandId: superseded.brandIds[0] }, superseded.ctx,
      { requestId: supersededRequest, correlationId: crypto.randomUUID() })).resolves.toMatchObject({
      publication: { attemptId: started.attemptId, status: "superseded", errorCode: "connection_changed" },
    });

    const transient = await fixture();
    commandSquare(vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("temporary", { status: 503 })));
    await expect(runCommand("publish_pos_item", { posLocationId: "L1", brandId: transient.brandIds[0] }, transient.ctx,
      { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() })).rejects.toThrow("Square is unavailable");
  });

  it("returns a confirmed durable menu publication envelope", async () => {
    const f = await fixture();
    commandSquare(vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => success(JSON.parse(String(init?.body)), "MENU-SUCCESS")));
    await expect(runCommand("publish_pos_menu", { posLocationId: "L1" }, f.ctx,
      { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() })).resolves.toEqual({
      publication: { attemptId: expect.any(String), status: "succeeded", errorCode: null },
      result: expect.objectContaining({ published: true, items: [expect.any(Object)] }),
    });
  });

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

  it("keeps publication fenced between credential CAS and catalog-attempt advancement", async () => {
    const f = await fixture();
    expect((await admin.from("pos_connections").update({ access_expires_at: "2020-01-01T00:00:00Z" })
      .eq("id", f.connectionId)).error).toBeNull();
    const sync = await beginSquareCatalogSync(f.ctx, crypto.randomUUID());
    if ("replayResult" in sync) throw new Error("unexpected replay");
    const tokens = await readVersionedIntegrationTokens(f.ctx, "square");
    await compareAndSwapSquareTokens(f.ctx, tokens, {
      accessToken: "refreshed-access", refreshToken: "refreshed-secret",
      accessExpiresAt: "2026-10-10T00:00:00Z", merchantId: sync.merchantId, receivedAt: "2026-09-10T00:00:00Z",
    }, 2_592_000);
    expect(sql(`select credential_version from public.pos_connections where id='${f.connectionId}';
      select credential_version from private.square_catalog_syncs where actor_id='${sync.actorId}' and request_id='${sync.requestId}'`))
      .toEqual(["2", "1"]);

    const provider = vi.fn<typeof globalThis.fetch>();
    await expect(publishSquareCatalogItem(f.ctx, { posLocationId: "L1", brandId: f.brandIds[0]! }, crypto.randomUUID(),
      new SquareClient(config, provider), "publish_pos_item")).rejects.toMatchObject({ status: 409 });
    expect(provider).not.toHaveBeenCalled();
    expect(sql(`select count(*) from private.square_publications where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);

    const advanced = await advanceSquareCatalogSync(f.ctx, sync, 2);
    await recordSquareCatalogSnapshot(f.ctx, advanced, { locations: [{ id: "L1", name: "Taproom", status: "ACTIVE" }], variations: [] });
    const publication = await beginSquarePublication(f.ctx, { posLocationId: "L1", brandId: f.brandIds[0]! },
      crypto.randomUUID(), "publish_pos_item");
    expect(publication.catalogGeneration).toBe(1);
  });
});
