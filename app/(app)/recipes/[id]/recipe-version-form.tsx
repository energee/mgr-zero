// app/(app)/recipes/[id]/recipe-version-form.tsx — the live draft of a
// recipe version: RecipeView (components/mgr/views/recipe.tsx) with every
// field controlled, starting as a copy of the current version (`initial`, from
// versionToDraft) or blank before the first one. A changed draft is kept in
// sessionStorage per actor, brewery and recipe (lib/mgr/recipe-draft.ts),
// written as each change is made, restored with a notice and Start over on
// return, and cleared when the version saves; /recipes/new keeps none, since
// there is no recipe to key it by yet. The ingredient, mash, fermentation and
// water rows open their sheets (schedule-sheets.tsx), and the OG/FG/ABV preview
// comes from the same pure recipeGravity the server uses (lib/recipe-gravity.ts),
// or names why there is none (gravityBlockerText, noMashText). With a recipeId
// the bottom button runs create_recipe_version, disabled with draftBlocker's
// reason until the draft is complete; without one (recipes/new) the
// shared parent fields sit on top and one save runs create_recipe then
// create_recipe_version, landing on the recipe. Efficiency and attenuation
// are typed as percents, as the inventory draws them, and sent as fractions.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { E } from "@/components/mgr/e";
import { RecipeView } from "@/components/mgr/views/recipe";
import { BLANK_RECIPE, NewRecipeFieldsView, type NewRecipeBrand } from "@/components/mgr/views/new-recipe";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { useCommandContext } from "@/lib/brewery-provider";
import { gravityBlockers, recipeGravity } from "@/lib/recipe-gravity";
import { plural } from "@/lib/mgr/plural";
import { readRecipeDraft, recipeDraftKey, shouldKeepDraft, writeRecipeDraft } from "@/lib/mgr/recipe-draft";
import { draftBlocker, gravityBlockerText, noMashText, RECIPE_NUMBERS, type RecipeDraft, type RecipeNumberKey } from "@/lib/mgr/recipe-view";
import { EMPTY_WATER, fermentationSummary, ingredientDetail, lineReady, mashRowSummary, materialLookup, optionalNumber as num, removeAt, upsertAt, type RecipeMaterial, type MashStep, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";
import { FermentationScheduleSheet, IngredientSheet, MashScheduleSheet, WaterSheet } from "./schedule-sheets";

type Numbers = Record<RecipeNumberKey, string>;

const DEFAULT_MASH: MashStep[] = [{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }];
const DEFAULTS: Partial<Numbers> = { efficiency: "75", attenuation: "78" };
const BLANK_NUMBERS = Object.fromEntries(RECIPE_NUMBERS.map(([k]) => [k, DEFAULTS[k] ?? ""])) as Numbers;
/** The draft before a recipe has a version: the default mash step, 75% efficiency, 78% attenuation, nothing else. */
const BLANK_DRAFT: RecipeDraft = { numbers: BLANK_NUMBERS, notes: "", lines: [], mashSchedule: DEFAULT_MASH, fermentationSchedule: [], water: EMPTY_WATER };
const pctToFraction = (s: string) => Number(s) / 100;

export function RecipeEditor({ recipeId, title, backHref, backLabel, brands = [], initial, baseVersionId = null, baseVersion, materials, profiles, unit }: {
  recipeId?: string; title: string; backHref: string; backLabel?: string; brands?: NewRecipeBrand[];
  /** The current version as a draft (versionToDraft); absent before the first version and on /recipes/new. */
  initial?: RecipeDraft;
  /** The id and number of the version `initial` copies; a kept draft from another id is restored as stale. */
  baseVersionId?: string | null; baseVersion?: number;
  materials: RecipeMaterial[]; profiles: WaterProfileIons[]; unit: GravityUnit;
}) {
  const router = useRouter();
  const action = useCommandAction();
  const context = useCommandContext();
  const key = recipeId === undefined ? null : recipeDraftKey(context, recipeId);
  const start = initial ?? BLANK_DRAFT;
  const [parent, setParent] = useState(BLANK_RECIPE);
  const [draft, setDraft] = useState(start);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);
  const { numbers, notes, lines, mashSchedule, fermentationSchedule, water } = draft;

  const { setError } = action;
  useEffect(() => {
    if (key === null) return;
    const restore = () => {
      let kept: ReturnType<typeof readRecipeDraft>;
      try { kept = readRecipeDraft(sessionStorage.getItem(key), baseVersionId); }
      catch {
        // A record that cannot be read is dropped; starting from the server's version is safe,
        // because that version is the base the brewer started the draft from.
        sessionStorage.removeItem(key);
        setError("Your saved draft could not be read; starting from the current version.");
        return;
      }
      if (!kept) return;
      setDraft(kept.draft);
      setRestoredNotice(kept.stale ? `Restored your unsaved draft, based on an earlier version; the recipe is now on v${baseVersion}.` : "Restored your unsaved draft");
    };
    restore();
  }, [key, baseVersionId, baseVersion, setError]);

  // Every change goes through here and is kept as it is made, so mounting never writes.
  // An untouched copy is not kept: its key is removed, so returning shows no notice.
  function change(patch: Partial<RecipeDraft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (key === null) return;
    try {
      if (shouldKeepDraft(start, next)) writeRecipeDraft(sessionStorage, key, baseVersionId, next);
      else sessionStorage.removeItem(key);
    } catch { setError("Your draft could not be kept in this tab; it is lost if you leave the page before saving."); }
  }
  function startOver() {
    if (key !== null) sessionStorage.removeItem(key);
    setDraft(start);
    setRestoredNotice(null);
  }

  // Declared before the preview reads it during render (#440).
  const material = materialLookup(materials);
  const validLines = lines.filter(lineReady);
  const eff = pctToFraction(numbers.efficiency), att = pctToFraction(numbers.attenuation);
  const build = (id: string) => ({
    recipeId: id, mashSchedule, fermentationSchedule,
    process: { preBoilBbl: num(numbers.preBoil), whirlpoolMinutes: num(numbers.whirlpoolMin), whirlpoolTempF: num(numbers.whirlpoolTemp), whirlpoolRestMinutes: num(numbers.whirlpoolRest), knockoutTempF: num(numbers.knockoutTemp) },
    water: { targetProfileId: water.targetProfileId || undefined, sourceProfileId: water.sourceProfileId || undefined, mashGal: num(water.mashGal), spargeGal: num(water.spargeGal), targetMashPh: num(water.targetMashPh), additions: water.additions },
    brewhouseEfficiency: eff, yeastAttenuation: att,
    boilMinutes: num(numbers.boilMin), note: notes || undefined,
    ingredients: validLines.map((l) => ({ materialId: l.materialId, perBblQty: Number(l.perBblQty), stage: l.stage, timingMinutes: l.timingMinutes ? Number(l.timingMinutes) : undefined })),
  });

  // Recomputed every render: a handful of numbers. Null (no "Predicted:"
  // line) until there is a mash ingredient and every mash ingredient's material
  // has an extract_potential and a weight unit; until then the preview names the
  // first line that blocks it, or says there is no mash ingredient.
  const gravityLines = validLines.map((l) => ({ perBblQty: Number(l.perBblQty), extractPotential: material.get(l.materialId)?.extract_potential ?? null, stage: l.stage, unit: material.unit(l.materialId) }));
  const preview = eff > 0 && eff <= 1 && att > 0 && att <= 1 && validLines.length > 0
    ? recipeGravity({ brewhouseEfficiency: eff, yeastAttenuation: att, ingredients: gravityLines })
    : null;
  const gravityWhy = gravityBlockerText(gravityBlockers(gravityLines), (n) => material.name(validLines[n].materialId), (n) => material.unit(validLines[n].materialId), { saved: false })
    ?? noMashText(validLines.map((l) => l.stage));

  const creating = recipeId === undefined;
  // A parent that saved before the version failed is kept, so a retry writes
  // only the version instead of a second recipe; the parent fields lock at
  // that point, since there is no update_recipe to carry a later edit.
  const [createdId, setCreatedId] = useState(recipeId ?? "");
  async function submit() {
    let id = createdId;
    if (!id) {
      const ok = await action.run("create_recipe", { name: parent.name, brandId: parent.brandId || undefined, note: parent.note || undefined }, (d) => {
        const got = (d as { id?: unknown } | null)?.id;
        if (typeof got === "string") { id = got; setCreatedId(got); }
      });
      if (!ok) return;
      if (!id) { action.setError("The recipe was created but its id did not come back; open it from Recipes to add the version."); return; }
    }
    await action.run("create_recipe_version", build(id), () => {
      if (key !== null) sessionStorage.removeItem(key);
      router.push(`/recipes/${id}`);
    });
  }
  // What the draft still lacks, named for the brewer; the submit stays disabled until it is null.
  const blockedReason = draftBlocker({ name: creating ? parent.name : undefined, lines, mashSchedule, efficiency: numbers.efficiency, attenuation: numbers.attenuation });
  const parentLocked = creating && createdId !== "";
  const sheetMaterials = materials.map((m) => ({ id: m.id, name: m.name, unit: m.base_uom, category: m.category }));
  const target = profiles.find((p) => p.id === water.targetProfileId)?.name;
  const mashRow = { title: `Mash schedule · ${plural(mashSchedule.length, "step")}`, detail: mashRowSummary(mashSchedule) };
  const fermentationRow = { title: `Fermentation schedule · ${plural(fermentationSchedule.length, "stage")}`, detail: fermentationSchedule.length ? fermentationSummary(fermentationSchedule) : "No stages yet" };
  const waterRow = { title: "Water", detail: `${target ? `target ${target}` : "no target"} · ${plural(water.additions.length, "addition")}` };

  return (
    <RecipeView
      model={{
        title, backHref, backLabel, ...numbers, notes,
        ingredients: lines.map((l, i) => ({
          key: `${i}-${l.materialId}`, title: material.name(l.materialId), detail: ingredientDetail(l.stage, l.timingMinutes, l.perBblQty, material.unit(l.materialId)), qty: "",
          action: <IngredientSheet line={l} materials={sheetMaterials} onSave={(f) => change({ lines: upsertAt(draft.lines, i, f) })} onDelete={() => change({ lines: removeAt(draft.lines, i) })} trigger={E.act(<>Edit<span className="sr-only"> {material.name(l.materialId)}</span></>)} />,
        })),
        mash: mashRow, fermentation: fermentationRow, water: waterRow,
        predicted: preview ? `Predicted: OG ${formatGravity(preview.ogPlato, unit)} · FG ${formatGravity(preview.fgPlato, unit)} · ABV ${preview.abv.toFixed(1)}%` : gravityWhy ?? undefined,
      }}
      parentForm={creating ? <>
        <NewRecipeFieldsView brands={brands} values={parent} onChange={setParent} busy={action.busy || parentLocked} />
        {parentLocked ? E.info("The recipe is saved under this name; only the version is still to write.") : null}
      </> : restoredNotice ? <>
        {E.info(restoredNotice)}
        {E.btn("Start over", "g", undefined, startOver)}
      </> : undefined}
      controls={{
        set: (field, value) => change(field === "notes" ? { notes: value } : { numbers: { ...draft.numbers, [field]: value } }),
        onSubmit: () => void submit(), busy: action.busy, blockedReason, error: action.error,
        submitLabel: creating && !parentLocked ? "Create recipe" : "Create recipe version",
      }}
      slots={{
        addIngredient: <IngredientSheet materials={sheetMaterials} onSave={(f) => change({ lines: [...draft.lines, f] })} trigger={E.row("+ add ingredient", "material · stage · timing", "")} />,
        mash: <MashScheduleSheet steps={mashSchedule} onChange={(mashSchedule) => change({ mashSchedule })} trigger={E.nav(mashRow.title, mashRow.detail)} />,
        fermentation: <FermentationScheduleSheet stages={fermentationSchedule} onChange={(fermentationSchedule) => change({ fermentationSchedule })} trigger={E.nav(fermentationRow.title, fermentationRow.detail)} />,
        water: <WaterSheet water={water} profiles={profiles} materials={materials} onChange={(water) => change({ water })} trigger={E.nav(waterRow.title, waterRow.detail)} />,
      }}
    />
  );
}
