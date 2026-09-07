// lib/commands/production.ts — recipes and their immutable versions, the
// vessels beer sits in, and the batches that fill them. A recipe
// is a name; how it is brewed lives on a version, and a version is never
// edited: `create_recipe_version` writes the next one (version = max+1) with
// its ingredients in a single RPC, snapshotting each material's extract
// potential so an old version's predicted gravity cannot move when the
// material is retyped. `get_recipe` predicts OG/FG/ABV here in TypeScript
// (lib/recipe-gravity.ts) — the schema stores assumptions, never results.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError } from "./registry";
import { recipeGravity } from "@/lib/recipe-gravity";

const INGREDIENT_STAGES = ["mash", "boil", "whirlpool", "fermentation", "dry_hop", "packaging", "other"] as const;

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

defineCommand({
  name: "create_recipe_version",
  description: "Add the next version of a recipe with its ingredients; versions are immutable and snapshot each material's extract potential",
  input: z.object({
    recipeId: z.string().uuid(),
    mashTempF: z.number(),
    brewhouseEfficiency: fraction,
    yeastAttenuation: fraction,
    boilMinutes: z.number().int().positive().optional(),
    targetIbu: z.number().nonnegative().optional(),
    note: z.string().optional(),
    ingredients: z.array(z.object({
      materialId: z.string().uuid(),
      perBblQty: z.number().positive(),
      stage: z.enum(INGREDIENT_STAGES),
      timingMinutes: z.number().int().optional(),
    })).min(1),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_recipe_version", {
    p_brewery: ctx.breweryId, p_recipe: i.recipeId, p_mash_temp_f: i.mashTempF,
    p_brewhouse_efficiency: i.brewhouseEfficiency, p_yeast_attenuation: i.yeastAttenuation,
    p_boil_minutes: i.boilMinutes ?? null, p_target_ibu: i.targetIbu ?? null, p_note: i.note ?? null,
    p_ingredients: i.ingredients.map((l) => ({
      material_id: l.materialId, per_bbl_qty: l.perBblQty, stage: l.stage, timing_minutes: l.timingMinutes ?? null,
    })),
    p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_recipes", description: "Recipes, alphabetical, with the brand each one brews",
  input: z.object({}), roles: ["admin", "brewer"],
  handler: (ctx) => unwrap(ctx.db.from("recipes").select("id, name, brand_id, note, created_at")
    .eq("brewery_id", ctx.breweryId).order("name")),
});

// The recipe version editor's ingredient picker: a name and category per
// material, plus whether it typed an extract potential (so the picker can
// warn that a boil/hop-style addition contributes no gravity).
defineQuery({
  name: "list_materials", description: "Materials, alphabetical, with category and extract potential",
  input: z.object({}), roles: ["admin", "brewer"],
  handler: (ctx) => unwrap(ctx.db.from("materials").select("id, name, category, extract_potential")
    .eq("brewery_id", ctx.breweryId).eq("active", true).order("name")),
});

// Number() guards the numeric columns against a driver that hands them back as
// strings. A missing extract snapshot is NOT defaulted here — it is passed
// through as null so recipeGravity can skip the ingredient outright rather
// than have a made-up potential move the predicted OG.
const num = (v: unknown, fallback = 0) => (v === null || v === undefined ? fallback : Number(v));

defineQuery({
  name: "get_recipe",
  description: "One recipe with its latest version, that version's ingredients, and the OG/FG/ABV they predict",
  input: z.object({ recipeId: z.string().uuid() }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    const recipe = await unwrap(ctx.db.from("recipes").select("id, name, brand_id, note, created_at")
      .eq("brewery_id", ctx.breweryId).eq("id", i.recipeId).maybeSingle());
    if (!recipe) throw new CommandError("recipe not found", 404, "not_found");

    const version = await unwrap(ctx.db.from("recipe_versions")
      .select("id, version, mash_temp_f, brewhouse_efficiency, yeast_attenuation, boil_minutes, target_ibu, note, created_at")
      .eq("recipe_id", i.recipeId).order("version", { ascending: false }).limit(1).maybeSingle());
    if (!version) return { recipe, version: null, ingredients: [], ogPlato: null, fgPlato: null, abv: null };

    const ingredients = await unwrap(ctx.db.from("recipe_ingredients")
      .select("id, material_id, per_bbl_qty, stage, timing_minutes, sort, extract_snapshot")
      .eq("recipe_version_id", version.id).order("sort")) ?? [];

    return {
      recipe, version, ingredients,
      ...recipeGravity({
        mashTempF: num(version.mash_temp_f),
        brewhouseEfficiency: num(version.brewhouse_efficiency),
        yeastAttenuation: num(version.yeast_attenuation),
        ingredients: ingredients.map((l) => ({
          // A null snapshot stays null: recipeGravity skips that ingredient
          // rather than defaulting its potential, which would silently move
          // the predicted OG.
          perBblQty: num(l.per_bbl_qty), extractPotential: l.extract_snapshot == null ? null : num(l.extract_snapshot), stage: l.stage as string,
        })),
      }),
    };
  },
});

// ------------------------------------------------------------ vessels, batches
const VESSEL_KINDS = ["fermenter", "brite", "barrel", "kettle", "other"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

defineCommand({
  name: "upsert_vessel", description: "Create or rename a vessel: its name, kind and capacity. Contents are never stored here — they are derived from the open occupancy",
  input: z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1),
    kind: z.enum(VESSEL_KINDS),
    capacityBbl: z.number().positive(),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_vessel", {
    p_brewery: ctx.breweryId, p_vessel: i.id ?? null, p_name: i.name, p_kind: i.kind,
    p_capacity_bbl: i.capacityBbl, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_vessels", description: "Vessels, alphabetical, with kind and capacity",
  input: z.object({}), roles: ["admin", "brewer"],
  handler: (ctx) => unwrap(ctx.db.from("vessels").select("id, name, kind, capacity_bbl, active")
    .eq("brewery_id", ctx.breweryId).order("name")),
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
    plannedBbl: z.number().positive(),
    note: z.string().optional(),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("schedule_batch", {
    p_brewery: ctx.breweryId, p_brand: i.intendedBrandId ?? null, p_recipe_version: i.recipeVersionId ?? null,
    p_planned_on: i.plannedOn, p_planned_bbl: i.plannedBbl, p_note: i.note ?? null,
    p_request_id: execution.requestId,
  })),
});

// One call: it stamps batches.brewed_on and opens the vessel occupancy that
// makes the beer findable. Brewing into a vessel whose occupancy overlaps the
// brew day is refused — including a backdated day that falls inside a stretch
// the vessel was full but has since been emptied.
defineCommand({
  name: "record_brew_day", description: "Record that a scheduled batch was brewed: stamps the brew date and moves it into a vessel that is not already occupied",
  input: z.object({
    batchId: z.string().uuid(),
    vesselId: z.string().uuid(),
    initialBbl: z.number().positive(),
    brewedOn: isoDate,
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_brew_day", {
    p_brewery: ctx.breweryId, p_batch: i.batchId, p_vessel: i.vesselId,
    p_initial_bbl: i.initialBbl, p_brewed_on: i.brewedOn, p_request_id: execution.requestId,
  })),
});

