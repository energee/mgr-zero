// lib/mgr/recipe-process-view.ts — the recipe process spec as the sheets edit
// it and the recipe page reads it: ordered mash steps, fermentation stages and
// water additions on a draft version (recipe-builder spec D2: repetition earns
// a surface), pure list helpers, the summary lines the schedule screens print,
// and the labelled read-out of a cut version's process scalars and water.
import { saccharificationRest, totalMinutes, type MashStep } from "./recipe-schedule";
import { gramsOf, IONS, ION_LABELS, suggestSalts, waterChemistry, type Ions, type Salt } from "@/lib/water-chemistry";

export type { MashStep };
/** Where an ingredient enters the process; the command's enum and the editor's Stage pick. */
export const INGREDIENT_STAGES = ["mash", "boil", "whirlpool", "fermentation", "dry_hop", "packaging", "other"] as const;
export type IngredientStage = (typeof INGREDIENT_STAGES)[number];
/** One ingredient line as the editor holds it: strings until the version is built. */
export type IngredientLine = { materialId: string; perBblQty: string; stage: IngredientStage; timingMinutes: string };
export const lineReady = (l: IngredientLine) => l.materialId !== "" && Number(l.perBblQty) > 0 && (l.timingMinutes === "" || Number.isInteger(Number(l.timingMinutes)));
/** "dry hop · 4 min · 1.2 lb / bbl": the row detail for a line, drawn the same on the draft and on a cut version. */
export const ingredientDetail = (stage: string, timingMinutes: number | string | null, perBbl: number | string, unit?: string) =>
  `${stage.replace("_", " ")}${timingMinutes !== null && timingMinutes !== "" ? ` · ${timingMinutes} min` : ""} · ${perBbl}${unit ? ` ${unit}` : ""} / bbl`;
/** Name and base unit by material id, for rows that name a material the command returned. */
export function materialLookup<M extends { id: string; name: string; base_uom: string }>(materials: readonly M[]) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  return { name: (id: string) => byId.get(id)?.name ?? id.slice(0, 8), unit: (id: string) => byId.get(id)?.base_uom, get: (id: string) => byId.get(id) };
}
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

// Sheet field shapes (strings, as typed) and their readiness checks. Pure, so a
// server component (the inventory frame) can call them: a "use client" module
// cannot export a function the server invokes.
export type MashStepFields = { name: string; kind: string; tempF: string; minutes: string };
export const toMashStepFields = (s?: MashStep): MashStepFields => ({ name: s?.name ?? "", kind: s?.kind ?? "infusion", tempF: s ? String(s.tempF) : "", minutes: s ? String(s.minutes) : "" });
export const mashStepReady = (f: MashStepFields) => f.name.trim() !== "" && isNumber(f.tempF) && isPositive(f.minutes);
export type FermentationStageFields = { name: string; kind: string; tempF: string; days: string };
export const toStageFields = (s?: FermentationStage): FermentationStageFields => ({ name: s?.name ?? "", kind: s?.kind ?? "primary", tempF: s ? String(s.tempF) : "", days: s ? String(s.days) : "" });
export const stageReady = (f: FermentationStageFields) => f.name.trim() !== "" && isNumber(f.tempF) && isPositive(f.days);
export type WaterAdditionFields = { materialId: string; qty: string; unit: string; stage: string };
export const toAdditionFields = (a?: WaterAddition): WaterAdditionFields => ({ materialId: a?.materialId ?? "", qty: a ? String(a.qty) : "", unit: a?.unit ?? "g", stage: a?.stage ?? "mash" });
export const additionReady = (f: WaterAdditionFields) => f.materialId !== "" && isPositive(f.qty);

/** A profile option the Water screen can compute from. */
export type WaterProfileIons = { id: string; name: string; ions: Ions };
/** A material as the Water screen sees it: `salt` undefined means the schema carries none yet, null means not a salt. */
export type SaltMaterial = { id: string; name: string; salt?: Salt | null };

