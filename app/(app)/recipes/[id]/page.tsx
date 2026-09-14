// app/(app)/recipes/[id]/page.tsx — one recipe, drawn by RecipeView exactly
// as the inventory draws it: its latest version's process numbers,
// ingredients, schedules and the OG/FG/ABV get_recipe predicts (never
// stored). Create recipe version opens ./new, where recipe-version-form.tsx
// makes every field live for create_recipe_version.
import { RecipeView } from "@/components/mgr/views/recipe";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { orNotFound } from "@/lib/mgr/not-found";
import type { RecipeMaterial } from "./recipe-version-form";
import { fermentationSummary, ingredientDetail, mashSummary, materialLookup, processReadout, type FermentationStage, type MashStep, type ProcessColumns } from "@/lib/mgr/recipe-process-view";

type Recipe = { id: string; name: string; brand_id: string | null; note: string | null };
type Version = ProcessColumns & {
  id: string; version: number; mash_temp_f: number | null; brewhouse_efficiency: number; yeast_attenuation: number;
  boil_minutes: number | null; note: string | null;
  mash_schedule: MashStep[]; fermentation_schedule: FermentationStage[];
};
type WaterAdditionRow = { material_id: string; qty: number; unit: string; stage: string };
type Profile = { id: string; name: string };
type Ingredient = { id: string; material_id: string; per_bbl_qty: number; stage: string; timing_minutes: number | null; sort: number; extract_snapshot: number | null };
type GetRecipe = { recipe: Recipe; version: Version | null; ingredients: Ingredient[]; waterAdditions: WaterAdditionRow[]; ogPlato: number | null; fgPlato: number | null; abv: number | null };

const pct = (n: number) => String(Math.round(n * 100));
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ recipe, version, ingredients, waterAdditions, ogPlato, fgPlato, abv }, materials, gravityUnit, profiles] = (await Promise.all([
    orNotFound(runCommand("get_recipe", { recipeId: id }, ctx)),
    runCommand("list_materials", {}, ctx),
    runCommand("get_gravity_unit", {}, ctx),
    runCommand("list_water_profiles", {}, ctx),
  ])) as [GetRecipe, RecipeMaterial[], { effective: GravityUnit }, Profile[]];
  const material = materialLookup(materials);
  const profileName = (pid: string | null) => (pid && profiles.find((p) => p.id === pid)?.name) || null;

  const target = profileName(version?.target_water_profile_id ?? null);
  const water = version ? processReadout(version, profileName).filter(([k]) => !/^(Pre-boil|Whirlpool|Knockout)/.test(k)) : [];
  return (
    <RecipeView
      readOnly
      model={{
        title: version ? `${recipe.name} v${version.version}` : recipe.name,
        backHref: "/recipes",
        createHref: `/recipes/${recipe.id}/new`,
        empty: version ? undefined : "No version yet: create the first one",
        parent: { title: `Recipe parent · ${recipe.name}`, detail: recipe.note ?? "" },
        ingredients: ingredients.map((i) => ({
          key: i.id, title: material.name(i.material_id),
          detail: ingredientDetail(i.stage, i.timing_minutes, Number(i.per_bbl_qty), material.unit(i.material_id)),
          qty: "",
        })),
        preBoil: str(version?.pre_boil_bbl), boilMin: str(version?.boil_minutes),
        whirlpoolMin: str(version?.whirlpool_minutes), whirlpoolTemp: str(version?.whirlpool_temp_f), whirlpoolRest: str(version?.whirlpool_rest_minutes), knockoutTemp: str(version?.knockout_temp_f),
        efficiency: version ? pct(version.brewhouse_efficiency) : "", attenuation: version ? pct(version.yeast_attenuation) : "",
        mash: version ? { title: `Mash schedule · ${version.mash_schedule.length} steps`, detail: mashSummary(version.mash_schedule), rows: version.mash_schedule.map((s) => ({ title: s.name, detail: `${s.kind} · ${s.tempF} °F · ${s.minutes} min` })) } : undefined,
        fermentation: version ? { title: `Fermentation schedule · ${version.fermentation_schedule.length} stages`, detail: fermentationSummary(version.fermentation_schedule), rows: version.fermentation_schedule.map((s) => ({ title: s.name, detail: `${s.tempF} °F · ${s.days} days` })) } : undefined,
        water: version ? {
          title: `Water · ${target ? `target ${target}` : "no target"}`, detail: `${waterAdditions.length} additions`,
          rows: [...water.map(([k, v]) => ({ title: k, detail: v })), ...waterAdditions.map((a) => ({ title: material.name(a.material_id), detail: `${a.qty} ${a.unit} · ${a.stage}` }))],
        } : undefined,
        notes: version?.note ?? "",
        predicted: ogPlato !== null && fgPlato !== null && abv !== null
          ? `Predicted: OG ${formatGravity(ogPlato, gravityUnit.effective)} · FG ${formatGravity(fgPlato, gravityUnit.effective)} · ABV ${abv.toFixed(1)}%`
          : undefined,
      }}
    />
  );
}
