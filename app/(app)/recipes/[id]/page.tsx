// app/(app)/recipes/[id]/page.tsx — one recipe, drawn by RecipeView: its
// selected version read out as text (toRecipePageModel), with the OG/FG/ABV
// get_recipe predicts (never stored) or why it predicted none. The page only
// fetches and renders. New recipe version opens ./new, where
// recipe-version-form.tsx makes every field live for create_recipe_version.
// Schedule batch opens /batches?recipe=<id>, whose New batch sheet starts on
// the current version (schedule_batch).
import { RecipeView } from "@/components/mgr/views/recipe";
import { RecipeBrandPicker } from "./recipe-brand-picker";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import type { RecipeMaterial } from "@/lib/mgr/recipe-process-view";
import { recipePageTitle, toRecipePageModel } from "@/lib/mgr/recipe-view";
import { getRecipePageData } from "../recipe-data";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
};

function selectedVersion(v: string | string[] | undefined): number | undefined {
  return v === undefined ? undefined : typeof v === "string" ? Number(v) : NaN;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const { snapshot } = await getRecipePageData(id, selectedVersion(v));
  return { title: recipePageTitle(snapshot) };
}

export default async function RecipePage({ params, searchParams }: Props) {
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const { brewery, ctx, snapshot } = await getRecipePageData(id, selectedVersion(v));
  const [materials, gravityUnit, profiles, brands] = (await Promise.all([
    runCommand("list_materials", {}, ctx),
    runCommand("get_gravity_unit", {}, ctx),
    runCommand("list_water_profiles", {}, ctx),
    runCommand("list_brands", {}, ctx),
  ])) as [RecipeMaterial[], { effective: GravityUnit }, { id: string; name: string }[], { id: string; name: string; alias: string | null }[]];
  const { recipe } = snapshot;
  return (
    <RecipeView
      readOnly
      parentForm={<RecipeBrandPicker recipeId={recipe.id} brandId={recipe.brand_id} brands={brands} />}
      model={toRecipePageModel(snapshot, { materials, profiles, unit: gravityUnit.effective, timeZone: brewery.timeZone })}
    />
  );
}
