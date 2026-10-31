// lib/mgr/fixtures/production.ts — batch, brew-day, packaging, and recipe
// snapshots. Views own no sample data.
import type { BatchesSnapshot } from "@/lib/mgr/batches-view";
import type { BrewDayViewModel } from "@/lib/mgr/brew-day-view";
import { startAtPlan, waterAdditionRows, type BrewIngredient, type BrewPrepViewModel, type BrewTimelineViewModel } from "@/lib/mgr/brew-prep-view";
import type { ClosePackagingRunViewModel } from "@/lib/mgr/close-packaging-run-view";
import type { RecipeViewModel } from "@/lib/mgr/recipe-view";
import type { RecipesSnapshot } from "@/lib/mgr/recipes-view";
import type { RunClosedViewModel } from "@/lib/mgr/run-closed-view";
import { DEMO_TIME_ZONE } from "@/lib/mgr/fixtures/settings";
import type { ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";
import type { VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";
import type { CellarMapViewModel } from "@/lib/mgr/cellar-map-view";
import { fermentationSummary, ingredientDetail, mashRowSummary, waterRowSummary, type FermentationStage, type MashStep, type WaterDraft } from "@/lib/mgr/recipe-process-view";
import { plural } from "@/lib/mgr/plural";
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
  recipe: "Hazy IPA v4",
  recipeOptions: [{ id: "hazy-v4", label: "Hazy IPA v4" }, { id: "pils-v3", label: "Pils v3" }, { id: "stout-v2", label: "Stout v2" }],
  brandId: "hazy",
  brand: "Hazy IPA",
  brandOptions: [{ id: "hazy", label: "Hazy IPA" }, { id: "pils", label: "Pils" }, { id: "stout", label: "Stout" }],
  plannedBbl: "15",
  date: "2026-09-04",
  today: "2026-09-03",
  note: "Dry hop on day 4",
};

export const brewDayHazy: BrewDayViewModel = {
  sources: [{ material_id: "malt", material_name: "Pale malt", unit: "lb", location_id: "brewery", location_name: "Brewery", bin_id: "stock", bin_name: "Stock", lot_id: "malt-lot", lot_code: "M-24", qty: 800 }],
  actuals: [{ key: "malt", source: "malt/brewery/stock/malt-lot", stage: "mash", qty: "660" }], process: { knockoutTempF: "68" },
  plan: { recipe: "Hazy v4", ingredients: [{ id: "malt", material_id: "malt", materialName: "Pale malt", unit: "lb", stage: "mash", per_bbl_qty: 45.2 }] },
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

/** BAT-202 Mineral #6 v1, 22 bbl: its mash, boil and whirlpool ingredients, each starting at plan. */
const mineralIngredients: BrewIngredient[] = ([
  { key: "malted-oats", name: "Malted Oats", materialId: "malted-oats", stage: "mash", plan: 1650, unit: "lb", packSize: 55, source: { lot: "MO-2611", bin: "Malt room / A2", materialId: "malted-oats", locationId: "malt-room", binId: "a2", lotId: "mo-2611" } },
  { key: "pilsen", name: "Fieldstone Pilsen", materialId: "pilsen", stage: "mash", plan: 400, unit: "lb", packSize: 50, source: { lot: "BP-0918", bin: "Malt room / A1", materialId: "pilsen", locationId: "malt-room", binId: "a1", lotId: "bp-0918" } },
  { key: "chit", name: "Chit Malt", materialId: "chit", stage: "mash", plan: 220, unit: "lb", packSize: 50, source: null },
  { key: "rolled-oats", name: "Rolled Oats", materialId: "rolled-oats", stage: "mash", plan: 200, unit: "lb", packSize: 50, source: { lot: null, bin: "Dry storage / D1", materialId: "rolled-oats", locationId: "dry-storage", binId: "d1", lotId: null } },
  { key: "white-wheat", name: "Fieldstone White Wheat", materialId: "white-wheat", stage: "mash", plan: 200, unit: "lb", packSize: 50, source: { lot: "WW-0822", bin: "Malt room / A3", materialId: "white-wheat", locationId: "malt-room", binId: "a3", lotId: "ww-0822" } },
  { key: "crystals", name: "Brewer’s Crystals", materialId: "crystals", stage: "boil", plan: 110, unit: "lb", packSize: 55, source: { lot: "BC-0710", bin: "Dry storage / D2", materialId: "crystals", locationId: "dry-storage", binId: "d2", lotId: "bc-0710" } },
  { key: "nelson", name: "Valley Hops Nelson Sauvin 2026", materialId: "nelson", stage: "whirlpool", plan: 44, unit: "lb", packSize: 44, source: { lot: "NS-26-114", bin: "Hop freezer / F1", materialId: "nelson", locationId: "hop-freezer", binId: "f1", lotId: "ns-26-114" } },
] satisfies Omit<BrewIngredient, "packs" | "loose">[]).map(startAtPlan);

const mineralVessels = [1, 2, 3, 4, 5, 6].map(n => ({ id: `fv${n}`, name: `FV${n}`, kind: "fermenter", capacity_bbl: 25.5 }));

/** Prep mid-pull: Fieldstone Pilsen came up 7.5 sacks, so it reads short. */
export const brewPrepMineral: BrewPrepViewModel = {
  title: "BAT-202 · Mineral #6 v1 · 22 bbl",
  planned: "22 bbl · Oct 22, 2026",
  vesselId: "fv3",
  vessels: mineralVessels,
  ingredients: mineralIngredients.map(row => row.key === "pilsen" ? { ...row, packs: "7.5", loose: "0" } : row),
  later: "Fermentation 1 · Dry hop 6",
};

/** Chit Malt sits in two bins, so Prep could not pick its source alone: Edit offers both. */
const chitStock = [
  { material_id: "chit", material_name: "Chit Malt", unit: "lb", location_id: "malt-room", location_name: "Malt room", bin_id: "a4", bin_name: "A4", lot_id: "cm-0907", lot_code: "CM-0907", qty: 150 },
  { material_id: "chit", material_name: "Chit Malt", unit: "lb", location_id: "malt-room", location_name: "Malt room", bin_id: "a5", bin_name: "A5", lot_id: "cm-1002", lot_code: "CM-1002", qty: 300 },
];

/** The stock behind each sourced line, so a confirmed row reads green (timelineTone checks it against stock). */
const lineStock = mineralIngredients.flatMap(row => row.source ? [{
  material_id: row.materialId, material_name: row.name, unit: row.unit, location_id: row.source.locationId, location_name: row.source.bin.split(" / ")[0],
  bin_id: row.source.binId, bin_name: row.source.bin.split(" / ")[1], lot_id: row.source.lotId, lot_code: row.source.lot, qty: 2000,
}] : []);

/** The recipe's one water addition, 40 g of gypsum in the mash, stocked in grams in one bin. */
const gypsumStock = [{ material_id: "gypsum", material_name: "Gypsum", unit: "g", location_id: "dry-storage", location_name: "Dry storage", bin_id: "d3", bin_name: "D3", lot_id: null, lot_code: null, qty: 5000 }];
const mineralWater = waterAdditionRows({ waterAdditions: [{ id: "gypsum-mash", material_id: "gypsum", materialName: "Gypsum", qty: 40, unit: "g", stage: "mash", baseUnit: "g" }] }, gypsumStock).rows;

/** Brew day mid-mash: the first two mash rows confirmed, so Mash is the open stage on a phone; the gypsum row waits. */
export const brewTimelineMineral: BrewTimelineViewModel = {
  title: brewPrepMineral.title,
  planned: brewPrepMineral.planned,
  sources: [...lineStock, ...chitStock, ...gypsumStock],
  ingredients: [...brewPrepMineral.ingredients.map(row => ({ ...row, confirmed: row.key === "malted-oats" || row.key === "pilsen" })), ...mineralWater],
  targets: { mash: "152 °F · 60 min · pH 5.3", lauter: "pre-boil 25 bbl", boil: "60 min", whirlpool: "180 °F · 20 min", knockout: "66 °F" },
  process: { mashWaterGal: "620", targetMashPh: "5.3" },
  vesselId: "fv3",
  vessels: mineralVessels,
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

/** Brands the Create recipe sheet offers; a recipe is brewed toward one, optionally. */
export const recipeBrandOptions = [{ id: "hazy", name: "Hazy IPA" }, { id: "pils", name: "Pils" }, { id: "stout", name: "Stout" }];

/** list_recipes rows, drawn by the live adapter: two with a current version, one saved without one. */
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

/** The drawn water: Denver source, Hazy target, a suggestion the brewer trimmed by hand so Calcium and Chloride warn; Bicarbonate warns too, since salts only add ions and Denver starts 70 ppm over the target. */
export const WATER_HAZY: WaterDraft = {
  targetProfileId: "hazy", sourceProfileId: "denver", mashGal: "9.5", spargeGal: "12.0", targetMashPh: "5.35",
  additions: [{ materialId: "gypsum", qty: 4, unit: "g", stage: "mash" }, { materialId: "cacl", qty: 6, unit: "g", stage: "mash" }, { materialId: "lactic", qty: 3, unit: "mL", stage: "sparge" }],
};

export const recipeHazyV4: RecipeViewModel = {
  title: "Hazy IPA v4",
  saved: "Aug 28, 2026",
  versions: [4, 3, 2, 1].map((number) => ({ number, selected: number === 4, latest: number === 4 })),
  recipeNote: "The flagship. Keep it soft and juicy.",
  priceGroup: "3",
  priceGroupOptions: ["Not decided", "1", "2", "3", "4", "5", "6", "7", "8"],
  // 2-row comes in 50 lb sacks and Citra in 44 lb boxes; the dry hop is a cellar stage, so it has no pack total.
  ingredients: [
    { key: "malt", title: "2-row", detail: ingredientDetail("mash", null, 44, "lb"), qty: "", pack: { perBbl: 44, factor: 50, unit: "lb" } },
    { key: "boil", title: "Citra", detail: ingredientDetail("boil", 10, 0.4, "lb"), qty: "", pack: { perBbl: 0.4, factor: 44, unit: "lb" } },
    { key: "dh", title: "Citra", detail: ingredientDetail("dry_hop", null, 1.2, "lb"), qty: "" },
  ],
  totalsAtBbl: "22",
  preBoil: "16.8",
  boilMin: "60",
  whirlpoolMin: "20",
  whirlpoolTemp: "180",
  whirlpoolRest: "10",
  knockoutTemp: "65",
  efficiency: "72",
  attenuation: "78",
  mash: { title: `Mash schedule · ${plural(MASH_STEPS.length, "step")}`, detail: mashRowSummary(MASH_STEPS) },
  // PR D drops the dry-hop day argument with the dry-hop row.
  fermentation: { title: `Fermentation schedule · ${plural(FERM_STAGES.length, "stage")}`, detail: fermentationSummary(FERM_STAGES, 4) },
  // The live draft's Water row: target and addition count (recipe-version-form.tsx); the Water frame names the source.
  water: { title: "Water", detail: waterRowSummary(waterProfiles.find((p) => p.id === WATER_HAZY.targetProfileId)?.name, WATER_HAZY.additions.length) },
  notes: "Whirlpool hard, knock out cold.",
  predicted: "Predicted: OG 15.2 °P · FG 3.3 °P · ABV 6.5%",
  tape: [
    ["B-0413 · OG 14.8 · FG 3.5 · ABV 6.0%", "eff 68% · att 76%"],
    ["B-0398 · OG 15.1 · FG 3.4 · ABV 6.3%", "eff 71% · att 77%"],
  ],
  actualsNote: "Actuals run −0.4 °P OG vs predicted (eff 68–71% vs 72% assumed). Lower the assumption on v5?",
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
