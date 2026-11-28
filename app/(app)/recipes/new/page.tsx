// app/(app)/recipes/new/page.tsx — a recipe that does not exist yet: the
// Recipe editor (../[id]/recipe-version-form.tsx) with the parent fields on
// top. One save runs create_recipe then create_recipe_version and lands on
// the recipe.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toRecipeMaterial, toWaterProfileOption, type RecipeMaterial, type WaterProfileRow } from "@/lib/mgr/recipe-process-view";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { toMaterialCosts } from "@/lib/mgr/recipe-cost-view";
import type { BatchMeasurement } from "@/lib/mgr/recipe-assumptions";
import { RecipeEditor } from "../[id]/recipe-version-form";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/recipes/new") };

type Named = { id: string; name: string; alias?: string | null };

export default async function NewRecipePage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [brands, materials, gravityUnit, profiles, costs, measurements] = (await Promise.all([
    runCommand("list_brands", {}, ctx), runCommand("list_materials", {}, ctx), runCommand("get_gravity_unit", {}, ctx), runCommand("list_water_profiles", {}, ctx),
    runCommand("list_material_costs", {}, ctx), runCommand("list_batch_measurements", {}, ctx),
  ])) as [Named[], RecipeMaterial[], { effective: GravityUnit }, WaterProfileRow[], Parameters<typeof toMaterialCosts>[0], BatchMeasurement[]];
  return (
    <RecipeEditor
      title="New recipe" backHref="/recipes"
      brands={brands.map(({ id, name, alias }) => ({ id, name, alias }))}
      materials={materials.map(toRecipeMaterial)}
      profiles={profiles.map(toWaterProfileOption)} unit={gravityUnit.effective}
      costs={toMaterialCosts(costs)} measurements={measurements}
    />
  );
}
