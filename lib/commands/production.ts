// lib/commands/production.ts — recipes and their immutable versions, the
// vessels beer sits in, and the batches that fill them. A recipe
// is a name; how it is brewed lives on a version, and a version is never
// edited: `create_recipe_version` writes the next one (version = max+1) with
// its ingredients in a single RPC, snapshotting each material's extract
// potential and alpha acid so an old version's predicted gravity and IBU cannot
// move when the material is retyped. A version may also carry the batch size it
// is written for (`batch_bbl`); ingredient amounts stay per barrel, and batch
// amounts are derived from the two. `get_recipe` predicts OG/FG/ABV and IBU
// here in TypeScript (lib/recipe-gravity.ts, lib/recipe-ibu.ts) — the schema
// stores assumptions, never results.
// `get_recipe_outcomes` measures each brewed batch the same way, on read: a
// row per tank for a batch split across several, and beside them the batches
// other recipes brewed on the same grain bill.
import { z } from "zod";
import { historyInput, historyResult, newestFirst, type HistoryRow } from "./history";
import type { VesselReading } from "@/lib/mgr/vessel-detail-view";
import { currentBrewRecords } from "@/lib/mgr/brew-day-view";
import { INGREDIENT_STAGES, scheduleDays, timedInDays, timingLimitMinutes } from "@/lib/mgr/recipe-process-view";
import { gristKey, type RecipeOutcome } from "@/lib/mgr/recipe-view";
import { fermentationReadingInput, fermentationReadingOfflinePolicy, MASH_PH_BOUNDS, READING_BOUNDS } from "@/lib/composer/offline-policy";
import { isoDate, completeRows, defineCommand, defineQuery, inChunks, PAGE_SIZE, unwrap, CommandError, type Ctx, latestOf } from "./registry";
import { brandNames } from "./packaging";
import { measuredGravity, potentialPointsPerBbl, recipeGravity, type RecipeGravityIngredient } from "@/lib/recipe-gravity";
import { recipeIbu, type IbuLine } from "@/lib/recipe-ibu";
import { escapeRegex } from "@/lib/escape-regex";
import { MASH_STEP_KINDS, FERMENTATION_STAGE_KINDS, WATER_ADDITION_STAGES, WATER_ADDITION_UNITS } from "@/lib/mgr/enums";

// The process spec (recipe-builder spec D2, D6, D7). Stored as given; the RPC
// derives mash_temp_f. The option arrays live in lib/mgr/enums.ts so the shared
// views can read them without importing this module and registering every
// command in it.
// Process temperatures share the reading range, so a typo such as -500 °F is refused, not frozen into a recipe version
// or brew record (#1476, #1478).
const processTempF = z.number().min(READING_BOUNDS.tempF.min).max(READING_BOUNDS.tempF.max);
/** A barrel volume stored in numeric(10,3) (#427). */
const bbl = z.number().positive().max(9_999_999.999);
const mashStep = z.object({ name: z.string().trim().min(1).describe("The mash step's name"), kind: z.enum(MASH_STEP_KINDS).describe("The mash step's method"), tempF: processTempF, minutes: z.number().int().positive() });
const fermentationStage = z.object({ name: z.string().trim().min(1).describe("The fermentation stage's name"), kind: z.enum(FERMENTATION_STAGE_KINDS).describe("The fermentation stage's type"), tempF: processTempF, days: z.number().positive() });
const processInput = z.object({
  preBoilBbl: z.number().positive().optional(), whirlpoolMinutes: z.number().int().nonnegative().optional(), whirlpoolTempF: processTempF.optional(),
  whirlpoolRestMinutes: z.number().int().nonnegative().optional(), knockoutTempF: processTempF.optional(),
  // Each version carries its own: one saved without a batch size has none, whatever the version before it had.
  batchBbl: bbl.optional().describe("The batch size this version is written for, in bbl; ingredient amounts stay per barrel"),
});
const waterInput = z.object({
  targetProfileId: z.string().uuid().optional(), sourceProfileId: z.string().uuid().optional(),
  mashGal: z.number().positive().optional(), spargeGal: z.number().nonnegative().optional(), targetMashPh: z.number().min(MASH_PH_BOUNDS.min).max(MASH_PH_BOUNDS.max).optional(),
  additions: z.array(z.object({ materialId: z.string().uuid(), qty: z.number().positive().describe("How much of this water addition, in its unit"), unit: z.enum(WATER_ADDITION_UNITS).describe("The unit of this water addition's qty"), stage: z.enum(WATER_ADDITION_STAGES) })).default([]),
});

// Efficiency and attenuation are fractions (0.75), never percents: the column
// comment says so and recipeGravity multiplies by them directly, so a 75 here
// would predict a hundredfold gravity. (0,1] is the whole legal range.
const fraction = z.number().gt(0).lte(1);

defineCommand({
  name: "create_recipe", description: "Create a recipe: a name, optionally the brand it brews, and a note; its brewing facts live on versions",
  compensation: "Cannot be undone; no command deletes a recipe.",
  input: z.object({ name: z.string().trim().min(1).describe("The recipe's name"), brandId: z.string().uuid().optional(), note: z.string().optional() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_recipe", {
    p_brewery: ctx.breweryId, p_brand: i.brandId ?? null, p_name: i.name, p_note: i.note ?? null,
    p_request_id: execution.requestId,
  })),
});

// A recipe's brand after creation; null clears it. Batches already scheduled
// keep the brand they copied, so nothing downstream is rewritten.
defineCommand({
  name: "set_recipe_brand", description: "Set or clear the brand a recipe brews (a pre-fill for new batches); batches already scheduled keep their brand",
  compensation: "Reverse with set_recipe_brand and the previous brand, or null if there was none.",
  input: z.object({ recipeId: z.string().uuid(), brandId: z.string().uuid().nullable() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_recipe_brand", {
    p_brewery: ctx.breweryId, p_recipe: i.recipeId, p_brand: i.brandId, p_request_id: execution.requestId,
  })),
});

