import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runCommand } from "@/lib/commands/registry";
import { publicEnv } from "@/lib/env/public";
import { assembleFinishedGoods, toFinishedGoodsViewProps } from "@/lib/mgr/finished-goods-view";
import { admin, insertFixture, makeBrewery, makeStaff, makeStaffCtx, seedCatalog, seedLocation } from "./helpers";
import "@/lib/commands/all";

type StockRow = { brewery_id: string; sku_id: string; qty: string };
type SkuRow = { id: string; name: string; brands: { name: string } | null };

const fixtureId = (prefix: string, index: number) =>
  `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

describe("complete finished-goods reads", () => {
  it("assembles every owned stock row beyond the PostgREST row cap", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const location = await seedLocation(brewery.id, { kind: "taproom" });
    const format = await admin.from("formats").insert({
      brewery_id: brewery.id,
      name: `Complete ${crypto.randomUUID()}`,
      basis: "packaged",
      package_type: "can",
      bbl_per_unit: 0.01,
    }).select("id").single();
    expect(format.error).toBeNull();

    const brandPrefix = crypto.randomUUID().slice(0, 8);
    const skuPrefix = crypto.randomUUID().slice(0, 8);
    const brandRows = Array.from({ length: 1_001 }, (_, index) => ({
      id: fixtureId(brandPrefix, index + 1),
      brewery_id: brewery.id,
      name: `Complete brand ${String(index + 1).padStart(4, "0")}`,
    }));
    const skuRows = brandRows.map((brand, index) => ({
      id: fixtureId(skuPrefix, index + 1),
      brewery_id: brewery.id,
      brand_id: brand.id,
      format_id: format.data!.id,
      name: index === 1_000 ? "Cap target" : `Complete SKU ${String(index + 1).padStart(4, "0")}`,
    }));
    expect((await admin.from("brands").insert(brandRows)).error).toBeNull();
    expect((await admin.from("skus").insert(skuRows)).error).toBeNull();

    const target = skuRows.at(-1)!;
    insertFixture("inventory_movements", skuRows.map((sku) => ({
      brewery_id: brewery.id,
      sku_id: sku.id,
      location_id: location.id,
      bin_id: location.binId,
      qty: sku.id === target.id ? 7 : 1,
      type: "opening_balance",
      created_by: ctx.userId,
    })));
    expect((await admin.from("allocations").insert({
      brewery_id: brewery.id,
      sku_id: target.id,
      qty: 3,
      source: "taproom_standing",
      ref: location.id,
    })).error).toBeNull();

    const foreign = await makeBrewery();
    const foreignCtx = await makeStaffCtx(foreign.id, "admin");
    const foreignLocation = await seedLocation(foreign.id);
    const foreignSku = await seedCatalog(foreign.id, { product: "Foreign stock" });
    insertFixture("inventory_movements", {
      brewery_id: foreign.id,
      sku_id: foreignSku.skuId,
      location_id: foreignLocation.id,
      bin_id: foreignLocation.binId,
      qty: 99,
      type: "opening_balance",
      created_by: foreignCtx.userId,
    });

    const [skus, binRows, atpRows] = await Promise.all([
      runCommand("list_skus", {}, ctx) as Promise<SkuRow[]>,
      runCommand("get_bin_on_hand", {}, ctx) as Promise<StockRow[]>,
      runCommand("get_atp", {}, ctx) as Promise<StockRow[]>,
    ]);
    const model = toFinishedGoodsViewProps(assembleFinishedGoods(skus, binRows, atpRows));

    expect({ binRows: binRows.length, atpRows: atpRows.length, assembled: model.rows.length })
      .toEqual({ binRows: 1_001, atpRows: 1_001, assembled: 1_001 });
    expect(binRows.every((row) => row.brewery_id === brewery.id && row.sku_id !== foreignSku.skuId)).toBe(true);
    expect(atpRows.every((row) => row.brewery_id === brewery.id && row.sku_id !== foreignSku.skuId)).toBe(true);
    expect(model.rows.find((row) => row.title.endsWith("Cap target"))?.detail)
      .toBe("7 on hand · 3 allocated · ATP 4");

    const lowId = fixtureId("00000000", Number.parseInt(crypto.randomUUID().slice(-8), 16));
    const highId = fixtureId("ffffffff", Number.parseInt(crypto.randomUUID().slice(-8), 16));
    const churnBrands = ["Low churn", "High churn"].map((name) => ({ brewery_id: brewery.id, name: `${name} ${crypto.randomUUID()}` }));
    const insertedBrands = await admin.from("brands").insert(churnBrands).select("id");
    expect(insertedBrands.error).toBeNull();
    expect((await admin.from("skus").insert([
      { id: lowId, brewery_id: brewery.id, brand_id: insertedBrands.data![0].id, format_id: format.data!.id, name: "Low churn SKU" },
      { id: highId, brewery_id: brewery.id, brand_id: insertedBrands.data![1].id, format_id: format.data!.id, name: "High churn SKU" },
    ])).error).toBeNull();
    await runCommand("set_standing_allocation", { locationId: location.id, skuId: lowId, qty: 1 }, ctx);

    let churned = false;
    const staff = await makeStaff(brewery.id, "admin");
    const db = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
      auth: { persistSession: false },
      global: { fetch: async (input, init) => {
        const response = await globalThis.fetch(input, init);
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
        const range = new Headers(init?.headers).get("range");
        if (!churned && url.pathname.endsWith("/atp") && init?.method !== "HEAD"
          && (range === "0-499" || url.searchParams.get("limit") === "500")) {
          churned = true;
          await runCommand("set_standing_allocation", { locationId: location.id, skuId: lowId, qty: 0 }, ctx);
          await runCommand("set_standing_allocation", { locationId: location.id, skuId: highId, qty: 1 }, ctx);
        }
        return response;
      } },
    });
    expect((await db.auth.signInWithPassword({ email: staff.email, password: "test-password-1" })).error).toBeNull();
    const churnRows = await runCommand("get_atp", {}, { db, userId: staff.id, breweryId: brewery.id, role: "admin" }) as StockRow[];
    const currentIds = new Set(churnRows.map((row) => row.sku_id));
    expect(churned).toBe(true);
    expect(churnRows).toHaveLength(1_002);
    expect({
      everyCurrentStock: skuRows.every((sku) => currentIds.has(sku.id)),
      closedAllocationOnlyRow: currentIds.has(lowId),
      openedAllocationOnlyRow: currentIds.has(highId),
    }).toEqual({ everyCurrentStock: true, closedAllocationOnlyRow: false, openedAllocationOnlyRow: true });
  }, 30_000);
});
