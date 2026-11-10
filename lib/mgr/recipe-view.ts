// lib/mgr/recipe-view.ts — view-model for Recipe, the one brewsheet page: the
// inventory frame, the live editor and the read-out of an earlier copy. The
// sheet's sections in brew-day order, with the ingredient stages and process
// numbers each holds (RECIPE_SECTIONS). Also the get_recipe result shape
// (RecipeSnapshot), a saved copy as the draft the editor starts from
// (versionToDraft), why a draft cannot be saved yet (draftBlocker), the page's
// model of a saved copy (toRecipePageModel) and why a prediction is missing
// (gravityBlockerText, noMashText). The headline figures (figureStrip) are what
// get_recipe predicted for a saved copy, frozen at its save, or the editor's
// preview from current Materials (draftIbu); when the two differ on an unchanged
// sheet, materialsNowGive words the offer to Refresh from Materials. Each line
// reads its timing and its amount per bbl (ingredientCells), and each schedule
// lists its rows (mashView, fermentationView, waterView), the same on the
// editor and a saved copy. The batch size is saved on each copy and optional
// (batchSize reads the field). With one, every line also reads its amount for
// the batch, as a count of packs when it is whole packs (ingredientPack,
// batchTotalText), and the editor offers rounding it to whole packs
// (packRounding). Each mash line carries its share of the grain bill by
// weight (gristShares). Batch actuals is the table of get_recipe_outcomes: what the
// shown copy predicts, then one row per brewed batch (outcomeTable), and the gap
// for the shown copy (outcomeSummary).
// As brewed lists the earlier copies those batches brewed (recipeHistory); Use
// this again loads one into the editor and says where it came from (loadedNotice).
// The database calls a saved copy a recipe version; the page never says so.
import type { ReactNode } from "react";
import { formatDate } from "@/lib/date-format";
import { gravityBlockers, LB_PER, type GravityBlocker, type RecipeGravityResult } from "@/lib/recipe-gravity";
import { ibuText, recipeIbu, type RecipeIbu } from "@/lib/recipe-ibu";
import { batNo } from "./doc-no";
import { formatGravity, type GravityUnit } from "./gravity-unit";
import { batchQty, fromPacks, hasPack, packText, perBblForPacks, splitPacks, type Pack } from "./pack-qty";
import { plural } from "./plural";
import { isNumber, numberNotationError, percent } from "./quantity-input";
import { sentenceCase } from "./labels";
import { plannedBarrelsError } from "./schedule-batch-view";
import { submitReason } from "./submit-reason";
import { READING_BOUNDS } from "@/lib/composer/offline-policy";
import {
  fermentationRowTitle, fermentationStageDetail, fermentationSummary, mashRowTitle, ingredientTiming, lineReady, mashRowSummary, mashStepDetail, materialLookup, perBblDisplay, scheduleDays, timingOutOfRange, toIngredientFields, waterAdditionDetail, waterReadout, WATER_ROW_TITLE,
  type FermentationStage, type IngredientLine, type IngredientStage, type MashStep, type ProcessColumns, type RecipeMaterial, type WaterDraft,
} from "./recipe-process-view";
/** A line's per-bbl amount with its material's pack: its size (base units per pack), base unit and pack word (hasPack says whether it has one). */
export type RecipePack = Pack & { perBbl: number };
/** One ingredient line of a step. `stage` places it in its section (RECIPE_SECTIONS); `amount` is per bbl ("40.9 lb")
 *  and `timing` is "60 min" or "day 3", or "" (ingredientCells). `edit` (the live editor only) takes the line's
 *  name as a trigger and returns the Ingredient sheet it opens. `pack` lets the page read the line's amount for the
 *  batch; `onRound` (the live editor only) takes the per-bbl amount a Round choice picked. `share` is a mash line's
 *  part of the grain bill by weight, from 0 to 1 (gristShares). */
export type RecipeIngredientView = {
  key: string; title: string; stage: IngredientStage; amount: string; timing: string;
  edit?: (trigger: ReactNode) => ReactNode; pack?: RecipePack; onRound?: (perBbl: number) => void; share?: number;
};
/** A line's stage, per-bbl amount to three significant digits and timing, the same on the editor and a saved copy. */
export const ingredientCells = (stage: IngredientStage, timingMinutes: number | string | null, perBbl: number | string, unit?: string) => ({
  stage, amount: `${perBblDisplay(Number(perBbl))}${unit ? ` ${unit}` : ""}`, timing: ingredientTiming(stage, timingMinutes),
});

/** Input bounds mirroring create_recipe_version, so the browser refuses a
 * decimal minute or a zero volume before the command answers with a raw
 * validation error (#447). Pre-boil must be positive; 0.01 bbl stands in for
 * the exclusive minimum a number field cannot express. */
