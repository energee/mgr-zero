import { describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import { assembleFinishedGoods, toFinishedGoodsViewProps } from "@/lib/mgr/finished-goods-view";
import { admin, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation } from "./helpers";
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
  }, 30_000);
});
