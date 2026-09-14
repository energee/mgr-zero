// app/(app)/recipes/new/page.tsx — a recipe that does not exist yet: the
// Recipe editor (../[id]/recipe-version-form.tsx) with the parent fields on
// top. One save runs create_recipe then create_recipe_version and lands on
// the recipe.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { RecipeEditor, toRecipeMaterial, type RecipeMaterial } from "../[id]/recipe-version-form";

type Named = { id: string; name: string };

export default async function NewRecipePage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [brands, materials, gravityUnit, profiles] = (await Promise.all([
    runCommand("list_brands", {}, ctx), runCommand("list_materials", {}, ctx), runCommand("get_gravity_unit", {}, ctx), runCommand("list_water_profiles", {}, ctx),
  ])) as [Named[], RecipeMaterial[], { effective: GravityUnit }, Named[]];
  return (
    <RecipeEditor
      title="New recipe" backHref="/recipes"
      brands={brands.map(({ id, name }) => ({ id, name }))}
      materials={materials.map(toRecipeMaterial)}
      profiles={profiles} unit={gravityUnit.effective}
    />
  );
}
