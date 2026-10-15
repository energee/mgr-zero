// lib/mgr/recipe-view.ts — view-model for Recipe: the inventory editor and
// the live page (read-out of a cut version, or the draft editor). Also the
// get_recipe result shape (RecipeSnapshot), the copy of a saved version a new
// draft starts from (versionToDraft), and why a draft cannot be saved yet
// (draftBlocker).
import type { ReactNode } from "react";
import { lineReady, type FermentationStage, type IngredientLine, type IngredientStage, type MashStep, type ProcessColumns, type WaterDraft } from "./recipe-process-view";
/** `action` (a live Edit) draws in place of `qty` when the page is a draft. */
export type RecipeIngredientView = { key: string; title: string; detail: string; qty: string; action?: ReactNode };

/** Input bounds mirroring create_recipe_version, so the browser refuses a
 * decimal minute or a zero volume before the command answers with a raw
 * validation error (#447). Pre-boil must be positive; 0.01 bbl stands in for
 * the exclusive minimum a number field cannot express. */
const WHOLE_MINUTES = { min: 1, step: 1 } as const;
const WHOLE_MINUTES_OR_NONE = { min: 0, step: 1 } as const;

/** The eight process numbers drawn in one grid, in drawing order, with their bounds. */
export const RECIPE_NUMBERS = [
  ["preBoil", "Pre-boil volume bbl", { min: 0.01 }], ["boilMin", "Boil time min", WHOLE_MINUTES], ["whirlpoolMin", "Whirlpool min", WHOLE_MINUTES_OR_NONE], ["whirlpoolTemp", "Whirlpool temp °F", {}],
  ["whirlpoolRest", "Whirlpool rest min", WHOLE_MINUTES_OR_NONE], ["knockoutTemp", "Knockout temp °F", {}], ["efficiency", "Brewhouse efficiency %", {}], ["attenuation", "Yeast attenuation %", {}],
] as const;
export type RecipeNumberKey = (typeof RECIPE_NUMBERS)[number][0];

export type RecipeScheduleView = { title: string; detail: string; rows?: { title: string; detail: string }[] };

export type RecipeViewModel = {
  backHref?: string;
  /** The back link's text; "Recipes" unless the page sits under a recipe (the draft). */
  backLabel?: string;
  /** Where Create recipe version goes on a cut version; the draft editor submits instead. */
  createHref?: string;
  /** A recipe with no version yet: drawn instead of the editor, so no number is invented. */
  empty?: string;
  title: string;
  parent?: { title: string; detail: string };
  priceGroup?: string;
  priceGroupOptions?: string[];
  ingredients?: RecipeIngredientView[];
  preBoil?: string;
  boilMin?: string;
  whirlpoolMin?: string;
  whirlpoolTemp?: string;
  whirlpoolRest?: string;
  knockoutTemp?: string;
  efficiency?: string;
  attenuation?: string;
  /** A schedule row; `rows` present means it is read out inline (a cut version) instead of opening. */
  mash?: RecipeScheduleView;
  fermentation?: RecipeScheduleView;
  water?: RecipeScheduleView;
  notes?: string;
  predicted?: string;
  tape?: [string, string][];
  actualsNote?: string;
};

/** What get_recipe returns: the recipe, its latest version (null before the
 * first), that version's ingredients and water additions, and the prediction.
 * Postgres numerics may arrive as strings, so readers coerce with Number. */
export type RecipeSnapshot = {
  recipe: { id: string; name: string; brand_id: string | null; note: string | null };
  version: (ProcessColumns & {
    id: string; version: number; created_at: string; mash_temp_f: number | null; brewhouse_efficiency: number; yeast_attenuation: number;
    boil_minutes: number | null; note: string | null;
    mash_schedule: MashStep[]; fermentation_schedule: FermentationStage[];
  }) | null;
  ingredients: { id: string; material_id: string; per_bbl_qty: number; stage: string; timing_minutes: number | null; sort: number; extract_snapshot: number | null; materials: { base_uom: string } | null }[];
  waterAdditions: { material_id: string; qty: number; unit: string; stage: string }[];
  ogPlato: number | null; fgPlato: number | null; abv: number | null;
};
type SnapshotVersion = NonNullable<RecipeSnapshot["version"]>;

/** Everything the draft editor holds, as typed strings where it has a field. */
export type RecipeDraft = {
  numbers: Record<RecipeNumberKey, string>; notes: string; lines: IngredientLine[];
  mashSchedule: MashStep[]; fermentationSchedule: FermentationStage[]; water: WaterDraft;
};

/** A stored number as its field text: "" when absent, and Number() drops a numeric's trailing zeros. */
const text = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(Number(n)));
/** A stored fraction as a percent: 0.725 gives "72.5". toPrecision(12) drops float noise (0.07 * 100); it never rounds to whole percents. */
const percent = (f: number | string) => String(Number((Number(f) * 100).toPrecision(12)));

/** The eight process numbers of a saved version as field text; the read page and the draft copy share it. */
export function versionNumbers(v: SnapshotVersion): Record<RecipeNumberKey, string> {
  return {
    preBoil: text(v.pre_boil_bbl), boilMin: text(v.boil_minutes),
    whirlpoolMin: text(v.whirlpool_minutes), whirlpoolTemp: text(v.whirlpool_temp_f), whirlpoolRest: text(v.whirlpool_rest_minutes), knockoutTemp: text(v.knockout_temp_f),
    efficiency: percent(v.brewhouse_efficiency), attenuation: percent(v.yeast_attenuation),
  };
}

/** A new draft as a copy of the saved version, so a change starts from what was brewed; null when there is no version. */
export function versionToDraft(s: RecipeSnapshot): RecipeDraft | null {
  const v = s.version;
  if (!v) return null;
  return {
    numbers: versionNumbers(v),
    notes: v.note ?? "",
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

/** The first thing a draft still needs before it can be saved, or null when it is ready.
 * `name` is the new recipe's name and is passed only when the recipe is being created. */
export function draftBlocker(input: { name?: string; lines: IngredientLine[]; mashSchedule: MashStep[]; efficiency: string; attenuation: string }): string | null {
  if (input.name !== undefined && input.name.trim() === "") return "Give the recipe a name.";
  if (!input.lines.some(lineReady)) return "Add an ingredient with a quantity per bbl.";
  if (input.mashSchedule.length === 0) return "Add a mash step.";
  if (!validPercent(input.efficiency)) return "Set brewhouse efficiency between 0 and 100%.";
  if (!validPercent(input.attenuation)) return "Set yeast attenuation between 0 and 100%.";
  return null;
}
