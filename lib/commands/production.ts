// lib/commands/production.ts — recipes and their immutable versions, the
// vessels beer sits in, and the batches that fill them. A recipe
// is a name; how it is brewed lives on a version, and a version is never
// edited: `create_recipe_version` writes the next one (version = max+1) with
// its ingredients in a single RPC, snapshotting each material's extract
// potential so an old version's predicted gravity cannot move when the
// material is retyped. `get_recipe` predicts OG/FG/ABV here in TypeScript
// (lib/recipe-gravity.ts) — the schema stores assumptions, never results.
import { z } from "zod";
import type { VesselReading } from "@/lib/mgr/vessel-detail-view";
import { INGREDIENT_STAGES, scheduleDays, timedInDays, timingLimitMinutes } from "@/lib/mgr/recipe-process-view";
import { fermentationReadingInput, fermentationReadingOfflinePolicy, MASH_PH_BOUNDS, READING_BOUNDS } from "@/lib/composer/offline-policy";
import { completeRows, defineCommand, defineQuery, inChunks, PAGE_SIZE, unwrap, CommandError, type Ctx, latestOf } from "./registry";
import { brandNames, isoDate } from "./packaging";
import { recipeGravity } from "@/lib/recipe-gravity";
import { escapeRegex } from "@/lib/escape-regex";
import { MASH_STEP_KINDS, FERMENTATION_STAGE_KINDS, WATER_ADDITION_STAGES, WATER_ADDITION_UNITS } from "@/lib/mgr/enums";

// The process spec (recipe-builder spec D2, D6, D7). Stored as given; the RPC
// derives mash_temp_f. The option arrays live in lib/mgr/enums.ts so the shared
// views can read them without importing this module and registering every
// command in it.
export { MASH_STEP_KINDS, FERMENTATION_STAGE_KINDS, WATER_ADDITION_STAGES, WATER_ADDITION_UNITS } from "@/lib/mgr/enums";
// Process temperatures share the reading range, so a typo such as -500 °F is refused, not frozen into a recipe version
// or brew record (#1476, #1478).
const processTempF = z.number().min(READING_BOUNDS.tempF.min).max(READING_BOUNDS.tempF.max);
const mashStep = z.object({ name: z.string().trim().min(1), kind: z.enum(MASH_STEP_KINDS), tempF: processTempF, minutes: z.number().int().positive() });
const fermentationStage = z.object({ name: z.string().trim().min(1), kind: z.enum(FERMENTATION_STAGE_KINDS), tempF: processTempF, days: z.number().positive() });
const processInput = z.object({
  preBoilBbl: z.number().positive().optional(), whirlpoolMinutes: z.number().int().nonnegative().optional(), whirlpoolTempF: processTempF.optional(),
  whirlpoolRestMinutes: z.number().int().nonnegative().optional(), knockoutTempF: processTempF.optional(),
});
const waterInput = z.object({
  targetProfileId: z.string().uuid().optional(), sourceProfileId: z.string().uuid().optional(),
  mashGal: z.number().positive().optional(), spargeGal: z.number().nonnegative().optional(), targetMashPh: z.number().min(MASH_PH_BOUNDS.min).max(MASH_PH_BOUNDS.max).optional(),
  additions: z.array(z.object({ materialId: z.string().uuid(), qty: z.number().positive(), unit: z.enum(WATER_ADDITION_UNITS), stage: z.enum(WATER_ADDITION_STAGES) })).default([]),
});

// Efficiency and attenuation are fractions (0.75), never percents: the column
// comment says so and recipeGravity multiplies by them directly, so a 75 here
// would predict a hundredfold gravity. (0,1] is the whole legal range.
const fraction = z.number().gt(0).lte(1);