const WHOLE_MINUTES = { min: 1, step: 1 } as const;
const WHOLE_MINUTES_OR_NONE = { min: 0, step: 1 } as const;

/** The eight process numbers with their labels and bounds; RECIPE_SECTIONS says which step draws each. */
export const RECIPE_NUMBERS = [
  ["preBoil", "Pre-boil volume bbl", { min: 0.01 }], ["boilMin", "Boil time min", WHOLE_MINUTES], ["whirlpoolMin", "Whirlpool min", WHOLE_MINUTES_OR_NONE], ["whirlpoolTemp", "Whirlpool temp °F", {}],
  ["whirlpoolRest", "Whirlpool rest min", WHOLE_MINUTES_OR_NONE], ["knockoutTemp", "Knockout temp °F", {}], ["efficiency", "Brewhouse efficiency %", {}], ["attenuation", "Yeast attenuation %", {}],
] as const;
export type RecipeNumberKey = (typeof RECIPE_NUMBERS)[number][0];
/** The Batch size field's bounds: what recipe_versions.batch_bbl, a positive numeric(10,3), stores. */
export const BATCH_BBL_BOUNDS = { min: 0.001, max: 9_999_999.999 } as const;
/** The batch size as a number, or 0 when the field is blank or holds a size a copy cannot store (zero, exponent
 *  notation): then no line reads an amount for the batch. The same rule as New batch's planned barrels. */
export const batchSize = (text: string | undefined): number => (text !== undefined && isNumber(text) && !plannedBarrelsError(text) ? Number(text) : 0);

/** One step of the sheet: the ingredient stages drawn under it and the process numbers it holds. */
export type RecipeSection = {
  key: "water" | "mash" | "boil" | "whirlpool" | "knockout" | "fermentation" | "other";
  title: string; stages: readonly IngredientStage[]; numbers: readonly RecipeNumberKey[];
};
/** The sheet top to bottom, as the brew day runs. Water, Mash and Fermentation also hold the schedule of the same key. */
export const RECIPE_SECTIONS: readonly RecipeSection[] = [
  { key: "water", title: "Water", stages: [], numbers: [] },
  { key: "mash", title: "Mash", stages: ["mash"], numbers: ["efficiency"] },
  { key: "boil", title: "Boil", stages: ["boil"], numbers: ["preBoil", "boilMin"] },
  { key: "whirlpool", title: "Whirlpool", stages: ["whirlpool"], numbers: ["whirlpoolMin", "whirlpoolTemp", "whirlpoolRest"] },
  { key: "knockout", title: "Knockout", stages: [], numbers: ["knockoutTemp"] },
  { key: "fermentation", title: "Fermentation", stages: ["fermentation", "dry_hop"], numbers: ["attenuation"] },
  { key: "other", title: "Packaging and other", stages: ["packaging", "other"], numbers: [] },
];

/** A step's schedule as the page lists it: its count ("Schedule · 3 steps") and summary over one row per entry. */
export type RecipeScheduleView = { title: string; detail: string; rows: { title: string; detail: string }[] };
export const mashView = (steps: readonly MashStep[]): RecipeScheduleView => ({
  title: mashRowTitle(steps.length), detail: mashRowSummary(steps), rows: steps.map((m) => ({ title: m.name, detail: mashStepDetail(m) })),
});
export const fermentationView = (stages: readonly FermentationStage[]): RecipeScheduleView => ({
  title: fermentationRowTitle(stages.length), detail: stages.length ? fermentationSummary(stages) : "No stages yet",
  rows: stages.map((f) => ({ title: f.name, detail: fermentationStageDetail(f) })),
});
/** The sheet's water: its profiles, volumes and target pH (waterReadout), then each addition. "None yet" when it holds nothing. */
export function waterView(water: WaterDraft, profiles: readonly { id: string; name: string }[], materialName: (id: string) => string): RecipeScheduleView {
  const rows = [
    ...waterReadout(water, (id) => profiles.find((p) => p.id === id)?.name).map(([title, detail]) => ({ title, detail })),
    ...water.additions.map((a) => ({ title: materialName(a.materialId), detail: waterAdditionDetail(a) })),
  ];
  return { title: WATER_ROW_TITLE, detail: rows.length ? "" : "None yet", rows };
}

/** One earlier copy of the recipe, named by the batches that brewed it. `href` opens it read only; fixtures leave it out. */
type RecipeHistoryRow = { title: string; detail: string; href?: string; selected: boolean };

