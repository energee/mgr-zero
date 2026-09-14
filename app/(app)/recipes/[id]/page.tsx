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
import "@/lib/commands/all";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { orNotFound } from "@/lib/mgr/not-found";
import { NewVersionForm } from "./recipe-version-form";
import { fermentationSummary, mashSummary, processReadout, profileIons, type FermentationStage, type MashStep, type ProcessColumns } from "@/lib/mgr/recipe-process-view";

type Recipe = { id: string; name: string; brand_id: string | null; note: string | null };
type Version = ProcessColumns & {
  id: string; version: number; mash_temp_f: number | null; brewhouse_efficiency: number; yeast_attenuation: number;
  boil_minutes: number | null; target_ibu: number | null; note: string | null;
  mash_schedule: MashStep[]; fermentation_schedule: FermentationStage[];
};
type WaterAdditionRow = { material_id: string; qty: number; unit: string; stage: string };
type Profile = { id: string; name: string; calcium_ppm: number; magnesium_ppm: number; sodium_ppm: number; sulfate_ppm: number; chloride_ppm: number; bicarbonate_ppm: number };
type Ingredient = { id: string; material_id: string; per_bbl_qty: number; stage: string; timing_minutes: number | null; sort: number; extract_snapshot: number | null };
type GetRecipe = { recipe: Recipe; version: Version | null; ingredients: Ingredient[]; waterAdditions: WaterAdditionRow[]; ogPlato: number | null; fgPlato: number | null; abv: number | null };
type Material = { id: string; name: string; category: string; extract_potential: number | null };

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ recipe, version, ingredients, waterAdditions, ogPlato, fgPlato, abv }, materials, gravityUnit, profiles] = (await Promise.all([
    orNotFound(runCommand("get_recipe", { recipeId: id }, ctx)),
    runCommand("list_materials", {}, ctx),
    runCommand("get_gravity_unit", {}, ctx),
    runCommand("list_water_profiles", {}, ctx),
  ])) as [GetRecipe, Material[], { effective: GravityUnit }, Profile[]];
  const names = new Map(materials.map((m) => [m.id, m.name]));
  const materialName = (mid: string) => names.get(mid) ?? mid.slice(0, 8);
  const profileName = (pid: string | null) => (pid && profiles.find((p) => p.id === pid)?.name) || null;
  // The form is a client component: hand it the fields it reads, not the whole materials row.
  const formMaterials = materials.map(({ id, name, category, extract_potential }) => ({ id, name, category, extract_potential }));
  const profileOptions = profiles.map((p) => ({ id: p.id, name: p.name, ions: profileIons(p) }));

  return (
    <RecipeView
      model={{ title: recipe.name, backHref: "/recipes" }}
      createAction={<NewVersionForm recipeId={recipe.id} materials={formMaterials} profiles={profileOptions} unit={gravityUnit.effective} />}
      detail={
        <>
          {recipe.note ? E.fld("Note", recipe.note) : null}
          {version === null ? (
            E.blank("No version yet — create the first one")
          ) : (
            <>
              {E.fld("Version", `v${version.version}`)}
              {E.fld("Brewhouse efficiency", pct(version.brewhouse_efficiency))}
              {E.fld("Yeast attenuation", pct(version.yeast_attenuation))}
              {version.boil_minutes !== null ? E.fld("Boil", `${version.boil_minutes} min`) : null}
              {version.target_ibu !== null ? E.fld("Target IBU", version.target_ibu) : null}
              {version.note ? E.fld("Note", version.note) : null}
              {ogPlato !== null && fgPlato !== null && abv !== null
                ? E.fld("Predicted OG / FG / ABV", `${formatGravity(ogPlato, gravityUnit.effective)} / ${formatGravity(fgPlato, gravityUnit.effective)} / ${abv.toFixed(1)}%`)
                : null}
              {processReadout(version, profileName).slice(0, 3).map(([k, v]) => <div key={k}>{E.fld(k, v)}</div>)}
              {E.ttl(`Mash schedule · ${version.mash_schedule.length} steps`)}
              {version.mash_schedule.map((s, i) => <div key={i}>{E.row(s.name, `${s.kind} · ${s.tempF} °F · ${s.minutes} min`)}</div>)}
              {E.info(mashSummary(version.mash_schedule))}
              {E.ttl(`Fermentation schedule · ${version.fermentation_schedule.length} stages`)}
              {version.fermentation_schedule.map((s, i) => <div key={i}>{E.row(s.name, `${s.tempF} °F · ${s.days} days`)}</div>)}
              {E.info(fermentationSummary(version.fermentation_schedule))}
              {E.ttl("Water")}
              {processReadout(version, profileName).slice(3).map(([k, v]) => <div key={k}>{E.fld(k, v)}</div>)}
              {waterAdditions.map((a, i) => <div key={i}>{E.row(materialName(a.material_id), `${a.qty} ${a.unit} · ${a.stage}`)}</div>)}
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