// A recipe's name and note after creation; a null note clears it. Batches and saved copies point at the recipe by id,
// so nothing downstream is rewritten.
defineCommand({
  name: "update_recipe", description: "Change a recipe's name and note; a null note clears it. Its brand, saved versions and batches are not changed",
  compensation: "Reverse with update_recipe and the previous name and note.",
  input: z.object({ recipeId: z.string().uuid(), name: z.string().trim().min(1).describe("The recipe's name"), note: z.string().nullable().describe("The recipe's note; null for none") }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_recipe", {
    p_brewery: ctx.breweryId, p_recipe: i.recipeId, p_name: i.name, p_note: i.note, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "create_recipe_version",
  description: "Add the next version of a recipe: its mash and fermentation schedules, whirlpool/knockout/pre-boil, the batch size it is written for, water and additions, assumptions and ingredients; versions are immutable and snapshot each material's extract potential and alpha acid",
  compensation: "Cannot be undone; versions are immutable, so add a corrected one with create_recipe_version.",
  input: z.object({
    recipeId: z.string().uuid(),
    mashSchedule: z.array(mashStep).min(1),
    fermentationSchedule: z.array(fermentationStage).default([]),
    process: processInput.optional(),
    water: waterInput.optional(),
    brewhouseEfficiency: fraction,
    yeastAttenuation: fraction,
    boilMinutes: z.number().int().positive().optional(),
    targetIbu: z.number().nonnegative().optional(),
    note: z.string().optional(),
    ingredients: z.array(z.object({
      materialId: z.string().uuid(),
      perBblQty: z.number().positive(),
      stage: z.enum(INGREDIENT_STAGES),
      timingMinutes: z.number().int().nonnegative().optional(),
    })).min(1),
  }).superRefine((v, issue) => {
    // Each line's timing stays within its stage's range: the boil time, the fermentation schedule (at least 120 days),
    // or one day; fermentation and dry hop are whole days (#1478). The editor enforces the same timingLimitMinutes.
    const limits = { boilMinutes: v.boilMinutes, fermentationDays: scheduleDays(v.fermentationSchedule) };
    v.ingredients.forEach((line, index) => {
      if (line.timingMinutes === undefined) return;
      const max = timingLimitMinutes(line.stage, limits);
      if (line.timingMinutes > max || (timedInDays(line.stage) && line.timingMinutes % 1440 !== 0)) {
        issue.addIssue({ code: "custom", path: ["ingredients", index, "timingMinutes"], message: timedInDays(line.stage) ? `Enter a whole day from 0 to ${max / 1440}.` : `Enter 0 to ${max} minutes.` });
      }
    });
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_recipe_version", {
    p_brewery: ctx.breweryId, p_recipe: i.recipeId, p_mash_schedule: i.mashSchedule, p_fermentation_schedule: i.fermentationSchedule,
    // Absent keys read as NULL through `p_process ->> key`, so undefined is left as is.
    p_process: {
      pre_boil_bbl: i.process?.preBoilBbl, whirlpool_minutes: i.process?.whirlpoolMinutes, whirlpool_temp_f: i.process?.whirlpoolTempF,
      whirlpool_rest_minutes: i.process?.whirlpoolRestMinutes, knockout_temp_f: i.process?.knockoutTempF, batch_bbl: i.process?.batchBbl,
      target_water_profile_id: i.water?.targetProfileId, source_water_profile_id: i.water?.sourceProfileId,
      mash_water_gal: i.water?.mashGal, sparge_water_gal: i.water?.spargeGal, target_mash_ph: i.water?.targetMashPh,
      water_additions: (i.water?.additions ?? []).map((a) => ({ material_id: a.materialId, qty: a.qty, unit: a.unit, stage: a.stage })),
    },
    p_brewhouse_efficiency: i.brewhouseEfficiency, p_yeast_attenuation: i.yeastAttenuation,
    p_boil_minutes: i.boilMinutes ?? null, p_target_ibu: i.targetIbu ?? null, p_note: i.note ?? null,
    p_ingredients: i.ingredients.map((l) => ({
      material_id: l.materialId, per_bbl_qty: l.perBblQty, stage: l.stage, timing_minutes: l.timingMinutes ?? null,
    })),
    p_request_id: execution.requestId,
  })),
});

