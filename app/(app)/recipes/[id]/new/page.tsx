// app/(app)/recipes/[id]/new/page.tsx — the next version of a recipe: the
// Recipe editor (../recipe-version-form.tsx) bound to create_recipe_version,
// landing back on the recipe when it saves. Mirrors /recipes/new.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { orNotFound } from "@/lib/mgr/not-found";
import { RecipeEditor, toRecipeMaterial, type RecipeMaterial } from "../recipe-version-form";

type Named = { id: string; name: string };

export default async function NewVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ recipe }, materials, gravityUnit, profiles] = (await Promise.all([
    orNotFound(runCommand("get_recipe", { recipeId: id }, ctx)), runCommand("list_materials", {}, ctx), runCommand("get_gravity_unit", {}, ctx), runCommand("list_water_profiles", {}, ctx),
  ])) as [{ recipe: Named }, RecipeMaterial[], { effective: GravityUnit }, Named[]];
  return (
    <RecipeEditor
      recipeId={recipe.id} title={`${recipe.name} · new version`} backHref={`/recipes/${recipe.id}`} backLabel={recipe.name}
      materials={materials.map(toRecipeMaterial)} profiles={profiles} unit={gravityUnit.effective}
    />
  );
}
