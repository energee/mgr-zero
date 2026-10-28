// lib/mgr/brew-prep-view.ts — view-models for a batch's two brew tabs: Prep, the
// pull list (drawn like the order Pick sheet), and the Brew day timeline
// (Mash → Lauter → Boil → Whirlpool → Knockout). Both read the same brew-day
// ingredients, counted in packs plus loose base units (./pack-qty). Open bags
// are not inventory: a partial pull is just base units. Prep is saved as
// brew_pulls through save_batch_pulls; nothing here moves stock.
import { BREW_DAY_STAGES, INGREDIENT_STAGES, isBrewDayStage } from "./recipe-process-view";
import { brewDayLines, brewSourceKey, fitsStock, observedProcess, plannedQty, soleSource, type BrewDayVessel, type BrewMaterialSource, type BrewPlan, type BrewPull, type BrewWaterAddition } from "./brew-day-view";
import { sentenceCase } from "./labels";
import { materialSourceKey, type SourceIds } from "./material-source";
import { fromPacks, splitPacks, withPacks } from "./pack-qty";
import { fromTicks, isNumber, numberNotationError, toTicks } from "./quantity-input";
import { convertUom } from "@/lib/uom";
import { MASH_PH_BOUNDS, READING_BOUNDS } from "@/lib/composer/offline-policy";
import { totalMinutes } from "./recipe-schedule";
import { andList, submitReason } from "./submit-reason";

export type BrewDayStage = (typeof BREW_DAY_STAGES)[number];

/** One brew-day ingredient: the recipe's plan in base units and what was pulled. */
export type BrewIngredient = {
  key: string;
  name: string;
  /** The recipe line's material; a source is chosen among this material's stock. */
  materialId: string;
  stage: BrewDayStage;
  plan: number;
  unit: string;
  /** Base units per pack: materials.purchase_uom_factor. */
  packSize: number;
  /** The exact source it is pulled from, with its lot code and "location / bin" for display; null until chosen. A null lot is an untracked material. */
  source: (SourceIds & { lot: string | null; bin: string }) | null;
  /** Pulled packs (decimals allowed) and loose base units, as typed. */
  packs: string;
  loose: string;
  /** Ticked on the Brew day timeline as pulled into the brew; a line with a saved Prep pull starts ticked (#1508). */
  confirmed?: boolean;
  /** A planned water addition, not a recipe line: recorded with no recipeIngredientId, and never pulled in Prep. */
  water?: true;
};

export type BrewPrepViewModel = {
  title: string;
  backHref?: string;
  /** The batch's planned barrels and date, e.g. "22 bbl · Oct 22, 2026", and its note; shown on one line when set. */
  planned?: string;
  note?: string;
  vesselId: string;
  vessels: BrewDayVessel[];
  ingredients: BrewIngredient[];
  /** Stock a line without its exact source can be pulled from (get_brew_day_plan sources). Absent (the inventory), Choose lot is a plain verb; given, it opens an inline pick, or is disabled when none of it is that material. */
  sources?: BrewMaterialSource[];
  /** The cellar-stage additions this batch still plans, e.g. "Fermentation 1 · Dry hop 6". */
  later: string;
};

/** The timeline's stages in process order; lauter and knockout hold readings only. */
const TIMELINE_STAGES = [
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
  /** The batch's planned barrels and date, e.g. "22 bbl · Oct 22, 2026", and its note; each shows only when set. */
  planned?: string;
  note?: string;
  ingredients: BrewIngredient[];
  /** Stock a line without its exact source can be pulled from (get_brew_day_plan sources); with none, Edit offers no source pick. */
  sources?: BrewMaterialSource[];
  /** Planned water additions whose unit cannot become their material's base unit (waterAdditionRows' reminders),
   *  listed under Mash; recorded with Correct turn after the brew. The rest are confirmable rows in `ingredients`. */
  waterAdditions?: BrewWaterAddition[];
  /** The recipe target shown in each stage heading, e.g. "152 °F · 60 min · pH 5.3". */
  targets: Partial<Record<TimelineStage, string>>;
  /** Process readings by the record_brew_day process keys, as typed. */
  process: Record<string, string>;
  vesselId: string;
  vessels: BrewDayVessel[];
  initialBbl: string;
  brewedOn: string;
  /** The brewer confirmed nothing was pulled: record_brew_day refuses an empty record without it. */
  confirmEmpty?: boolean;
};

