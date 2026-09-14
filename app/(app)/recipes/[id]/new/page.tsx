// app/(app)/recipes/[id]/new/page.tsx — the next version of a recipe: the
// Recipe editor (../recipe-version-form.tsx) bound to create_recipe_version,
// landing back on the recipe when it saves. Mirrors /recipes/new.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { profileIons } from "@/lib/mgr/recipe-process-view";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { orNotFound } from "@/lib/mgr/not-found";
import { RecipeEditor, toRecipeMaterial, type RecipeMaterial } from "../recipe-version-form";

type Named = { id: string; name: string };
/** A list_water_profiles row: a name and six ions in ppm. */
type ProfileRow = Named & { calcium_ppm: number; magnesium_ppm: number; sodium_ppm: number; sulfate_ppm: number; chloride_ppm: number; bicarbonate_ppm: number };

export default async function NewVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ recipe }, materials, gravityUnit, profiles] = (await Promise.all([
    orNotFound(runCommand("get_recipe", { recipeId: id }, ctx)), runCommand("list_materials", {}, ctx), runCommand("get_gravity_unit", {}, ctx), runCommand("list_water_profiles", {}, ctx),
  ])) as [{ recipe: Named }, RecipeMaterial[], { effective: GravityUnit }, ProfileRow[]];
  return (
    <RecipeEditor
      recipeId={recipe.id} title={`${recipe.name} · new version`} backHref={`/recipes/${recipe.id}`} backLabel={recipe.name}
      materials={materials.map(toRecipeMaterial)} profiles={profiles.map((p) => ({ id: p.id, name: p.name, ions: profileIons(p) }))} unit={gravityUnit.effective}
    />
  );
}
