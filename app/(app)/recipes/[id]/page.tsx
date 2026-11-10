// app/(app)/recipes/[id]/page.tsx — the one recipe page. It opens the current
// saved copy in the editor (recipe-version-form.tsx), every field live, with the
// brand picker on top and, from toRecipePageModel, the saved date, Schedule
// batch, Batch actuals (get_recipe_outcomes) and As brewed around the sheet. A
// recipe not saved yet opens the blank sheet. ?v=N naming an earlier copy reads
// that copy out read only (RecipeView); ?v= naming the current copy is the
// editor. ?from=N is Use this again: the editor opens on the current copy with
// copy N loaded as an unsaved change. A ?v= or ?from= that names no saved copy
// is not found. The page only fetches and renders. Schedule batch opens
// /batches?recipe=<id>, whose New batch sheet starts on the saved recipe
// (schedule_batch).
import { RecipeView } from "@/components/mgr/views/recipe";
import { RecipeBrandPicker } from "./recipe-brand-picker";
import { RecipeEditor } from "./recipe-version-form";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { shouldKeepDraft } from "@/lib/mgr/recipe-draft";
import { toRecipeMaterial, toWaterProfileOption, type RecipeMaterial, type WaterProfileRow } from "@/lib/mgr/recipe-process-view";
import { loadedNotice, recipePageTitle, toRecipePageModel, versionToDraft, type RecipeOutcome } from "@/lib/mgr/recipe-view";
import { getRecipePageData } from "../recipe-data";

type Copy = string | string[] | undefined;
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: Copy; from?: Copy }>;
};

/** A ?v= or ?from= copy number. A repeated parameter is NaN, which get_recipe refuses, so the page is not found. */
function copyNumber(v: Copy): number | undefined {
  return v === undefined ? undefined : typeof v === "string" ? Number(v) : NaN;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const { snapshot } = await getRecipePageData(id, copyNumber(v));
  return { title: recipePageTitle(snapshot) };
}

export default async function RecipePage({ params, searchParams }: Props) {
  const [{ id }, { v, from }] = await Promise.all([params, searchParams]);
  const { brewery, ctx, snapshot } = await getRecipePageData(id, copyNumber(v));
  const [materials, gravityUnit, profiles, brands, outcomes] = (await Promise.all([
    runCommand("list_materials", {}, ctx),
    runCommand("get_gravity_unit", {}, ctx),
    runCommand("list_water_profiles", {}, ctx),
    runCommand("list_brands", {}, ctx),
    runCommand("get_recipe_outcomes", { recipeId: id }, ctx),
  ])) as [RecipeMaterial[], { effective: GravityUnit }, WaterProfileRow[], { id: string; name: string; alias: string | null }[], { batches: RecipeOutcome[] }];
  const { recipe, version } = snapshot;
  const latest = snapshot.versions[0];
  const model = toRecipePageModel(snapshot, { materials, profiles, unit: gravityUnit.effective, timeZone: brewery.timeZone, outcomes: outcomes.batches });
  // An earlier copy is read as brewed; only the current one is edited.
  if (version && version.version !== latest) return <RecipeView readOnly model={model} />;

  const initial = versionToDraft(snapshot) ?? undefined;
  // Use this again: the copy ?from names, read beside the current one. A copy that matches what is saved loads nothing.
  const earlier = from === undefined ? null : (await getRecipePageData(id, copyNumber(from))).snapshot;
  const draft = earlier && versionToDraft(earlier);
  const loaded = earlier?.version && draft && initial && shouldKeepDraft(initial, draft)
    ? { draft, notice: loadedNotice(outcomes.batches, earlier.version.version, latest) }
    : undefined;
  const { saved, scheduleHref, recipeNote, tape, actualsNote, history } = model;
  return (
    <RecipeEditor
      // A save makes a new current copy, so the editor remounts on it with nothing unsaved.
      key={version?.id ?? "unsaved"}
      recipeId={recipe.id} title={model.title} backHref="/recipes"
      parentForm={<RecipeBrandPicker recipeId={recipe.id} brandId={recipe.brand_id} brands={brands} />}
      page={{ saved, scheduleHref, recipeNote, tape, actualsNote, history }}
      initial={initial} baseVersionId={version?.id ?? null} loaded={loaded}
      materials={materials.map(toRecipeMaterial)} profiles={profiles.map(toWaterProfileOption)} unit={gravityUnit.effective}
    />
  );
}