// A post-knockout addition (dry hop, fruit, adjunct) against an open
// occupancy: one RPC writes the batch_additions row and its consumption
// movement. Not record_movement (finished goods) and not brew day (knockout).
defineCommand({
  name: "record_batch_addition",
  description: "Add a post-knockout material (dry hop, fruit, adjunct) to an open occupancy: one batch_additions row plus its consumption movement from the bin holding the most of it; lot required when the material is lot-tracked",
  compensation: "Cannot be undone; no command corrects a batch addition.",
  input: z.object({
    occupancyId: z.string().uuid(), materialId: z.string().uuid(), stage: z.enum(INGREDIENT_STAGES),
    qty: z.number().positive().describe("How much was added, in the material's base units"), lotId: z.string().uuid().optional().describe("The material lot added; required when the material is lot-tracked"), note: z.string().optional(),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_batch_addition", {
    p_brewery: ctx.breweryId, p_occupancy: i.occupancyId, p_material: i.materialId, p_stage: i.stage,
    p_lot: i.lotId ?? null, p_qty: i.qty, p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

// Lots with stock left, oldest received first: the Cellar addition sheet's lot
// picker. One call covers every lot-tracked material (the sheet groups by
// material_id); pass materialId to narrow. material_lot_on_hand carries
// staff_read via its base tables, so PostgREST scopes it to the brewery.
defineQuery({
  name: "list_material_lots", description: "Lots with quantity on hand, oldest received first, for one material or all of them",
  input: z.object({ materialId: z.string().uuid().optional() }), roles: ["admin", "brewer", "warehouse"],
  handler: async (ctx, i) => {
    let onHandQ = ctx.db.from("material_lot_on_hand").select("material_id, lot_id, received_on, qty").eq("brewery_id", ctx.breweryId).gt("qty", 0).order("received_on", { nullsFirst: false });
    let lotsQ = ctx.db.from("material_lots").select("id, lot_code").eq("brewery_id", ctx.breweryId);
    if (i.materialId) { onHandQ = onHandQ.eq("material_id", i.materialId); lotsQ = lotsQ.eq("material_id", i.materialId); }
    const [onHand, lots] = await Promise.all([unwrap(onHandQ), unwrap(lotsQ)]);
    const code = new Map((lots ?? []).map((x) => [x.id as string, x.lot_code as string]));
    return (onHand ?? []).map((l) => ({ material_id: l.material_id as string, lot_id: l.lot_id as string, lot_code: code.get(l.lot_id as string) ?? "", qty: Number(l.qty), received_on: l.received_on as string | null }));
  },
});

// Water profiles (Water profiles / Water profile screens): a catalog entity of
// six ions in ppm, plus optional alkalinity as CaCO3, the water's own pH and
// notes (#1205). One upsert creates (no profileId) or edits; an edit writes
// every field, so leaving an optional one out clears it.
const ppm = z.number().nonnegative().max(999_999.9); // numeric(7,1)
defineQuery({
  name: "list_water_profiles", description: "Water profiles, alphabetical: a name, six ions in ppm, and alkalinity as CaCO3, water pH and notes when set",
  input: z.object({}), roles: ["admin", "brewer"],
  handler: (ctx) => unwrap(ctx.db.from("water_profiles")
    .select("id, name, calcium_ppm, magnesium_ppm, sodium_ppm, sulfate_ppm, chloride_ppm, bicarbonate_ppm, alkalinity_ppm, water_ph, note")
    .eq("brewery_id", ctx.breweryId).order("name")),
});
defineCommand({
  name: "upsert_water_profile", description: "Create a water profile, or edit one by profileId: its name, six ions in ppm, and optional alkalinity as CaCO3, water pH and notes",
  compensation: "Reverse an edit with upsert_water_profile and the previous values; a new profile cannot be deleted.",
  input: z.object({
    profileId: z.string().uuid().optional(), name: z.string().trim().min(1).describe("The water profile's name"),
    calciumPpm: ppm, magnesiumPpm: ppm, sodiumPpm: ppm, sulfatePpm: ppm, chloridePpm: ppm, bicarbonatePpm: ppm,
    alkalinityPpm: ppm.optional().describe("Total alkalinity as CaCO3, in ppm"),
    waterPh: z.number().min(0).max(14).optional().describe("The water's own pH, not a recipe's target mash pH"),
    note: z.string().trim().max(2000).optional().describe("Free text; blank stores none"),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_water_profile", {
    p_brewery: ctx.breweryId, p_profile: i.profileId ?? null, p_name: i.name, p_calcium: i.calciumPpm, p_magnesium: i.magnesiumPpm,
    p_sodium: i.sodiumPpm, p_sulfate: i.sulfatePpm, p_chloride: i.chloridePpm, p_bicarbonate: i.bicarbonatePpm,
    p_alkalinity: i.alkalinityPpm ?? null, p_ph: i.waterPh ?? null, p_note: i.note || null, p_request_id: execution.requestId,
  })),
});

// Each recipe carries its latest version (id and number): schedule_batch names
// a *version*, so the batch picker needs it without a get_recipe per recipe.
defineQuery({
  name: "list_recipes", description: "Recipes, alphabetical, with the brand each one brews and its latest version; optionally only those whose name contains q",
  input: z.object({ q: z.string().trim().max(100).optional().describe("Only recipes whose name contains this text") }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    let query = ctx.db.from("recipes").select("id, name, brand_id, note, created_at").eq("brewery_id", ctx.breweryId);
    if (i.q) query = query.regexIMatch("name", escapeRegex(i.q));
    const recipes = (await unwrap(query.order("name"))) ?? [];
    if (recipes.length === 0) return [];
    const versions = (await unwrap(ctx.db.from("recipe_versions").select("id, recipe_id, version")
      .in("recipe_id", recipes.map((r) => r.id as string)).order("version", { ascending: false }))) ?? [];
    const latest = new Map<string, { id: string; version: number }>();
    for (const v of versions) if (!latest.has(v.recipe_id as string)) latest.set(v.recipe_id as string, { id: v.id as string, version: v.version as number });
    return recipes.map((r) => ({
      ...r, latest_version_id: latest.get(r.id as string)?.id ?? null, latest_version: latest.get(r.id as string)?.version ?? null,
    }));
  },
});

// Number() guards the numeric columns against a driver that hands them back as
// strings. A missing extract snapshot is NOT defaulted here — it is passed
// through as null so recipeGravity answers no prediction (null OG/FG/ABV,
// which the page hides) rather than have a made-up potential move the OG.
const num = (v: unknown) => Number(v ?? 0);

type SavedLine = { per_bbl_qty: unknown; extract_snapshot: unknown; stage: string; materials: { base_uom: string } | null };
/** A saved version's lines as recipe-gravity reads them. A null snapshot stays null, so nothing is predicted (#430). */
const gravityLines = (lines: SavedLine[]): RecipeGravityIngredient[] => lines.map((l) => ({
  perBblQty: num(l.per_bbl_qty), extractPotential: l.extract_snapshot == null ? null : num(l.extract_snapshot), stage: l.stage, unit: l.materials?.base_uom,
}));

type SavedHopLine = { per_bbl_qty: unknown; alpha_snapshot: unknown; stage: string; timing_minutes: number | null; materials: { base_uom: string; name: string; category: string } };
/** A saved version's lines as recipe-ibu reads them: the frozen alpha acid, never the material's current one. A null snapshot stays null, so it is a gap. */
const ibuLines = (lines: SavedHopLine[]): IbuLine[] => lines.map((l) => ({
  name: l.materials.name, category: l.materials.category, stage: l.stage, perBblQty: num(l.per_bbl_qty), unit: l.materials.base_uom,
  timingMinutes: l.timing_minutes, alphaAcid: l.alpha_snapshot == null ? null : num(l.alpha_snapshot),
}));

/** Brewing order: stage by stage, as INGREDIENT_STAGES lists them. Boil and whirlpool time counts down to the end of the
 *  stage, so 60 comes before 10; other stages count up from their start. A line with no time closes its stage. Equal lines
 *  compare as 0, so a stable sort keeps them in the brewer's order. */
function byBrewingOrder(a: { stage: string; timing_minutes: number | null }, b: { stage: string; timing_minutes: number | null }) {
  const stages: readonly string[] = INGREDIENT_STAGES;
  if (a.stage !== b.stage) return stages.indexOf(a.stage) - stages.indexOf(b.stage);
  if (a.timing_minutes === null || b.timing_minutes === null) return Number(a.timing_minutes === null) - Number(b.timing_minutes === null);
  return a.stage === "boil" || a.stage === "whirlpool" ? b.timing_minutes - a.timing_minutes : a.timing_minutes - b.timing_minutes;
}

defineQuery({
  name: "get_recipe",
  description: "One recipe with its requested version (latest by default) and the batch size that version is written for when it has one, all version numbers, that version's ingredients in brewing order, the OG/FG/ABV they predict, and its estimated IBU or why there is none",
  input: z.object({ recipeId: z.string().uuid(), version: z.number().int().positive().optional() }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    const versionQuery = ctx.db.from("recipe_versions").select("*").eq("recipe_id", i.recipeId);
    const [recipe, version, versionRows] = await Promise.all([
      unwrap(ctx.db.from("recipes").select("id, name, brand_id, note, created_at")
        .eq("brewery_id", ctx.breweryId).eq("id", i.recipeId).maybeSingle()),
      i.version === undefined
        ? latestOf<{ id: string; version: number; brewhouse_efficiency: number | null; yeast_attenuation: number | null }>(versionQuery, "version")
        : unwrap(versionQuery.eq("version", i.version).maybeSingle()),
      completeRows("Recipe versions", start => ctx.db.from("recipe_versions").select("version", { count: "exact" })
        .eq("recipe_id", i.recipeId).order("version", { ascending: false }).range(start, start + PAGE_SIZE - 1)),
    ]);
    if (!recipe) throw new CommandError("recipe not found", 404, "not_found");
    if (!version && i.version !== undefined) throw new CommandError("recipe version not found", 404, "not_found");
    const versions = versionRows.map((row) => row.version);
    if (!version) return { recipe, version: null, versions, ingredients: [], waterAdditions: [], ogPlato: null, fgPlato: null, abv: null, ibu: recipeIbu({ ogPlato: null, lines: [] }) };

    const [ingredients, waterAdditions] = await Promise.all([
      unwrap(ctx.db.from("recipe_ingredients")
        .select("id, material_id, per_bbl_qty, stage, timing_minutes, sort, extract_snapshot, alpha_snapshot, materials(base_uom, name, category)")
        .eq("recipe_version_id", version.id).order("sort")).then((r) => (r ?? []).sort(byBrewingOrder)),
      unwrap(ctx.db.from("recipe_water_additions").select("material_id, qty, unit, stage").eq("recipe_version_id", version.id).order("sort")).then((r) => r ?? []),
    ]);

    const predicted = recipeGravity({
      brewhouseEfficiency: num(version.brewhouse_efficiency),
      yeastAttenuation: num(version.yeast_attenuation),
      ingredients: gravityLines(ingredients),
    });
    return {
      recipe, version, versions, ingredients, waterAdditions,
      ...(predicted ?? { ogPlato: null, fgPlato: null, abv: null }),
      ibu: recipeIbu({ ogPlato: predicted?.ogPlato ?? null, lines: ibuLines(ingredients) }),
    };
  },
});

// Every brewed batch of a recipe, measured on read, beside the batches other
// recipes brewed on the same grain bill. OG is the first gravity reading and FG
// the last. Knockout sums each turn's current revision, and only a closed batch
// gets it: nothing records how many turns an open batch will have, so turn 1 of
// two would read about half its true efficiency. A cancelled batch never has
// brewed_on (batches check), so that filter covers it.
// A batch split across tanks gets a row per tank, from that tank's readings. It
// is split when two of the tank stays its gravity readings name held beer at the
// same time. A reading taken on the batch names no tank and stays off those
// rows. Its efficiency is the batch's, from the batch's first reading, on every
// row. A batch handed whole from one tank to the next (fermenter to brite) is
// one row, read across both stays: the first stay ended as the second began.
// Two turns into one tank are one stay, so one row.
// The grain bill is matched on each batch's own copy (gristKey). A copy with no
// mash line has no grain bill and matches nothing. Only a copy that a brewed
// batch points at can add a batch, so the mash lines read are those copies' and
// the shown copy's: the key's columns for another recipe's copy, the whole line
// for a copy whose batches are returned. A batch brewed as another recipe is
// read with its first gravity reading alone, and brew records are read for
// closed batches alone. Ceiling: finding those copies reads one column of every
// brewed batch in the brewery on each call, a page per 500 batches. If it
// measures slow, store the key on recipe_versions when a copy is saved and
// filter by it in the query.
const OUTCOME_BATCH = "id, batch_no, planned_bbl, brewed_on, closed_at, recipe_version_id, recipe_version:recipe_versions!inner(recipe_id, version, brewhouse_efficiency, yeast_attenuation, recipe:recipes!inner(name))";
/** A batch brewed as another recipe, with the gravity readings it is measured from: the read keeps only its first. */
const POOLED_BATCH = `${OUTCOME_BATCH}, fermentation_readings(batch_id, occupancy_id, gravity_plato)` as const;
defineQuery({
  name: "get_recipe_outcomes",
  description: "Each brewed batch of a recipe, newest first: OG, FG, ABV, apparent attenuation and brewhouse efficiency from its gravity readings and knockout, beside what its own version predicted and assumed. A batch split across tanks that held beer at the same time comes once per tank, with that tank's vessel name and figures and the batch's efficiency. Also each brewed batch of another recipe whose own version has the same mash lines as the requested version (latest by default), with its recipeName, OG and efficiency and no FG, ABV or attenuation; sameGrainBill marks every batch on that grain bill. A figure is null when an input is missing, and efficiency is null until the batch closes. Computed on read, never stored",
  input: z.object({ recipeId: z.string().uuid(), version: z.number().int().positive().optional().describe("The version whose grain bill other recipes' batches are matched on; the latest by default") }), roles: ["admin", "brewer"],
  handler: async (ctx, i): Promise<{ batches: RecipeOutcome[] }> => {
    const [recipe, versions] = await Promise.all([
      unwrap(ctx.db.from("recipes").select("id").eq("brewery_id", ctx.breweryId).eq("id", i.recipeId).maybeSingle()),
      completeRows("Recipe versions", start => ctx.db.from("recipe_versions").select("id, version", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("recipe_id", i.recipeId).order("version").range(start, start + PAGE_SIZE - 1)),
    ]);
    if (!recipe) throw new CommandError("recipe not found", 404, "not_found");
    // The version whose grain bill is matched: the one asked for, else the latest.
    const shown = i.version === undefined ? versions.at(-1) : versions.find((v) => v.version === i.version);
    if (!shown && i.version !== undefined) throw new CommandError("recipe version not found", 404, "not_found");
    // A recipe with no saved version has no batch.
    if (!shown) return { batches: [] };

    const brewed = <Columns extends string>(columns: Columns) => ctx.db.from("batches").select(columns, { count: "exact" })
      .eq("brewery_id", ctx.breweryId).not("brewed_on", "is", null)
      .order("brewed_on", { ascending: false }).order("batch_no", { ascending: false }).order("id");
    // This recipe's brewed batches, and the copy each brewed batch in the brewery points at.
    const [own, brewedCopies] = await Promise.all([
      completeRows("Batches", start => brewed(OUTCOME_BATCH).eq("recipe_version.recipe_id", i.recipeId).range(start, start + PAGE_SIZE - 1)),
      completeRows("Batches", start => ctx.db.from("batches").select("recipe_version_id", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).not("brewed_on", "is", null).not("recipe_version_id", "is", null)
        .order("id").range(start, start + PAGE_SIZE - 1)),
    ]);
    const ownCopies = new Set(versions.map((v) => v.id));
    const otherCopies = [...new Set(brewedCopies.map((b) => b.recipe_version_id!))].filter((id) => !ownCopies.has(id));

    /** The whole mash lines of these copies, as recipe-gravity reads them. */
    const mashLinesOf = (copies: string[]) => inChunks(copies, chunk => completeRows("Recipe mash lines", start => ctx.db.from("recipe_ingredients")
      .select("recipe_version_id, material_id, per_bbl_qty, extract_snapshot, stage, materials(base_uom)", { count: "exact" })
      .eq("brewery_id", ctx.breweryId).eq("stage", "mash").in("recipe_version_id", chunk).order("id").range(start, start + PAGE_SIZE - 1)));
    // The shown copy and the copies this recipe's batches were brewed from, whole. Another recipe's brewed copy, only
    // what its key needs. Every gravity reading of this recipe's batches.
    const [ownLines, otherKeyLines, ownReadings] = await Promise.all([
      mashLinesOf([...new Set([shown.id, ...own.map((b) => b.recipe_version_id!)])]),
      inChunks(otherCopies, chunk => completeRows("Recipe mash lines", start => ctx.db.from("recipe_ingredients")
        .select("recipe_version_id, material_id, per_bbl_qty", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("stage", "mash").in("recipe_version_id", chunk).order("id").range(start, start + PAGE_SIZE - 1))),
      inChunks(own.map((b) => b.id), chunk => completeRows("Fermentation readings", start => ctx.db.from("fermentation_readings")
        .select("batch_id, occupancy_id, gravity_plato", { count: "exact" }).eq("brewery_id", ctx.breweryId).in("batch_id", chunk)
        .not("gravity_plato", "is", null).order("at").order("id").range(start, start + PAGE_SIZE - 1))),
    ]);
    const keyLines = Map.groupBy([...ownLines, ...otherKeyLines], (line) => line.recipe_version_id);
    const billKey = (versionId: string) => gristKey((keyLines.get(versionId) ?? []).map((line) => ({ materialId: line.material_id, perBbl: num(line.per_bbl_qty) })));
    const shownKey = billKey(shown.id);
    /** This copy has the shown copy's grain bill. A copy with no mash line has none, so it matches nothing. */
    const onShownBill = (versionId: string) => shownKey !== "" && billKey(versionId) === shownKey;
    const sameBill = otherCopies.filter(onShownBill);
    const readingsOf = Map.groupBy(ownReadings, (r) => r.batch_id);
    // The tank stays of this recipe's batches whose gravity was read in more than one.
    const readInSeveral = [...readingsOf.values()].flatMap((taken) => {
      const stays = new Set(taken.flatMap((r) => r.occupancy_id ?? []));
      return stays.size > 1 ? [...stays] : [];
    });

    // The batches other recipes brewed on that grain bill, each with its first gravity reading, and their copies' mash
    // lines. Those tank stays, with each one's vessel and when it held beer.
    const [others, pooledLines, stays] = await Promise.all([
      inChunks(sameBill, chunk => completeRows("Batches", start => brewed(POOLED_BATCH).in("recipe_version_id", chunk)
        .not("fermentation_readings.gravity_plato", "is", null)
        .order("at", { referencedTable: "fermentation_readings" }).order("id", { referencedTable: "fermentation_readings" })
        .limit(1, { referencedTable: "fermentation_readings" }).range(start, start + PAGE_SIZE - 1))),
      mashLinesOf(sameBill),
      inChunks(readInSeveral, chunk => completeRows("Tank stays", start => ctx.db.from("vessel_occupancies")
        .select("id, batch_id, vessel_id, started_at, ended_at, vessels(name)", { count: "exact" }).eq("brewery_id", ctx.breweryId).in("id", chunk)
        .order("id").range(start, start + PAGE_SIZE - 1))),
    ]);
    const bills = Map.groupBy([...ownLines, ...pooledLines], (line) => line.recipe_version_id);
    for (const b of others) readingsOf.set(b.id, b.fermentation_readings);
    // ISO dates sort as text.
    const batches = [...own, ...others].sort((a, b) => b.brewed_on!.localeCompare(a.brewed_on!) || (b.batch_no ?? 0) - (a.batch_no ?? 0));

    const vesselOf = new Map(stays.map((stay) => [stay.id, { id: stay.vessel_id, name: stay.vessels.name }]));
    type Stay = (typeof stays)[number];
    /** `a` began before `b` ended. A stay still open has not ended. */
    const beganBeforeEnd = (a: Stay, b: Stay) => b.ended_at === null || Date.parse(a.started_at) < Date.parse(b.ended_at);
    // Split across tanks: two of the batch's stays held beer at the same time. A whole-batch transfer ends one stay at
    // the instant the next begins, so those two never did.
    const split = new Set([...Map.groupBy(stays, (stay) => stay.batch_id)]
      .filter(([, held]) => held.some((a, n) => held.slice(n + 1).some((b) => beganBeforeEnd(a, b) && beganBeforeEnd(b, a))))
      .map(([batchId]) => batchId));

    // Only a closed batch gets a knockout, so only the closed batches' brew records are read.
    const records = await inChunks(batches.filter((b) => b.closed_at !== null).map((b) => b.id), chunk => completeRows("Brew records", start => ctx.db.from("brew_records")
      .select("id, batch_id, initial_bbl, corrects_id", { count: "exact" }).eq("brewery_id", ctx.breweryId).in("batch_id", chunk)
      .order("id").range(start, start + PAGE_SIZE - 1)));
    const knockouts = new Map<string, number>();
    for (const r of currentBrewRecords(records)) knockouts.set(r.batch_id, (knockouts.get(r.batch_id) ?? 0) + num(r.initial_bbl));

    return {
      batches: batches.flatMap((b): RecipeOutcome[] => {
        const copy = b.recipe_version;
        const ingredients = gravityLines(bills.get(b.recipe_version_id!) ?? []);
        const assumptions = { brewhouseEfficiency: num(copy.brewhouse_efficiency), yeastAttenuation: num(copy.yeast_attenuation) };
        const potential = potentialPointsPerBbl(ingredients);
        const knockoutBbl = knockouts.get(b.id) ?? null;
        /** The figures of one run of gravity readings in time order: the first is the OG, the last the FG. */
        const measure = (gravity: number[]) => {
          const ogPlato = gravity[0] ?? null;
          const fgPlato = gravity.length > 1 ? gravity[gravity.length - 1] : null;
          return { ogPlato, fgPlato, ...measuredGravity({ ogPlato, fgPlato, potentialPointsPerBbl: potential, plannedBbl: num(b.planned_bbl), knockoutBbl }) };
        };
        const taken = readingsOf.get(b.id) ?? [];
        const plato = (rows: typeof taken) => rows.map((r) => num(r.gravity_plato));
        const basis = {
          batchId: b.id, batchNo: b.batch_no, version: copy.version, brewedOn: b.brewed_on!, closed: b.closed_at !== null,
          predicted: recipeGravity({ ...assumptions, ingredients }), assumedEfficiency: assumptions.brewhouseEfficiency, assumedAttenuation: assumptions.yeastAttenuation,
          sameGrainBill: onShownBill(b.recipe_version_id!),
        };
        const batch = measure(plato(taken));
        // Brewed as another recipe: its first reading, the only one read, gives the OG and efficiency. The rest follows
        // that recipe's yeast and fermentation, so it is not measured here.
        if (copy.recipe_id !== i.recipeId) return [{ ...basis, ...batch, recipeName: copy.recipe.name }];
        if (!split.has(b.id)) return [{ ...basis, ...batch }];
        const tanks = Map.groupBy(taken.filter((r) => r.occupancy_id !== null), (r) => vesselOf.get(r.occupancy_id!)!.id);
        // Each tank's own readings; the mash was one, so the efficiency is the batch's.
        return [...tanks.values()].map((inTank) => ({
          ...basis, ...measure(plato(inTank)), brewhouseEfficiency: batch.brewhouseEfficiency, vessel: vesselOf.get(inTank[0].occupancy_id!)!.name,
        }));
      }),
    };
  },
});

// ------------------------------------------------------------ vessels, batches
const VESSEL_KINDS = ["fermenter", "brite", "barrel", "kettle", "other"] as const;

defineCommand({
  name: "upsert_vessel", description: "Create or rename a vessel: its name, kind and capacity. Contents are never stored here — they are derived from the open occupancy",
  compensation: "Reverse an edit with upsert_vessel and the previous values, or remove a new vessel with delete_vessel.",
  input: z.object({
    id: z.string().uuid().optional().describe("The vessel to edit; omit to create one"),
    name: z.string().trim().min(1).describe("The vessel's name"),
    kind: z.enum(VESSEL_KINDS).describe("What type of vessel this is"),
    // Keep historical raw payloads replayable; the RPC enforces new-write
    // precision only after checking the durable request identity.
    capacityBbl: bbl,
  }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_vessel", {
    p_brewery: ctx.breweryId, p_vessel: i.id ?? null, p_name: i.name, p_kind: i.kind,
    p_capacity_bbl: i.capacityBbl, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "delete_vessel", description: "Delete a vessel that never held beer, or retire one with batch history so that history keeps it; a vessel holding beer is refused. The result's retired flag says which",
  compensation: "Cannot be undone; a retired vessel stays retired, so add a replacement with upsert_vessel.",
  input: z.object({ vesselId: z.string().uuid() }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("delete_vessel", {
    p_brewery: ctx.breweryId, p_vessel: i.vesselId, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_vessels", description: "Vessels, alphabetical, with kind and capacity; includes retired vessels when retired is true",
  input: z.object({ retired: z.boolean().optional() }), roles: ["admin", "brewer"],
  handler: (ctx, i) => {
    const query = ctx.db.from("vessels").select("id, name, kind, capacity_bbl, active").eq("brewery_id", ctx.breweryId);
    return unwrap((i.retired ? query : query.eq("active", true)).order("name"));
  },
});

// Scheduling is intent: both the brand and the recipe version are optional, and
// they are not cross-checked against each other — a recipe may be brand-less,
// and a batch's identity is only required at packaging.
defineCommand({
  name: "schedule_batch", description: "Pencil a brew day into the calendar: planned date and volume, optionally the brand it is meant to become and the recipe version to brew",
  compensation: "Reverse with cancel_batch.",
  input: z.object({
    intendedBrandId: z.string().uuid().optional(),
    recipeVersionId: z.string().uuid().optional(),
    plannedOn: isoDate,
    plannedBbl: bbl,
    note: z.string().optional(),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("schedule_batch", {
    p_brewery: ctx.breweryId, p_brand: i.intendedBrandId ?? null, p_recipe_version: i.recipeVersionId ?? null,
    p_planned_on: i.plannedOn, p_planned_bbl: i.plannedBbl, p_note: i.note ?? null,
    p_request_id: execution.requestId,
  })),
});

const brewActual = z.object({
  materialId: z.string().uuid(), recipeIngredientId: z.string().uuid().optional(), stage: z.enum(INGREDIENT_STAGES),
  locationId: z.string().uuid(), binId: z.string().uuid(), lotId: z.string().uuid().nullable().optional().describe("The material lot used; null or omitted for an untracked material"),
  qty: z.number().positive().multipleOf(0.0001).describe("How much was used, in the material's base units"),
});
const brewProcess = processInput.extend({
  boilMinutes: z.number().int().nonnegative().optional(), mashWaterGal: z.number().positive().optional(),
  spargeWaterGal: z.number().nonnegative().optional(), targetMashPh: z.number().min(MASH_PH_BOUNDS.min).max(MASH_PH_BOUNDS.max).optional(),
});
// A Prep pull is a brew actual before brew day: no stage, and zero is allowed
// (nothing pulled yet).
const brewPull = brewActual.omit({ stage: true }).extend({ qty: z.number().nonnegative().multipleOf(0.0001).describe("How much is pulled, in the material's base units; 0 means nothing yet") });
function brewPullRow(a: z.infer<typeof brewPull>) {
  return { material_id: a.materialId, recipe_ingredient_id: a.recipeIngredientId ?? null,
    location_id: a.locationId, bin_id: a.binId, lot_id: a.lotId ?? null, qty: a.qty };
}
function brewActualRows(actuals: z.infer<typeof brewActual>[]) {
  return actuals.map(a => ({ ...brewPullRow(a), stage: a.stage }));
}

defineQuery({
  name: "get_brew_day_plan", description: "Pinned recipe plan and available exact material sources for actual brew-day confirmation",
  roles: ["admin", "brewer"], input: z.object({ batchId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_brew_day_plan", { p_brewery: ctx.breweryId, p_batch: i.batchId })),
});
defineQuery({
  name: "get_brew_record", description: "Frozen brew record revisions and their confirmed source-linked material additions",
  roles: ["admin", "brewer"], input: z.object({ batchId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_brew_record", { p_brewery: ctx.breweryId, p_batch: i.batchId })),
});

// The first turn stamps batches.brewed_on and opens its vessel occupancy.
// Later same-batch turns top up that open tank without moving the first date.
// A first turn still refuses overlapping occupancies, including backdated ones.
defineCommand({
  name: "record_brew_day", description: "Record a same-batch brew turn with actual ingredient sources and frozen process, opening or topping up its tank",
  compensation: "Cannot be undone; fix the record with correct_brew_record.",
  input: z.object({
    batchId: z.string().uuid(),
    vesselId: z.string().uuid(),
    initialBbl: z.number().positive(),
    brewedOn: isoDate, actuals: z.array(brewActual).optional(), process: brewProcess.optional(), confirmEmpty: z.boolean().optional(),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_brew_day", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_vessel: i.vesselId,
    p_actuals: i.actuals && brewActualRows(i.actuals), p_process: i.process, p_confirm_empty: i.confirmEmpty,
    p_initial_bbl: i.initialBbl, p_brewed_on: i.brewedOn, p_request_id: execution.requestId,
  })),
});

// Prep is a draft: a full replace of the batch's pulls and planned tank, read
// back by get_brew_day_plan. record_brew_day still does the consuming.
defineCommand({
  name: "save_batch_pulls", description: "Prep saves the lots and amounts pulled for a planned batch and its planned tank; moves no stock",
  compensation: "Reverse with save_batch_pulls and the previous pulls before brew day.",
  input: z.object({ batchId: z.string().uuid(), vesselId: z.string().uuid().nullable(), lines: z.array(brewPull) }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("save_batch_pulls", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_vessel: i.vesselId, p_lines: i.lines.map(brewPullRow), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "correct_brew_record", description: "Correct a brew turn's ingredients and process after later additions, transfers or packaging using linked material compensation and replacement actuals; volume changes require an open occupancy with sufficient volume and unfiled books",
  compensation: "Reverse by correcting the latest revision again with correct_brew_record.",
  input: z.object({ recordId: z.string().uuid().describe("The brew record to correct"), reason: z.string().trim().min(1).describe("Why the brew record is corrected"), initialBbl: z.number().positive().multipleOf(0.001),
    actuals: z.array(brewActual), process: brewProcess.default({}), confirmEmpty: z.boolean().default(false) }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("correct_brew_record", {
    p_brewery: ctx.breweryId, p_record: i.recordId, p_reason: i.reason, p_initial_bbl: i.initialBbl,
    p_actuals: brewActualRows(i.actuals), p_process: i.process, p_confirm_empty: i.confirmEmpty, p_request_id: execution.requestId,
  })),
});

// Imported history (docs/plans/readings-on-batch.md): brew and close a planned
// batch on past dates with no tank and no completion loss, only before the
// books opened. An actual OG is a gravity reading dated the brew day, not a
// process field.
defineCommand({
  name: "record_historical_batch", description: "Admin only: record a past batch brewed and closed before the books opened, with its knockout volume and process but no tank stay and no completion loss",
  compensation: "Cannot be undone; correct_brew_record cannot change its knockout volume.",
  input: z.object({ batchId: z.string().uuid(), brewedOn: isoDate, closedOn: isoDate,
    knockoutBbl: z.number().positive().multipleOf(0.001), process: brewProcess.default({}) }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_historical_batch", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_brewed_on: i.brewedOn, p_closed_on: i.closedOn,
    p_knockout_bbl: i.knockoutBbl, p_process: i.process, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "cancel_batch", description: "Cancel an unstarted batch plan; retains history and refuses recorded physical work",
  compensation: "Cannot be undone; plan a new batch with schedule_batch.",
  input: z.object({ batchId: z.string().uuid() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("cancel_batch", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "reschedule_batch", description: "Reschedule an unstarted batch plan; retains history and refuses recorded physical work",
  compensation: "Reverse with reschedule_batch and the previous date.",
  input: z.object({ batchId: z.string().uuid(), plannedOn: isoDate }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("reschedule_batch", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_planned_on: i.plannedOn, p_request_id: execution.requestId,
  })),
});

// Optional many-to-one embeds preserve batch plans without a brand or recipe.
type BatchRow = {
  id: string; batch_no: number | null; intended_brand_id: string | null; recipe_version_id: string | null;
  planned_on: string; planned_bbl: number; brewed_on: string | null; closed_at: string | null; cancelled_at: string | null;
  completion_adjustment_id: string | null; note: string | null;
  brand: { name: string } | null; recipe_version: { recipe: { name: string } | null } | null;
};

const BATCH_COLUMNS = "id, batch_no, intended_brand_id, recipe_version_id, planned_on, planned_bbl, brewed_on, closed_at, cancelled_at, completion_adjustment_id, note, brand:brands(name), recipe_version:recipe_versions(recipe:recipes(name))";

/** Only brewed, unfinished batches need occupancy reads. History has no current vessels. */
async function batchListRows<T extends BatchRow>(ctx: Ctx, batches: T[], readings = false) {
  const activeIds = batches.filter(b => b.brewed_on && !b.closed_at && !b.cancelled_at).map(b => b.id);
  const vessels = await openVessels(ctx, activeIds, readings);
  return batches.map(({ brand, recipe_version, ...batch }) => ({
    ...batch,
    brand_name: brand?.name ?? null,
    recipe_name: recipe_version?.recipe?.name ?? null,
    vessel_name: vessels.get(batch.id)?.map(v => v.vessel_name).join(", ") || null,
    active_occupancies: vessels.get(batch.id) ?? [],
  }));
}

// The open occupancies (ended_at is null) are where a batch physically is; the
// gist exclusion on vessel_occupancies guarantees at most one per vessel, but a
// partial transfer leaves one batch open in several vessels. Each batch maps to
// all of them, oldest first, so the brew-day tank (created first) leads. Ids go
// 100 per read so the URL stays bounded (#469); a batch's rows all land in one
// chunk, so the per-chunk order is the per-batch order. withReadings embeds each
// occupancy's newest fermentation reading; the Batches list and Cellar map ask for it.
type OpenVessel = { id: string; vessel_id: string; initial_bbl: number; started_at: string; vessel_name: string; latest_reading?: VesselReading | null };
type OpenRow = { id: string; batch_id: string; vessel_id: string; initial_bbl: number; started_at: string; fermentation_readings?: VesselReading[] };
async function openVessels(ctx: Ctx, batchIds: string[], withReadings = false) {
  const rows = await inChunks(batchIds, async (chunk): Promise<OpenRow[]> => {
    const columns = "id, batch_id, vessel_id, initial_bbl, started_at";
    const open = ctx.db.from("vessel_occupancies").select(withReadings ? `${columns}, fermentation_readings(id,at,temp_f,gravity_plato,ph,note)` : columns)
      .in("batch_id", chunk).is("ended_at", null).order("created_at").order("id");
    return (await unwrap(withReadings ? open
      .order("at", { referencedTable: "fermentation_readings", ascending: false })
      .order("id", { referencedTable: "fermentation_readings", ascending: false })
      .limit(1, { referencedTable: "fermentation_readings" }) : open) ?? []) as unknown as OpenRow[];
  });
  const byBatch = new Map<string, OpenVessel[]>();
  if (rows.length === 0) return byBatch;
  const vessels = await inChunks([...new Set(rows.map((r) => r.vessel_id as string))],
    async chunk => (await unwrap(ctx.db.from("vessels").select("id, name").in("id", chunk))) ?? []);
  const names = new Map(vessels.map((v) => [v.id as string, v.name as string]));
  for (const r of rows) {
    const list = byBatch.get(r.batch_id as string) ?? [];
    list.push({
      id: r.id as string, vessel_id: r.vessel_id as string, initial_bbl: num(r.initial_bbl),
      started_at: r.started_at as string, vessel_name: names.get(r.vessel_id as string) ?? "",
      ...(r.fermentation_readings && { latest_reading: r.fermentation_readings[0] ?? null }),
    });
    byBatch.set(r.batch_id as string, list);
  }
  return byBatch;
}

defineQuery({
  name: "list_batches", description: "Unfinished batches by planned date, newest first, with brand, recipe and current vessels; readings adds the latest reading only for brewed, unclosed batches. Use list_batch_history for completed or cancelled batches.",
  input: z.object({
    readings: z.boolean().optional().describe("Add each active occupancy's latest fermentation reading"),
    open: z.boolean().optional().describe("True keeps brewed, unclosed batches; false keeps unstarted plans; omitted returns both"),
  }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    const batches = await completeRows<BatchRow>("Batches", start => {
      let q = ctx.db.from("batches").select(BATCH_COLUMNS, { count: "exact" })
        .eq("brewery_id", ctx.breweryId).is("closed_at", null).is("cancelled_at", null);
      if (i.open === true) q = q.not("brewed_on", "is", null);
      if (i.open === false) q = q.is("brewed_on", null);
      return q.order("planned_on", { ascending: false }).order("id").range(start, start + PAGE_SIZE - 1);
    });
    return batchListRows(ctx, batches, i.readings);
  },
});

defineQuery({
  name: "list_batch_history", description: "One page of completed or cancelled batches, newest created first, with brand and embedded recipe",
  input: z.object({ status: z.enum(["completed", "cancelled"]).describe("Which finished batches to list"), ...historyInput }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    let q = ctx.db.from("batches").select(`${BATCH_COLUMNS}, created_at`)
      .eq("brewery_id", ctx.breweryId).limit(i.limit + 1);
    q = i.status === "cancelled" ? q.not("cancelled_at", "is", null) : q.not("closed_at", "is", null).is("cancelled_at", null);
    const fetched = (await unwrap(newestFirst(q, i.cursor))) ?? [];
    const page = historyResult(fetched as unknown as (BatchRow & HistoryRow)[], i.limit);
    return { ...page, rows: await batchListRows(ctx, page.rows) };
  },
});

defineQuery({
  name: "get_brew_day", description: "One batch, with its intended brand's name, and the occupancy it is currently sitting in (the oldest open one when split across tanks): the vessel's name and the volume that went in; closed_at is set once the batch is completed; then writeOffBbl is the barrels its completion wrote off as loss (null when none) and packagedBbl the barrels its closed packaging runs packaged (both null before completion)",
  input: z.object({ batchId: z.string().uuid() }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    const batch = await unwrap(ctx.db.from("batches")
      .select("id, batch_no, intended_brand_id, recipe_version_id, planned_on, planned_bbl, brewed_on, closed_at, cancelled_at, completion_adjustment_id, note")
      .eq("brewery_id", ctx.breweryId).eq("id", i.batchId).maybeSingle());
    if (!batch) throw new CommandError("batch not found", 404, "not_found");
    const [vessels, brands, writeOff, balance] = await Promise.all([
      openVessels(ctx, [i.batchId]),
      brandNames(ctx, [batch.intended_brand_id]),
      // complete_batch records its write-off as one negative loss adjustment, named by completion_adjustment_id.
      batch.completion_adjustment_id ? unwrap(ctx.db.from("volume_adjustments").select("bbl")
        .eq("brewery_id", ctx.breweryId).eq("id", batch.completion_adjustment_id).single()) : null,
      // The packaged figure is the database's batch balance; the completion preview refuses a completed batch (#1480).
      batch.closed_at ? unwrap(ctx.db.rpc("get_batch_volume_balance", { p_brewery: ctx.breweryId, p_batch: i.batchId })) : null,
    ]);
    const brand_name = batch.intended_brand_id ? brands.get(batch.intended_brand_id) ?? null : null;
    return { batch: { ...batch, brand_name }, occupancy: vessels.get(i.batchId)?.[0] ?? null, writeOffBbl: writeOff ? -Number(writeOff.bbl) : null,
      packagedBbl: balance ? Number((balance as { packagedBbl: number }).packagedBbl) : null };
  },
});

defineQuery({
  name: "get_batch_completion_preview",
  description: "Preview the server-derived batch baseline, frozen packaged volume, prior attributed removals, residual and completion threshold",
  input: z.object({ batchId: z.string().uuid() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_batch_completion_preview", {
    p_brewery: ctx.breweryId, p_batch: i.batchId,
  })),
});

defineCommand({
  name: "complete_batch",
  description: "Close a brewed batch and its open occupancies; beer still in tanks at the threshold requires confirmInTankBbl equal to the previewed inTankBbl being written off as loss",
  compensation: "Cannot be undone; a batch never reopens, but reattribute_loss can reclassify its loss.",
  input: z.object({ batchId: z.string().uuid(), confirmInTankBbl: z.number().nonnegative().optional() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("complete_batch", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_request_id: execution.requestId,
    p_confirm_in_tank_bbl: i.confirmInTankBbl,
  })),
});

// ------------------------------------------------------------ cellar
// Moving beer writes one ledger row; nothing stores a volume. What is in a
// vessel is derived (occupancy_volumes), so the RPC's job is to write the
// transfer, open a receiving occupancy when the target vessel is empty, and
// close the source only once the view says it is empty.
defineCommand({
  name: "record_cellar_transfer",
  description: "Move beer out of one occupancy into a vessel: opens an occupancy if the vessel is empty, blends into the open one if it is not, and closes the source when it empties",
  compensation: "Cannot be undone; a cellar transfer has no correction.",
  input: z.object({
    fromOccupancyId: z.string().uuid(),
    toVesselId: z.string().uuid(),
    volumeBbl: z.number().positive(),
    lossBbl: z.number().nonnegative().optional(),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_cellar_transfer", {
    p_brewery: ctx.breweryId, p_from_occupancy: i.fromOccupancyId, p_to_vessel: i.toVesselId,
    p_volume_bbl: i.volumeBbl, p_loss_bbl: i.lossBbl ?? 0, p_request_id: execution.requestId,
  })),
});

// Manual entry only, in °F and °Plato (brewing-domain.md). Each of temperature,
// gravity and pH is optional, but a reading carries at least one; a closed
// occupancy takes none at all, and neither does a live closed batch.
defineCommand({
  name: "record_fermentation_reading",
  description: "Log one timestamped fermentation reading against an open occupancy, a brewed batch, or both (the occupancy must hold the batch); this is the only current operation eligible for exact offline replay",
  compensation: "Cannot be undone; the reading stays in the log, so record a corrected one.",
  input: fermentationReadingInput,
  roles: [...fermentationReadingOfflinePolicy.roles],
  idempotency: fermentationReadingOfflinePolicy.idempotency,
  offlineReplay: fermentationReadingOfflinePolicy.offlineReplay,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_fermentation_reading", {
    p_brewery: ctx.breweryId, p_batch: i.batchId ?? null, p_occupancy: i.occupancyId ?? null, p_at: i.at, p_temp_f: i.tempF ?? null,
    p_gravity_plato: i.gravityPlato ?? null, p_ph: i.ph ?? null, p_note: i.note ?? null,
    p_request_id: execution.requestId,
  })),
});

// A plain read: fermentation_readings carries the staff_read policy, so
// PostgREST already scopes this to the caller's brewery.
defineQuery({
  name: "list_fermentation_readings", description: "Readings logged against one occupancy, newest first",
  input: z.object({ occupancyId: z.string().uuid() }), roles: ["admin", "brewer"],
  handler: (ctx, i) => unwrap(ctx.db.from("fermentation_readings")
    .select("id, occupancy_id, at, temp_f, gravity_plato, ph, note")
    .eq("brewery_id", ctx.breweryId).eq("occupancy_id", i.occupancyId).order("at", { ascending: false })),
});

export {};
