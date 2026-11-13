// app/(app)/recipes/[id]/recipe-version-form.tsx — the recipe editor: RecipeView
// (components/mgr/views/recipe.tsx) bound to an unsaved sheet. On
// /recipes/<id> it starts as the current saved copy (`initial`, from
// versionToDraft), or blank before the first save, and the page's own parts
// (`page`: saved date and its change note, Schedule batch, Batch actuals, As
// brewed) sit around the sheet. Nothing is written until Save
// changes: the save bar is up only while the sheet differs from what is saved
// (shouldKeepDraft), and Discard puts it back and clears a failed save's
// message. The bar holds the change note for the save, except while a recipe
// is being created. An unchanged sheet shows the
// figures the saved copy froze (`saved`); once changed it shows the live
// preview. When current Materials would give the unchanged recipe other
// figures (materialsNowGive), Refresh from Materials saves it again as it is,
// which freezes them. The brand is apart from
// that: the pick in the page's sentence saves on its own (set_recipe_brand),
// says "Brand saved", and its refresh leaves the unsaved sheet alone. It
// stays enabled while that save runs, so focus never drops; a pick made
// meanwhile is ignored, and so is a pick of the brand it already has. The name
// and note are apart too: Edit name and note beside the brand opens the Recipe
// name sheet, whose Save runs update_recipe and says "Name and note saved"; the
// note keeps the source record id the page hides (storedRecipeNote). An unsaved change is kept in sessionStorage per actor, brewery
// and recipe (lib/mgr/recipe-draft.ts), written as each change is made,
// restored with a notice on return, and cleared on save; /recipes/new keeps
// none, since there is no recipe to key it by yet. Use this again arrives as
// `loaded`: an earlier copy shown as an unsaved change, kept like any other,
// with ?from dropped from the address so a reload restores it. Save changes
// runs create_recipe_version, disabled with draftBlocker's reason until the
// sheet is complete; the page then refreshes onto the new copy and remounts
// this editor. Without a recipeId (recipes/new) the shared parent fields sit
// on top, the save bar is always up, and one save runs create_recipe then
// create_recipe_version, landing on the recipe. A line's name and Add
// ingredient open the Ingredient sheet, and each schedule's action opens its
// sheet (schedule-sheets.tsx). The batch size and the eight process numbers
// have one sheet, Recipe numbers, and the water has one; a fact the page
// draws in a sentence opens the same sheet its action does (`sheetOpen`), so
// the sheet stays open while that fact is retyped, and closing it returns
// focus to the fact that opened it (CommandForm). The OG/FG/ABV preview comes from the same pure
// recipeGravity the server uses (lib/recipe-gravity.ts), or names why there is
// none (gravityBlockerText, noMashText). The IBU preview (draftIbu) reads each
// material's current alpha acid. Efficiency and attenuation are typed as percents, as the
// inventory draws them, and sent as fractions. The batch size is part of the
// draft: every save sends it, and a copy saved with the field blank has none.
// Each line carries its pack (ingredientPack), so RecipeView's Round choices
// rewrite that line's per-bbl amount through the same change(), and each mash
// line its share of the grain bill (gristShares). The Ingredient sheet takes
// the batch size and each material's pack, so a line can be typed in packs.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { E } from "@/components/mgr/e";
import { RecipeView } from "@/components/mgr/views/recipe";
import { BLANK_RECIPE, NewRecipeFieldsView, type NewRecipeBrand } from "@/components/mgr/views/new-recipe";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { nameWithAlias } from "@/lib/mgr/labels";
import { useCommandContext } from "@/lib/brewery-provider";
import { gravityBlockers, recipeGravity } from "@/lib/recipe-gravity";
import { readRecipeDraft, recipeDraftKey, shouldKeepDraft, writeRecipeDraft } from "@/lib/mgr/recipe-draft";
import { batchSize, draftBlocker, draftIbu, figureStrip, gravityBlockerText, gristShares, ingredientCells, ingredientPack, materialsNowGive, noMashText, RECIPE_NUMBERS, storedRecipeNote, waterFacts, type RecipeDraft, type RecipeFigures, type RecipeNumberKey, type RecipeViewModel } from "@/lib/mgr/recipe-view";
import { EMPTY_WATER, lineReady, materialLookup, optionalNumber as num, removeAt, scheduleDays, upsertAt, type RecipeMaterial, type MashStep, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";
import { FermentationScheduleSheet, IngredientSheet, MashScheduleSheet, RecipeNameSheet, RecipeNumbersSheet, WaterSheet } from "./schedule-sheets";

type Numbers = Record<RecipeNumberKey, string>;

const DEFAULT_MASH: MashStep[] = [{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }];
const DEFAULTS: Partial<Numbers> = { efficiency: "75", attenuation: "78" };
const BLANK_NUMBERS = Object.fromEntries(RECIPE_NUMBERS.map(([k]) => [k, DEFAULTS[k] ?? ""])) as Numbers;
/** The sheet before a recipe is first saved: the default mash step, 75% efficiency, 78% attenuation, nothing else. */
const BLANK_DRAFT: RecipeDraft = { batchBbl: "", numbers: BLANK_NUMBERS, notes: "", lines: [], mashSchedule: DEFAULT_MASH, fermentationSchedule: [], water: EMPTY_WATER };
const pctToFraction = (s: string) => Number(s) / 100;
const NOT_KEPT = "Your changes could not be kept in this tab; they are lost if you leave the page before saving.";

export function RecipeEditor({ recipeId, title, backHref, brandId = null, brands = [], storedNote = null, page, savedFigures, initial, baseVersionId = null, loaded, materials, profiles, unit }: {
  recipeId?: string; title: string; backHref: string;
  /** The brand the saved recipe brews, null for none; the pick in the page's sentence starts on it. */
  brandId?: string | null;
  /** The brands to pick from: in the sentence of a saved recipe, and in the Brand field of one being created. */
  brands?: NewRecipeBrand[];
  /** The saved recipe's note as stored, with the source record id the page hides; the Recipe name sheet keeps that id. */
  storedNote?: string | null;
  /** What the recipe page draws around the sheet from the saved recipe; the sheet's own fields come from the draft. */
  page?: Pick<RecipeViewModel, "saved" | "savedNote" | "scheduleHref" | "recipeNote" | "actuals" | "actualsNote" | "history" | "figures" | "figureNotes">;
  /** What the saved copy predicts, frozen at its save (get_recipe). The unchanged sheet shows `page`'s figures, drawn
   *  from these; Refresh from Materials is offered when the live preview gives other numbers. Absent before the first save. */
  savedFigures?: RecipeFigures;
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
  const brandAction = useCommandAction();
  const nameAction = useCommandAction();
  const context = useCommandContext();
  const key = recipeId === undefined ? null : recipeDraftKey(context, recipeId);
  const start = initial ?? BLANK_DRAFT;
  const [parent, setParent] = useState(BLANK_RECIPE);
  const [draft, setDraft] = useState(loaded?.draft ?? start);
  const [notice, setNotice] = useState<string | null>(loaded?.notice ?? null);
  // The one Recipe numbers sheet and the one Water sheet: which is open, whichever fact or action opened it.
  const [sheetOpen, setSheetOpen] = useState<"numbers" | "water" | null>(null);
  const { batchBbl, numbers, notes, lines, mashSchedule, fermentationSchedule, water } = draft;

  const { setError } = action;
  useEffect(() => {
    if (key === null) return;
    const settle = () => {
      if (loaded) {
        // Use this again: keep the loaded copy as this tab's unsaved change, then drop ?from from the address,
        // so a reload restores it with whatever was changed since instead of loading the copy afresh.
        // A search-only replace keeps this editor mounted, so the sheet and the notice stay on screen.
        try {
          // An unsaved change already kept in this tab is replaced; the notice says so instead of dropping it silently.
          const before = sessionStorage.getItem(key);
          writeRecipeDraft(sessionStorage, key, baseVersionId, loaded.draft);
          if (before !== null && before !== sessionStorage.getItem(key)) setNotice(`${loaded.notice} It replaced your earlier unsaved changes.`);
        } catch { setError(NOT_KEPT); }
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
    // A failed save's message, or the warning that the change could not be kept, is about the change just dropped.
    setError(null);
  }
  // The brand saves when it is picked ("" clears it). A pick made while one is saving is ignored, and so is a pick of
  // the brand the recipe already has, which would save nothing and still say "Brand saved".
  function pickBrand(value: string) {
    if (brandAction.busy || value === (brandId ?? "")) return;
    void brandAction.run("set_recipe_brand", { recipeId, brandId: value || null }, () => toast.success("Brand saved"));
  }

  // The name and note save from their own sheet; true once saved, which closes it.
  function saveName(values: { name: string; note: string }) {
    return nameAction.run("update_recipe", { recipeId, name: values.name, note: storedRecipeNote(storedNote, values.note) }, () => toast.success("Name and note saved"));
  }

  // Declared before the preview reads it during render (#440).
  const material = materialLookup(materials);
  const validLines = lines.filter(lineReady);
  // An ingredient's timing is bounded by this draft's boil time and fermentation schedule (#1478).
  const timingLimits = { boilMinutes: numbers.boilMin.trim() ? Number(numbers.boilMin) : undefined, fermentationDays: scheduleDays(fermentationSchedule) };
  const eff = pctToFraction(numbers.efficiency), att = pctToFraction(numbers.attenuation);
  const build = (id: string) => ({
    recipeId: id, mashSchedule, fermentationSchedule,
    process: { batchBbl: num(batchBbl), preBoilBbl: num(numbers.preBoil), whirlpoolMinutes: num(numbers.whirlpoolMin), whirlpoolTempF: num(numbers.whirlpoolTemp), whirlpoolRestMinutes: num(numbers.whirlpoolRest), knockoutTempF: num(numbers.knockoutTemp) },
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
  // that point, and the name and note are edited on the recipe's own page.
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
  const blockedReason = draftBlocker({ name: creating ? parent.name : undefined, lines, mashSchedule, fermentationSchedule, numbers, batchBbl, efficiency: numbers.efficiency, attenuation: numbers.attenuation });
  // A recipe being created has nothing saved to differ from: its bar is always up.
  const dirty = creating || shouldKeepDraft(start, draft);
  // An unchanged saved sheet shows what its copy froze; a changed or unsaved one shows the live preview.
  const frozen = !dirty && savedFigures !== undefined;
  // Refresh is offered only on a sheet that can be saved as it stands. A line whose material the page cannot see
  // (an inactive one) makes the live preview a guess, so the offer waits (materialsNowGive takes null).
  const refreshText = frozen && !blockedReason
    ? materialsNowGive(savedFigures, lines.every((l) => material.get(l.materialId)) ? live : null, unit)
    : undefined;
  const parentLocked = creating && createdId !== "";
  const sheetMaterials = materials.map((m) => ({ id: m.id, name: m.name, unit: m.base_uom, category: m.category, packSize: Number(m.purchase_uom_factor), packName: m.pack_name }));
  // What both Ingredient sheets take: the materials with their packs, the timing limits, and the batch size a line
  // can be typed in packs for (0 while the recipe has no usable one).
  const ingredientSheet = { materials: sheetMaterials, limits: timingLimits, batchBbl: batchSize(batchBbl) };
  const shares = gristShares(lines.map((l) => ({ stage: l.stage, perBbl: Number(l.perBblQty), unit: material.unit(l.materialId) })));
  const liveStrip = figureStrip(live, unit, { saved: false, why: gravityWhy });
  const toggle = (sheet: "numbers" | "water") => (open: boolean) => setSheetOpen(open ? sheet : null);
  return (
    <RecipeView
      model={{
        ...page, title, backHref, batchBbl, ...numbers, notes,
        // A recipe being created picks its brand in the parent fields; a saved one in its sentence.
        brand: creating ? undefined : { value: brandId ?? "", options: [{ value: "", label: "No brand yet" }, ...brands.map((b) => ({ value: b.id, label: nameWithAlias(b) }))] },
        ingredients: lines.map((l, i) => ({
          key: `${i}-${l.materialId}`, title: material.name(l.materialId), ...ingredientCells(l.stage, l.timingMinutes, l.perBblQty, material.unit(l.materialId)),
          edit: (trigger) => <IngredientSheet line={l} {...ingredientSheet} onSave={(f) => change({ lines: upsertAt(draft.lines, i, f) })} onDelete={() => change({ lines: removeAt(draft.lines, i) })} trigger={trigger} />,
          pack: ingredientPack(Number(l.perBblQty), material.get(l.materialId)),
          share: shares[i],
          onRound: (perBbl: number) => change({ lines: upsertAt(draft.lines, i, { ...l, perBblQty: String(perBbl) }) }),
        })),
        mashSchedule, fermentationSchedule, water: waterFacts(water, profiles, material.name),
        ...(frozen ? {} : { figures: liveStrip.figures, figureNotes: liveStrip.notes }),
      }}
      parentForm={creating ? <>
        <NewRecipeFieldsView brands={brands} values={parent} onChange={setParent} busy={action.busy || parentLocked} />
        {/* The row lays the parent fields out side by side; a notice takes a whole row of it. */}
        {parentLocked ? <div className="basis-full">{E.info("The recipe is saved under this name; only its sheet is still to save.")}</div> : null}
      </> : notice && dirty
        // The notice is about an unsaved change, so it goes once the sheet is back to what is saved.
        ? <div className="basis-full">{E.info(notice)}</div>
        : undefined}
      controls={{
        // A recipe being created has no change to note: its bar asks for none.
        setNote: creating ? undefined : (value) => change({ notes: value }),
        onSubmit: () => void submit(), busy: action.busy, blockedReason, error: action.error,
        dirty,
        // A recipe being created has nothing saved to go back to.
        onDiscard: creating ? undefined : discard,
        refresh: refreshText ? { text: refreshText, onRefresh: () => void submit() } : undefined,
        submitLabel: creating && !parentLocked ? "Create recipe" : undefined,
        onOpen: setSheetOpen,
        brand: creating ? undefined : { onChange: pickBrand, error: brandAction.error },
      }}
      slots={{
        rename: (trigger) => <RecipeNameSheet name={title} note={page?.recipeNote ?? ""} onSave={saveName} busy={nameAction.busy} error={nameAction.error} trigger={trigger} />,
        addIngredient: (stage, trigger) => <IngredientSheet stage={stage} {...ingredientSheet} onSave={(f) => change({ lines: [...draft.lines, f] })} trigger={trigger} />,
        sheet: (sheet, trigger) => {
          if (sheet === "numbers") return <RecipeNumbersSheet open={sheetOpen === "numbers"} onOpenChange={toggle("numbers")} values={{ batchBbl, ...numbers }} onChange={(field, value) => change(field === "batchBbl" ? { batchBbl: value } : { numbers: { ...draft.numbers, [field]: value } })} trigger={trigger} />;
          if (sheet === "mash") return <MashScheduleSheet steps={mashSchedule} onChange={(mashSchedule) => change({ mashSchedule })} trigger={trigger} />;
          if (sheet === "fermentation") return <FermentationScheduleSheet stages={fermentationSchedule} onChange={(fermentationSchedule) => change({ fermentationSchedule })} trigger={trigger} />;
          return <WaterSheet open={sheetOpen === "water"} onOpenChange={toggle("water")} water={water} profiles={profiles} materials={materials} onChange={(water) => change({ water })} trigger={trigger} />;
        },
      }}
    />
  );
}
