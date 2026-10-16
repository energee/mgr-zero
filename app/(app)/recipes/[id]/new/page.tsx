// app/(app)/recipes/[id]/new/page.tsx — the next version of a recipe: the
// Recipe editor (../recipe-version-form.tsx) bound to create_recipe_version,
// landing back on the recipe when it saves. The draft starts as a copy of the
// current version (versionToDraft), or blank before the first one; an unsaved
// draft kept in this tab replaces it on arrival. Mirrors /recipes/new.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toRecipeMaterial, toWaterProfileOption, type RecipeMaterial, type WaterProfileRow } from "@/lib/mgr/recipe-process-view";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { orNotFound } from "@/lib/mgr/not-found";
import { versionToDraft, type RecipeSnapshot } from "@/lib/mgr/recipe-view";
import { RecipeEditor } from "../recipe-version-form";

export default async function NewVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [snapshot, materials, gravityUnit, profiles] = (await Promise.all([
    orNotFound(runCommand("get_recipe", { recipeId: id }, ctx)), runCommand("list_materials", {}, ctx), runCommand("get_gravity_unit", {}, ctx), runCommand("list_water_profiles", {}, ctx),
  ])) as [RecipeSnapshot, RecipeMaterial[], { effective: GravityUnit }, WaterProfileRow[]];
  const { recipe, version } = snapshot;
  return (
    <RecipeEditor
      recipeId={recipe.id} title={`${recipe.name} · new version`} backHref={`/recipes/${recipe.id}`} backLabel={recipe.name}
      initial={versionToDraft(snapshot) ?? undefined} baseVersionId={version?.id ?? null} baseVersion={version?.version}
      materials={materials.map(toRecipeMaterial)} profiles={profiles.map(toWaterProfileOption)} unit={gravityUnit.effective}
    />
  );
}
