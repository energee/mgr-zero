import { beforeAll, describe, expect, it, vi } from "vitest";
import { SquareClient, syncSquareCatalog, syncSquareSales } from "@/lib/pos";
import { admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";

const config = {
  applicationId: "app",
  applicationSecret: "secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth",
  environment: "sandbox" as const,
};

type Order = Record<string, unknown>;

beforeAll(() => {
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
  expect(process.env.DATABASE_URL).toContain(":54352/");
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function squareFetch(merchantId: string, pages: (body: Record<string, unknown>) => Response | Promise<Response>, locations = [
  { id: "L1", name: "Taproom", status: "ACTIVE", merchant_id: merchantId },
  { id: "L2", name: "Beer garden", status: "ACTIVE", merchant_id: merchantId },
]) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v2/locations")) return response({ locations });
    if (url.endsWith("/v2/orders/search")) return pages(JSON.parse(String(init?.body)) as Record<string, unknown>);
    throw new Error(`unexpected Square request ${url}`);
  });
}

function saleOrder(input: {
  id: string; location?: string; version?: number; updatedAt: string; createdAt?: string;
  lines?: Record<string, unknown>[]; returns?: Record<string, unknown>[];
}): Order {
  return {
    id: input.id,
    location_id: input.location ?? "L1",
    version: input.version ?? 1,
    state: "COMPLETED",
    created_at: input.createdAt ?? input.updatedAt,
    updated_at: input.updatedAt,
    line_items: input.lines ?? [],
    returns: input.returns ?? [],
  };
}

const line = (uid: string, variation: string, quantity: string, amount = 1600, extra: Record<string, unknown> = {}) => ({
  uid,
  catalog_object_id: variation,
  catalog_version: 11,
  quantity,
  item_type: "ITEM",
  total_money: { amount, currency: "USD" },
  ...extra,
});

const returned = (uid: string, sourceLine: string | null, quantity: string, extra: Record<string, unknown> = {}) => ({
  uid,
  ...(sourceLine ? { source_line_item_uid: sourceLine } : {}),
  catalog_object_id: "V1",
  catalog_version: 11,
  quantity,
  item_type: "ITEM",
  total_money: { amount: 1600, currency: "USD" },
  ...extra,
});

