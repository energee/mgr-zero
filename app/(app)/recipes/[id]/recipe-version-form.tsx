// app/(app)/recipes/[id]/recipe-version-form.tsx — the recipe editor: RecipeView
// (components/mgr/views/recipe.tsx) with every field controlled. On
// /recipes/<id> it starts as the current saved copy (`initial`, from
// versionToDraft), or blank before the first save, and the page's own parts
// (`page`: saved date, Schedule batch, Batch actuals, As brewed) and its brand
// picker (`parentForm`) sit around the sheet. Nothing is written until Save
// changes: the save bar is up only while the sheet differs from what is saved
// (shouldKeepDraft), and Discard puts it back. An unchanged sheet shows the
// figures the saved copy froze (`saved`); once changed it shows the live
// preview. When current Materials would give the unchanged recipe other
// figures (materialsNowGive), Refresh from Materials saves it again as it is,
// which freezes them. The brand picker is apart from
// that: it saves on pick (set_recipe_brand) and its refresh leaves the unsaved
// sheet alone. An unsaved change is kept in sessionStorage per actor, brewery
// and recipe (lib/mgr/recipe-draft.ts), written as each change is made,
// restored with a notice on return, and cleared on save; /recipes/new keeps
// none, since there is no recipe to key it by yet. Use this again arrives as
// `loaded`: an earlier copy shown as an unsaved change, kept like any other,
// with ?from dropped from the address so a reload restores it. Save changes
// runs create_recipe_version, disabled with draftBlocker's reason until the
// sheet is complete; the page then refreshes onto the new copy and remounts
// this editor. Without a recipeId (recipes/new) the shared parent fields sit
// on top, the save bar is always up, and one save runs create_recipe then
// create_recipe_version, landing on the recipe. A line's name, a step's Add
// ingredient (on that step's stage) and its Edit schedule open their sheets
// (schedule-sheets.tsx). The OG/FG/ABV preview comes from the same pure
// recipeGravity the server uses (lib/recipe-gravity.ts), or names why there is
// none (gravityBlockerText, noMashText). The IBU preview (draftIbu) reads each
// material's current alpha acid. Efficiency and attenuation are typed as percents, as the
// inventory draws them, and sent as fractions. Each brew-day line carries its
// pack (ingredientPack), so RecipeView's Round choices rewrite that line's
// per-bbl amount through the same change().
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { E } from "@/components/mgr/e";
import { RecipeView } from "@/components/mgr/views/recipe";
import { BLANK_RECIPE, NewRecipeFieldsView, type NewRecipeBrand } from "@/components/mgr/views/new-recipe";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { useCommandContext } from "@/lib/brewery-provider";
import { gravityBlockers, recipeGravity } from "@/lib/recipe-gravity";
import { readRecipeDraft, recipeDraftKey, shouldKeepDraft, writeRecipeDraft } from "@/lib/mgr/recipe-draft";
import { draftBlocker, draftIbu, fermentationView, figureStrip, gravityBlockerText, ingredientCells, ingredientPack, mashView, materialsNowGive, noMashText, RECIPE_NUMBERS, waterView, type RecipeDraft, type RecipeFigures, type RecipeNumberKey, type RecipeViewModel } from "@/lib/mgr/recipe-view";
import { EMPTY_WATER, lineReady, materialLookup, optionalNumber as num, removeAt, scheduleDays, upsertAt, type RecipeMaterial, type MashStep, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";
import { FermentationScheduleSheet, IngredientSheet, MashScheduleSheet, WaterSheet } from "./schedule-sheets";

type Numbers = Record<RecipeNumberKey, string>;

const DEFAULT_MASH: MashStep[] = [{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }];
const DEFAULTS: Partial<Numbers> = { efficiency: "75", attenuation: "78" };
const BLANK_NUMBERS = Object.fromEntries(RECIPE_NUMBERS.map(([k]) => [k, DEFAULTS[k] ?? ""])) as Numbers;
/** The sheet before a recipe is first saved: the default mash step, 75% efficiency, 78% attenuation, nothing else. */
const BLANK_DRAFT: RecipeDraft = { numbers: BLANK_NUMBERS, notes: "", lines: [], mashSchedule: DEFAULT_MASH, fermentationSchedule: [], water: EMPTY_WATER };
const pctToFraction = (s: string) => Number(s) / 100;
const NOT_KEPT = "Your changes could not be kept in this tab; they are lost if you leave the page before saving.";

export function RecipeEditor({ recipeId, title, backHref, brands = [], parentForm, page, saved, initial, baseVersionId = null, loaded, materials, profiles, unit }: {
  recipeId?: string; title: string; backHref: string; brands?: NewRecipeBrand[];
  /** The recipe page's brand picker, drawn above the sheet. It saves on its own, apart from the sheet's Save changes. */
  parentForm?: ReactNode;
  /** What the recipe page draws around the sheet from the saved recipe; the sheet's own fields come from the draft. */
  page?: Pick<RecipeViewModel, "saved" | "scheduleHref" | "recipeNote" | "tape" | "actualsNote" | "history" | "figures" | "figureNotes">;
  /** What the saved copy predicts, frozen at its save (get_recipe). The unchanged sheet shows `page`'s figures, drawn
   *  from these; Refresh from Materials is offered when the live preview gives other numbers. Absent before the first save. */
  saved?: RecipeFigures;
  /** The current saved copy as a draft (versionToDraft); absent before the first save and on /recipes/new. */
  initial?: RecipeDraft;
  /** The id of the copy `initial` is; a kept draft from another id is restored as stale. */
  baseVersionId?: string | null;
  /** Use this again: an earlier copy to show as an unsaved change, and the notice naming where it came from. */
  loaded?: { draft: RecipeDraft; notice: string };
  materials: RecipeMaterial[]; profiles: WaterProfileIons[]; unit: GravityUnit;
}) {
  const router = useRouter();
  const action = useCommandAction();
  const context = useCommandContext();
  const key = recipeId === undefined ? null : recipeDraftKey(context, recipeId);
  const start = initial ?? BLANK_DRAFT;
  const [parent, setParent] = useState(BLANK_RECIPE);
  const [draft, setDraft] = useState(loaded?.draft ?? start);
  const [notice, setNotice] = useState<string | null>(loaded?.notice ?? null);
  const { numbers, notes, lines, mashSchedule, fermentationSchedule, water } = draft;

  const { setError } = action;
  useEffect(() => {
    if (key === null) return;
    const settle = () => {
      if (loaded) {
        // Use this again: keep the loaded copy as this tab's unsaved change, then drop ?from from the address,
        // so a reload restores it with whatever was changed since instead of loading the copy afresh.
        // A search-only replace keeps this editor mounted, so the sheet and the notice stay on screen.
        try { writeRecipeDraft(sessionStorage, key, baseVersionId, loaded.draft); }
        catch { setError(NOT_KEPT); }
        router.replace(`/recipes/${recipeId}`, { scroll: false });
        return;
      }
      let kept: ReturnType<typeof readRecipeDraft>;
      try { kept = readRecipeDraft(sessionStorage.getItem(key), baseVersionId); }
      catch {
        // A record that cannot be read is dropped; starting from the saved recipe is safe,
        // because that is what the brewer started the change from.
        sessionStorage.removeItem(key);
        setError("Your unsaved changes could not be read; starting from the saved recipe.");
        return;
      }
      if (!kept) return;
      setDraft(kept.draft);
      // The Use this again notice stays: this also runs once ?from is dropped, on the copy it just kept.
      const restored = kept.stale ? "Restored your unsaved changes. The recipe has been saved again since you made them." : "Restored your unsaved changes";
      setNotice((shown) => shown ?? restored);
    };
    settle();
  }, [key, baseVersionId, loaded, recipeId, router, setError]);

  // Every change goes through here and is kept as it is made, so mounting writes only for Use this again.
  // An untouched copy is not kept: its key is removed, so returning shows no notice.
  function change(patch: Partial<RecipeDraft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (key === null) return;
    try {
      if (shouldKeepDraft(start, next)) writeRecipeDraft(sessionStorage, key, baseVersionId, next);
      else sessionStorage.removeItem(key);
    } catch { setError(NOT_KEPT); }
  }
  function discard() {
    if (key !== null) sessionStorage.removeItem(key);
    setDraft(start);
    setNotice(null);
  }

  // Declared before the preview reads it during render (#440).
  const material = materialLookup(materials);
  const validLines = lines.filter(lineReady);
  // An ingredient's timing is bounded by this draft's boil time and fermentation schedule (#1478).
  const timingLimits = { boilMinutes: numbers.boilMin.trim() ? Number(numbers.boilMin) : undefined, fermentationDays: scheduleDays(fermentationSchedule) };
  const eff = pctToFraction(numbers.efficiency), att = pctToFraction(numbers.attenuation);
  const build = (id: string) => ({
    recipeId: id, mashSchedule, fermentationSchedule,
    process: { preBoilBbl: num(numbers.preBoil), whirlpoolMinutes: num(numbers.whirlpoolMin), whirlpoolTempF: num(numbers.whirlpoolTemp), whirlpoolRestMinutes: num(numbers.whirlpoolRest), knockoutTempF: num(numbers.knockoutTemp) },
    water: { targetProfileId: water.targetProfileId || undefined, sourceProfileId: water.sourceProfileId || undefined, mashGal: num(water.mashGal), spargeGal: num(water.spargeGal), targetMashPh: num(water.targetMashPh), additions: water.additions },
    brewhouseEfficiency: eff, yeastAttenuation: att,
    boilMinutes: num(numbers.boilMin), note: notes || undefined,
    ingredients: validLines.map((l) => ({ materialId: l.materialId, perBblQty: Number(l.perBblQty), stage: l.stage, timingMinutes: l.timingMinutes ? Number(l.timingMinutes) : undefined })),
  });

  // Recomputed every render: a handful of numbers. No gravity is predicted
  // until there is a mash ingredient and every mash ingredient's material
  // has an extract_potential and a weight unit; until then the preview names the
  // first line that blocks it, or says there is no mash ingredient.
  const gravityLines = validLines.map((l) => ({ perBblQty: Number(l.perBblQty), extractPotential: material.get(l.materialId)?.extract_potential ?? null, stage: l.stage, unit: material.unit(l.materialId) }));
  const preview = eff > 0 && eff <= 1 && att > 0 && att <= 1 && validLines.length > 0
    ? recipeGravity({ brewhouseEfficiency: eff, yeastAttenuation: att, ingredients: gravityLines })
    : null;
  const gravityWhy = gravityBlockerText(gravityBlockers(gravityLines), (n) => material.name(validLines[n].materialId), (n) => material.unit(validLines[n].materialId), { saved: false })
    ?? noMashText(validLines.map((l) => l.stage));
  /** What the sheet as it stands predicts from current Materials. */
  const live: RecipeFigures = { ogPlato: preview?.ogPlato ?? null, fgPlato: preview?.fgPlato ?? null, abv: preview?.abv ?? null, ibu: draftIbu(validLines, preview?.ogPlato ?? null, materials) };

  const creating = recipeId === undefined;
  // A parent that saved before its sheet failed is kept, so a retry writes
  // only the sheet instead of a second recipe; the parent fields lock at
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
      if (!id) { action.setError("The recipe was created but its id did not come back; open it from Recipes to finish it."); return; }
    }
    // A save on the recipe's own page stays there: run() refreshes the page, which remounts this editor on the new copy.
    await action.run("create_recipe_version", build(id), () => {
      if (key !== null) sessionStorage.removeItem(key);
      if (creating) router.push(`/recipes/${id}`);
    });
  }
  // What the sheet still lacks, named for the brewer; Save stays disabled until it is null.
  const blockedReason = draftBlocker({ name: creating ? parent.name : undefined, lines, mashSchedule, fermentationSchedule, numbers, efficiency: numbers.efficiency, attenuation: numbers.attenuation });
  // A recipe being created has nothing saved to differ from: its bar is always up.
  const dirty = creating || shouldKeepDraft(start, draft);
  // An unchanged saved sheet shows what its copy froze; a changed or unsaved one shows the live preview.
  const frozen = !dirty && saved !== undefined;
  // Refresh is offered only on a sheet that can be saved as it stands. A line whose material the page cannot see
  // (an inactive one) makes the live preview a guess, so the offer waits (materialsNowGive takes null).
  const refreshText = frozen && !blockedReason
    ? materialsNowGive(saved, lines.every((l) => material.get(l.materialId)) ? live : null, unit)
    : undefined;
  const parentLocked = creating && createdId !== "";
  const sheetMaterials = materials.map((m) => ({ id: m.id, name: m.name, unit: m.base_uom, category: m.category }));
  const liveStrip = figureStrip(live, unit, { saved: false, why: gravityWhy });
  return (
    <RecipeView
      model={{
        ...page, title, backHref, ...numbers, notes,
        ingredients: lines.map((l, i) => ({
          key: `${i}-${l.materialId}`, title: material.name(l.materialId), ...ingredientCells(l.stage, l.timingMinutes, l.perBblQty, material.unit(l.materialId)),
          edit: (trigger) => <IngredientSheet line={l} materials={sheetMaterials} limits={timingLimits} onSave={(f) => change({ lines: upsertAt(draft.lines, i, f) })} onDelete={() => change({ lines: removeAt(draft.lines, i) })} trigger={trigger} />,
          pack: ingredientPack(l.stage, Number(l.perBblQty), material.get(l.materialId)),
          onRound: (perBbl: number) => change({ lines: upsertAt(draft.lines, i, { ...l, perBblQty: String(perBbl) }) }),
        })),
        mash: mashView(mashSchedule), fermentation: fermentationView(fermentationSchedule), water: waterView(water, profiles, material.name),
        ...(frozen ? {} : { figures: liveStrip.figures, figureNotes: liveStrip.notes }),
      }}
      parentForm={creating ? <>
        <NewRecipeFieldsView brands={brands} values={parent} onChange={setParent} busy={action.busy || parentLocked} />
        {parentLocked ? E.info("The recipe is saved under this name; only its sheet is still to save.") : null}
      </> : <>
        {parentForm}
        {notice ? E.info(notice) : null}
      </>}
      controls={{
        set: (field, value) => change(field === "notes" ? { notes: value } : { numbers: { ...draft.numbers, [field]: value } }),
        onSubmit: () => void submit(), busy: action.busy, blockedReason, error: action.error,
        dirty,
        // A recipe being created has nothing saved to go back to.
        onDiscard: creating ? undefined : discard,
        refresh: refreshText ? { text: refreshText, onRefresh: () => void submit() } : undefined,
        submitLabel: creating && !parentLocked ? "Create recipe" : undefined,
      }}
      slots={{
        addIngredient: (stage, trigger) => <IngredientSheet stage={stage} materials={sheetMaterials} limits={timingLimits} onSave={(f) => change({ lines: [...draft.lines, f] })} trigger={trigger} />,
        schedule: (key, trigger) => {
          if (key === "mash") return <MashScheduleSheet steps={mashSchedule} onChange={(mashSchedule) => change({ mashSchedule })} trigger={trigger} />;
          if (key === "fermentation") return <FermentationScheduleSheet stages={fermentationSchedule} onChange={(fermentationSchedule) => change({ fermentationSchedule })} trigger={trigger} />;
          return <WaterSheet water={water} profiles={profiles} materials={materials} onChange={(water) => change({ water })} trigger={trigger} />;
        },
      }}
    />
  );
}