/** A list_water_profiles row (and the catalog fixture): a name and six ions in ppm columns. */
export type WaterProfileRow = { id: string; name: string } & Record<`${keyof Ions}_ppm`, number>;
export const profileIons = (p: Omit<WaterProfileRow, "id" | "name">): Ions =>
  Object.fromEntries(IONS.map((ion) => [ion, p[`${ion}_ppm`]])) as Ions;
/** The option the Water screen computes from; both live pages and the inventory map rows through this. */
export const toWaterProfileOption = (p: WaterProfileRow): WaterProfileIons => ({ id: p.id, name: p.name, ions: profileIons(p) });

const tenth = (n: number) => Math.round(n * 10) / 10;
/** Grams split into mash and sparge by volume; a stage that rounds to nothing folds into the other. */
export function splitByStage(grams: number, mashGal: number, spargeGal: number): { mash: number; sparge: number } {
  // A negative stage volume counts as empty, so its share goes to the other stage rather than vanishing.
  mashGal = Math.max(0, mashGal); spargeGal = Math.max(0, spargeGal);
  const total = mashGal + spargeGal;
  if (total <= 0) return { mash: tenth(grams), sparge: 0 };
  const mash = tenth(grams * mashGal / total), sparge = tenth(grams - mash);
  if (mash === 0) return { mash: 0, sparge: tenth(grams) };
  if (sparge === 0) return { mash: tenth(grams), sparge: 0 };
  return { mash, sparge };
}

const saltOf = (materials: SaltMaterial[], id: string) => materials.find((m) => m.id === id)?.salt;
const asSaltAdditions = (draft: WaterDraft, materials: SaltMaterial[]) =>
  draft.additions.map((a) => ({ salt: saltOf(materials, a.materialId), grams: gramsOf(a.qty, a.unit) }));

const hasSalt = (m: SaltMaterial): m is SaltMaterial & { salt: Salt } => Boolean(m.salt);

/** The solver's additions in place of the draft's salts; acids and unknown materials stay where they were.
 *  Two stocked materials carrying the same salt collapse to one suggestion, mapped to the first such material. */
export function suggestAdditions(draft: WaterDraft, source: Ions, target: Ions, materials: SaltMaterial[]): WaterAddition[] {
  const mashGal = Number(draft.mashGal) || 0, spargeGal = Number(draft.spargeGal) || 0;
  const stocked = materials.filter(hasSalt);
  const bySalt = new Map<Salt, string>();
  for (const m of stocked) if (!bySalt.has(m.salt)) bySalt.set(m.salt, m.id);
  const kept = draft.additions.filter((a) => !saltOf(materials, a.materialId));
  const suggested = suggestSalts({ source, target, totalGal: mashGal + spargeGal, salts: [...bySalt.keys()] }).flatMap(({ salt, grams }) => {
    const materialId = bySalt.get(salt)!;
    const { mash, sparge } = splitByStage(grams, mashGal, spargeGal);
    return [mash > 0 ? { materialId, qty: mash, unit: "g", stage: "mash" } : null, sparge > 0 ? { materialId, qty: sparge, unit: "g", stage: "sparge" } : null].filter((a): a is WaterAddition => a !== null);
  });
  return [...suggested, ...kept];
}

export const WARN_PPM = 20;
export type IonReadoutRow = { ion: string; detail: string; warning: boolean };
const ppm = (n: number) => String(Math.round(n));
/** Round before choosing the sign, so a delta like −0.4 renders "+0" and never "−0". */
const signed = (n: number) => { const r = Math.round(n); return r < 0 ? `−${-r}` : `+${r}`; };
/** Six rows, one per ion: "180 of 200 ppm · −20"; empty without a target. */
export function ionReadout(draft: WaterDraft, source: Ions, target: Ions | undefined, materials: SaltMaterial[]): IonReadoutRow[] {
  if (!target) return [];
  const rows = waterChemistry({ source, target, mashGal: Number(draft.mashGal) || 0, spargeGal: Number(draft.spargeGal) || 0, additions: asSaltAdditions(draft, materials) });
  return rows.map((r) => ({ ion: ION_LABELS[r.ion], detail: `${ppm(r.result)} of ${ppm(r.target!)} ppm · ${signed(r.delta!)}`, warning: Math.abs(r.delta!) > WARN_PPM }));
}
