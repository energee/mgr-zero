// lib/mgr/brew-prep-view.ts — view-models for a batch's two brew tabs: Prep, the
// pull list (drawn like the order Pick sheet), and the Brew day timeline
// (Mash → Lauter → Boil → Whirlpool → Knockout). Both read the same brew-day
// ingredients, counted in packs plus loose base units (./pack-qty). Open bags
// are not inventory: a partial pull is just base units.
import { BREW_DAY_STAGES } from "./recipe-process-view";
import type { BrewDayVessel } from "./brew-day-view";
import { fromPacks, packs, splitPacks } from "./pack-qty";
import { toTicks } from "./quantity-input";

export type BrewDayStage = (typeof BREW_DAY_STAGES)[number];

/** One brew-day ingredient: the recipe's plan in base units and what was pulled. */
export type BrewIngredient = {
  key: string;
  name: string;
  stage: BrewDayStage;
  plan: number;
  unit: string;
  /** Base units per pack: materials.purchase_uom_factor. */
  packSize: number;
  /** The bin it is pulled from; null until a source is chosen. A null lot is an untracked material. */
  source: { lot: string | null; bin: string } | null;
  /** Pulled packs (decimals allowed) and loose base units, as typed. */
  packs: string;
  loose: string;
  /** Ticked on the Brew day timeline as pulled into the brew. */
  confirmed?: boolean;
};

export type BrewPrepViewModel = {
  title: string;
  backHref?: string;
  vesselId: string;
  vessels: BrewDayVessel[];
  ingredients: BrewIngredient[];
  /** The cellar-stage additions this batch still plans, e.g. "Fermentation 1 · Dry hop 6". */
  later: string;
};

/** The timeline's stages in process order; lauter and knockout hold readings only. */
export const TIMELINE_STAGES = [
  { stage: "mash", label: "Mash", process: ["mashWaterGal", "targetMashPh"] },
  { stage: "lauter", label: "Lauter", process: ["spargeWaterGal", "preBoilBbl"] },
  { stage: "boil", label: "Boil", process: ["boilMinutes"] },
  { stage: "whirlpool", label: "Whirlpool", process: ["whirlpoolTempF", "whirlpoolMinutes", "whirlpoolRestMinutes"] },
  { stage: "knockout", label: "Knockout", process: ["knockoutTempF"] },
] as const;
export type TimelineStage = (typeof TIMELINE_STAGES)[number]["stage"];

export type BrewTimelineViewModel = {
  title: string;
  backHref?: string;
  ingredients: BrewIngredient[];
  /** The recipe target shown in each stage heading, e.g. "152 °F · 60 min · pH 5.3". */
  targets: Partial<Record<TimelineStage, string>>;
  /** Process readings by the record_brew_day process keys, as typed. */
  process: Record<string, string>;
  vesselId: string;
  vessels: BrewDayVessel[];
  initialBbl: string;
  brewedOn: string;
};

/** A pull line starts at plan: whole packs plus the loose remainder. */
export function startAtPlan(row: Omit<BrewIngredient, "packs" | "loose">): BrewIngredient {
  const split = splitPacks(row.plan, row.packSize);
  return { ...row, packs: String(split.packs), loose: String(split.loose) };
}

/** Base units pulled; a blank field counts as none. */
export const pulledQty = (row: BrewIngredient) => fromPacks(Number(row.packs) || 0, Number(row.loose) || 0, row.packSize);

export const isShort = (row: BrewIngredient) => toTicks(pulledQty(row)) < toTicks(row.plan);

/** "plan 220 lb = 4 × 50 lb + 20 lb · lot · bin". */
export function pullDetail(row: BrewIngredient): string {
  const plan = `${row.plan} ${row.unit}`, inPacks = packs(row.plan, row.packSize, row.unit);
  const source = row.source ? `${row.source.lot ?? "untracked"} · ${row.source.bin}` : "no source chosen";
  return `plan ${inPacks === plan ? plan : `${plan} = ${inPacks}`} · ${source}`;
}

/** Each timeline stage with its own ingredients and process reading keys. */
export const timelineStages = (model: BrewTimelineViewModel) =>
  TIMELINE_STAGES.map(stage => ({ ...stage, ingredients: model.ingredients.filter(row => row.stage === stage.stage) }));

/** The stage a phone opens: the first one still holding an unconfirmed ingredient. */
export const currentStage = (model: BrewTimelineViewModel): TimelineStage =>
  timelineStages(model).find(stage => stage.ingredients.some(row => !row.confirmed))?.stage ?? "knockout";

export const knockoutReady = (model: BrewTimelineViewModel) =>
  model.vessels.some(vessel => vessel.id === model.vesselId) && Number(model.initialBbl) > 0 && Number.isFinite(Number(model.initialBbl)) && Boolean(model.brewedOn);

/** Record brew day is irreversible: every ingredient confirmed and a valid knockout first. */
export const canRecordTimeline = (model: BrewTimelineViewModel) => model.ingredients.every(row => row.confirmed) && knockoutReady(model);
