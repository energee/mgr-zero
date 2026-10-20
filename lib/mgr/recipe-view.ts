// lib/mgr/recipe-view.ts — view-model for Recipe: the inventory editor and
// the live page (read-out of a cut version, or the draft editor). Also the
// get_recipe result shape (RecipeSnapshot), the copy of a saved version a new
// draft starts from (versionToDraft), why a draft cannot be saved yet
// (draftBlocker), the read page's model of a saved version (toRecipePageModel)
// and why a prediction is missing (gravityBlockerText, noMashText).
import type { ReactNode } from "react";
import { formatDate } from "@/lib/date-format";
import { gravityBlockers, type GravityBlocker } from "@/lib/recipe-gravity";
import { formatGravity, type GravityUnit } from "./gravity-unit";
import { plural } from "./plural";
import {
  fermentationSummary, ingredientDetail, lineReady, mashRowSummary, mashStepDetail, materialLookup, perBblDisplay, processReadout,
  type FermentationStage, type IngredientLine, type IngredientStage, type MashStep, type ProcessColumns, type RecipeMaterial, type WaterDraft,
} from "./recipe-process-view";
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
  /** Where New recipe version goes on a cut version; the draft editor submits instead. */
  createHref?: string;
  /** A recipe with no version yet: drawn instead of the editor, so no number is invented. */
  empty?: string;
  title: string;
  /** When the shown version was saved, as a date in the brewery's zone. */
  saved?: string;
  versions?: { number: number; href?: string; selected: boolean; latest: boolean }[];
  historical?: boolean;
  /** The recipe's own note (not the version note, which is `notes`). */
  recipeNote?: string;
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

/** What get_recipe returns: the recipe, its selected version (null before the
 * first), all version numbers, that version's ingredients and water additions, and the prediction.
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

/** Why there is no prediction, naming the first blocked line, or null when nothing blocks it.
 * `saved` tells a saved version (fixed by creating the next one) from a draft (fixed under Materials).
 * nameOf and unitOf take a blocker's index into the ingredient list that gravityBlockers was given. */
export function gravityBlockerText(blockers: GravityBlocker[], nameOf: (index: number) => string, unitOf: (index: number) => string | undefined, { saved }: { saved: boolean }): string | null {
  const first = blockers[0];
  if (!first) return null;
  const name = nameOf(first.index);
  if (first.reason === "no_weight") return `${name} is stocked in ${unitOf(first.index) ?? "no unit"}, which has no weight, so nothing is predicted.`;
  return saved
    ? `${name} had no extract potential when this version was saved; set it under Materials, then create the next version.`
    : `${name} has no extract potential; set it under Materials.`;
}

/** Why there is no prediction when no line is a mash line: gravityBlockers lists nothing then,
 * yet recipeGravity predicts nothing. Null with no lines, since draftBlocker already asks for one. */
export function noMashText(stages: string[]): string | null {
  return stages.length > 0 && !stages.includes("mash") ? "No mash ingredient, so nothing is predicted." : null;
}

/** The read page's selected saved version, or the empty state before the first version. */
export function toRecipePageModel(
  s: RecipeSnapshot,
  ctx: { materials: RecipeMaterial[]; profiles: { id: string; name: string }[]; unit: GravityUnit; timeZone: string },
): RecipeViewModel {
  const { recipe, version: v, ingredients, waterAdditions } = s;
  const material = materialLookup(ctx.materials);
  const profileName = (pid: string | null) => (pid && ctx.profiles.find((p) => p.id === pid)?.name) || null;
  const base = { title: recipe.name, backHref: "/recipes", createHref: `/recipes/${recipe.id}/new`, recipeNote: recipe.note ?? undefined };
  if (!v) return { ...base, empty: "No version yet: create the first one" };

  // The water rows leave out the process scalars processReadout also returns; the numbers grid shows those.
  const waterFacts = processReadout(v, profileName).filter(([k]) => !/^(Pre-boil|Whirlpool|Knockout)/.test(k));
  // The prediction get_recipe made, or why it made none: the saved line's own snapshot and unit, as get_recipe read them.
  const blockers = gravityBlockers(ingredients.map((i) => ({ perBblQty: Number(i.per_bbl_qty), extractPotential: i.extract_snapshot, stage: i.stage, unit: i.materials?.base_uom })));
  const predicted = s.ogPlato !== null && s.fgPlato !== null && s.abv !== null
    ? `Predicted: OG ${formatGravity(s.ogPlato, ctx.unit)} · FG ${formatGravity(s.fgPlato, ctx.unit)} · ABV ${s.abv.toFixed(1)}%`
    : gravityBlockerText(blockers, (n) => material.name(ingredients[n].material_id), (n) => ingredients[n].materials?.base_uom, { saved: true })
      ?? noMashText(ingredients.map((i) => i.stage)) ?? undefined;
  return {
    ...base,
    title: `${recipe.name} v${v.version}`,
    saved: formatDate(v.created_at, ctx.timeZone),
    historical: v.version !== s.versions[0],
    versions: s.versions.map((number) => ({ number, href: `?v=${number}`, selected: number === v.version, latest: number === s.versions[0] })),
    ingredients: ingredients.map((i) => ({
      key: i.id, title: material.name(i.material_id),
      detail: ingredientDetail(i.stage, i.timing_minutes, perBblDisplay(Number(i.per_bbl_qty)), material.unit(i.material_id)),
      qty: "",
    })),
    ...versionNumbers(v),
    mash: { title: `Mash schedule · ${plural(v.mash_schedule.length, "step")}`, detail: mashRowSummary(v.mash_schedule), rows: v.mash_schedule.map((m) => ({ title: m.name, detail: mashStepDetail(m) })) },
    fermentation: {
      title: `Fermentation schedule · ${plural(v.fermentation_schedule.length, "stage")}`,
      detail: v.fermentation_schedule.length ? fermentationSummary(v.fermentation_schedule) : "No stages yet",
      rows: v.fermentation_schedule.map((f) => ({ title: f.name, detail: `${f.tempF} °F · ${plural(f.days, "day")}` })),
    },
    water: {
      title: "Water", detail: "",
      rows: [...waterFacts.map(([k, val]) => ({ title: k, detail: val })), ...waterAdditions.map((a) => ({ title: material.name(a.material_id), detail: `${a.qty} ${a.unit} · ${a.stage}` }))],
    },
    notes: v.note ?? "",
    predicted,
  };
}