/** The tab a planned batch page opens, as `?tab=` spells it: the one `?tab=` names, else Brew day once Prep pulls are saved, else Prep. */
export const openBrewTab = (tab: string | undefined, pullsSaved: boolean): "prep" | "brew-day" =>
  tab === "prep" || tab === "brew-day" ? tab : pullsSaved ? "brew-day" : "prep";

/** An amount as the pull fields hold it: whole packs plus the loose remainder.
 *  With no pack size (1) PackQuantity draws only the first field, so the whole amount goes there. */
function packFields(qty: number, packSize: number): Pick<BrewIngredient, "packs" | "loose"> {
  if (packSize === 1) return { packs: String(qty), loose: "0" };
  const split = splitPacks(qty, packSize);
  return { packs: String(split.packs), loose: String(split.loose) };
}

/** A pull line starts at plan: whole packs plus the loose remainder. */
export const startAtPlan = (row: Omit<BrewIngredient, "packs" | "loose">): BrewIngredient => ({ ...row, ...packFields(row.plan, row.packSize) });

/** A stock source or saved pull as a line's source. */
const lineSource = (s: BrewMaterialSource): BrewIngredient["source"] =>
  ({ materialId: s.material_id, locationId: s.location_id, binId: s.bin_id, lotId: s.lot_id, lot: s.lot_code, bin: `${s.location_name} / ${s.bin_name}` });

/** Prep's lines for `plannedBbl`: a saved pull's amount and source, confirmed, so Brew day does not ask for it again
 *  (#1508). A line with no pull takes the only matching source (brewPlanActuals' rule) and starts at plan, or at zero once
 *  Prep is saved: a saved Prep leaves off only lines pulled to zero. */
export function brewIngredients(plan: BrewPlan, pulls: BrewPull[], sources: BrewMaterialSource[], plannedBbl: number): BrewIngredient[] {
  return brewDayLines(plan).map(line => {
    const row = { key: line.id, name: line.materialName, materialId: line.material_id, stage: line.stage, plan: plannedQty(line, plannedBbl), unit: line.unit, packSize: line.purchaseUomFactor ?? 1 };
    const pull = pulls.find(saved => saved.recipe_ingredient_id === line.id);
    if (pull) return { ...row, source: lineSource(pull), ...packFields(pull.qty, row.packSize), confirmed: true };
    const only = soleSource(sources, line.material_id);
    const unpulled = { ...row, source: only ? lineSource(only) : null };
    return pulls.length ? { ...unpulled, ...packFields(0, row.packSize) } : startAtPlan(unpulled);
  });
}

/** The timeline stage that takes a water addition: sparge water is added during the mash's lauter, kettle salts in the boil. */
const WATER_STAGE: Record<string, BrewDayStage> = { mash: "mash", sparge: "mash", kettle: "boil" };

/** The plan's water additions as Brew day rows (#1508): each amount converted to its material's base unit and started at
 *  plan, with the only matching source. An addition whose unit cannot convert (mL of a material stocked by weight) stays a
 *  reminder, recorded with Correct turn after the brew. */
export function waterAdditionRows(plan: BrewPlan, sources: BrewMaterialSource[]): { rows: BrewIngredient[]; reminders: BrewWaterAddition[] } {
  const rows: BrewIngredient[] = [], reminders: BrewWaterAddition[] = [];
  for (const addition of plan.waterAdditions ?? []) {
    const qty = convertUom(addition.qty, addition.unit, addition.baseUnit);
    if (qty === null) { reminders.push(addition); continue; }
    const only = soleSource(sources, addition.material_id);
    rows.push({ ...startAtPlan({ key: addition.id, name: addition.materialName, materialId: addition.material_id, stage: WATER_STAGE[addition.stage],
      plan: fromTicks(toTicks(qty)), unit: addition.baseUnit, packSize: 1, source: only ? lineSource(only) : null }), water: true });
  }
  return { rows, reminders };
}

/** The cellar-stage lines still planned, counted by stage: "Fermentation 1 · Dry hop 6", or "None". */
export function laterAdditions(plan: BrewPlan): string {
  const stages = (plan.ingredients ?? []).map(row => row.stage);
  const counts = INGREDIENT_STAGES.filter(stage => !isBrewDayStage(stage))
    .map(stage => ({ stage, count: stages.filter(s => s === stage).length }))
    .filter(({ count }) => count > 0);
  return counts.map(({ stage, count }) => `${sentenceCase(stage)} ${count}`).join(" · ") || "None";
}

