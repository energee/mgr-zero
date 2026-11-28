// lib/commands/recipe-cost.ts — one recipe copy's ingredient cost, read from
// recipe_version_costs. The view owns the rule: each ingredient at its last
// purchase-order receipt cost, else at the material's typed price, and no cost
// at all while any ingredient has neither. This read only turns the view's
// material ids into names for get_brand_recipe_cost. The recipe page does not
// read it: the editor costs the sheet as typed (lib/mgr/recipe-cost-view.ts).
import { unwrap, type Ctx } from "./registry";

export type RecipeVersionCost = {
  costCentsPerBbl: number | null;
  /** Names of ingredients with no receipt cost and no typed price. */
  uncosted: string[];
  /** Names of ingredients costed at the typed price, because the material has no receipt cost. */
  unreceived: string[];
};

export async function recipeVersionCost(ctx: Ctx, versionId: string): Promise<RecipeVersionCost> {
  const row = await unwrap(ctx.db.from("recipe_version_costs").select("cost_cents_per_bbl, uncosted_material_ids, unreceived_material_ids")
    .eq("recipe_version_id", versionId).maybeSingle()) as { cost_cents_per_bbl: number | null; uncosted_material_ids: string[]; unreceived_material_ids: string[] } | null;
  // A copy with no ingredients has no row.
  if (!row) return { costCentsPerBbl: null, uncosted: [], unreceived: [] };
  const ids = [...row.uncosted_material_ids, ...row.unreceived_material_ids];
  const materials = ids.length ? await unwrap(ctx.db.from("materials").select("id, name").in("id", ids).order("name").limit(ids.length)) as { id: string; name: string }[] : [];
  const named = (list: string[]) => materials.filter((m) => list.includes(m.id)).map((m) => m.name);
  return { costCentsPerBbl: row.cost_cents_per_bbl, uncosted: named(row.uncosted_material_ids), unreceived: named(row.unreceived_material_ids) };
}
