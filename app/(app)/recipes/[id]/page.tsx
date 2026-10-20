// app/(app)/recipes/[id]/page.tsx — one recipe, drawn by RecipeView: its
// selected version read out as text (toRecipePageModel), with the OG/FG/ABV
// get_recipe predicts (never stored) or why it predicted none. The page only
// fetches and renders. New recipe version opens ./new, where
// recipe-version-form.tsx makes every field live for create_recipe_version.
import { RecipeView } from "@/components/mgr/views/recipe";
import { RecipeBrandPicker } from "./recipe-brand-picker";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { orNotFound } from "@/lib/mgr/not-found";
import type { RecipeMaterial } from "@/lib/mgr/recipe-process-view";
import { toRecipePageModel, type RecipeSnapshot } from "@/lib/mgr/recipe-view";

export default async function RecipePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
}) {
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [snapshot, materials, gravityUnit, profiles, brands] = (await Promise.all([
    orNotFound(runCommand("get_recipe", { recipeId: id, version: v === undefined ? undefined : typeof v === "string" ? Number(v) : NaN }, ctx)),
    runCommand("list_materials", {}, ctx),
    runCommand("get_gravity_unit", {}, ctx),
    runCommand("list_water_profiles", {}, ctx),
    runCommand("list_brands", {}, ctx),
  ])) as [RecipeSnapshot, RecipeMaterial[], { effective: GravityUnit }, { id: string; name: string }[], { id: string; name: string; alias: string | null }[]];
  const { recipe } = snapshot;
  return (
    <RecipeView
      readOnly
      parentForm={<RecipeBrandPicker recipeId={recipe.id} brandId={recipe.brand_id} brands={brands} />}
      model={toRecipePageModel(snapshot, { materials, profiles, unit: gravityUnit.effective, timeZone: brewery.timeZone })}
    />
  );
}
