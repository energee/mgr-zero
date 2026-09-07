// lib/commands/production.ts — recipes and their immutable versions. A recipe
// is a name; how it is brewed lives on a version, and a version is never
// edited: `create_recipe_version` writes the next one (version = max+1) with
// its ingredients in a single RPC, snapshotting each material's extract
// potential so an old version's predicted gravity cannot move when the
// material is retyped. `get_recipe` predicts OG/FG/ABV here in TypeScript
// (lib/recipe-gravity.ts) — the schema stores assumptions, never results.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError } from "./registry";
import { recipeGravity } from "@/lib/recipe-gravity";

const INGREDIENT_STAGES = ["mash", "boil", "whirlpool", "fermentation", "dry_hop", "packaging", "other"] as const;

// Efficiency and attenuation are fractions (0.75), never percents: the column
// comment says so and recipeGravity multiplies by them directly, so a 75 here
// would predict a hundredfold gravity. (0,1] is the whole legal range.
const fraction = z.number().gt(0).lte(1);

defineCommand({
  name: "create_recipe", description: "Create a recipe: a name, optionally the brand it brews, and a note; its brewing facts live on versions",
  input: z.object({ name: z.string().trim().min(1), brandId: z.string().uuid().optional(), note: z.string().optional() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_recipe", {
    p_brewery: ctx.breweryId, p_brand: i.brandId ?? null, p_name: i.name, p_note: i.note ?? null,
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "create_recipe_version",
  description: "Add the next version of a recipe with its ingredients; versions are immutable and snapshot each material's extract potential",
  input: z.object({
    recipeId: z.string().uuid(),
    mashTempF: z.number(),
    brewhouseEfficiency: fraction,
    yeastAttenuation: fraction,
    boilMinutes: z.number().int().positive().optional(),
    targetIbu: z.number().nonnegative().optional(),
    note: z.string().optional(),
    ingredients: z.array(z.object({
      materialId: z.string().uuid(),
      perBblQty: z.number().positive(),
      stage: z.enum(INGREDIENT_STAGES),
      timingMinutes: z.number().int().optional(),
    })).min(1),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_recipe_version", {
    p_brewery: ctx.breweryId, p_recipe: i.recipeId, p_mash_temp_f: i.mashTempF,
    p_brewhouse_efficiency: i.brewhouseEfficiency, p_yeast_attenuation: i.yeastAttenuation,
    p_boil_minutes: i.boilMinutes ?? null, p_target_ibu: i.targetIbu ?? null, p_note: i.note ?? null,
    p_ingredients: i.ingredients.map((l) => ({
      material_id: l.materialId, per_bbl_qty: l.perBblQty, stage: l.stage, timing_minutes: l.timingMinutes ?? null,
    })),
    p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_recipes", description: "Recipes, alphabetical, with the brand each one brews",
  input: z.object({}), roles: ["admin", "brewer"],
  handler: (ctx) => unwrap(ctx.db.from("recipes").select("id, name, brand_id, note, created_at")
    .eq("brewery_id", ctx.breweryId).order("name")),
});

// A missing extract snapshot predicts as 1.0 — no extract, which is what a
// material with no typed potential (a hop, a chemical) contributes. Number()
// guards the numeric columns against a driver that hands them back as strings.
const num = (v: unknown, fallback = 0) => (v === null || v === undefined ? fallback : Number(v));

defineQuery({
  name: "get_recipe",
  description: "One recipe with its latest version, that version's ingredients, and the OG/FG/ABV they predict",
  input: z.object({ recipeId: z.string().uuid() }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    const recipe = await unwrap(ctx.db.from("recipes").select("id, name, brand_id, note, created_at")
      .eq("brewery_id", ctx.breweryId).eq("id", i.recipeId).maybeSingle());
    if (!recipe) throw new CommandError("recipe not found", 404, "not_found");

    const version = await unwrap(ctx.db.from("recipe_versions")
      .select("id, version, mash_temp_f, brewhouse_efficiency, yeast_attenuation, boil_minutes, target_ibu, note, created_at")
      .eq("recipe_id", i.recipeId).order("version", { ascending: false }).limit(1).maybeSingle());
    if (!version) return { recipe, version: null, ingredients: [], ogPlato: null, fgPlato: null, abv: null };

    const ingredients = await unwrap(ctx.db.from("recipe_ingredients")
      .select("id, material_id, per_bbl_qty, stage, timing_minutes, sort, extract_snapshot")
      .eq("recipe_version_id", version.id).order("sort")) ?? [];

    return {
      recipe, version, ingredients,
      ...recipeGravity({
        mashTempF: num(version.mash_temp_f),
        brewhouseEfficiency: num(version.brewhouse_efficiency),
        yeastAttenuation: num(version.yeast_attenuation),
        ingredients: ingredients.map((l) => ({
          perBblQty: num(l.per_bbl_qty), extractPotential: num(l.extract_snapshot, 1), stage: l.stage as string,
        })),
      }),
    };
  },
});

export {};
