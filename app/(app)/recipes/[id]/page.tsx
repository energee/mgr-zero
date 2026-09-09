// app/(app)/recipes/[id]/page.tsx — one recipe: its latest version's
// assumptions, ingredients, and the OG/FG/ABV get_recipe predicts from them
// (lib/recipe-gravity.ts — never stored). New version opens
// recipe-version-form.tsx → create_recipe_version, whose live preview calls
// the same pure function. Predictions are computed in degrees Plato and
// printed in whatever unit the reader chose (get_gravity_unit, resolved once
// here and handed to the form too).
import { E } from "@/components/mgr/e";
import { RecipeView } from "@/components/mgr/views/recipe";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toRecipeViewProps } from "@/lib/mgr/recipe-view";
import "@/lib/commands/all";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { orNotFound } from "@/lib/mgr/not-found";
import { NewVersionForm } from "./recipe-version-form";

type Recipe = { id: string; name: string; brand_id: string | null; note: string | null };
type Version = {
  id: string; version: number; mash_temp_f: number; brewhouse_efficiency: number; yeast_attenuation: number;
  boil_minutes: number | null; target_ibu: number | null; note: string | null;
};
type Ingredient = { id: string; material_id: string; per_bbl_qty: number; stage: string; timing_minutes: number | null; sort: number; extract_snapshot: number | null };
type GetRecipe = { recipe: Recipe; version: Version | null; ingredients: Ingredient[]; ogPlato: number | null; fgPlato: number | null; abv: number | null };
type Material = { id: string; name: string; category: string; extract_potential: number | null };

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ recipe, version, ingredients, ogPlato, fgPlato, abv }, materials, gravityUnit] = (await Promise.all([
    orNotFound(runCommand("get_recipe", { recipeId: id }, ctx)),
    runCommand("list_materials", {}, ctx),
    runCommand("get_gravity_unit", {}, ctx),
  ])) as [GetRecipe, Material[], { effective: GravityUnit }];
  const materialName = (mid: string) => materials.find((m) => m.id === mid)?.name ?? mid.slice(0, 8);

  return (
    <RecipeView
      model={toRecipeViewProps({ title: recipe.name, backHref: "/recipes" })}
      createAction={<NewVersionForm recipeId={recipe.id} materials={materials} unit={gravityUnit.effective} />}
      detail={
        <>
          {recipe.note ? E.fld("Note", recipe.note) : null}
          {version === null ? (
            E.blank("No version yet — create the first one")
          ) : (
            <>
              {E.fld("Version", `v${version.version}`)}
              {E.fld("Mash temp", `${version.mash_temp_f} °F`)}
              {E.fld("Brewhouse efficiency", pct(version.brewhouse_efficiency))}
              {E.fld("Yeast attenuation", pct(version.yeast_attenuation))}
              {version.boil_minutes !== null ? E.fld("Boil", `${version.boil_minutes} min`) : null}
              {version.target_ibu !== null ? E.fld("Target IBU", version.target_ibu) : null}
              {version.note ? E.fld("Note", version.note) : null}
              {ogPlato !== null && fgPlato !== null && abv !== null
                ? E.fld("Predicted OG / FG / ABV", `${formatGravity(ogPlato, gravityUnit.effective)} / ${formatGravity(fgPlato, gravityUnit.effective)} / ${abv.toFixed(1)}%`)
                : null}
              {E.ttl("Ingredients")}
              {E.tbl(["material", "per bbl", "stage", "timing"], ingredients.map((i) => [
                materialName(i.material_id), Number(i.per_bbl_qty), i.stage.replace("_", " "), i.timing_minutes ?? "—",
              ]))}
            </>
          )}
        </>
      }
    />
  );
}
