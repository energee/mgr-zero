// app/(app)/recipes/new/page.tsx — a recipe that does not exist yet: the
// Recipe editor (../[id]/recipe-version-form.tsx) with the parent fields on
// top. One save runs create_recipe then create_recipe_version and lands on
// the recipe.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { profileIons } from "@/lib/mgr/recipe-process-view";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { RecipeEditor, toRecipeMaterial, type RecipeMaterial } from "../[id]/recipe-version-form";

type Named = { id: string; name: string };
/** A list_water_profiles row: a name and six ions in ppm. */
type ProfileRow = Named & { calcium_ppm: number; magnesium_ppm: number; sodium_ppm: number; sulfate_ppm: number; chloride_ppm: number; bicarbonate_ppm: number };

export default async function NewRecipePage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [brands, materials, gravityUnit, profiles] = (await Promise.all([
    runCommand("list_brands", {}, ctx), runCommand("list_materials", {}, ctx), runCommand("get_gravity_unit", {}, ctx), runCommand("list_water_profiles", {}, ctx),
  ])) as [Named[], RecipeMaterial[], { effective: GravityUnit }, ProfileRow[]];
  return (
    <RecipeEditor
      title="New recipe" backHref="/recipes"
      brands={brands.map(({ id, name }) => ({ id, name }))}
      materials={materials.map(toRecipeMaterial)}
      profiles={profiles.map((p) => ({ id: p.id, name: p.name, ions: profileIons(p) }))} unit={gravityUnit.effective}
    />
  );
}
