// tests/commands-import.test.ts — TDD spec for the import_csv command (Task 9).
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx, admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type ImportResult = { inserted: number; errors: { row: number; message: string }[] };
type OnHandRow = { qty: number | string };

describe("import_csv", () => {
  let ctx: any, b: any;
  beforeAll(async () => {
    b = await makeBrewery();
    ctx = await makeStaffCtx(b.id);
    await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" });
  });

  it("imports products+skus then opening balances; bad rows reported not fatal", async () => {
    const r1 = await runCommand<ImportResult>("import_csv", { kind: "products_skus", rows: [
      { product: "Hazy IPA", style: "IPA", abv: "6.5", sku_name: "1/2 bbl keg", package_type: "keg", units_per_case: "", bbl_per_unit: "0.5" },
      { product: "Hazy IPA", style: "IPA", abv: "6.5", sku_name: "16oz 4-pack", package_type: "can", units_per_case: "6", bbl_per_unit: "0.01612903" },
    ] }, ctx);
    expect(r1.inserted).toBe(2);
    const r2 = await runCommand<ImportResult>("import_csv", { kind: "opening_balances", rows: [
      { product: "Hazy IPA", sku_name: "1/2 bbl keg", location: "WH", qty: "24" },
      { product: "Hazy IPA", sku_name: "does-not-exist", location: "WH", qty: "5" },
    ] }, ctx);
    expect(r2.inserted).toBe(1);
    expect(r2.errors).toHaveLength(1);
    const oh = await runCommand<OnHandRow[]>("get_on_hand", {}, ctx);
    expect(oh.some((r: any) => Number(r.qty) === 24)).toBe(true);
  });

  it("rejects a non-numeric abv instead of silently nulling it", async () => {
    const r = await runCommand<ImportResult>("import_csv", { kind: "products_skus", rows: [
      { product: "Bad ABV Ale", style: "Pale", abv: "n/a", sku_name: "6-pack", package_type: "can", units_per_case: "4", bbl_per_unit: "0.05" },
    ] }, ctx);
    expect(r.inserted).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/abv/i);
    const { data: product } = await ctx.db.from("products").select("id").eq("brewery_id", b.id).eq("name", "Bad ABV Ale").maybeSingle();
    expect(product).toBeNull();
  });

  it("rejects a qty of 0 for opening balances with a clean error", async () => {
    const r = await runCommand<ImportResult>("import_csv", { kind: "opening_balances", rows: [
      { product: "Hazy IPA", sku_name: "1/2 bbl keg", location: "WH", qty: "0" },
    ] }, ctx);
    expect(r.inserted).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/qty/i);
  });

  it("resolves an ambiguous sku_name via the product column instead of failing PGRST116", async () => {
    // Two different products both carry a sku literally named "1/2 bbl keg" —
    // sku_name alone is not unique per brewery, only per (product, name).
    await runCommand<ImportResult>("import_csv", { kind: "products_skus", rows: [
      { product: "Pale Ale", style: "APA", abv: "5.2", sku_name: "1/2 bbl keg", package_type: "keg", units_per_case: "", bbl_per_unit: "0.5" },
    ] }, ctx);
    const r = await runCommand<ImportResult>("import_csv", { kind: "opening_balances", rows: [
      { product: "Pale Ale", sku_name: "1/2 bbl keg", location: "WH", qty: "10" },
    ] }, ctx);
    expect(r.errors).toHaveLength(0);
    expect(r.inserted).toBe(1);
  });

  it("rejects a fractional unit_price_cents instead of silently truncating it", async () => {
    const r = await runCommand<ImportResult>("import_csv", { kind: "price_list_items", rows: [
      { price_list: "Standard", product: "Hazy IPA", sku_name: "1/2 bbl keg", unit_price_cents: "12.5" },
    ] }, ctx);
    expect(r.inserted).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/unit_price_cents/i);
  });

  it("imports a price_list_items row when product + sku_name resolve unambiguously", async () => {
    const r = await runCommand<ImportResult>("import_csv", { kind: "price_list_items", rows: [
      { price_list: "Standard", product: "Hazy IPA", sku_name: "1/2 bbl keg", unit_price_cents: "12500" },
    ] }, ctx);
    expect(r.errors).toHaveLength(0);
    expect(r.inserted).toBe(1);
  });

  it("derives collision-resistant child request IDs from the full import request ID", async () => {
    const productName = `Collision product ${crypto.randomUUID()}`;
    const skuName = "Collision SKU";
    const product = await admin.from("products")
      .insert({ brewery_id: b.id, name: productName })
      .select("id")
      .single();
    const sku = await admin.from("skus").insert({
      brewery_id: b.id,
      product_id: product.data!.id,
      name: skuName,
      package_type: "keg",
      bbl_per_unit: 0.5,
    }).select("id").single();
    const input = {
      kind: "opening_balances",
      rows: [{ product: productName, sku_name: skuName, location: "WH", qty: "2" }],
    };
    const firstExecution = {
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa1111",
      correlationId: crypto.randomUUID(),
    };
    const secondExecution = {
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa2222",
      correlationId: crypto.randomUUID(),
    };

    const first = await runCommand<ImportResult>("import_csv", input, ctx, firstExecution);
    const second = await runCommand<ImportResult>("import_csv", input, ctx, secondExecution);
    const replay = await runCommand<ImportResult>("import_csv", input, ctx, secondExecution);
    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(replay).toEqual(second);

    const movements = await admin.from("inventory_movements")
      .select("id")
      .eq("brewery_id", b.id)
      .eq("sku_id", sku.data!.id)
      .eq("type", "opening_balance");
    expect(movements.data).toHaveLength(2);
  });

  it("rejects a batch over the 5000-row cap before touching the database", async () => {
    const rows = Array.from({ length: 5001 }, () => ({ name: "x", state: "PA" }));
    await expect(runCommand<ImportResult>("import_csv", { kind: "customers", rows }, ctx)).rejects.toThrow(/validation/i);
  });
});