// Brand, recipe and vessel are resolved with follow-up reads rather than
// embedded joins: every one of them is optional on a batch, and PostgREST
// embeds through the composite foreign keys read far less clearly than this.
type BatchRow = {
  id: string; batch_no: number | null; intended_brand_id: string | null; recipe_version_id: string | null;
  planned_on: string; planned_bbl: number; brewed_on: string | null; note: string | null;
};

type Ctx = Parameters<Parameters<typeof defineQuery>[0]["handler"]>[0];

async function brandNames(ctx: Ctx, batches: BatchRow[]) {
  const ids = [...new Set(batches.map((b) => b.intended_brand_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map<string, string>();
  const rows = (await unwrap(ctx.db.from("brands").select("id, name").in("id", ids))) ?? [];
  return new Map(rows.map((r) => [r.id as string, r.name as string]));
}

// A batch names a recipe *version*; the human-readable name lives one hop
// further out on the recipe itself.
async function recipeNames(ctx: Ctx, batches: BatchRow[]) {
  const ids = [...new Set(batches.map((b) => b.recipe_version_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map<string, string>();
  const versions = (await unwrap(ctx.db.from("recipe_versions").select("id, recipe_id").in("id", ids))) ?? [];
  const recipeIds = [...new Set(versions.map((v) => v.recipe_id as string))];
  const recipes = (await unwrap(ctx.db.from("recipes").select("id, name").in("id", recipeIds))) ?? [];
  const byRecipe = new Map(recipes.map((r) => [r.id as string, r.name as string]));
  return new Map(versions.map((v) => [v.id as string, byRecipe.get(v.recipe_id as string) ?? ""]));
}

// The open occupancy (ended_at is null) is where a batch physically is; the
// gist exclusion on vessel_occupancies guarantees at most one per vessel.
async function openVessels(ctx: Ctx, batchIds: string[]) {
  const rows = (await unwrap(ctx.db.from("vessel_occupancies")
    .select("id, batch_id, vessel_id, initial_bbl, started_at").in("batch_id", batchIds).is("ended_at", null))) ?? [];
  if (rows.length === 0) return new Map<string, { id: string; vessel_id: string; initial_bbl: number; started_at: string; vessel_name: string }>();
  const vessels = (await unwrap(ctx.db.from("vessels").select("id, name")
    .in("id", [...new Set(rows.map((r) => r.vessel_id as string))]))) ?? [];
  const names = new Map(vessels.map((v) => [v.id as string, v.name as string]));
  return new Map(rows.map((r) => [r.batch_id as string, {
    id: r.id as string, vessel_id: r.vessel_id as string, initial_bbl: num(r.initial_bbl),
    started_at: r.started_at as string, vessel_name: names.get(r.vessel_id as string) ?? "",
  }]));
}

defineQuery({
  name: "list_batches", description: "Batches by planned date, newest first, with the brand and recipe they intend and the vessel each one currently sits in",
  input: z.object({}), roles: ["admin", "brewer"],
  handler: async (ctx) => {
    const batches = (await unwrap(ctx.db.from("batches")
      .select("id, batch_no, intended_brand_id, recipe_version_id, planned_on, planned_bbl, brewed_on, note")
      .eq("brewery_id", ctx.breweryId).order("planned_on", { ascending: false })) ?? []) as BatchRow[];
    if (batches.length === 0) return [];

    const brands = await brandNames(ctx, batches);
    const recipes = await recipeNames(ctx, batches);
    const vessels = await openVessels(ctx, batches.map((b) => b.id));

    return batches.map((b) => ({
      ...b,
      brand_name: b.intended_brand_id ? brands.get(b.intended_brand_id) ?? null : null,
      recipe_name: b.recipe_version_id ? recipes.get(b.recipe_version_id) ?? null : null,
      vessel_name: vessels.get(b.id)?.vessel_name ?? null,
    }));
  },
});

defineQuery({
  name: "get_brew_day", description: "One batch with the occupancy it is currently sitting in: the vessel's name and the volume that went in",
  input: z.object({ batchId: z.string().uuid() }), roles: ["admin", "brewer"],
  handler: async (ctx, i) => {
    const batch = await unwrap(ctx.db.from("batches")
      .select("id, batch_no, intended_brand_id, recipe_version_id, planned_on, planned_bbl, brewed_on, note")
      .eq("brewery_id", ctx.breweryId).eq("id", i.batchId).maybeSingle());
    if (!batch) throw new CommandError("batch not found", 404, "not_found");
    return { batch, occupancy: (await openVessels(ctx, [i.batchId])).get(i.batchId) ?? null };
  },
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

// Manual entry only, in °F and °Plato (brewing-domain.md). Gravity and pH are
// optional because a quick temperature check is a legitimate reading; a closed
// occupancy takes none at all.
defineCommand({
  name: "record_fermentation_reading",
  description: "Log a fermentation reading against an open occupancy: temperature in °F, optionally gravity in °Plato, pH and a note",
  input: z.object({
    occupancyId: z.string().uuid(),
    at: z.string().datetime({ offset: true }),
    tempF: z.number(),
    gravityPlato: z.number().optional(),
    ph: z.number().optional(),
    note: z.string().optional(),
  }),
  roles: ["admin", "brewer"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_fermentation_reading", {
    p_brewery: ctx.breweryId, p_occupancy: i.occupancyId, p_at: i.at, p_temp_f: i.tempF,
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