export type RecipeViewModel = {
  backHref?: string;
  /** The back link's text; "Recipes" unless the page sits under the recipe (an earlier copy). */
  backLabel?: string;
  /** Where Schedule batch goes: Batches, with New batch open on this recipe as saved. Only a saved recipe has one. */
  scheduleHref?: string;
  title: string;
  /** When the shown copy was saved, as a date in the brewery's zone, then the current copy's change note. Absent until the recipe is first saved. */
  saved?: string;
  /** An earlier copy's read-only note ("As brewed in B-0041 to B-0045 · read only"); absent on the current recipe. */
  asBrewed?: string;
  /** Where Use this again goes from an earlier copy: the current page, with this copy loaded as an unsaved change. */
  useAgainHref?: string;
  /** As brewed: the earlier copies batches brewed, newest first. */
  history?: RecipeHistoryRow[];
  /** The recipe's own note (not the change note, which is `notes`). */
  recipeNote?: string;
  priceGroup?: string;
  priceGroupOptions?: string[];
  ingredients?: RecipeIngredientView[];
  /** The batch the recipe is written for, in bbl, as field text; blank or absent means it has none, and amounts read per bbl only. */
  batchBbl?: string;
  preBoil?: string;
  boilMin?: string;
  whirlpoolMin?: string;
  whirlpoolTemp?: string;
  whirlpoolRest?: string;
  knockoutTemp?: string;
  efficiency?: string;
  attenuation?: string;
  mash?: RecipeScheduleView;
  fermentation?: RecipeScheduleView;
  water?: RecipeScheduleView;
  notes?: string;
  /** The headline figures as value and label (["15.2 °P", "OG"]), and the lines under them (figureStrip). */
  figures?: [string, string][];
  figureNotes?: string[];
  /** Batch actuals: one row per brewed batch of any copy (outcomeTable), then the gap for the shown copy. */
  actuals?: RecipeActuals;
  actualsNote?: string;
};

/** What get_recipe returns: the recipe, its selected version (null before the
 * first), all version numbers, that version's ingredients in brewing order, its water additions, the prediction and the IBU.
 * Postgres numerics may arrive as strings, so readers coerce with Number. */
export type RecipeSnapshot = {
  recipe: { id: string; name: string; brand_id: string | null; note: string | null };
  versions: number[];
  version: (ProcessColumns & {
    id: string; version: number; created_at: string; mash_temp_f: number | null; brewhouse_efficiency: number; yeast_attenuation: number;
    boil_minutes: number | null; note: string | null;
    mash_schedule: MashStep[]; fermentation_schedule: FermentationStage[];
  }) | null;
  ingredients: { id: string; material_id: string; per_bbl_qty: number; stage: string; timing_minutes: number | null; sort: number; extract_snapshot: number | null; materials: { base_uom: string } | null }[];
  waterAdditions: { material_id: string; qty: number; unit: string; stage: string }[];
  ogPlato: number | null; fgPlato: number | null; abv: number | null; ibu: RecipeIbu;
};
type SnapshotVersion = NonNullable<RecipeSnapshot["version"]>;

/** Everything the draft editor holds, as typed strings where it has a field. */
export type RecipeDraft = {
  /** The batch size in bbl; "" saves the copy without one. */
  batchBbl: string;
  numbers: Record<RecipeNumberKey, string>; notes: string; lines: IngredientLine[];
  mashSchedule: MashStep[]; fermentationSchedule: FermentationStage[]; water: WaterDraft;
};

/** A stored number as its field text: "" when absent, and Number() drops a numeric's trailing zeros. */
const text = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(Number(n)));

/** The eight process numbers of a saved version as field text; the read page and the draft copy share it. */
export function versionNumbers(v: SnapshotVersion): Record<RecipeNumberKey, string> {
  return {
    preBoil: text(v.pre_boil_bbl), boilMin: text(v.boil_minutes),
    whirlpoolMin: text(v.whirlpool_minutes), whirlpoolTemp: text(v.whirlpool_temp_f), whirlpoolRest: text(v.whirlpool_rest_minutes), knockoutTemp: text(v.knockout_temp_f),
    efficiency: percent(v.brewhouse_efficiency), attenuation: percent(v.yeast_attenuation),
  };
}

/** A new draft as a copy of the saved version, so a change starts from what was brewed; null when there is no version.
 *  The change note starts blank: it describes the change about to be saved, not the one the copy was saved with. */
