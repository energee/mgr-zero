// lib/mgr/fixtures/production.ts — batch, brew-day, packaging, and recipe
// snapshots. Views own no sample data.
import type { BatchesSnapshot } from "@/lib/mgr/batches-view";
import type { BrewDayViewModel } from "@/lib/mgr/brew-day-view";
import type { ClosePackagingRunViewModel } from "@/lib/mgr/close-packaging-run-view";
import type { RecipeViewModel } from "@/lib/mgr/recipe-view";
import type { RecipesSnapshot } from "@/lib/mgr/recipes-view";
import type { RunClosedViewModel } from "@/lib/mgr/run-closed-view";
import type { ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";
import type { VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";

export const batchesBrewer: BatchesSnapshot = {
  title: "Work",
  subtitle: "brewer default",
  planned: [
    { key: "b0416", title: "B-0416 · Hazy IPA v4", detail: "Fri 9/4 · 15 bbl", verb: "Start", tone: "info" },
  ],
  active: [
    { key: "b0409", title: "B-0409 · Pils", detail: "FV1 · 1.9 °P · read 4 h ago", verb: "Reading", tone: "info" },
    { key: "b0413", title: "B-0413 · Stout", detail: "FV3 · reading overdue 31 h", verb: "Reading", tone: "info", warning: true },
  ],
};

export const scheduleBatchHazy: ScheduleBatchViewModel = {
  title: "B-0416 · Hazy",
  recipeId: "hazy-v4",
  recipe: "Hazy IPA v4",
  recipeOptions: [{ id: "hazy-v4", label: "Hazy IPA v4" }, { id: "pils-v3", label: "Pils v3" }, { id: "stout-v2", label: "Stout v2" }],
  brandId: "hazy",
  brand: "Hazy IPA",
  brandOptions: [{ id: "hazy", label: "Hazy IPA" }, { id: "pils", label: "Pils" }, { id: "stout", label: "Stout" }],
  plannedBbl: "15",
  date: "2026-09-04",
  note: "Dry hop on day 4",
};

export const brewDayHazy: BrewDayViewModel = {
  title: "B-0416 · Hazy",
  lots: [
    { key: "malt", title: "2-row", detail: "lot L-0821 · 660 lb" },
    { key: "citra", title: "Citra · boil", detail: "lot L-0790 · 6 lb" },
    { key: "yeast", title: "Yeast", detail: "WLP066 · lot Y-0312 · 1 brink" },
  ],
  knockoutFrom: "14.6 bbl",
  knockoutTo: "FV2",
  sheet: { title: "Brew sheet · Hazy IPA v4", detail: "mash 3 steps · whirlpool 20 min · read only" },
  tapeHead: [
    ["Start B-0416 · Hazy IPA v4", ""],
    ["Consume additions", "named material lots"],
  ],
};

export const vesselFv3: VesselDetailViewModel = {
  title: "FV3",
  occupancy: { title: "Stout · BATCH-0168", detail: "13.5 / 15 bbl · 90% full", verb: "Open batch", warning: true },
  currentReading: "5.2 °P · 68.2 °F · overdue 31 h",
  history: [
    { key: "r1", title: "9/02 · 7:10 AM", detail: "5.2 °P · 68.2 °F", who: "Dana" },
    { key: "r2", title: "9/01 · 7:04 AM", detail: "6.8 °P · 67.9 °F", who: "Ali" },
    { key: "r3", title: "8/31 · 6:58 AM", detail: "8.6 °P · 67.5 °F", who: "Dana" },
  ],
  name: "FV3",
  type: "Fermenter",
  typeOptions: ["Fermenter", "Brite", "Barrel", "Kettle", "Other"],
  capacity: "15",
};

export const closePackagingRunHazy: ClosePackagingRunViewModel = {
  title: "RUN-0031 · started",
  source: "FV3 · B-0416",
  needRows: [
    ["cans 2,880", "3,100", "0"],
    ["ends 2,880", "2,400", "480"],
    ["labels 2,880", "5,000", "0"],
  ],
  shortNote: "480 ends short · resolve or explicitly override before starting.",
  packaged: "118 cases",
  lot: "L-240905-HZ",
  lotOptions: ["L-240905-HZ", "new lot"],
  destination: "Warehouse · selected",
  destinationOptions: ["Warehouse · selected", "Taproom"],
  labelsDamaged: "6",
  endsDamaged: "0",
  writeOff: "Warehouse · packaging bin",
  writeOffOptions: ["Warehouse · packaging bin", "Cellar · packaging bin"],
  tape: [
    ["FV3 · B-0416", "source checked"],
    ["+118 cases · production in", "Warehouse · new lot"],
    ["−2,832 cans + ends · consumption", "derived from 118 cases"],
    ["−6 labels · damage", "Warehouse · packaging bin"],
    ["Beer loss · 0.30 bbl", "yield 97.9%"],
  ],
};

export const runClosedHazy: RunClosedViewModel = {
  title: "RUN-0031 · closed",
  lot: "L-240905-HZ",
  output: "118 cases · Warehouse",
  yield: "97.9% · 0.30 bbl loss",
};

export const recipesList: RecipesSnapshot = {
  rows: [
    { key: "hazy", title: "Hazy IPA v4", detail: "IPA · 15 bbl · updated Aug 28", verb: "Review", tone: "primary" },
    { key: "pils", title: "Pils v3", detail: "German pils · 15 bbl · updated Aug 21", verb: "Review", tone: "primary" },
    { key: "stout", title: "Stout v2", detail: "Stout · draft version", verb: "Finish", tone: "primary", warning: true },
  ],
};

export const recipeHazyV4: RecipeViewModel = {
  title: "Hazy IPA v4",
  parent: { title: "Recipe parent · Hazy IPA · IPA", detail: "name and style only" },
  priceGroup: "3",
  priceGroupOptions: ["Not decided", "1", "2", "3", "4", "5", "6", "7", "8"],
  scaleIndex: 1,
  ingredients: [
    { key: "malt", title: "2-row", detail: "mash · 44 lb / bbl", qty: "660 lb" },
    { key: "boil", title: "Citra", detail: "boil · 10 min · 0.4 lb / bbl", qty: "6 lb" },
    { key: "dh", title: "Citra", detail: "dry hop · day 4 · 1.2 lb / bbl", qty: "18 lb" },
  ],
  preBoil: "16.8",
  boilMin: "60",
  whirlpoolMin: "20",
  whirlpoolTemp: "180",
  whirlpoolRest: "10",
  knockoutTemp: "65",
  efficiency: "72",
  attenuation: "78",
  mash: { title: "Mash schedule · 3 steps", detail: "152 °F saccharification rest" },
  fermentation: { title: "Fermentation schedule · 4 stages", detail: "18 days · dry hop day 4 in Primary" },
  water: { title: "Water · Municipal Denver to Hazy target", detail: "3 salts and acids" },
  notes: "Whirlpool hard, knock out cold.",
  predicted: "Predicted: OG 15.2 °P · FG 3.3 °P · ABV 6.5%",
  tape: [
    ["B-0413 · OG 14.8 · FG 3.5 · ABV 6.0%", "eff 68% · att 76%"],
    ["B-0398 · OG 15.1 · FG 3.4 · ABV 6.3%", "eff 71% · att 77%"],
  ],
  actualsNote: "Actuals run −0.4 °P OG vs predicted (eff 68–71% vs 72% assumed). Lower the assumption on v5?",
};
