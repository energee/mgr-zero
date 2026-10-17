import type { Database } from "@/lib/supabase/database";
import type { StaffRole } from "@/lib/commands/registry";
// tests/commands-catalog.test.ts — catalog commands must use the idempotent database API.
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeBrewery, makeStaffCtx, seedPriceGroup } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let adminCtx: { db: SupabaseClient<Database>; userId: string; breweryId: string; roles: StaffRole[] };
let salesCtx: { db: SupabaseClient<Database>; userId: string; breweryId: string; roles: StaffRole[] };

beforeAll(async () => {
  const brewery = await makeBrewery();
  [adminCtx, salesCtx] = await Promise.all([
    makeStaffCtx(brewery.id, "admin"),
    makeStaffCtx(brewery.id, "sales"),
  ]);
});

describe("catalog commands", () => {
  it("creates catalog records through RPC-backed commands: brand, format, sku = brand × format", async () => {
    const brand = await runCommand("upsert_brand", { name: "Command Lager", style: "Lager", abv: 5.1, priceGroupId: await seedPriceGroup(salesCtx.breweryId, "Standard", 1) }, salesCtx) as { id: string; style_id: string };
    const fmt = await runCommand("upsert_format", { name: "16 oz can", basis: "packaged", packageType: "can", bblPerUnit: 0.004 }, salesCtx) as { id: string };
    const sku = await runCommand("create_sku", { brandId: brand.id, formatId: fmt.id }, salesCtx) as { id: string; name: string };
    const location = await runCommand("create_location", { name: "Command Warehouse", uses: ["warehouse"] }, adminCtx) as { id: string };

    expect(brand.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(brand.style_id).toMatch(/^[0-9a-f-]{36}$/i); // the style row was created with the brand
    expect(sku.name).toBe("Command Lager · 16 oz can");
    expect(location.id).toMatch(/^[0-9a-f-]{36}$/i);
    // one brand × one format, once
    await expect(runCommand("create_sku", { brandId: brand.id, formatId: fmt.id }, salesCtx))
      .rejects.toMatchObject({ status: 409, code: "conflict" }); // #422: a readable conflict, not a 500
    // a second location with the same name is a conflict, not a 500 "database error" (#422)
    await expect(runCommand("create_location", { name: "Command Warehouse", uses: ["warehouse"] }, adminCtx))
      .rejects.toMatchObject({ status: 409, code: "conflict", message: "That already exists. Use a different name or value." });
    // a poured format is never a sku
    const group = await runCommand("upsert_price_group", { name: `g-${crypto.randomUUID().slice(0, 8)}`, position: 99 }, salesCtx) as { id: string };
    const pour = await runCommand("upsert_format", { name: "pint", basis: "poured", priceGroupId: group.id, ounces: 16 }, salesCtx) as { id: string };
    await expect(runCommand("create_sku", { brandId: brand.id, formatId: pour.id }, salesCtx)).rejects.toThrow(/packaged/);
    // upsert by id renames; the same style name reuses the style row
    const again = await runCommand("upsert_brand", { id: brand.id, name: "Command Lager", style: "Lager", abv: 5.2 }, salesCtx) as { style_id: string };
    expect(again.style_id).toBe(brand.style_id);
    const brands = await runCommand("list_brands", {}, salesCtx) as { id: string; styles: { name: string } | null; skus: { id: string }[] }[];
    expect(brands.find((b) => b.id === brand.id)).toMatchObject({ styles: { name: "Lager" } });
    expect(brands.find((b) => b.id === brand.id)!.skus.map((s) => s.id)).toEqual([sku.id]);
  });

  it("denies sales members admin-only location creation in the registry and raw RPC", async () => {
    await expect(runCommand("create_location", { name: "Sales Warehouse", uses: ["warehouse"] }, salesCtx))
      .rejects.toMatchObject({ code: "permission_denied" });

    const raw = await salesCtx.db.rpc("create_location", {
      p_brewery: salesCtx.breweryId,
      p_name: "Raw sales warehouse",
      p_uses: ["warehouse"],
      p_request_id: crypto.randomUUID(),
    });
    expect(raw.error).not.toBeNull();
  });
});

describe("update_location", () => {
  it("admin renames a location and may change its kind; sales is denied", async () => {
    const loc = await runCommand("create_location", { name: "Old WH", uses: ["warehouse"] }, adminCtx) as { id: string };
    const row = await runCommand("update_location", { locationId: loc.id, name: "Main WH", uses: ["taproom"] }, adminCtx) as { id: string; name: string; kind: string };
    expect(row).toMatchObject({ id: loc.id, name: "Main WH", uses: ["taproom"] });
    await expect(runCommand("update_location", { locationId: loc.id, name: "Nope", uses: ["warehouse"] }, salesCtx))
      .rejects.toMatchObject({ code: "permission_denied" });
  });
});

// docs/plans/list-filters.md: Catalog's search, sort and category run in Postgres.
describe("list_brands filters", () => {
  type B = { name: string };
  let ctx: typeof salesCtx;
  const names = (rows: unknown) => (rows as B[]).map((b) => b.name);
  beforeAll(async () => {
    const brewery = await makeBrewery();
    ctx = await makeStaffCtx(brewery.id, "sales");
    // Created in this order, so "newest" is the reverse.
    await runCommand("upsert_brand", { name: "Amber", style: "Ale", abv: 5.2, category: "Core" }, ctx);
    await runCommand("upsert_brand", { name: "Big Stout", style: "Stout", abv: 9.5, category: "Seasonal", alias: "Animal #14" }, ctx);
    await runCommand("upsert_brand", { name: "Crisp 100% Lager", style: "Lager", category: "Core" }, ctx);
  });

  it("returns every brand A–Z with no input, as before", async () => {
    expect(names(await runCommand("list_brands", {}, ctx))).toEqual(["Amber", "Big Stout", "Crisp 100% Lager"]);
  });
  it("q matches anywhere in the name or alias, case-insensitively", async () => {
    expect(names(await runCommand("list_brands", { q: "stout" }, ctx))).toEqual(["Big Stout"]);
    expect(names(await runCommand("list_brands", { q: "animal" }, ctx))).toEqual(["Big Stout"]);
  });
  it("q treats % and _ as literal text", async () => {
    expect(names(await runCommand("list_brands", { q: "100%" }, ctx))).toEqual(["Crisp 100% Lager"]);
    expect(names(await runCommand("list_brands", { q: "%" }, ctx))).toEqual(["Crisp 100% Lager"]);
  });
  it("sorts by ABV high to low with no ABV last, and by newest", async () => {
    expect(names(await runCommand("list_brands", { sort: "abv" }, ctx))).toEqual(["Big Stout", "Amber", "Crisp 100% Lager"]);
    expect(names(await runCommand("list_brands", { sort: "newest" }, ctx))).toEqual(["Crisp 100% Lager", "Big Stout", "Amber"]);
  });
  it("category narrows to one category", async () => {
    expect(names(await runCommand("list_brands", { category: "Core" }, ctx))).toEqual(["Amber", "Crisp 100% Lager"]);
  });
});