defineCommand({
  name: "create_recipe", description: "Create a recipe: a name, optionally the brand it brews, and a note; its brewing facts live on versions",
  input: z.object({ name: z.string().trim().min(1), brandId: z.string().uuid().optional(), note: z.string().optional() }),
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
  input: z.object({ recipeId: z.string().uuid(), brandId: z.string().uuid().nullable() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_recipe_brand", {
    p_brewery: ctx.breweryId, p_recipe: i.recipeId, p_brand: i.brandId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "create_recipe_version",
  description: "Add the next version of a recipe: its mash and fermentation schedules, whirlpool/knockout/pre-boil, water and additions, assumptions and ingredients; versions are immutable and snapshot each material's extract potential",
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
      whirlpool_rest_minutes: i.process?.whirlpoolRestMinutes, knockout_temp_f: i.process?.knockoutTempF,
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
  input: z.object({
    occupancyId: z.string().uuid(), materialId: z.string().uuid(), stage: z.enum(INGREDIENT_STAGES),
    qty: z.number().positive(), lotId: z.string().uuid().optional(), note: z.string().optional(),
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
  input: z.object({
    profileId: z.string().uuid().optional(), name: z.string().trim().min(1),
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

defineQuery({
  name: "get_recipe",
  description: "One recipe with its requested version (latest by default), all version numbers, that version's ingredients, and the OG/FG/ABV they predict",
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
    if (!version) return { recipe, version: null, versions, ingredients: [], waterAdditions: [], ogPlato: null, fgPlato: null, abv: null };

    const [ingredients, waterAdditions] = await Promise.all([
      unwrap(ctx.db.from("recipe_ingredients")
        .select("id, material_id, per_bbl_qty, stage, timing_minutes, sort, extract_snapshot, materials(base_uom)")
        .eq("recipe_version_id", version.id).order("sort")).then((r) => r ?? []),
      unwrap(ctx.db.from("recipe_water_additions").select("material_id, qty, unit, stage").eq("recipe_version_id", version.id).order("sort")).then((r) => r ?? []),
    ]);

    return {
      recipe, version, versions, ingredients, waterAdditions,
      ...(recipeGravity({
        brewhouseEfficiency: num(version.brewhouse_efficiency),
        yeastAttenuation: num(version.yeast_attenuation),
        ingredients: ingredients.map((l) => ({
          // A null snapshot stays null: recipeGravity then predicts nothing
          // rather than defaulting its potential or printing OG 0 (#430).
          perBblQty: num(l.per_bbl_qty), extractPotential: l.extract_snapshot == null ? null : num(l.extract_snapshot), stage: l.stage as string,
          unit: l.materials?.base_uom,
        })),
      }) ?? { ogPlato: null, fgPlato: null, abv: null }),
    };
  },
});

// ------------------------------------------------------------ vessels, batches
const VESSEL_KINDS = ["fermenter", "brite", "barrel", "kettle", "other"] as const;
/** A barrel volume stored in numeric(10,3) (#427). */
const bbl = z.number().positive().max(9_999_999.999);

defineCommand({
  name: "upsert_vessel", description: "Create or rename a vessel: its name, kind and capacity. Contents are never stored here — they are derived from the open occupancy",
  input: z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1),
    kind: z.enum(VESSEL_KINDS),
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
  locationId: z.string().uuid(), binId: z.string().uuid(), lotId: z.string().uuid().nullable().optional(),
  qty: z.number().positive().multipleOf(0.0001),
});
const brewProcess = processInput.extend({
  boilMinutes: z.number().int().nonnegative().optional(), mashWaterGal: z.number().positive().optional(),
  spargeWaterGal: z.number().nonnegative().optional(), targetMashPh: z.number().min(MASH_PH_BOUNDS.min).max(MASH_PH_BOUNDS.max).optional(),
});
// A Prep pull is a brew actual before brew day: no stage, and zero is allowed
// (nothing pulled yet).
const brewPull = brewActual.omit({ stage: true }).extend({ qty: z.number().nonnegative().multipleOf(0.0001) });
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
  input: z.object({ batchId: z.string().uuid(), vesselId: z.string().uuid().nullable(), lines: z.array(brewPull) }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("save_batch_pulls", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_vessel: i.vesselId, p_lines: i.lines.map(brewPullRow), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "correct_brew_record", description: "Correct a brew turn's ingredients and process after later additions, transfers or packaging using linked material compensation and replacement actuals; volume changes require an open occupancy with sufficient volume and unfiled books",
  input: z.object({ recordId: z.string().uuid(), reason: z.string().trim().min(1), initialBbl: z.number().positive().multipleOf(0.001),
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
  input: z.object({ batchId: z.string().uuid() }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("cancel_batch", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "reschedule_batch", description: "Reschedule an unstarted batch plan; retains history and refuses recorded physical work",
  input: z.object({ batchId: z.string().uuid(), plannedOn: isoDate }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("reschedule_batch", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_planned_on: i.plannedOn, p_request_id: execution.requestId,
  })),
});

// Brand, recipe and vessel are resolved with follow-up reads rather than
// embedded joins: every one of them is optional on a batch, and PostgREST
// embeds through the composite foreign keys read far less clearly than this.
type BatchRow = {
  id: string; batch_no: number | null; intended_brand_id: string | null; recipe_version_id: string | null;
  planned_on: string; planned_bbl: number; brewed_on: string | null; closed_at: string | null; cancelled_at: string | null;
  completion_adjustment_id: string | null; note: string | null;
};

// A batch names a recipe *version*; the human-readable name lives one hop
// further out on the recipe itself.
async function recipeNames(ctx: Ctx, batches: BatchRow[]) {
  const ids = [...new Set(batches.map((b) => b.recipe_version_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map<string, string>();
  const versions = await inChunks(ids, async chunk => (await unwrap(ctx.db.from("recipe_versions").select("id, recipe_id").in("id", chunk))) ?? []);
  const recipeIds = [...new Set(versions.map((v) => v.recipe_id as string))];
  const recipes = await inChunks(recipeIds, async chunk => (await unwrap(ctx.db.from("recipes").select("id, name").in("id", chunk))) ?? []);
  const byRecipe = new Map(recipes.map((r) => [r.id as string, r.name as string]));
  return new Map(versions.map((v) => [v.id as string, byRecipe.get(v.recipe_id as string) ?? ""]));
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
  name: "list_batches", description: "Batches by planned date, newest first, with completion status and the brand, recipe, and current vessels and each open occupancy; readings adds each occupancy’s latest fermentation reading; open keeps only brewed batches not yet completed",
  input: z.object({
    readings: z.boolean().optional().describe("Add each open occupancy's latest fermentation reading"),
    open: z.boolean().optional().describe("Keep only batches that were brewed and are not completed (the ones still in a tank)"),
  }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    // Paged past PostgREST's 1000-row cap (#759); id breaks planned_on ties so pages never overlap.
    const batches = await completeRows<BatchRow>("Batches", start => {
      let q = ctx.db.from("batches")
        .select("id, batch_no, intended_brand_id, recipe_version_id, planned_on, planned_bbl, brewed_on, closed_at, cancelled_at, completion_adjustment_id, note", { count: "exact" })
        .eq("brewery_id", ctx.breweryId);
      if (i.open) q = q.not("brewed_on", "is", null).is("closed_at", null);
      return q.order("planned_on", { ascending: false }).order("id").range(start, start + PAGE_SIZE - 1);
    });
    if (batches.length === 0) return [];

    const [brands, recipes, vessels] = await Promise.all([
      brandNames(ctx, batches.map((b) => b.intended_brand_id)),
      recipeNames(ctx, batches),
      openVessels(ctx, batches.map((b) => b.id), i.readings),
    ]);

    return batches.map((b) => ({
      ...b,
      brand_name: b.intended_brand_id ? brands.get(b.intended_brand_id) ?? null : null,
      recipe_name: b.recipe_version_id ? recipes.get(b.recipe_version_id) ?? null : null,
      vessel_name: vessels.get(b.id)?.map((v) => v.vessel_name).join(", ") || null,
      active_occupancies: vessels.get(b.id) ?? [],
    }));
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