export function versionToDraft(s: RecipeSnapshot): RecipeDraft | null {
  const v = s.version;
  if (!v) return null;
  return {
    batchBbl: text(v.batch_bbl),
    numbers: versionNumbers(v),
    notes: "",
    lines: s.ingredients.map((i) => ({ materialId: i.material_id, perBblQty: text(i.per_bbl_qty), stage: i.stage as IngredientStage, timingMinutes: text(i.timing_minutes) })),
    mashSchedule: v.mash_schedule,
    fermentationSchedule: v.fermentation_schedule,
    water: {
      targetProfileId: v.target_water_profile_id ?? "", sourceProfileId: v.source_water_profile_id ?? "",
      mashGal: text(v.mash_water_gal), spargeGal: text(v.sparge_water_gal), targetMashPh: text(v.target_mash_ph),
      additions: s.waterAdditions.map((a) => ({ materialId: a.material_id, qty: Number(a.qty), unit: a.unit, stage: a.stage })),
    },
  };
}

/** A percent field's text is usable when it is above 0 and at most 100. */
const validPercent = (s: string) => Number(s) > 0 && Number(s) <= 100;

/** A typed optional process number: blank, or plain notation that passes `ok`. */
const optionalOk = (s: string | undefined, ok: (n: number) => boolean) =>
  !s?.trim() || (!numberNotationError(s) && isNumber(s) && ok(Number(s)));
const inTempRange = (n: number) => n >= READING_BOUNDS.tempF.min && n <= READING_BOUNDS.tempF.max;
const wholeAtLeast = (min: number) => (n: number) => Number.isInteger(n) && n >= min;

/** What a draft still needs before it can be saved, as one "Still needed: …" sentence (submitReason), or null when it
 * is ready (#1481). `name` is the new recipe's name and is passed only when the recipe is being created. The process
 * numbers and each line's timing are checked against create_recipe_version's bounds, because a cut version cannot be
 * edited (#1478). */
export function draftBlocker(input: {
  name?: string; lines: IngredientLine[]; mashSchedule: MashStep[]; efficiency: string; attenuation: string;
  numbers?: Partial<Record<RecipeNumberKey, string>>; fermentationSchedule?: FermentationStage[]; batchBbl?: string;
}): string | null {
  const n = input.numbers ?? {};
  const limits = { boilMinutes: n.boilMin?.trim() ? Number(n.boilMin) : undefined, fermentationDays: scheduleDays(input.fermentationSchedule ?? []) };
  const timings = input.lines.filter((l) => l.materialId).flatMap((line) => {
    const range = timingOutOfRange(line.stage, toIngredientFields(line).timing, limits);
    return range ? [`${sentenceCase(line.stage).toLowerCase()} timing from ${range.days ? `day 0 to ${range.max}` : `0 to ${range.max} minutes`}`] : [];
  });
  const needs: [boolean, string][] = [
    [input.name !== undefined && input.name.trim() === "", "a recipe name"],
    [!input.lines.some(lineReady), "an ingredient with a quantity per bbl"],
    [input.mashSchedule.length === 0, "a mash step"],
    [!validPercent(input.efficiency), "brewhouse efficiency from 0 to 100%"],
    [!validPercent(input.attenuation), "yeast attenuation from 0 to 100%"],
    // Optional; a typed one must be a size the copy can store (batchSize is 0 otherwise).
    [Boolean(input.batchBbl?.trim()) && batchSize(input.batchBbl) === 0, "a batch size above zero, up to 9,999,999.999 bbl"],
    [!optionalOk(n.preBoil, (v) => v > 0), "a pre-boil volume above zero"],
    [!optionalOk(n.boilMin, wholeAtLeast(1)), "a boil time of one or more whole minutes"],
    [!optionalOk(n.whirlpoolMin, wholeAtLeast(0)), "a whirlpool time of zero or more whole minutes"],
    [!optionalOk(n.whirlpoolRest, wholeAtLeast(0)), "a whirlpool rest of zero or more whole minutes"],
    [!optionalOk(n.whirlpoolTemp, inTempRange), "a whirlpool temperature from 25 to 212 °F"],
    [!optionalOk(n.knockoutTemp, inTempRange), "a knockout temperature from 25 to 212 °F"],
  ];
  return submitReason([...needs.filter(([missing]) => missing).map(([, need]) => need), ...timings]);
}

/** Why there is no prediction, naming the first blocked line, or null when nothing blocks it.
 * `saved` tells a saved copy (which froze the gap, so the fix is picked up by Refresh from Materials) from a draft (fixed under Materials).
 * nameOf and unitOf take a blocker's index into the ingredient list that gravityBlockers was given. */