async function fixture(options: { squareCatalog?: boolean } = {}) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "admin");
  const merchantId = `merchant-${crypto.randomUUID()}`;
  const connection = await admin.from("pos_connections").insert({
    brewery_id: brewery.id, merchant_id: merchantId, state: "connected", credential_version: 1,
    access_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).select("id").single();
  expect(connection.error).toBeNull();
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    values('${brewery.id}','square','${connection.data!.id}','access','refresh',1)`);
  const one = await seedLocation(brewery.id, { name: "Taproom", kind: "taproom" });
  const two = await seedLocation(brewery.id, { name: "Beer garden", kind: "taproom" });
  const catalog = await seedCatalog(brewery.id, { product: "Hazy", packageType: "keg", bblPerUnit: .5 });
  const pour = await admin.from("formats").insert({
    brewery_id: brewery.id, brand_id: catalog.brandId, name: "Pint", basis: "poured", ounces: 16,
  }).select("id").single();
  expect(pour.error).toBeNull();
  expect((await admin.from("pos_locations").insert([
    { brewery_id: brewery.id, connection_id: connection.data!.id, external_location_id: "L1", location_id: one.id },
    { brewery_id: brewery.id, connection_id: connection.data!.id, external_location_id: "L2", location_id: two.id },
  ])).error).toBeNull();
  if (options.squareCatalog !== false) {
    expect((await admin.from("pos_catalog_variations").insert({
      brewery_id: brewery.id, connection_id: connection.data!.id, external_item_id: "I1", external_variation_id: "V1",
      external_item_name: "Hazy", external_variation_name: "Pint", source_version: 11, available: false,
    })).error).toBeNull();
    expect((await admin.from("pos_item_mappings").insert({
      brewery_id: brewery.id, connection_id: connection.data!.id, external_item_id: "I1", external_variation_id: "V1",
      format_id: pour.data!.id,
    })).error).toBeNull();
  }
  return { brewery, ctx, merchantId, connectionId: connection.data!.id as string, locations: [one, two], catalog, pour: pour.data! };
}

function currentExpected(breweryId: string) {
  return Number(sql(`select coalesce(sum(e.expected_bbl),0)::text from private.pos_current_sales s
    join public.pos_sale_expectations e on e.sale_id=s.id where s.brewery_id='${breweryId}' and s.contributes`)[0]);
}

describe("Square durable sales sync", () => {
  it("rejects a disjoint same-version order snapshot atomically and replays an exact removal tombstone", async () => {
    const f = await fixture();
    const updated1 = new Date(Date.now() - 120_000).toISOString();
    const v1 = saleOrder({ id: "SNAPSHOT", version: 1, updatedAt: updated1, lines: [line("A", "V1", "1")] });
    await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config,
      squareFetch(f.merchantId, () => response({ orders: [v1] }))));
    const before = sql(`select (select count(*) from public.pos_sales where brewery_id='${f.brewery.id}')||':'||
      (select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}')||':'||
      (select sales_synced_through::text from public.pos_connections where id='${f.connectionId}')`)[0];

    const driftRequest = crypto.randomUUID();
    const disjointV1 = saleOrder({ id: "SNAPSHOT", version: 1, updatedAt: updated1, lines: [line("B", "V1", "3")] });
    await expect(syncSquareSales(f.ctx, driftRequest, new SquareClient(config,
      squareFetch(f.merchantId, () => response({ orders: [disjointV1] }))))).rejects.toMatchObject({ status: 409 });
    expect(sql(`select (select count(*) from public.pos_sales where brewery_id='${f.brewery.id}')||':'||
      (select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}')||':'||
      (select sales_synced_through::text from public.pos_connections where id='${f.connectionId}')`)).toEqual([before]);
    expect(sql(`select pages||':'||coalesce(cursor,'none')||':'||status from private.square_sales_syncs
      where request_id='${driftRequest}'`)).toEqual(["0:none:in_progress"]);

    const updated2 = new Date(Date.now() - 60_000).toISOString();
    const removedV2 = saleOrder({ id: "SNAPSHOT", version: 2, updatedAt: updated2, lines: [] });
    await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config,
      squareFetch(f.merchantId, () => response({ orders: [removedV2] }))));
    await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config,
      squareFetch(f.merchantId, () => response({ orders: [removedV2] }))));
    expect(sql(`select source_version::text||':'||external_line_id||':'||fact_status from public.pos_sales
      where brewery_id='${f.brewery.id}' and external_order_id='SNAPSHOT' order by source_version`))
      .toEqual(["1:A:accepted", "2:A:removed"]);
    expect(currentExpected(f.brewery.id)).toBe(0);
    expect(sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
  });

  it("keeps a sale before catalog visible and reconciles it through a later deleted variation mapping", async () => {
    const f = await fixture({ squareCatalog: false });
    const order = saleOrder({ id: "BEFORE-CATALOG", updatedAt: new Date(Date.now() - 60_000).toISOString(),
      lines: [line("early", "V1", "1")] });
    await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config,
      squareFetch(f.merchantId, () => response({ orders: [order] }))));
    const identityBefore = sql(`select source_hash||':'||external_order_id||':'||external_line_id||':'||source_version::text
      from public.pos_sales where brewery_id='${f.brewery.id}'`)[0];
    expect(sql(`select coalesce(external_item_id,'?')||':'||external_variation_id from public.pos_unmapped_items
      where brewery_id='${f.brewery.id}'`)).toEqual(["?:V1"]);

    const catalogFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v2/locations")) return response({ locations: [
        { id: "L1", name: "Taproom", status: "ACTIVE", merchant_id: f.merchantId },
        { id: "L2", name: "Beer garden", status: "ACTIVE", merchant_id: f.merchantId },
      ] });
      if (url.endsWith("/v2/catalog/search")) return response({ objects: [{ id: "I1", type: "ITEM", version: 12,
        item_data: { name: "Hazy", variations: [{ id: "V1", type: "ITEM_VARIATION", version: 12, is_deleted: true,
          item_variation_data: { item_id: "I1", name: "Pint" } }] } }] });
      throw new Error(`unexpected Square request ${url}`);
    });
    await syncSquareCatalog(f.ctx, crypto.randomUUID(), new SquareClient(config, catalogFetch));
    expect(sql(`select available::text from public.pos_catalog_variations where connection_id='${f.connectionId}'
      and external_variation_id='V1'`)).toEqual(["false"]);
    const mapped = await f.ctx.db.rpc("set_pos_item_mapping", { p_brewery: f.brewery.id, p_external_item: "I1",
      p_external_variation: "V1", p_sku: null, p_format: f.pour.id, p_ignored: false, p_request_id: crypto.randomUUID() });
    expect(mapped.error).toBeNull();
    expect(sql(`select source_hash||':'||external_order_id||':'||external_line_id||':'||source_version::text
      from public.pos_sales where brewery_id='${f.brewery.id}'`)).toEqual([identityBefore]);
    expect(sql(`select (external_item_id is null)::text from public.pos_sales where brewery_id='${f.brewery.id}'`)).toEqual(["true"]);
    expect(currentExpected(f.brewery.id)).toBeCloseTo(16 / 3968, 10);
    expect(sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
  });

  it("keeps the sales watermark monotonic when a later request completes before an older one", async () => {
    const f = await fixture();
    let enterA!: () => void, releaseA!: () => void;
    const enteredA = new Promise<void>((resolve) => { enterA = resolve; });
    const releasedA = new Promise<void>((resolve) => { releaseA = resolve; });
    const requestA = crypto.randomUUID(), requestB = crypto.randomUUID();
    const a = syncSquareSales(f.ctx, requestA, new SquareClient(config, squareFetch(f.merchantId, async () => {
      enterA(); await releasedA; return response({ orders: [] });
    })));
    await enteredA;
    await new Promise((resolve) => setTimeout(resolve, 10));
    let afterB = "";
    try {
      await syncSquareSales(f.ctx, requestB, new SquareClient(config,
        squareFetch(f.merchantId, () => response({ orders: [] }))));
      afterB = sql(`select sales_synced_through::text from public.pos_connections where id='${f.connectionId}'`)[0];
    } finally {
      releaseA();
    }
    await a;
    const [aEnd, bEnd] = sql(`select ends_at::text from private.square_sales_syncs where request_id='${requestA}';
      select ends_at::text from private.square_sales_syncs where request_id='${requestB}'`);
    expect(Date.parse(bEnd)).toBeGreaterThan(Date.parse(aEnd));
    expect(sql(`select sales_synced_through::text from public.pos_connections where id='${f.connectionId}'`)).toEqual([afterB]);
    expect(sql(`select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}'`)).toEqual(["4"]);
    expect(sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
  });

  it("keeps an empty newer order version current when a delayed older line finishes afterward", async () => {
    const f = await fixture();
    const updated1 = new Date(Date.now() - 120_000).toISOString();
    const updated2 = new Date(Date.now() - 60_000).toISOString();
    let enterA!: () => void, releaseA!: () => void;
    const enteredA = new Promise<void>((resolve) => { enterA = resolve; });
    const releasedA = new Promise<void>((resolve) => { releaseA = resolve; });
    const older = saleOrder({ id: "EMPTY-NEWER", version: 1, updatedAt: updated1, lines: [line("old", "V1", "4")] });
    const newer = saleOrder({ id: "EMPTY-NEWER", version: 2, updatedAt: updated2, lines: [] });
    const a = syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config, squareFetch(f.merchantId, async () => {
      enterA(); await releasedA; return response({ orders: [older] });
    })));
    await enteredA;
    try {
      await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config,
        squareFetch(f.merchantId, () => response({ orders: [newer] }))));
    } finally {
      releaseA();
    }
    await a;
    expect(sql(`select source_version::text from private.square_order_snapshots where brewery_id='${f.brewery.id}'
      and external_order_id='EMPTY-NEWER' order by source_version`)).toEqual(["1", "2"]);
    expect(sql(`select source_version::text||':'||external_line_id||':'||fact_status from public.pos_sales
      where brewery_id='${f.brewery.id}' and external_order_id='EMPTY-NEWER'`)).toEqual(["1:old:accepted"]);
    expect(sql(`select external_line_id from private.pos_current_sales where brewery_id='${f.brewery.id}'
      and external_order_id='EMPTY-NEWER'`)).toEqual([]);
    expect(currentExpected(f.brewery.id)).toBe(0);
    expect(sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
  });

  it("deduplicates pages and retries while preserving sales, linked returns, exchanges, unsupported facts, and zero inventory writes", async () => {
    const f = await fixture();
    const now = new Date(), late = new Date(now.getTime() - 10 * 86_400_000).toISOString();
    const updated = new Date(now.getTime() - 60_000).toISOString();
    const orders = [
      saleOrder({ id: "O1", updatedAt: updated, lines: [line("same", "V1", "2", 3200)] }),
      saleOrder({ id: "O2", location: "L2", updatedAt: updated, lines: [line("same", "V1", "1")] }),
      saleOrder({ id: "EX", updatedAt: updated, lines: [line("new", "V1", "1")], returns: [
        { uid: "RET", source_order_id: "O1", return_line_items: [returned("r1", "same", "1")] },
      ] }),
      saleOrder({ id: "CUSTOM", updatedAt: updated, returns: [
        { uid: "CUSTOM-RET", source_order_id: "O1", return_line_items: [
          { uid: "custom", quantity: "1", item_type: "CUSTOM_AMOUNT", total_money: { amount: 500, currency: "USD" } },
        ] },
      ] }),
      saleOrder({ id: "UNLINKED", updatedAt: updated, returns: [
        { uid: "UNLINKED-RET", return_line_items: [returned("unlinked", null, "1")] },
      ] }),
      saleOrder({ id: "MEASURED", updatedAt: updated, lines: [line("measured", "V1", "1.25", 2000, {
        quantity_unit: { measurement_unit: { weight_unit: "GENERIC_POUND" }, precision: 2 },
      })] }),
      saleOrder({ id: "PRECISE", updatedAt: updated, lines: [line("precise", "V1", "1.00001")] }),
      saleOrder({ id: "LATE", updatedAt: updated, createdAt: late, lines: [line("late", "V1", "1")] }),
      saleOrder({ id: "OVER", updatedAt: updated, returns: [
        { uid: "OVER-RET", source_order_id: "O1", return_line_items: [returned("over", "same", "2")] },
      ] }),
    ];
    const seenBodies: Record<string, unknown>[] = [];
    const fetcher = squareFetch(f.merchantId, (body) => {
      seenBodies.push(body);
      return body.cursor ? response({ orders: orders.slice(2) }) : response({ orders: orders.slice(0, 4), cursor: "page-2" });
    });
    const requestId = crypto.randomUUID();
    const before = sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)[0];
    const first = await syncSquareSales(f.ctx, requestId, new SquareClient(config, fetcher));
    const after = sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)[0];

    expect(first).toMatchObject({ complete: true, acceptedFacts: 5, unsupportedFacts: 5, pages: 2, locations: 2 });
    expect(after).toBe(before);
    expect(seenBodies).toHaveLength(2);
    for (const body of seenBodies) {
      expect(body).toMatchObject({
        location_ids: ["L1", "L2"],
        query: { filter: { date_time_filter: { updated_at: { start_at: expect.any(String), end_at: expect.any(String) } } },
          sort: { sort_field: "UPDATED_AT", sort_order: "ASC" } },
        return_entries: false,
      });
    }
    expect((seenBodies[1] as { cursor?: string }).cursor).toBe("page-2");
    expect((seenBodies[0] as any).query.filter.date_time_filter.updated_at)
      .toEqual((seenBodies[1] as any).query.filter.date_time_filter.updated_at);

    expect(sql(`select external_order_id||':'||external_line_id from public.pos_sales
      where brewery_id='${f.brewery.id}' and external_line_id='same' order by external_order_id`)).toEqual(["O1:same", "O2:same"]);
    expect(sql(`select external_order_id||':'||fact_status||':'||coalesce(unsupported_reason,'') from public.pos_sales
      where brewery_id='${f.brewery.id}' and fact_status='unsupported' order by external_order_id`)).toEqual([
        "CUSTOM:unsupported:custom_amount", "MEASURED:unsupported:measured_quantity",
        "OVER:unsupported:return_quantity_exceeds_source", "PRECISE:unsupported:unsupported_count_quantity",
        "UNLINKED:unsupported:unlinked_return",
      ]);
    expect(sql(`select source_quantity from public.pos_sales where brewery_id='${f.brewery.id}' and external_order_id in ('MEASURED','PRECISE') order by external_order_id`))
      .toEqual(["1.25", "1.00001"]);
    expect(currentExpected(f.brewery.id)).toBeCloseTo(4 * 16 / 3968, 10);

    const retry = squareFetch(f.merchantId, () => { throw new Error("completed replay contacted Square"); });
    await expect(syncSquareSales(f.ctx, requestId, new SquareClient(config, retry))).resolves.toEqual(first);
    expect(retry).not.toHaveBeenCalled();
    expect(sql(`select count(*) from public.pos_sales where brewery_id='${f.brewery.id}'`)).toEqual(["10"]);
    expect(sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)).toEqual([before]);
  });

  it("appends revised quantities and removals without letting a duplicate or late older revision become current", async () => {
    const f = await fixture();
    const updated1 = new Date(Date.now() - 120_000).toISOString();
    const updated2 = new Date(Date.now() - 60_000).toISOString();
    const v1 = saleOrder({ id: "REV", version: 1, updatedAt: updated1, lines: [line("keep", "V1", "1"), line("remove", "V1", "2")] });
    await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config, squareFetch(f.merchantId, () => response({ orders: [v1] }))));
    expect(currentExpected(f.brewery.id)).toBeCloseTo(3 * 16 / 3968, 10);

    const v2 = saleOrder({ id: "REV", version: 2, updatedAt: updated2, lines: [line("keep", "V1", "2")] });
    await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config, squareFetch(f.merchantId, () => response({ orders: [v2] }))));
    expect(sql(`select source_version::text||':'||external_line_id||':'||fact_status from public.pos_sales
      where brewery_id='${f.brewery.id}' and external_order_id='REV' order by source_version,external_line_id`)).toEqual([
        "1:keep:accepted", "1:remove:accepted", "2:keep:accepted", "2:remove:removed",
    ]);
    expect(currentExpected(f.brewery.id)).toBeCloseTo(2 * 16 / 3968, 10);
    expect(Number(sql(`select sum(e.expected_bbl)::text from public.pos_sale_expectations e
      join public.pos_sales s on s.id=e.sale_id where s.brewery_id='${f.brewery.id}' and s.external_order_id='REV'`)[0]))
      .toBeCloseTo(5 * 16 / 3968, 10);

    await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config, squareFetch(f.merchantId, () => response({ orders: [v1] }))));
    expect(currentExpected(f.brewery.id)).toBeCloseTo(2 * 16 / 3968, 10);
    expect(sql(`select count(*) from public.pos_sales where brewery_id='${f.brewery.id}' and external_order_id='REV'`)).toEqual(["4"]);
    expect(sql(`select external_line_id from private.pos_current_sales where brewery_id='${f.brewery.id}' and external_order_id='REV' order by 1`))
      .toEqual(["keep", "remove"]);
  });

  it("resumes the exact failed page/window and records coverage only after all locations and pages complete", async () => {
    const f = await fixture();
    const locations = Array.from({ length: 11 }, (_, index) => ({ id: `L${index + 1}`, name: `Location ${index + 1}`,
      status: "ACTIVE", merchant_id: f.merchantId }));
    expect((await admin.from("pos_locations").update({ location_id: null }).eq("connection_id", f.connectionId)
      .eq("external_location_id", "L2")).error).toBeNull();
    const updated = new Date(Date.now() - 60_000).toISOString();
    const pageOne = saleOrder({ id: "PAGE1", updatedAt: updated, lines: [line("one", "V1", "1")] });
    const requestId = crypto.randomUUID();
    let firstWindow: unknown;
    const failing = squareFetch(f.merchantId, (body) => {
      firstWindow ??= (body as any).query.filter.date_time_filter.updated_at;
      return body.cursor ? response({ errors: [{ category: "API_ERROR" }] }, 503) : response({ orders: [pageOne], cursor: "resume-here" });
    }, locations);
    await expect(syncSquareSales(f.ctx, requestId, new SquareClient(config, failing))).rejects.toThrow("Square is unavailable");
    expect(sql(`select count(*) from public.pos_sales where brewery_id='${f.brewery.id}'`)).toEqual(["1"]);
    expect(sql(`select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
    expect(sql(`select cursor from private.square_sales_syncs where brewery_id='${f.brewery.id}' and request_id='${requestId}'`)).toEqual(["resume-here"]);

    const resumedBodies: Record<string, unknown>[] = [];
    const resumed = squareFetch(f.merchantId, (body) => {
      resumedBodies.push(body);
      return response({ orders: [] });
    }, locations);
    const result = await syncSquareSales(f.ctx, requestId, new SquareClient(config, resumed));
    expect(result).toMatchObject({ complete: true, pages: 3, locations: 11 });
    expect(resumedBodies).toHaveLength(2);
    expect(resumedBodies[0]).toMatchObject({ cursor: "resume-here" });
    expect((resumedBodies[0].location_ids as string[])).toHaveLength(10);
    expect((resumedBodies[1].location_ids as string[])).toHaveLength(1);
    expect((resumedBodies[0] as any).query.filter.date_time_filter.updated_at).toEqual(firstWindow);
    expect(sql(`select external_location_id||':'||complete::text from public.pos_sales_coverage
      where brewery_id='${f.brewery.id}' and external_location_id in ('L1','L2') order by external_location_id`))
      .toEqual(["L1:true", "L2:true"]);
    expect(sql(`select coalesce(location_id::text,'unmapped') from public.pos_sales_coverage where brewery_id='${f.brewery.id}' and external_location_id='L2'`))
      .toEqual(["unmapped"]);
    expect((await f.ctx.db.rpc("set_pos_location_mapping", { p_brewery: f.brewery.id, p_external_location: "L2",
      p_location: f.locations[1].id, p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect(sql(`select location_id::text from public.pos_sales_coverage where brewery_id='${f.brewery.id}' and external_location_id='L2'`))
      .toEqual([f.locations[1].id]);
    expect(sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
  });

  it("refuses an order outside the fixed provider window without facts, checkpoint, or coverage", async () => {
    const f = await fixture();
    const requestId = crypto.randomUUID();
    const fetcher = squareFetch(f.merchantId, (body) => {
      const end = (body as any).query.filter.date_time_filter.updated_at.end_at as string;
      return response({ orders: [saleOrder({ id: "OUTSIDE", updatedAt: new Date(Date.parse(end) + 1).toISOString(),
        lines: [line("outside", "V1", "1")] })] });
    });
    await expect(syncSquareSales(f.ctx, requestId, new SquareClient(config, fetcher))).rejects.toThrow("Square is unavailable");
    expect(sql(`select count(*) from public.pos_sales where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
    expect(sql(`select pages from private.square_sales_syncs where brewery_id='${f.brewery.id}' and request_id='${requestId}'`)).toEqual(["0"]);
    expect(sql(`select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);
  });

  it("treats an omitted orders field as an observed empty page and still rejects malformed orders", async () => {
    const f = await fixture();
    const empty = await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config,
      squareFetch(f.merchantId, () => response({}))));
    expect(empty).toMatchObject({ complete: true, acceptedFacts: 0, unsupportedFacts: 0, pages: 1, locations: 2 });
    const before = sql(`select (select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}')||':'||
      (select sales_synced_through::text from public.pos_connections where id='${f.connectionId}')`)[0];
    expect(before.startsWith("2:")).toBe(true);

    const malformedRequest = crypto.randomUUID();
    await expect(syncSquareSales(f.ctx, malformedRequest, new SquareClient(config,
      squareFetch(f.merchantId, () => response({ orders: null }))))).rejects.toThrow("Square is unavailable");
    expect(sql(`select (select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}')||':'||
      (select sales_synced_through::text from public.pos_connections where id='${f.connectionId}')`)).toEqual([before]);
    expect(sql(`select pages::text from private.square_sales_syncs where request_id='${malformedRequest}'`)).toEqual(["0"]);
  });

  it("enforces current Admin, tenant, and connection generation while feeding P12 current draft and completed variance only", async () => {
    const f = await fixture();
    const observed = new Date(Date.now() - 2 * 86_400_000);
    const second = new Date(Date.now() - 86_400_000);
    const firstCount = await ins("taproom_counts", {
      brewery_id: f.brewery.id, location_id: f.locations[0].id, counted_on: observed.toISOString().slice(0, 10),
      observed_at: observed.toISOString(), created_at: observed.toISOString(), counted_by: f.ctx.userId,
    });
    const secondCount = await ins("taproom_counts", {
      brewery_id: f.brewery.id, location_id: f.locations[0].id, counted_on: second.toISOString().slice(0, 10),
      observed_at: second.toISOString(), created_at: second.toISOString(), counted_by: f.ctx.userId, prior_count_id: firstCount.id,
    });
    const physicalBefore = sql(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.taproom_counts t where brewery_id='${f.brewery.id}'`)[0];
    const order = saleOrder({ id: "P12", updatedAt: new Date().toISOString(), createdAt: new Date(observed.getTime() + 3_600_000).toISOString(),
      lines: [line("p12", "V1", "1")] });
    await syncSquareSales(f.ctx, crypto.randomUUID(), new SquareClient(config, squareFetch(f.merchantId, () => response({ orders: [order] }))));
    const draft = await f.ctx.db.rpc("get_taproom_draft_projection", { p_brewery: f.brewery.id, p_location: f.locations[0].id });
    const variance = await f.ctx.db.rpc("get_taproom_variance", { p_brewery: f.brewery.id, p_location: f.locations[0].id, p_weeks: 4 });
    expect(draft.error ?? variance.error).toBeNull();
    expect((variance.data as any).periods.at(-1)).toMatchObject({ count_id: secondCount.id, expected_bbl: 16 / 3968 });
    expect(draft.data).toMatchObject({ expected_bbl: null, coverage_complete: false, reason: "incomplete_pos_coverage" });
    expect(sql(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.taproom_counts t where brewery_id='${f.brewery.id}'`)[0]).toBe(physicalBefore);
    expect(sql(`select count(*) from public.inventory_movements where brewery_id='${f.brewery.id}'`)).toEqual(["0"]);

    const warehouse = await makeStaffCtx(f.brewery.id, "warehouse");
    await expect(syncSquareSales(warehouse, crypto.randomUUID(), new SquareClient(config, squareFetch(f.merchantId, () => response({ orders: [] })))))
      .rejects.toMatchObject({ status: 403 });
    const foreign = await makeBrewery();
    const foreignCtx = await makeStaffCtx(foreign.id, "admin");
    await expect(syncSquareSales(foreignCtx, crypto.randomUUID(), new SquareClient(config, squareFetch(f.merchantId, () => response({ orders: [] })))))
      .rejects.toMatchObject({ status: 404 });

    const staleRequest = crypto.randomUUID();
    const coverageBefore = sql(`select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}'`)[0];
    const staleFetch = squareFetch(f.merchantId, async () => {
      sql(`update public.pos_connections set credential_version=2 where id='${f.connectionId}'`);
      return response({ orders: [] });
    });
    await expect(syncSquareSales(f.ctx, staleRequest, new SquareClient(config, staleFetch))).rejects.toMatchObject({ status: 409 });
    expect(sql(`select count(*) from public.pos_sales_coverage where brewery_id='${f.brewery.id}'`)[0]).toBe(coverageBefore);
  });
});
