// app/(app)/recipes/[id]/page.tsx — one recipe, drawn by RecipeView exactly
// as the inventory draws it: its latest version's process numbers,
// ingredients, schedules and the OG/FG/ABV get_recipe predicts (never
// stored). Create recipe version opens the same page with ?draft, where
// recipe-version-form.tsx makes every field live for create_recipe_version.
import { RecipeView } from "@/components/mgr/views/recipe";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { orNotFound } from "@/lib/mgr/not-found";
import { RecipeEditor } from "./recipe-version-form";
import { fermentationSummary, mashSummary, processReadout, type FermentationStage, type MashStep, type ProcessColumns } from "@/lib/mgr/recipe-process-view";

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
type Material = { id: string; name: string; category: string; base_uom: string; extract_potential: number | null };

const pct = (n: number) => String(Math.round(n * 100));
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export default async function RecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft?: string }> }) {
  const [{ id }, { draft }] = await Promise.all([params, searchParams]);
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
  const materialUnit = (mid: string) => materials.find((m) => m.id === mid)?.base_uom ?? "";
  const profileName = (pid: string | null) => (pid && profiles.find((p) => p.id === pid)?.name) || null;
  // The form is a client component: hand it the fields it reads, not the whole materials row.
  const formMaterials = materials.map(({ id, name, category, base_uom, extract_potential }) => ({ id, name, category, base_uom, extract_potential }));
  const backHref = `/recipes/${recipe.id}`;

  if (draft !== undefined) {
    return <RecipeEditor recipeId={recipe.id} title={`${recipe.name} · new version`} backHref={backHref} backLabel={recipe.name} materials={formMaterials} profiles={profiles} unit={gravityUnit.effective} />;
  }

  const target = profileName(version?.target_water_profile_id ?? null);
  const water = version ? processReadout(version, profileName).filter(([k]) => !/^(Pre-boil|Whirlpool|Knockout)/.test(k)) : [];
  return (
    <RecipeView
      readOnly
      model={{
        title: version ? `${recipe.name} v${version.version}` : recipe.name,
        backHref: "/recipes",
        createHref: `${backHref}?draft`,
        empty: version ? undefined : "No version yet: create the first one",
        parent: { title: `Recipe parent · ${recipe.name}`, detail: recipe.note ?? "" },
        ingredients: ingredients.map((i) => ({
          key: i.id, title: materialName(i.material_id),
          detail: `${i.stage.replace("_", " ")}${i.timing_minutes !== null ? ` · ${i.timing_minutes} min` : ""} · ${Number(i.per_bbl_qty)} ${materialUnit(i.material_id)} / bbl`,
          qty: "",
        })),
        preBoil: str(version?.pre_boil_bbl), boilMin: str(version?.boil_minutes),
        whirlpoolMin: str(version?.whirlpool_minutes), whirlpoolTemp: str(version?.whirlpool_temp_f), whirlpoolRest: str(version?.whirlpool_rest_minutes), knockoutTemp: str(version?.knockout_temp_f),
        efficiency: version ? pct(version.brewhouse_efficiency) : "", attenuation: version ? pct(version.yeast_attenuation) : "",
        mash: version ? { title: `Mash schedule · ${version.mash_schedule.length} steps`, detail: mashSummary(version.mash_schedule), rows: version.mash_schedule.map((s) => ({ title: s.name, detail: `${s.kind} · ${s.tempF} °F · ${s.minutes} min` })) } : undefined,
        fermentation: version ? { title: `Fermentation schedule · ${version.fermentation_schedule.length} stages`, detail: fermentationSummary(version.fermentation_schedule), rows: version.fermentation_schedule.map((s) => ({ title: s.name, detail: `${s.tempF} °F · ${s.days} days` })) } : undefined,
        water: version ? {
          title: `Water · ${target ? `target ${target}` : "no target"}`, detail: `${waterAdditions.length} additions`,
          rows: [...water.map(([k, v]) => ({ title: k, detail: v })), ...waterAdditions.map((a) => ({ title: materialName(a.material_id), detail: `${a.qty} ${a.unit} · ${a.stage}` }))],
        } : undefined,
        notes: version?.note ?? "",
        predicted: ogPlato !== null && fgPlato !== null && abv !== null
          ? `Predicted: OG ${formatGravity(ogPlato, gravityUnit.effective)} · FG ${formatGravity(fgPlato, gravityUnit.effective)} · ABV ${abv.toFixed(1)}%`
          : undefined,
      }}
    />
  );
}