export function gravityBlockerText(blockers: GravityBlocker[], nameOf: (index: number) => string, unitOf: (index: number) => string | undefined, { saved }: { saved: boolean }): string | null {
  const first = blockers[0];
  if (!first) return null;
  const name = nameOf(first.index);
  if (first.reason === "no_weight") return `${name} is stocked in ${unitOf(first.index) ?? "no unit"}, which has no weight, so nothing is predicted.`;
  return saved
    ? `${name} had no extract potential when this recipe was saved; set it under Materials, then Refresh from Materials on the current recipe.`
    : `${name} has no extract potential; set it under Materials.`;
}

/** Why there is no prediction when no line is a mash line: gravityBlockers lists nothing then,
 * yet recipeGravity predicts nothing. Null with no lines, since draftBlocker already asks for one. */
export function noMashText(stages: string[]): string | null {
  return stages.length > 0 && !stages.includes("mash") ? "No mash ingredient, so nothing is predicted." : null;
}

/** The editor's IBU preview, from each material's current alpha acid, which saving freezes. Undefined with no lines, since
 *  draftBlocker already asks for one. A line whose material the picker hides (an inactive one) reads as a hop with neither
 *  alpha acid nor a unit, so the preview shows the gap instead of silently dropping the line. */
export function draftIbu(lines: IngredientLine[], ogPlato: number | null, materials: RecipeMaterial[]): RecipeIbu | undefined {
  if (lines.length === 0) return undefined;
  const material = materialLookup(materials);
  const ibuLines = lines.map((l) => {
    const m = material.get(l.materialId);
    return {
      name: material.name(l.materialId), category: m?.category ?? "hop", stage: l.stage, perBblQty: Number(l.perBblQty),
      unit: m?.base_uom, timingMinutes: l.timingMinutes ? Number(l.timingMinutes) : null, alphaAcid: m?.alpha_acid ?? null,
    };
  });
  return recipeIbu({ ogPlato, lines: ibuLines });
}

/** What a recipe predicts: get_recipe's figures for a saved copy, frozen at its save, or the editor's preview from
 *  current Materials. `ibu` is absent on a sheet with no line yet. */
export type RecipeFigures = { ogPlato: number | null; fgPlato: number | null; abv: number | null; ibu?: RecipeIbu };

/** The headline strip: each figure the recipe predicts as value and label, and the lines under it. A figure that cannot
 *  be predicted is not drawn; `why` says why there is no gravity, and the IBU line says what its figure leaves out
 *  (whirlpool hops, a gap) or why there is none. `saved` words a gap's fix for a saved copy, as ibuText does. */
export function figureStrip(f: RecipeFigures, unit: GravityUnit, { saved, why }: { saved: boolean; why?: string | null }): { figures: [string, string][]; notes: string[] } {
  const figures: [string, string][] = [];
  if (f.ogPlato !== null && f.fgPlato !== null && f.abv !== null) figures.push([formatGravity(f.ogPlato, unit), "OG"], [formatGravity(f.fgPlato, unit), "FG"], [`${f.abv.toFixed(1)}%`, "ABV"]);
  if (f.ibu?.kind === "estimate") figures.push([String(f.ibu.ibu), "IBU"]);
  if (f.ibu?.kind === "lowerBound") figures.push([`≥ ${f.ibu.ibu}`, "IBU"]);
  // A plain estimate is all in its figure.
  const ibuNote = f.ibu && !(f.ibu.kind === "estimate" && !f.ibu.whirlpool) ? ibuText(f.ibu, { saved }) : undefined;
  return { figures, notes: [f.ogPlato === null ? why : undefined, ibuNote].filter((note): note is string => Boolean(note)) };
}

/** A prediction exactly as the strip prints it in the brewery's gravity unit, plus how many hops still have a gap.
 *  Comparing the printed figures keeps the offer from naming a number the sheet already shows. */
const figureKey = (f: RecipeFigures, unit: GravityUnit) =>
  JSON.stringify([figureStrip(f, unit, { saved: false }).figures, f.ibu && "gaps" in f.ibu ? f.ibu.gaps.length : 0]);

/** The line that offers Refresh from Materials on an unchanged sheet: what the saved recipe would predict from current
 *  Materials (`now`), when that differs from what the saved copy froze (`saved`). Undefined when the numbers match, so
 *  a refresh would change nothing, and when `now` is null: the page cannot see one of the lines' materials (an
 *  inactive one), so it cannot tell what a refresh would give. */
export function materialsNowGive(saved: RecipeFigures, now: RecipeFigures | null, unit: GravityUnit): string | undefined {
  if (!now || figureKey(saved, unit) === figureKey(now, unit)) return undefined;
  const { figures } = figureStrip(now, unit, { saved: false });
  return `Materials now give ${figures.length ? figures.map(([value, label]) => `${label} ${value}`).join(" · ") : "no prediction"}.`;
}

