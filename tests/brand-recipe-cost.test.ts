// tests/brand-recipe-cost.test.ts — get_brand_recipe_cost: the cost per
// barrel a brand's recipe implies, from recipe_version_costs (last receipt
// cost per ingredient), naming ingredients with no receipt yet, and which
// version speaks for the brand (last brewed, else newest).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedMaterial } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

// Sales reads the cost (it prices); Brewer writes the recipes.
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let brewer: Awaited<ReturnType<typeof makeStaffCtx>>;
let brandId: string;
let malt: string;
let hop: string;
let wh: { id: string; binId: string };

const receipt = (materialId: string, unitCostCents: number) => admin.from("material_movements").insert({
  brewery_id: ctx.breweryId, material_id: materialId, location_id: wh.id, bin_id: wh.binId, qty: 100, type: "receipt", unit_cost_cents: unitCostCents, created_by: ctx.userId,
});

beforeAll(async () => {
  const b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "sales");
  brewer = await makeStaffCtx(b.id, "brewer");
  ({ brandId } = await seedCatalog(b.id, { product: "Costed IPA", sku: "Costed IPA · ½ bbl" }));
  wh = await seedLocation(b.id);
  malt = await seedMaterial(b.id, { name: "Pale Ale Malt", category: "malt" });
  hop = await seedMaterial(b.id, { name: "Citra", category: "hop" });
  const { error } = await receipt(malt, 100);
  if (error) throw error;
});

describe("get_brand_recipe_cost", () => {
  it("is empty for a brand with no recipe", async () => {
    expect(await runCommand("get_brand_recipe_cost", { brandId }, ctx)).toEqual({ recipeVersionId: null, costCentsPerBbl: null, uncosted: [] });
  });

  it("names an ingredient with no receipt cost, then sums per barrel once every ingredient has one", async () => {
    const recipe = (await runCommand("create_recipe", { name: "Costed IPA", brandId }, brewer)) as { id: string };
    const v1 = (await runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78,
      ingredients: [{ materialId: malt, perBblQty: 60, stage: "mash" }, { materialId: hop, perBblQty: 1.5, stage: "boil", timingMinutes: 60 }],
    }, brewer)) as { id: string };
    // The hop has never been received: the partial sum must not pass as a cost.
    expect(await runCommand("get_brand_recipe_cost", { brandId }, ctx)).toEqual({ recipeVersionId: v1.id, costCentsPerBbl: 6000, uncosted: ["Citra"] });
    const { error } = await receipt(hop, 2000);
    if (error) throw error;
    // 60 × $1.00 + 1.5 × $20.00 per bbl.
    expect(await runCommand("get_brand_recipe_cost", { brandId }, ctx)).toEqual({ recipeVersionId: v1.id, costCentsPerBbl: 9000, uncosted: [] });
  });

  it("lets the last brewed version speak for the brand over a newer unbrewed one", async () => {
    const recipe = (await runCommand("list_recipes", {}, brewer) as { id: string; name: string }[]).find((r) => r.name === "Costed IPA")!;
    const versions = (await admin.from("recipe_versions").select("id, version").eq("recipe_id", recipe.id).order("version")).data as { id: string; version: number }[];
    const v1 = versions[0]!.id;
    const v2 = (await runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 150, brewhouseEfficiency: 0.8, yeastAttenuation: 0.8,
      ingredients: [{ materialId: malt, perBblQty: 80, stage: "mash" }],
    }, brewer)) as { id: string };
    expect((await runCommand("get_brand_recipe_cost", { brandId }, ctx) as { recipeVersionId: string }).recipeVersionId).toBe(v2.id);
    const { error } = await admin.from("batches").insert({
      brewery_id: ctx.breweryId, intended_brand_id: brandId, recipe_version_id: v1, planned_on: "2026-09-01", planned_bbl: 15, brewed_on: "2026-09-02", created_by: ctx.userId,
    });
    if (error) throw error;
    expect(await runCommand("get_brand_recipe_cost", { brandId }, ctx)).toEqual({ recipeVersionId: v1, costCentsPerBbl: 9000, uncosted: [] });
  });
});
