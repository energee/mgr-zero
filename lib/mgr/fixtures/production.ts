// lib/mgr/fixtures/production.ts — batch, brew-day, packaging, and recipe
// snapshots. Views own no sample data.
import type { BatchesSnapshot } from "@/lib/mgr/batches-view";
import type { BrewDayViewModel } from "@/lib/mgr/brew-day-view";
import { cellarPlanRows, startAtPlan, waterAdditionRows, type BrewIngredient, type BrewPrepViewModel, type BrewTimelineViewModel } from "@/lib/mgr/brew-prep-view";
import type { ClosePackagingRunViewModel } from "@/lib/mgr/close-packaging-run-view";
import { figureStrip, gristShares, ingredientCells, ingredientPack, outcomeSummary, outcomeTable, recipeHistory, waterFacts, type RecipeOutcome, type RecipeViewModel } from "@/lib/mgr/recipe-view";
import type { RecipesSnapshot } from "@/lib/mgr/recipes-view";
import type { RunClosedViewModel } from "@/lib/mgr/run-closed-view";
import { DEMO_TIME_ZONE } from "@/lib/mgr/fixtures/settings";
import type { ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";
import type { VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";
import type { CellarMapViewModel } from "@/lib/mgr/cellar-map-view";
import { recipeIbu } from "@/lib/recipe-ibu";
import type { FermentationStage, IngredientStage, MashStep, RecipeMaterial, WaterDraft } from "@/lib/mgr/recipe-process-view";
import { waterProfiles } from "./catalog";

export const cellarMapBrewer: CellarMapViewModel = {
  readingHref: null,
  actionHint: "Several tanks hold beer. Use Reading on a tank.",
  tiles: [
    { name: "FV1", detail: "Pils · 12.8 / 15 bbl", reading: "1.9 °P · read 4 h", fill: 85, readingHref: "" },
    { name: "FV2", detail: "Hazy · 9.0 / 15 bbl", reading: "7.5 °P · read 8 h", fill: 60, readingHref: "" },
    { name: "FV3", detail: "Stout · 13.5 / 15 bbl", reading: "5.2 °P · overdue 31 h", warning: true, fill: 90, readingHref: "" },
    { name: "BT1", detail: "Pils · 7.0 / 10 bbl", reading: "carbing", fill: 70, readingHref: "" },
    { name: "BT2", detail: "Empty · 0 / 10 bbl", reading: "available", fill: 0 },
    { name: "FB1", detail: "Saison · 0.4 / 1 bbl", reading: "aging · read 1 d", fill: 40, readingHref: "" },
  ],
  detail: { title: "FV3 · fermenter · 15 bbl", description: "occupancy, readings and vessel facts" },
};

export const batchesBrewer: BatchesSnapshot = {
  title: "Batches",
  vessels: [
    { key: "fv1", name: "FV1", kind: "Fermenter", capacityBbl: 15, active: true },
    { key: "fv3", name: "FV3", kind: "Fermenter", capacityBbl: 15, active: true },
    { key: "fv4", name: "FV4", kind: "Fermenter", capacityBbl: 10, active: false },
  ],
  planned: [
    { key: "b0416", batchNo: "B-0416", brand: "Hazy IPA", recipe: "Hazy IPA", plannedOn: "Sep 4, 2026", plannedBbl: 15, vessel: null, overdue: true },
    { key: "b0417", batchNo: "B-0417", brand: null, recipe: null, plannedOn: "Sep 8, 2026", plannedBbl: 10, vessel: null },
  ],
  active: [
    { key: "b0409", batchNo: "B-0409", brand: "Pils", recipe: "Pils", plannedOn: "Aug 28, 2026", plannedBbl: 15, vessel: "FV1", readings: [{ key: "pils-fv1", vessel: "FV1", reading: "No readings yet" }] },
    { key: "b0413", batchNo: "B-0413", brand: "Stout", recipe: "Stout", plannedOn: "Aug 31, 2026", plannedBbl: 15, vessel: "FV3, FV4", readings: [{ key: "stout-fv3", vessel: "FV3", reading: "0.0 °P · pH 4.2 · Sep 2, 2026, 5:00 PM" }, { key: "stout-fv4", vessel: "FV4", reading: "5.2 °P · 68 °F · Sep 3, 2026, 8:10 AM" }] },
    { key: "b0414", batchNo: "B-0414", brand: "Porter", recipe: "Robust porter", plannedOn: "Sep 1, 2026", plannedBbl: 10, vessel: null, readings: [] },
  ],
  completed: [
    { key: "b0401", batchNo: "B-0401", brand: "Amber ale", recipe: "Amber ale", plannedOn: "Aug 2, 2026", plannedBbl: 10, vessel: null },
  ],
  cancelled: [
    { key: "b0412", batchNo: "B-0412", brand: null, recipe: "Pale ale", plannedOn: "Aug 30, 2026", plannedBbl: 15, vessel: null },
  ],
};

export const batchesEmpty: BatchesSnapshot = {
  title: "Batches",
  planned: [],
  active: [],
  vessels: [],
};

export const scheduleBatchHazy: ScheduleBatchViewModel = {
  recipeId: "hazy-v4",
  recipe: "Hazy IPA",
  recipeOptions: [{ id: "hazy-v4", label: "Hazy IPA" }, { id: "pils-v3", label: "Pils" }, { id: "stout-v2", label: "Stout" }],
  brandId: "hazy",
  brand: "Hazy IPA",
  brandOptions: [{ id: "hazy", label: "Hazy IPA" }, { id: "pils", label: "Pils" }, { id: "stout", label: "Stout" }],
  plannedBbl: "15",
  date: "2026-09-04",
  today: "2026-09-03",
  note: "Dry hop on day 4",
};

/** The fermentation stages the Brew day and Prep frames list under Later, in cellar. */
const cellarStages: FermentationStage[] = [
  { name: "Primary", kind: "primary", tempF: 68, days: 4 },
  { name: "Cold crash", kind: "cold crash", tempF: 34, days: 2 },
];

export const brewDayHazy: BrewDayViewModel = {
  sources: [{ material_id: "malt", material_name: "Pale malt", unit: "lb", location_id: "brewery", location_name: "Brewery", bin_id: "stock", bin_name: "Stock", lot_id: "malt-lot", lot_code: "M-24", qty: 800 }],
  actuals: [{ key: "malt", source: "malt/brewery/stock/malt-lot", stage: "mash", qty: "660" }], process: { knockoutTempF: "68" },
  plan: {
    recipe: "Hazy v4",
    version: { boil_minutes: 60, whirlpool_temp_f: 180, whirlpool_minutes: 20, knockout_temp_f: 66, fermentation_schedule: cellarStages },
    ingredients: [
      { id: "malt", material_id: "malt", materialName: "Pale malt", unit: "lb", stage: "mash", per_bbl_qty: 45.2 },
      { id: "dry-hop", material_id: "citra", materialName: "Citra", unit: "lb", stage: "dry_hop", per_bbl_qty: 1.2, timing_minutes: 4 * 1440 },
    ],
  },
  title: "B-0416 · Hazy",
  lots: [
    { key: "malt", title: "2-row", detail: "lot L-0821 · 660 lb" },
    { key: "citra", title: "Citra · boil", detail: "lot L-0790 · 6 lb" },
    { key: "yeast", title: "Yeast", detail: "WLP066 · lot Y-0312 · 1 brink" },
  ],
  vesselId: "fv2",
  initialBbl: "14.6",
  brewedOn: "2026-09-04",
  vessels: [{ id: "fv2", name: "FV2", kind: "fermenter", capacity_bbl: 15 }, { id: "fv1", name: "FV1", kind: "fermenter", capacity_bbl: 15 }],
  sheet: { title: "Brew sheet · Hazy IPA v4", detail: "mash 3 steps · whirlpool 20 min · read only" },
  tapeHead: [
    ["Start B-0416 · Hazy IPA v4", ""],
    ["Consume additions", "named material lots"],
  ],
};

export const brewDayTurnsHazy: BrewDayViewModel = {
  ...brewDayHazy, recorded: true, plannedBbl: 20, today: "2026-09-06", initialBbl: "14.6", vesselName: "FV2",
  vessels: [{ id: "fv2", name: "FV2", kind: "fermenter", capacity_bbl: 20 }],
  records: [1, 2].map(turn => ({
    id: `hazy-turn-${turn}`, turn, initial_bbl: 7.3, brewed_on: `2026-09-0${turn + 3}`, created_at: `2026-09-0${turn + 3}`,
    corrects_id: null, correction_reason: null, plan_snapshot: brewDayHazy.plan!, process: { knockoutTempF: 68 }, additions: [],
  })),
};

/** BAT-202 Quarry #6 v1, 22 bbl: its mash, boil and whirlpool ingredients, each starting at plan. */
const quarryIngredients: BrewIngredient[] = ([
  { key: "malted-oats", name: "Malted Oats", materialId: "malted-oats", stage: "mash", plan: 1650, unit: "lb", packSize: 55, source: { lot: "MO-2611", bin: "Malt room / A2", materialId: "malted-oats", locationId: "malt-room", binId: "a2", lotId: "mo-2611" } },
  { key: "pilsen", name: "Fieldstone Pilsen", materialId: "pilsen", stage: "mash", plan: 400, unit: "lb", packSize: 50, source: { lot: "BP-0918", bin: "Malt room / A1", materialId: "pilsen", locationId: "malt-room", binId: "a1", lotId: "bp-0918" } },
  { key: "chit", name: "Chit Malt", materialId: "chit", stage: "mash", plan: 220, unit: "lb", packSize: 50, source: null },
  { key: "rolled-oats", name: "Rolled Oats", materialId: "rolled-oats", stage: "mash", plan: 200, unit: "lb", packSize: 50, source: { lot: null, bin: "Dry storage / D1", materialId: "rolled-oats", locationId: "dry-storage", binId: "d1", lotId: null } },
  { key: "white-wheat", name: "Fieldstone White Wheat", materialId: "white-wheat", stage: "mash", plan: 200, unit: "lb", packSize: 50, source: { lot: "WW-0822", bin: "Malt room / A3", materialId: "white-wheat", locationId: "malt-room", binId: "a3", lotId: "ww-0822" } },
  { key: "crystals", name: "Brewer’s Crystals", materialId: "crystals", stage: "boil", plan: 110, unit: "lb", packSize: 55, source: { lot: "BC-0710", bin: "Dry storage / D2", materialId: "crystals", locationId: "dry-storage", binId: "d2", lotId: "bc-0710" } },
  { key: "nelson", name: "Valley Hops Nelson Sauvin 2026", materialId: "nelson", stage: "whirlpool", plan: 44, unit: "lb", packSize: 44, source: { lot: "NS-26-114", bin: "Hop freezer / F1", materialId: "nelson", locationId: "hop-freezer", binId: "f1", lotId: "ns-26-114" } },
] satisfies Omit<BrewIngredient, "packs" | "loose">[]).map(startAtPlan);

const quarryVessels = [1, 2, 3, 4, 5, 6].map(n => ({ id: `fv${n}`, name: `FV${n}`, kind: "fermenter", capacity_bbl: 25.5 }));

/** Quarry's plan after knockout at 22 bbl: its stages, a yeast pitch on day 0 and a dry hop on day 4. */
const quarryLater = cellarPlanRows({
  version: { fermentation_schedule: cellarStages },
  ingredients: [
    { id: "yeast", material_id: "yeast", materialName: "House ale yeast", unit: "each", stage: "fermentation", per_bbl_qty: 0.1, timing_minutes: 0 },
    { id: "dry-hop", material_id: "nelson", materialName: "Valley Hops Nelson Sauvin 2026", unit: "lb", stage: "dry_hop", per_bbl_qty: 1.2, timing_minutes: 4 * 1440 },
  ],
}, 22);

/** Prep mid-pull: Fieldstone Pilsen came up 7.5 sacks, so it reads short. */
export const brewPrepQuarry: BrewPrepViewModel = {
  title: "BAT-202 · Quarry #6 v1 · 22 bbl",
  planned: "22 bbl · Oct 22, 2026",
  vesselId: "fv3",
  vessels: quarryVessels,
  ingredients: quarryIngredients.map(row => row.key === "pilsen" ? { ...row, packs: "7.5", loose: "0" } : row),
  later: quarryLater,
};

/** Chit Malt sits in two bins, so Prep could not pick its source alone: Edit offers both. */
const chitStock = [
  { material_id: "chit", material_name: "Chit Malt", unit: "lb", location_id: "malt-room", location_name: "Malt room", bin_id: "a4", bin_name: "A4", lot_id: "cm-0907", lot_code: "CM-0907", qty: 150 },
  { material_id: "chit", material_name: "Chit Malt", unit: "lb", location_id: "malt-room", location_name: "Malt room", bin_id: "a5", bin_name: "A5", lot_id: "cm-1002", lot_code: "CM-1002", qty: 300 },
];

/** The stock behind each sourced line, so a confirmed row reads green (timelineTone checks it against stock). */
const lineStock = quarryIngredients.flatMap(row => row.source ? [{
  material_id: row.materialId, material_name: row.name, unit: row.unit, location_id: row.source.locationId, location_name: row.source.bin.split(" / ")[0],
  bin_id: row.source.binId, bin_name: row.source.bin.split(" / ")[1], lot_id: row.source.lotId, lot_code: row.source.lot, qty: 2000,
}] : []);

/** The recipe's one water addition, 40 g of gypsum in the mash, stocked in grams in one bin. */
const gypsumStock = [{ material_id: "gypsum", material_name: "Gypsum", unit: "g", location_id: "dry-storage", location_name: "Dry storage", bin_id: "d3", bin_name: "D3", lot_id: null, lot_code: null, qty: 5000 }];
const quarryWater = waterAdditionRows({ waterAdditions: [{ id: "gypsum-mash", material_id: "gypsum", materialName: "Gypsum", qty: 40, unit: "g", stage: "mash", baseUnit: "g" }] }, gypsumStock).rows;

/** Brew day mid-mash: the first two mash rows confirmed, so Mash is the open stage on a phone; the gypsum row waits. */
export const brewTimelineQuarry: BrewTimelineViewModel = {
  title: brewPrepQuarry.title,
  planned: brewPrepQuarry.planned,
  sources: [...lineStock, ...chitStock, ...gypsumStock],
  ingredients: [...brewPrepQuarry.ingredients.map(row => ({ ...row, confirmed: row.key === "malted-oats" || row.key === "pilsen" })), ...quarryWater],
  targets: { mash: "152 °F · 60 min · pH 5.3", lauter: "pre-boil 25 bbl", boil: "60 min", whirlpool: "180 °F · 20 min", knockout: "66 °F" },
  later: quarryLater,
  process: { mashWaterGal: "620", targetMashPh: "5.3" },
  vesselId: "fv3",
  vessels: quarryVessels,
  initialBbl: "22",
  brewedOn: "2026-10-22",
};

export const vesselFv3: VesselDetailViewModel = {
  title: "FV3",
  occupancy: { title: "Stout · BATCH-0168", detail: "13.5 / 15 bbl · 90% full", warning: true },
  readings: {
    current: "5.2 °P · 68.2 °F · overdue 31 h",
    history: [
      { key: "r1", title: "Sep 2, 2026, 7:10 AM", detail: "5.2 °P · 68.2 °F", who: "Dana" },
      { key: "r2", title: "Sep 1, 2026, 7:04 AM", detail: "6.8 °P · 67.9 °F", who: "Ali" },
      { key: "r3", title: "Aug 31, 2026, 6:58 AM", detail: "8.6 °P · 67.5 °F", who: "Dana" },
    ],
  },
  name: "FV3",
  type: "Fermenter",
  typeOptions: ["Fermenter", "Brite", "Barrel", "Kettle", "Other"],
  capacity: "15",
};

/** New vessel before it is filled in: no name, no capacity, and no readings. */
export const vesselNew: VesselDetailViewModel = {
  title: "New vessel",
  name: "",
  type: "Fermenter",
  typeOptions: ["Fermenter", "Brite", "Barrel", "Kettle", "Other"],
  capacity: "",
};

const packagingPlan = {
  revision: "fixture-plan", planned: [{ materialId: "cans", name: "Cans", unit: "each", lotTracked: false, qty: 2832, onHand: 3100, onOrder: 0, short: 0 }],
  materials: [{ id: "cans", name: "Cans", unit: "each", lotTracked: false }], lots: [],
  sources: [{ materialId: "cans", locationId: "warehouse", binId: "dry", lotId: null, qty: 3100 }],
};

export const closePackagingRunHazy: ClosePackagingRunViewModel = {
  title: "RUN-0031 · started",
  closeFields: { bblDrawn: "40", outputs: [{ id: "cases", name: "Hazy cases", qty: "118" }], lotCode: "L-260905-HZ", packagedOn: "2026-09-05", bestBy: "", locationId: "warehouse", binId: "dry",
    locations: [{ id: "warehouse", name: "Warehouse" }], bins: [{ id: "dry", location_id: "warehouse", name: "Dry" }], plan: packagingPlan,
    actuals: [{ key: "cans", materialId: "cans", locationId: "warehouse", binId: "dry", lotId: null, used: "2832", loss: "6", unused: "12" }] },
  source: "FV3 · B-0416",

};

export const runClosedHazy: RunClosedViewModel = {
  title: "RUN-0031 · closed",
  brand: "Hazy IPA",
  source: "FV3 · B-0416",
  plannedOn: "2026-09-04",
  closedAt: "2026-09-05T20:00:00Z",
  records: [{ id: "material-record", created_at: "2026-09-05", corrects_id: null, correction_reason: null, planned: packagingPlan.planned, actuals: [{ material_id: "cans", material_name: "Cans", unit: "each", location_id: "warehouse", location_name: "Warehouse", bin_id: "dry", bin_name: "Dry", lot_id: null, lot_code: null, qty_used: 2832, qty_loss: 6, qty_unused: 12 }] }],
  correction: { plan: packagingPlan, locations: closePackagingRunHazy.closeFields!.locations, bins: closePackagingRunHazy.closeFields!.bins, rows: closePackagingRunHazy.closeFields!.actuals, reason: "" },
  bblDrawn: 40,
  lot: { id: "lot-hazy", code: "L-260905-HZ", packaged_on: "2026-09-05", best_by: null },
  outputs: [{ sku_id: "cases", sku_name: "Hazy cases", qty_actual: 118 }],
  timeZone: DEMO_TIME_ZONE,
};

/** The brands a recipe can be brewed toward: what the Brand pick in Recipe's sentence offers. */
const recipeBrandOptions = [{ id: "hazy", name: "Hazy IPA" }, { id: "pils", name: "Pils" }, { id: "stout", name: "Stout" }];

/** list_recipes rows, drawn by the live adapter: two written recipes, and one saved by name with no sheet yet. */
export const recipesList: RecipesSnapshot = {
  recipes: [
    { id: "hazy", name: "Hazy IPA", brand: "Hazy IPA", latest_version: 4 },
    { id: "pils", name: "Pils", brand: "Pils", latest_version: 3 },
    { id: "saison", name: "Farmhouse saison", brand: null, latest_version: null },
  ],
};

/** The drawn mash schedule, in the shape create_recipe_version stores. The
 *  Recipe row, the Mash schedule frame and its footer all read it, so the total
 *  and the conversion rest never disagree. */
export const MASH_STEPS: MashStep[] = [
  { name: "Mash-in", kind: "infusion", tempF: 104, minutes: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 },
  { name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 },
];

/** The drawn fermentation schedule. Same rule as MASH_STEPS. */
export const FERM_STAGES: FermentationStage[] = [
  { name: "Primary", kind: "primary", tempF: 68, days: 4 },
  { name: "Diacetyl rest", kind: "diacetyl rest", tempF: 72, days: 2 },
  { name: "Cold crash", kind: "cold crash", tempF: 34, days: 2 },
  { name: "Conditioning", kind: "conditioning", tempF: 34, days: 10 },
];

/** The drawn water for a 22 bbl batch: Denver source, Hazy target, a suggestion the brewer trimmed by hand so Calcium and Chloride warn; Bicarbonate warns too, since salts only add ions and Denver starts 70 ppm over the target. */
export const WATER_HAZY: WaterDraft = {
  targetProfileId: "hazy", sourceProfileId: "denver", mashGal: "450", spargeGal: "600", targetMashPh: "5.35",
  additions: [{ materialId: "gypsum", qty: 200, unit: "g", stage: "mash" }, { materialId: "cacl", qty: 300, unit: "g", stage: "mash" }, { materialId: "lactic", qty: 150, unit: "mL", stage: "sparge" }],
};

/** The names of WATER_HAZY's additions, as list_materials would give them to the recipe page. */
const WATER_HAZY_NAMES: Record<string, string> = { gypsum: "Gypsum", cacl: "Calcium chloride", lactic: "Lactic acid" };

/** Hazy IPA's brewed batches as get_recipe_outcomes returns them: two closed on the current copy (4), then two on the copy
 *  before it (3), which assumed more efficiency. Batch actuals and As brewed are computed from these. */
const HAZY_V4 = { version: 4, closed: true, predicted: { ogPlato: 15.2, fgPlato: 3.5, abv: 6.3 }, assumedEfficiency: 0.72, assumedAttenuation: 0.78 };
const HAZY_V3 = { ...HAZY_V4, version: 3, predicted: { ogPlato: 15.6, fgPlato: 3.6, abv: 6.5 }, assumedEfficiency: 0.74 };
const HAZY_OUTCOMES: RecipeOutcome[] = [
  { ...HAZY_V4, batchId: "b-0413", batchNo: 413, brewedOn: "2026-10-03", ogPlato: 14.8, fgPlato: 3.5, abv: 6.1, apparentAttenuation: 0.77, brewhouseEfficiency: 0.68 },
  { ...HAZY_V4, batchId: "b-0398", batchNo: 398, brewedOn: "2026-09-12", ogPlato: 15.1, fgPlato: 3.4, abv: 6.3, apparentAttenuation: 0.78, brewhouseEfficiency: 0.71 },
  { ...HAZY_V3, batchId: "b-0371", batchNo: 371, brewedOn: "2026-07-18", ogPlato: 15.0, fgPlato: 3.6, abv: 6.1, apparentAttenuation: 0.77, brewhouseEfficiency: 0.7 },
  { ...HAZY_V3, batchId: "b-0356", batchNo: 356, brewedOn: "2026-06-27", ogPlato: 14.9, fgPlato: 3.5, abv: 6.1, apparentAttenuation: 0.77, brewhouseEfficiency: 0.69 },
];

type HazyMaterial = Pick<RecipeMaterial, "base_uom" | "purchase_uom_factor" | "pack_name"> & { alphaAcid?: number };
/** A hop sold in 44 lb boxes, and a material with no pack. */
const boxed = (alphaAcid: number): HazyMaterial => ({ base_uom: "lb", purchase_uom_factor: 44, pack_name: "box", alphaAcid });
const loose = (base_uom: string, alphaAcid?: number): HazyMaterial => ({ base_uom, purchase_uom_factor: 1, pack_name: null, alphaAcid });

/** Hazy IPA's lines with each material's pack and alpha acid, as get_recipe and list_materials give them. At the
 *  recipe's 22 bbl the 2-row is 18 bags of 55 lb and the oats 4 packs of 50 lb, sold by no word. Citra and Mosaic come
 *  in 44 lb boxes: the whirlpool and dry hop lines are whole boxes, and the 10 minute Citra is not, so it offers Round.
 *  Magnum and Biofine have no pack, so they read in their unit.
 *  The yeast is counted in "each" and sold by the pitch. `timing` is minutes, so day 3 is 3 × 1440. */
const HAZY_LINES: { key: string; title: string; stage: IngredientStage; timing: number | null; perBbl: number; material: HazyMaterial }[] = [
  { key: "malt", title: "2-row", stage: "mash", timing: null, perBbl: 45, material: { base_uom: "lb", purchase_uom_factor: 55, pack_name: "bag" } },
  { key: "oats", title: "Flaked oats", stage: "mash", timing: null, perBbl: 9.090909, material: { base_uom: "lb", purchase_uom_factor: 50, pack_name: null } },
  { key: "bitter", title: "Magnum", stage: "boil", timing: 60, perBbl: 0.1, material: loose("lb", 14) },
  { key: "boil", title: "Citra", stage: "boil", timing: 10, perBbl: 0.4, material: boxed(12.5) },
  { key: "wp-citra", title: "Citra", stage: "whirlpool", timing: null, perBbl: 2, material: boxed(12.5) },
  { key: "yeast", title: "House ale yeast", stage: "fermentation", timing: 0, perBbl: 0.045455, material: { base_uom: "each", purchase_uom_factor: 1, pack_name: "pitch" } },
  { key: "dh-citra", title: "Citra", stage: "dry_hop", timing: 3 * 1440, perBbl: 4, material: boxed(12.5) },
  { key: "dh-mosaic", title: "Mosaic", stage: "dry_hop", timing: 3 * 1440, perBbl: 2, material: boxed(11.5) },
  { key: "fining", title: "Biofine", stage: "packaging", timing: null, perBbl: 0.090909, material: loose("L") },
];
const HAZY_SHARES = gristShares(HAZY_LINES.map((l) => ({ stage: l.stage, perBbl: l.perBbl, unit: l.material.base_uom })));
/** The IBU get_recipe would read from the hop lines, with the alpha acid frozen at the save. The page text is computed from it. */
const HAZY_IBU = recipeIbu({
  ogPlato: HAZY_V4.predicted.ogPlato,
  lines: HAZY_LINES.flatMap((l) => (l.material.alphaAcid === undefined ? [] : [{ name: l.title, category: "hop", unit: l.material.base_uom, alphaAcid: l.material.alphaAcid, stage: l.stage, perBblQty: l.perBbl, timingMinutes: l.timing }])),
});

/** Hazy IPA as saved (its fourth copy underneath, which the page never names), with no unsaved change. */
export const recipeHazyV4: RecipeViewModel = {
  title: "Hazy IPA",
  // The saved date, then that save's change note.
  saved: "Aug 28, 2026 · Whirlpool hard, knock out cold",
  recipeNote: "The flagship. Keep it soft and juicy.",
  brand: { value: "hazy", options: [{ value: "", label: "No brand yet" }, ...recipeBrandOptions.map((b) => ({ value: b.id, label: b.name }))] },
  priceGroup: "3",
  priceGroupOptions: ["Not decided", "1", "2", "3", "4", "5", "6", "7", "8"],
  // Each line is built as the live page builds it: its cells, its pack and, for a mash line, its share of the grain bill.
  ingredients: HAZY_LINES.map((l, i) => ({
    key: l.key, title: l.title, ...ingredientCells(l.stage, l.timing, l.perBbl, l.material.base_uom),
    pack: ingredientPack(l.perBbl, l.material), share: HAZY_SHARES[i],
  })),
  batchBbl: "22",
  preBoil: "24.5",
  boilMin: "60",
  whirlpoolMin: "20",
  whirlpoolTemp: "180",
  whirlpoolRest: "10",
  knockoutTemp: "65",
  efficiency: "72",
  attenuation: "78",
  // The schedules and the water the band, the cellar profile and the rows are drawn from; the Mash schedule, Fermentation schedule and Water frames edit them.
  mashSchedule: MASH_STEPS,
  fermentationSchedule: FERM_STAGES,
  water: waterFacts(WATER_HAZY, waterProfiles, (id) => WATER_HAZY_NAMES[id]),
  ...(({ figures, notes }) => ({ figures, figureNotes: notes }))(figureStrip({ ...HAZY_V4.predicted, ibu: HAZY_IBU }, "plato", { saved: true })),
  actuals: outcomeTable(HAZY_OUTCOMES, "plato", HAZY_V4),
  actualsNote: outcomeSummary(HAZY_OUTCOMES, 4),
  // The inventory's rows open nothing by address; the Recipe record's `to` says where a tap goes.
  history: recipeHistory(HAZY_OUTCOMES, 4, 4).map((row) => ({ ...row, href: undefined })),
};
export const cellarTransferPils = {
  fromId: "fv1-occupancy", toId: "bt1", volume: "3.0", loss: "",
  occupancies: [
    { occupancy_id: "fv1-occupancy", vessel_id: "fv1", vessel_name: "FV1", brand_name: "Pils", batch_no: 409, bbl: 12.8 },
    { occupancy_id: "fv2-occupancy", vessel_id: "fv2", vessel_name: "FV2", brand_name: "Hazy IPA", batch_no: 416, bbl: 14.6 },
    { occupancy_id: "bt1-occupancy", vessel_id: "bt1", vessel_name: "BT1", brand_name: "Pils", batch_no: 412, bbl: 7 },
  ],
  vessels: [{ id: "bt1", name: "BT1", capacity_bbl: 10 }, { id: "bt2", name: "BT2", capacity_bbl: 10 }],
};

export const cellarAdditionCitra = {
  occupancyId: "fv2-occupancy", materialId: "citra", lotId: "l-0790", stage: "dry_hop" as const, qty: "18",
  occupancies: cellarTransferPils.occupancies,
  materials: [
    { id: "citra", name: "Citra", category: "hop", base_uom: "lb", lot_tracked: true },
    { id: "raspberry", name: "Raspberry purée", category: "other", base_uom: "lb", lot_tracked: false },
  ],
  lotsByMaterial: { citra: [{ lot_id: "l-0790", lot_code: "L-0790", qty: 40, received_on: "2026-08-20" }] },
};