/** Base units pulled; a blank field counts as none. */
export const pulledQty = (row: BrewIngredient) => fromPacks(Number(row.packs) || 0, Number(row.loose) || 0, row.packSize);

/** A typed packs or loose field is a number at or above zero; blank counts as zero. */
const isPullAmount = (value: string) => Number.isFinite(Number(value)) && Number(value) >= 0;

const validAmounts = (row: BrewIngredient) => isPullAmount(row.packs) && isPullAmount(row.loose);

/** A line pulled above zero with no exact source yet (brew_pulls and record_brew_day both need one); a line pulled to
 *  zero needs none. Prep's reason scrolls to the first such line. */
export const needsSource = (row: BrewIngredient) => validAmounts(row) && row.source === null && pulledQty(row) !== 0;
const pullReady = (row: BrewIngredient) => validAmounts(row) && !needsSource(row);

/** What the lines still need: valid amounts per line, then sources. One missing source is named; several are counted,
 *  so the sticky phone footer stays one line instead of listing every ingredient (#1508). */
function pullNeeds(rows: BrewIngredient[]): string[] {
  const amounts = rows.filter(row => !validAmounts(row)).map(row => `pulled amounts of zero or more for ${row.name}`);
  const unsourced = rows.filter(needsSource);
  if (unsourced.length === 0) return amounts;
  return [...amounts, `a source for ${unsourced.length === 1 ? unsourced[0].name : `${unsourced.length} items`}`];
}

/** Why Done pulling is withheld, or null when every line is pullReady (a short line pulled to nothing needs no source). */
export const prepReason = (model: BrewPrepViewModel) => submitReason(pullNeeds(model.ingredients));

/** One note naming each unsourced line's material that has no stock to choose a source from, or null. Prep draws it once
 *  above the list instead of a disabled Choose lot on every such line (#1508). Without `sources` (the inventory) stock
 *  is unknown, so it is null. */
export function noStockNote(model: BrewPrepViewModel): string | null {
  if (!model.sources) return null;
  const stocked = new Set(model.sources.map(s => s.material_id));
  const names = [...new Set(model.ingredients.filter(row => !row.source && !stocked.has(row.materialId)).map(row => row.name))];
  return names.length ? `No stock to choose a source from for ${andList(names)}.` : null;
}

/** save_batch_pulls input: each sourced line at its pulled amount; a line with no source was pulled to zero and is left out. */
export function brewPullsPayload(model: BrewPrepViewModel) {
  return {
    vesselId: model.vesselId || null,
    lines: model.ingredients.flatMap(row => row.source
      ? [{ recipeIngredientId: row.key, materialId: row.source.materialId, locationId: row.source.locationId, binId: row.source.binId, lotId: row.source.lotId, qty: pulledQty(row) }]
      : []),
  };
}

export const isShort = (row: BrewIngredient) => toTicks(pulledQty(row)) < toTicks(row.plan);

/** A pull line is amber until it has a source and reaches plan. */
export const pullTone = (row: BrewIngredient): "w" | "ok" => !row.source || isShort(row) ? "w" : "ok";

/** A packs field is worth drawing when the material has a pack size and the plan reaches one pack, or packs are
 *  already entered; under one pack the line is just loose base units, so a packs stepper stuck at 0 is noise. */
export const showsPacks = (row: BrewIngredient) => row.packSize !== 1 && (toTicks(row.plan) >= toTicks(row.packSize) || Number(row.packs) > 0);

/** "plan 220 lb = 4 × 50 lb + 20 lb · lot · bin". */
export function pullDetail(row: BrewIngredient): string {
  const source = row.source ? `${row.source.lot ?? "untracked"} · ${row.source.bin}` : "no source chosen";
  return `plan ${withPacks(row.plan, row.packSize, row.unit)} · ${source}`;
}

