// tests/production.test.ts — recipes and their immutable versions: a version
// snapshots materials.extract_potential onto every ingredient, so editing the
// material later never moves an old version's predicted gravity. get_recipe
// computes OG/FG/ABV in TypeScript (lib/recipe-gravity.ts), never in SQL.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { recipeGravity } from "@/lib/recipe-gravity";
import "@/lib/commands/all";

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let malt: string;
let hop: string;

// A malt with a typed extract potential and a hop without one: the hop proves
// the boil stage is excluded from gravity and that a null potential is tolerated.
async function seedMaterial(name: string, category: string, extractPotential: number | null) {
  const { data, error } = await admin.from("materials").insert({
    brewery_id: b.id, name, category, base_uom: "lb", purchase_uom: "lb", extract_potential: extractPotential,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "brewer");
  malt = await seedMaterial("Pale Ale Malt", "malt", 1.037);
  hop = await seedMaterial("Citra", "hop", null);
});

describe("recipes and immutable versions", () => {
  it("creates a recipe, then two versions whose ingredients snapshot extract potential", async () => {
    const recipe = (await runCommand("create_recipe", { name: "Flagship IPA", note: "house pale" }, ctx)) as { id: string };
    expect(recipe.id).toBeTruthy();

    const v1 = (await runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, boilMinutes: 60,
      ingredients: [
        { materialId: malt, perBblQty: 60, stage: "mash" },
        { materialId: hop, perBblQty: 1.5, stage: "boil", timingMinutes: 60 },
      ],
    }, ctx)) as { id: string; version: number };
    expect(v1.version).toBe(1);

    // The malt's potential changes after v1 is saved; v1 must not follow it.
    await admin.from("materials").update({ extract_potential: 1.02 }).eq("id", malt);

    const v2 = (await runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 150, brewhouseEfficiency: 0.8, yeastAttenuation: 0.8,
      ingredients: [{ materialId: malt, perBblQty: 70, stage: "mash" }],
    }, ctx)) as { id: string; version: number };
    expect(v2.version).toBe(2);

    const v1Rows = await admin.from("recipe_ingredients")
      .select("material_id, per_bbl_qty, stage, extract_snapshot").eq("recipe_version_id", v1.id).order("sort");
    expect(v1Rows.data).toEqual([
      { material_id: malt, per_bbl_qty: 60, stage: "mash", extract_snapshot: 1.037 },
      { material_id: hop, per_bbl_qty: 1.5, stage: "boil", extract_snapshot: null },
    ]);

    const v2Rows = await admin.from("recipe_ingredients").select("extract_snapshot").eq("recipe_version_id", v2.id);
    expect(v2Rows.data).toEqual([{ extract_snapshot: 1.02 }]);

    // get_recipe answers with the latest version and the gravity that
    // recipeGravity predicts from exactly those snapshots.
    const got = (await runCommand("get_recipe", { recipeId: recipe.id }, ctx)) as {
      recipe: { id: string; name: string };
      version: { id: string; version: number };
      ingredients: { material_id: string; extract_snapshot: number | null }[];
      ogPlato: number; fgPlato: number; abv: number;
    };
    expect(got.recipe).toMatchObject({ id: recipe.id, name: "Flagship IPA" });
    expect(got.version).toMatchObject({ id: v2.id, version: 2 });
    const expected = recipeGravity({
      mashTempF: 150, brewhouseEfficiency: 0.8, yeastAttenuation: 0.8,
      ingredients: [{ perBblQty: 70, extractPotential: 1.02, stage: "mash" }],
    });
    expect({ ogPlato: got.ogPlato, fgPlato: got.fgPlato, abv: got.abv }).toEqual(expected);

    const listed = (await runCommand("list_recipes", {}, ctx)) as { id: string }[];
    expect(listed.map((r) => r.id)).toContain(recipe.id);
  });

  it("refuses an efficiency or attenuation outside (0,1]", async () => {
    const recipe = (await runCommand("create_recipe", { name: "Fraction check" }, ctx)) as { id: string };
    const bad = (v: Record<string, number>) => runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78,
      ingredients: [{ materialId: malt, perBblQty: 60, stage: "mash" }], ...v,
    }, ctx);
    await expect(bad({ brewhouseEfficiency: 75 })).rejects.toThrow(/validation failed/);
    await expect(bad({ yeastAttenuation: 0 })).rejects.toThrow(/validation failed/);
  });

  it("keeps targets off recipe_versions: gravity is predicted, never stored", () => {
    expect(sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name='recipe_versions'
        and column_name in ('target_og_plato','target_fg_plato','target_abv') order by 1`)).toEqual([]);
  });
});
