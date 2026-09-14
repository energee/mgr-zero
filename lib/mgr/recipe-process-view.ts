// lib/mgr/recipe-process-view.ts — the recipe process spec as the sheets edit
// it and the recipe page reads it: ordered mash steps, fermentation stages and
// water additions on a draft version (recipe-builder spec D2: repetition earns
// a surface), pure list helpers, the summary lines the schedule screens print,
// and the labelled read-out of a cut version's process scalars and water.
import { saccharificationRest, totalMinutes, type MashStep } from "./recipe-schedule";

export type { MashStep };
export type FermentationStage = { name: string; kind: string; tempF: number; days: number };
export type WaterAddition = { materialId: string; qty: number; unit: string; stage: string };
export type WaterDraft = { targetProfileId: string; sourceProfileId: string; mashGal: string; spargeGal: string; targetMashPh: string; additions: WaterAddition[] };

export const EMPTY_WATER: WaterDraft = { targetProfileId: "", sourceProfileId: "", mashGal: "", spargeGal: "", targetMashPh: "", additions: [] };

/** A typed number field holds a finite number; a positive one is above zero. */
export const isNumber = (s: string) => s !== "" && Number.isFinite(Number(s));
export const isPositive = (s: string) => Number(s) > 0;
/** An optional numeric field: empty means not given. */
export const optionalNumber = (s: string) => (s === "" ? undefined : Number(s));

/** Position comes from list order, never a typed number: move one slot up (-1) or down (+1). */
export function moveItem<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list as T[];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export const upsertAt = <T>(list: readonly T[], index: number | undefined, item: T): T[] =>
  index === undefined ? [...list, item] : list.map((x, i) => (i === index ? item : x));

export const removeAt = <T>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);

export function mashSummary(steps: readonly MashStep[]): string {
  const rest = saccharificationRest(steps);
  return `Total ${totalMinutes(steps)} min · ${rest ? `the ${rest.tempF} °F rest feeds the prediction.` : "no rest between 144 and 162 °F, so the prediction has no mash temperature."}`;
}

/** Total days, and where a dry hop on day N lands: day 4 is the last day of a 4-day Primary. */
export function fermentationSummary(stages: readonly FermentationStage[], dryHopDay?: number): string {
  const total = stages.reduce((n, s) => n + s.days, 0);
  if (dryHopDay === undefined) return `Total ${total} days.`;
  let end = 0;
  const stage = stages.find((s) => { end += s.days; return dryHopDay <= end; });
  return `Total ${total} days · dry hop day ${dryHopDay} ${stage ? `falls in ${stage.name}` : "is after the last stage"}.`;
}

/** The process columns get_recipe returns on a version. */
export type ProcessColumns = {
  pre_boil_bbl: number | null; whirlpool_minutes: number | null; whirlpool_temp_f: number | null; whirlpool_rest_minutes: number | null; knockout_temp_f: number | null;
  target_water_profile_id: string | null; source_water_profile_id: string | null; mash_water_gal: number | null; sparge_water_gal: number | null; target_mash_ph: number | null;
};

/** Label and value for each process fact a cut version carries; absent facts print nothing. */
export function processReadout(v: ProcessColumns, profileName: (id: string | null) => string | null): [string, string][] {
  const whirlpool = v.whirlpool_minutes === null ? null
    : `${v.whirlpool_minutes} min${v.whirlpool_temp_f !== null ? ` at ${v.whirlpool_temp_f} °F` : ""}${v.whirlpool_rest_minutes !== null ? ` · ${v.whirlpool_rest_minutes} min rest` : ""}`;
  const rows: [string, string | null][] = [
    ["Pre-boil volume", v.pre_boil_bbl === null ? null : `${v.pre_boil_bbl} bbl`],
    ["Whirlpool", whirlpool],
    ["Knockout temp", v.knockout_temp_f === null ? null : `${v.knockout_temp_f} °F`],
    ["Source profile", profileName(v.source_water_profile_id) ?? "Brewery default"],
    ["Target profile", profileName(v.target_water_profile_id) ?? "No target"],
    ["Mash water", v.mash_water_gal === null ? null : `${v.mash_water_gal} gal`],
    ["Sparge water", v.sparge_water_gal === null ? null : `${v.sparge_water_gal} gal`],
    ["Target mash pH", v.target_mash_ph === null ? null : String(v.target_mash_ph)],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null);
}