/** A line's source picks: this material's stock, labelled "C-2 · Malt room / A2 · 1000 lb available", each with the source it sets. */
export const sourceChoices = (sources: BrewMaterialSource[], materialId: string) =>
  sources.filter(s => s.material_id === materialId).map(s => ({
    value: brewSourceKey(s), label: `${s.lot_code ?? "Untracked"} · ${s.location_name} / ${s.bin_name} · ${s.qty} ${s.unit} available`, source: lineSource(s) }));

/** Something is pulled above zero; until then Record needs the brewer to confirm no ingredients were used. */
export const anyPulled = (model: BrewTimelineViewModel) => model.ingredients.some(row => pulledQty(row) > 0);

/** Each timeline stage with its own ingredients and process reading keys. */
export const timelineStages = (model: BrewTimelineViewModel) =>
  TIMELINE_STAGES.map(stage => ({ ...stage, ingredients: model.ingredients.filter(row => row.stage === stage.stage) }));

/** A folded stage's progress, "1 of 2 confirmed"; undefined for a stage with no ingredients. */
export const stageProgress = (rows: BrewIngredient[]) =>
  rows.length ? `${rows.filter(row => row.confirmed).length} of ${rows.length} confirmed` : undefined;

/** The timeline's Confirm all: every ingredient in every stage confirmed at the amount and source it shows (pass the whole
 *  ingredient list, not one stage's); timelineTone still flags any that can't record. */
export const confirmAll = (rows: BrewIngredient[]) => rows.map(row => ({ ...row, confirmed: true }));

/** The stage a phone opens: the first one still holding an unconfirmed ingredient. */
export const currentStage = (model: BrewTimelineViewModel): TimelineStage =>
  timelineStages(model).find(stage => stage.ingredients.some(row => !row.confirmed))?.stage ?? "knockout";

const TEMP = "Enter a temperature from 25 to 212 °F.";
const MINUTES = "Enter whole minutes, zero or more.";
/** Each process reading's rule, matching record_brew_day's schema (#1476). */
const PROCESS_RULES: Record<string, { ok: (n: number) => boolean; help: string }> = {
  mashWaterGal: { ok: n => n > 0, help: "Enter an amount above zero." },
  targetMashPh: { ok: n => n >= MASH_PH_BOUNDS.min && n <= MASH_PH_BOUNDS.max, help: `Enter a mash pH from ${MASH_PH_BOUNDS.min} to ${MASH_PH_BOUNDS.max}.` },
  spargeWaterGal: { ok: n => n >= 0, help: "Enter an amount of zero or more." },
  preBoilBbl: { ok: n => n > 0, help: "Enter an amount above zero." },
  boilMinutes: { ok: n => Number.isInteger(n) && n >= 0, help: MINUTES },
  whirlpoolMinutes: { ok: n => Number.isInteger(n) && n >= 0, help: MINUTES },
  whirlpoolRestMinutes: { ok: n => Number.isInteger(n) && n >= 0, help: MINUTES },
  whirlpoolTempF: { ok: n => n >= READING_BOUNDS.tempF.min && n <= READING_BOUNDS.tempF.max, help: TEMP },
  knockoutTempF: { ok: n => n >= READING_BOUNDS.tempF.min && n <= READING_BOUNDS.tempF.max, help: TEMP },
};

/** What is wrong with each typed process reading, by key; a blank reading was not measured and is fine. One check drives
 *  the field errors and timelineReason, so the form and the record cannot disagree. */
export function processErrors(process: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(process).flatMap(([key, value]) => {
    if (!value.trim()) return [];
    const notation = numberNotationError(value);
    if (notation) return [[key, notation]];
    const rule = PROCESS_RULES[key];
    return rule && (!isNumber(value) || !rule.ok(Number(value))) ? [[key, rule.help]] : [];
  }));
}

/** What knockout still needs: a listed vessel, positive barrels within its capacity and a brew date, as record_brew_day
 *  requires. A top-up into a tank already holding beer is checked against what is left by the server. */
const knockoutNeeds = (model: BrewTimelineViewModel) => {
  const vessel = model.vessels.find(item => item.id === model.vesselId);
  const bbl = Number(model.initialBbl);
  return [
    ...(vessel ? [] : ["a knockout vessel"]),
    ...(bbl > 0 && Number.isFinite(bbl) ? [] : ["knockout barrels above zero"]),
    ...(vessel && bbl > Number(vessel.capacity_bbl) ? [`at most ${Number(vessel.capacity_bbl)} bbl into ${vessel.name}`] : []),
    ...(model.brewedOn ? [] : ["a brew date"]),
  ];
};
/** Knockout is complete: when the loss-baseline tape shows. */
export const knockoutReady = (model: BrewTimelineViewModel) => knockoutNeeds(model).length === 0;