/** The pack a line reads its batch amount with, at any stage: a positive amount and a known material; else none. */
export function ingredientPack(perBbl: number, material: Pick<RecipeMaterial, "base_uom" | "purchase_uom_factor" | "pack_name"> | undefined): RecipePack | undefined {
  if (!(perBbl > 0) || !material) return undefined;
  return { perBbl, factor: Number(material.purchase_uom_factor), unit: material.base_uom, packName: material.pack_name };
}

/** The amount the page draws under "At 22 bbl": "23 bags" or "4 × 50 lb" when it is whole packs, else "220 lb" (packText). */
export const batchTotalText = (p: RecipePack, bbl: number): string => packText(batchQty(p.perBbl, bbl), p);

/** Each line's share of the grain bill by weight, from 0 to 1, in the lines' order: a mash line's pounds over all mash
 *  lines' pounds. Shares are the same at any batch size, so they are worked from the per-bbl amounts. A line that is
 *  not a mash line, or is stocked by volume or count, has no share and adds nothing to the bill. */
export function gristShares(lines: readonly { stage: string; perBbl: number; unit?: string }[]): (number | undefined)[] {
  // A mash line whose unit is unknown (its material is not in the page's list, an inactive one) has an unknown weight.
  // Counting it as nothing would read every other malt too high, so then no share is given.
  if (lines.some((l) => l.stage === "mash" && l.perBbl > 0 && l.unit === undefined)) return lines.map(() => undefined);
  const pounds = lines.map((l) => (l.stage === "mash" && l.perBbl > 0 ? l.perBbl * (LB_PER[l.unit ?? ""] ?? 0) : 0));
  const bill = pounds.reduce((sum, lb) => sum + lb, 0);
  return pounds.map((lb) => (lb > 0 ? lb / bill : undefined));
}

/** At `bbl`: whole when the total is already whole packs, else a Round choice down (from one pack up) and up, each
 *  named as the line will read once chosen ("Round to 4 × 50 lb", or "Round to 18 bags" with a pack word) and
 *  carrying the per-bbl amount that gives that many packs (perBblForPacks). Null with no pack.
 *  ponytail: that rounding error grows with `bbl`; from about 100 bbl it can pass half a tick (950.0001 lb for 19 × 50 lb
 *  at 300 bbl), so the line still offers Round. Exact whole packs at that size need per_bbl_qty to keep more decimals. */
export function packRounding(p: RecipePack, bbl: number): { whole: boolean; choices: { label: string; perBbl: number }[] } | null {
  if (!hasPack(p)) return null;
  const split = splitPacks(batchQty(p.perBbl, bbl), p.factor);
  if (split.packs > 0 && split.loose === 0) return { whole: true, choices: [] };
  const counts = split.packs > 0 ? [split.packs, split.packs + 1] : [1];
  return { whole: false, choices: counts.map((n) => ({ label: `Round to ${packText(fromPacks(n, 0, p.factor), p)}`, perBbl: perBblForPacks(n, p.factor, bbl) })) };
}

/** What get_recipe_outcomes returns for one brewed batch: its measured figures beside what its own copy (`version`)
 *  predicted and assumed. A measured figure is null when an input is missing. Efficiency is null until the batch closes, because
 *  nothing records how many turns it will have. The fractions (attenuation, efficiency) run 0 to 1; ABV is a percent. */
export type RecipeOutcome = {
  batchId: string; batchNo: number | null; version: number; brewedOn: string; closed: boolean;
  ogPlato: number | null; fgPlato: number | null; abv: number | null; apparentAttenuation: number | null; brewhouseEfficiency: number | null;
  predicted: RecipeGravityResult | null; assumedEfficiency: number; assumedAttenuation: number;
};

