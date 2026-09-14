// lib/mgr/recipe-process-view.ts — the recipe process spec as the sheets edit
// it: ordered mash steps, fermentation stages and water additions on a draft
// version (recipe-builder spec D2: repetition earns a surface). Pure list
// helpers plus the summary lines the schedule screens print. Shapes match
// create_recipe_version's input and the JSONB get_recipe returns.
import { saccharificationRest, totalDuration } from "./recipe-schedule";

export type MashStep = { name: string; kind: string; tempF: number; minutes: number };
export type FermentationStage = { name: string; kind: string; tempF: number; days: number };
export type WaterAddition = { materialId: string; qty: number; unit: string; stage: string };
export type WaterDraft = { targetProfileId: string; sourceProfileId: string; mashGal: string; spargeGal: string; targetMashPh: string; additions: WaterAddition[] };

export const EMPTY_WATER: WaterDraft = { targetProfileId: "", sourceProfileId: "", mashGal: "", spargeGal: "", targetMashPh: "", additions: [] };

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
  const asSteps = steps.map((s) => ({ ...s, duration: s.minutes }));
  const rest = saccharificationRest(asSteps);
  return `Total ${totalDuration(asSteps)} min · ${rest ? `the ${rest.tempF} °F rest feeds the prediction.` : "no rest between 144 and 162 °F, so the prediction has no mash temperature."}`;
}

/** Total days, and where a dry hop on day N lands: day 4 is the last day of a 4-day Primary. */
export function fermentationSummary(stages: readonly FermentationStage[], dryHopDay?: number): string {
  const total = stages.reduce((n, s) => n + s.days, 0);
  if (dryHopDay === undefined) return `Total ${total} days.`;
  let end = 0;
  const stage = stages.find((s) => { end += s.days; return dryHopDay <= end; });
  return `Total ${total} days · dry hop day ${dryHopDay} ${stage ? `falls in ${stage.name}` : "is after the last stage"}.`;
}