/** The stock each row pulled above zero from a source draws: fitsStock's lines. A row's source is camelCase SourceIds,
 *  so it keys with materialSourceKey, the same string brewSourceKey gives its stock row. */
const stockDraws = (rows: BrewIngredient[]) =>
  rows.flatMap(row => row.source && pulledQty(row) > 0 ? [{ source: materialSourceKey(row.source), qty: pulledQty(row) }] : []);

/** A timeline row's tone: confirmed is green only with a source within stock, else amber; unconfirmed is amber when short,
 *  unsourced or over stock, else plain. */
export function timelineTone(row: BrewIngredient, sources?: BrewMaterialSource[]): "ok" | "w" | "" {
  const fits = pullReady(row) && fitsStock(stockDraws([row]), sources);
  if (row.confirmed) return fits ? "ok" : "w";
  return isShort(row) || !fits ? "w" : "";
}

/** Why Record brew day (irreversible) is withheld, or null when it may record: every ingredient confirmed and pullReady, the
 *  pulls together within stock (canRecordBrewDay's rule), something pulled or confirmEmpty, and a valid knockout. */
export const timelineReason = (model: BrewTimelineViewModel) => submitReason([
  ...(model.ingredients.every(row => row.confirmed) ? [] : ["every ingredient confirmed"]),
  ...pullNeeds(model.ingredients),
  ...(fitsStock(stockDraws(model.ingredients), model.sources) ? [] : ["pulls within the stock on hand"]),
  ...(anyPulled(model) || model.confirmEmpty ? [] : ["a pulled ingredient or Confirm no ingredients used"]),
  ...(Object.keys(processErrors(model.process)).length ? ["process readings in range"] : []),
  ...knockoutNeeds(model),
]);

/** record_brew_day input: each line pulled above zero at its exact source; a pulled line with no source throws. */
export function timelineRecordPayload(model: BrewTimelineViewModel, batchId: string): [string, Record<string, unknown>] {
  const actuals = model.ingredients.filter(row => pulledQty(row) > 0).map(row => {
    if (!row.source) throw new Error("Choose an exact material source");
    const { materialId, locationId, binId, lotId } = row.source;
    return { materialId, locationId, binId, lotId, ...(row.water ? {} : { recipeIngredientId: row.key }), stage: row.stage, qty: pulledQty(row) };
  });
  // brewRecordPayload's key order: a saved attempt is matched by its JSON (lib/commands/recovery.ts).
  return ["record_brew_day", { initialBbl: Number(model.initialBbl), actuals, process: observedProcess(model.process), confirmEmpty: Boolean(model.confirmEmpty),
    batchId, vesselId: model.vesselId, brewedOn: model.brewedOn }];
}

/** Present parts joined " · ", or undefined when none is set. */
const joinParts = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ") || undefined;
/** "152 °F" from a set column; null when the column is blank. */
const withUnit = (value: number | null | undefined, unit: string) => value == null ? null : `${value} ${unit}`;

/** Each stage's recipe target from the pinned version, e.g. mash "152 °F · 60 min · pH 5.3"; a stage with nothing set is left out. */
export function brewTargets(plan: BrewPlan): BrewTimelineViewModel["targets"] {
  const v = plan.version ?? {};
  const targets: Record<TimelineStage, string | undefined> = {
    mash: joinParts(withUnit(v.mash_temp_f, "°F"), withUnit(totalMinutes(v.mash_schedule ?? []) || null, "min"), v.target_mash_ph == null ? null : `pH ${v.target_mash_ph}`),
    lauter: joinParts(v.pre_boil_bbl == null ? null : `pre-boil ${v.pre_boil_bbl} bbl`),
    boil: joinParts(withUnit(v.boil_minutes, "min")),
    whirlpool: joinParts(withUnit(v.whirlpool_temp_f, "°F"), withUnit(v.whirlpool_minutes, "min")),
    knockout: joinParts(withUnit(v.knockout_temp_f, "°F")),
  };
  return Object.fromEntries(Object.entries(targets).filter(([, text]) => text !== undefined));
}