/** A fraction as a whole percent: 0.657 reads "66%". */
export const wholePercent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** One figure of Batch actuals: what the batch measured, and what its own copy predicted or assumed when that copy is
 *  not the one shown (the top row already says the shown copy's). Either is "" when there is none. */
type OutcomeCell = { measured: string; predicted: string };
/** Batch actuals as a table: the five figure columns, what the shown copy predicts and assumes for each, then one row per
 *  batch. `notes` say what is missing or can still move, and mark a batch another copy brewed. */
export type RecipeActuals = {
  columns: string[]; predicted: string[];
  rows: { key: string; batch: string; brewed: string; notes: string[]; cells: OutcomeCell[] }[];
};
/** What a copy predicts and assumes; a brewed batch carries its own copy's. */
type OutcomeBasis = Pick<RecipeOutcome, "version" | "predicted" | "assumedEfficiency" | "assumedAttenuation">;

/** Batch actuals: the five figures of each brewed batch, in the order given, under what the shown copy (`shown`) predicts
 *  and assumes. Gravity is in the reader's unit, named once in its column head. A batch another copy brewed is marked
 *  "earlier recipe" or "later recipe" and carries that copy's own prediction. Undefined with no batches, so no section is drawn. */
export function outcomeTable(outcomes: RecipeOutcome[], unit: GravityUnit, shown: OutcomeBasis): RecipeActuals | undefined {
  if (outcomes.length === 0) return undefined;
  // The column head names the unit, so a Plato figure drops it: "14.8" under "OG °P".
  const gravity = (plato: number | null) => (plato === null ? "" : formatGravity(plato, unit).replace(" °P", ""));
  const percent1 = (n: number | null) => (n === null ? "" : `${n.toFixed(1)}%`);
  const basis = (b: OutcomeBasis) => [
    gravity(b.predicted?.ogPlato ?? null), gravity(b.predicted?.fgPlato ?? null), percent1(b.predicted?.abv ?? null),
    wholePercent(b.assumedAttenuation), wholePercent(b.assumedEfficiency),
  ];
  const degrees = unit === "plato" ? " °P" : "";
  return {
    columns: [`OG${degrees}`, `FG${degrees}`, "ABV", "Attenuation", "Efficiency"],
    predicted: basis(shown),
    rows: outcomes.map((o) => {
      const own = o.version === shown.version ? null : basis(o);
      const values = [
        gravity(o.ogPlato), gravity(o.fgPlato), percent1(o.abv),
        o.apparentAttenuation === null ? "" : wholePercent(o.apparentAttenuation), o.brewhouseEfficiency === null ? "" : wholePercent(o.brewhouseEfficiency),
      ];
      const notes = [
        o.version < shown.version && "earlier recipe",
        o.version > shown.version && "later recipe",
        o.ogPlato === null && "no gravity readings yet",
        o.ogPlato !== null && o.fgPlato === null && "FG needs a second reading",
        !o.closed && "still open",
      ].filter((note): note is string => Boolean(note));
      return { key: o.batchId, batch: batNo(o.batchNo), brewed: formatDate(o.brewedOn), notes, cells: values.map((value, i) => ({ measured: value, predicted: own?.[i] ?? "" })) };
    }),
  };
}

/** As brewed: one row per copy before `latestVersion` that a brewed batch used, newest copy first, named by its
 *  batch numbers ("B-0041 to B-0045") with their count and brew dates. A copy no batch brewed gets no row.
 *  `selected` marks the copy being shown. */
export function recipeHistory(outcomes: RecipeOutcome[], shownVersion: number, latestVersion: number): RecipeHistoryRow[] {
  const earlier = [...new Set(outcomes.map((o) => o.version))].filter((v) => v !== latestVersion).sort((a, b) => b - a);
  return earlier.map((version) => {
    const batches = outcomes.filter((o) => o.version === version);
    const numbers = batches.flatMap((b) => b.batchNo ?? []);
    const [low, high] = numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : [null, null];
    // ISO dates sort as text.
    const days = batches.map((b) => b.brewedOn).sort();
    const [first, last] = [days[0], days[days.length - 1]].map((day) => formatDate(day));
    return {
      title: low === high ? batNo(low) : `${batNo(low)} to ${batNo(high)}`,
      detail: `${plural(batches.length, "batch", "batches")} · ${first === last ? first : `${first} – ${last}`}`,
      href: `?v=${version}`, selected: version === shownVersion,
    };
  });
}

/** What the editor says after Use this again loaded the copy `version` as an unsaved change: the batches that brewed it, and what saving does. */
export function loadedNotice(outcomes: RecipeOutcome[], version: number, latestVersion: number): string {
  const brewed = recipeHistory(outcomes, version, latestVersion).find((h) => h.selected);
  return `Loaded ${brewed ? `the recipe as brewed in ${brewed.title}` : "an earlier recipe no batch brewed"}. Save changes to make it the current recipe.`;
}

/** "68–71%", or "68%" when the lowest and highest round alike. */
function percentRange(fractions: number[]): string {
  const [low, high] = [Math.min(...fractions), Math.max(...fractions)].map((n) => Math.round(n * 100));
  return low === high ? `${low}%` : `${low}–${high}%`;
}

/** The gap between what the copy `version` assumes and what its closed batches measured, or undefined under two such batches.
 *  An open batch is skipped because it has no efficiency and its FG can still move. It states the gap and gives no advice:
 *  the brewer decides what to do with it. */
export function outcomeSummary(outcomes: RecipeOutcome[], version: number): string | undefined {
  const measured = outcomes.filter((o) => o.version === version && o.closed && o.brewhouseEfficiency !== null);
  if (measured.length < 2) return undefined;
  const { assumedEfficiency, assumedAttenuation } = measured[0];
  const attenuations = measured.flatMap((o) => o.apparentAttenuation ?? []);
  const efficiency = `efficiency ${percentRange(measured.map((o) => o.brewhouseEfficiency!))} against ${wholePercent(assumedEfficiency)} assumed`;
  const attenuation = attenuations.length >= 2 ? `; attenuation ${percentRange(attenuations)} against ${wholePercent(assumedAttenuation)} assumed` : "";
  return `${plural(measured.length, "batch", "batches")}: ${efficiency}${attenuation}.`;
}

/** The same heading for the screen and its browser tab: the recipe's name, whichever copy is shown. */
export function recipePageTitle({ recipe }: Pick<RecipeSnapshot, "recipe">): string {
  return recipe.name;
}

/** A source system's record id (a 24-hex Mongo id, as in "Imported from Example Brewing recipe 6720f0…") ending a recipe note; the read page hides it, the stored note keeps it. */
const IMPORT_ID = /\s+[0-9a-f]{24}$/;

/** The page's model of the selected saved copy; before the first save, the title and note alone.
 *  A copy before the newest is read as brewed: its note, Use this again, and a back link to the current recipe. */
export function toRecipePageModel(
  s: RecipeSnapshot,
  ctx: { materials: RecipeMaterial[]; profiles: { id: string; name: string }[]; unit: GravityUnit; timeZone: string; outcomes: RecipeOutcome[] },
): RecipeViewModel {
  const { recipe, version: v, ingredients } = s;
  const material = materialLookup(ctx.materials);
  const base = { title: recipePageTitle(s), backHref: "/recipes", recipeNote: recipe.note?.replace(IMPORT_ID, "") || undefined };
  const draft = versionToDraft(s);
  if (!v || !draft) return base;
  const latest = s.versions[0];
  const history = recipeHistory(ctx.outcomes, v.version, latest);
  const shown = history.find((h) => h.selected);

  // Why get_recipe predicted no gravity: the saved line's own snapshot and unit, as get_recipe read them.
  const blockers = gravityBlockers(ingredients.map((i) => ({ perBblQty: Number(i.per_bbl_qty), extractPotential: i.extract_snapshot, stage: i.stage, unit: i.materials?.base_uom })));
  const why = gravityBlockerText(blockers, (n) => material.name(ingredients[n].material_id), (n) => ingredients[n].materials?.base_uom, { saved: true })
    ?? noMashText(ingredients.map((i) => i.stage));
  const { figures, notes: figureNotes } = figureStrip(s, ctx.unit, { saved: true, why });
  const shares = gristShares(ingredients.map((i) => ({ stage: i.stage, perBbl: Number(i.per_bbl_qty), unit: i.materials?.base_uom ?? material.unit(i.material_id) })));
  return {
    ...base,
    ...(v.version === latest
      ? { scheduleHref: `/batches?recipe=${recipe.id}` }
      : {
        backHref: `/recipes/${recipe.id}`, backLabel: "Current recipe", useAgainHref: `/recipes/${recipe.id}?from=${v.version}`,
        asBrewed: `${shown ? `As brewed in ${shown.title}` : "An earlier recipe no batch brewed"} · read only`,
      }),
    // The current copy's change note rides on the saved line; an earlier copy prints it as its own field (`notes`).
    saved: [formatDate(v.created_at, ctx.timeZone), v.version === latest && v.note].filter(Boolean).join(" · "),
    history,
    ingredients: ingredients.map((i, n) => ({
      key: i.id, title: material.name(i.material_id),
      ...ingredientCells(i.stage as IngredientStage, i.timing_minutes, i.per_bbl_qty, material.unit(i.material_id)),
      pack: ingredientPack(Number(i.per_bbl_qty), material.get(i.material_id)),
      share: shares[n],
    })),
    batchBbl: draft.batchBbl,
    ...versionNumbers(v),
    mash: mashView(v.mash_schedule),
    fermentation: fermentationView(v.fermentation_schedule),
    water: waterView(draft.water, ctx.profiles, material.name),
    notes: v.note ?? "",
    figures, figureNotes,
    actuals: outcomeTable(ctx.outcomes, ctx.unit, { version: v.version, predicted: s.ogPlato !== null && s.fgPlato !== null && s.abv !== null ? { ogPlato: s.ogPlato, fgPlato: s.fgPlato, abv: s.abv } : null, assumedEfficiency: Number(v.brewhouse_efficiency), assumedAttenuation: Number(v.yeast_attenuation) }),
    actualsNote: outcomeSummary(ctx.outcomes, v.version),
  };
}
