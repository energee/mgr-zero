// lib/import/lolev.ts — maps Lolev Manager (Payload CMS on MongoDB) documents
// to the inputs of MGR's existing commands: upsert_material,
// upsert_water_profile, create_recipe and create_recipe_version. Pure: no I/O
// and no database. The runner resolves material and profile names to ids and
// calls the commands, so their zod schemas and RPCs still validate everything.
// Lolev weights are pounds per batch and batch size is barrels, so every
// ingredient becomes pounds per barrel. Anything dropped is reported in
// `skipped`, never silently lost. Plan: docs/plans/lolev-import.md.
import { MASH_STEP_KINDS, FERMENTATION_STAGE_KINDS, WATER_ADDITION_STAGES } from "@/lib/mgr/enums";
import type { IngredientStage } from "@/lib/mgr/recipe-process-view";

type MashKind = (typeof MASH_STEP_KINDS)[number];
type FermentationKind = (typeof FERMENTATION_STAGE_KINDS)[number];
type WaterStage = (typeof WATER_ADDITION_STAGES)[number];

/** Turns canonical extended JSON (bsondump output) into plain numbers, id strings and ISO dates. */
export function fromEjson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(fromEjson);
  if (v === null || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if ("$oid" in o) return o.$oid;
  if ("$numberInt" in o) return Number(o.$numberInt);
  if ("$numberLong" in o) return Number(o.$numberLong);
  if ("$numberDouble" in o) return Number(o.$numberDouble);
  if ("$date" in o) return new Date(fromEjson(o.$date) as number | string).toISOString();
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, fromEjson(x)]));
}

type Doc = { _id: string; name: string };
export type LolevCatalog = {
  malts: (Doc & { yieldOnGrind?: number })[];
  hops: Doc[];
  yeasts: (Doc & { attenuation?: { low?: number; high?: number } })[];
  sugars: (Doc & { ppg?: number })[];
  adjuncts: Doc[];
};

/** upsert_material input, without an id (the runner skips names that exist). */
export type MaterialInput = {
  name: string; category: "malt" | "hop" | "yeast" | "adjunct" | "chemical";
  baseUom: "lb" | "g" | "each"; purchaseUom: "lb" | "g" | "each"; purchaseUomFactor: 1; extractPotential?: number;
};

/** Lolev's water-addition mineral keys → the MGR chemical material each becomes. */
export const SALT_NAMES = {
  gypsum: "Gypsum (CaSO4)",
  "calcium-chloride": "Calcium chloride (CaCl2)",
  "table-salt": "Table salt (NaCl)",
  "epsom-salt": "Epsom salt (MgSO4)",
  "baking-soda": "Baking soda (NaHCO3)",
} as const;
type Mineral = keyof typeof SALT_NAMES;

// upsert_material refuses a potential outside [1, 1.05], so an out-of-range
// value is left off (the material imports without one) rather than clamped
// into a number Lolev never had.
const potential = (p: number) => (p >= 1 && p <= 1.05 ? p : undefined);

/** One material per distinct name, plus the five water salts; byLolevId maps every Lolev id to its material name. */
export function mapMaterials(catalog: LolevCatalog): { materials: MaterialInput[]; byLolevId: Map<string, string> } {
  const byName = new Map<string, MaterialInput>();
  const byLolevId = new Map<string, string>();
  const add = (doc: Doc, m: Omit<MaterialInput, "name" | "purchaseUom" | "purchaseUomFactor">) => {
    byLolevId.set(doc._id, doc.name);
    if (byName.has(doc.name)) return; // same variety, another lot: one material
    const { extractPotential, ...rest } = m;
    byName.set(doc.name, { name: doc.name, ...rest, purchaseUom: m.baseUom, purchaseUomFactor: 1, ...(extractPotential === undefined ? {} : { extractPotential }) });
  };
  // Malt: 46 PPG (sucrose) times the grind yield.
  for (const d of catalog.malts) add(d, { category: "malt", baseUom: "lb", extractPotential: d.yieldOnGrind ? potential(1 + 0.046 * d.yieldOnGrind / 100) : undefined });
  for (const d of catalog.sugars) add(d, { category: "adjunct", baseUom: "lb", extractPotential: d.ppg ? potential(1 + d.ppg / 1000) : undefined });
  for (const d of catalog.hops) add(d, { category: "hop", baseUom: "lb" });
  for (const d of catalog.adjuncts) add(d, { category: "adjunct", baseUom: "lb" });
  for (const d of catalog.yeasts) add(d, { category: "yeast", baseUom: "each" });
  const salts: MaterialInput[] = Object.values(SALT_NAMES).map((name) => ({ name, category: "chemical", baseUom: "g", purchaseUom: "g", purchaseUomFactor: 1 }));
  return { materials: [...byName.values(), ...salts], byLolevId };
}

export const DEFAULT_PROFILE_NAME = "Lolev default";
type Ions = { calcium?: number; magnesium?: number; sodium?: number; sulfate?: number; chloride?: number; bicarbonate?: number; pH?: number };
export type WaterProfileInput = { name: string; calciumPpm: number; magnesiumPpm: number; sodiumPpm: number; sulfatePpm: number; chloridePpm: number; bicarbonatePpm: number };

/** upsert_water_profile input; a missing ion reads as 0 ppm. Lolev's pH has no MGR column. */
export function mapWaterProfile(name: string, ions: Ions): WaterProfileInput {
  return {
    name, calciumPpm: ions.calcium ?? 0, magnesiumPpm: ions.magnesium ?? 0, sodiumPpm: ions.sodium ?? 0,
    sulfatePpm: ions.sulfate ?? 0, chloridePpm: ions.chloride ?? 0, bicarbonatePpm: ions.bicarbonate ?? 0,
  };
}

export type LolevRecipe = {
  _id: string; name: string; createdAt: string; batchSize?: number; boilTime?: number; mashTemp?: number;
  targetAttenuation?: number; notes?: unknown;
  malts?: { malt: string; weight: number }[];
  hops?: { hop: string; weight: number; hopTiming?: string | null; boilTime?: number }[];
  sugars?: { sugar: string; weight: number; timing?: string }[];
  adjuncts?: { adjunct: string; weight: number; timing?: string }[];
  yeast?: string;
  mashSchedule?: { stepType?: string; temperature: number; duration: number }[];
  fermentationSchedule?: { stage: string; temperature: number; duration: number }[];
  useDefaultWaterProfile?: boolean; sourceWaterProfile?: Ions;
  waterAdditions?: { mineral: string | null; amount: number; unit: string; target?: string }[];
};

type Ingredient = { materialName: string; perBblQty: number; stage: IngredientStage; timingMinutes?: number };
/** create_recipe_version input without recipeId; materials are named, and the source profile is RecipeImport.sourceProfile. */
export type VersionInput = {
  mashSchedule: { name: string; kind: MashKind; tempF: number; minutes: number }[];
  fermentationSchedule: { name: string; kind: FermentationKind; tempF: number; days: number }[];
  water: { additions: { materialName: string; qty: number; unit: "g"; stage: WaterStage }[] };
  brewhouseEfficiency: number; yeastAttenuation: number; boilMinutes?: number;
  ingredients: Ingredient[];
};
export type RecipeImport = { lolevId: string; name: string; note: string; sourceProfile: "default" | WaterProfileInput | null; version: VersionInput };
export type Skipped = { lolevId: string; name: string; reason: string };

const positiveInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const FERMENTATION_ALIASES: Record<string, FermentationKind> = { "diacetyl-rest": "diacetyl rest", "cold-crash": "cold crash" };
const HOP_STAGES: Record<string, IngredientStage> = { boil: "boil", whirlpool: "whirlpool", "dry-hop": "dry_hop" };
const isOneOf = <T extends string>(list: readonly T[], v: string | undefined): v is T => (list as readonly string[]).includes(v ?? "");

/**
 * Maps recipes to create_recipe + create_recipe_version inputs. A recipe with no
 * batch size or no usable ingredient is skipped; a dropped line or water
 * addition is reported in `skipped` and the recipe is kept. Yeasts supply the
 * attenuation midpoint when the recipe has no target.
 */
export function mapRecipes(recipes: LolevRecipe[], byLolevId: Map<string, string>, yeasts: LolevCatalog["yeasts"] = []): { recipes: RecipeImport[]; skipped: Skipped[] } {
  const skipped: Skipped[] = [];
  const out: RecipeImport[] = [];
  for (const r of recipes) {
    const skip = (reason: string) => skipped.push({ lolevId: r._id, name: r.name, reason });
    const bbl = r.batchSize;
    if (!bbl || bbl <= 0) { skip("no batch size"); continue; }

    const ingredients: Ingredient[] = [];
    const line = (id: string | undefined, lb: number, stage: IngredientStage, label: string, timingMinutes?: number) => {
      const materialName = id ? byLolevId.get(id) : undefined;
      if (!materialName) return skip(`${label} ${id ?? "(none)"}: material not found`);
      if (!(lb > 0)) return skip(`${label} ${materialName}: weight ${lb}`);
      ingredients.push({ materialName, perBblQty: Math.round((lb / bbl) * 1e6) / 1e6, stage, ...(timingMinutes === undefined ? {} : { timingMinutes }) });
    };
    for (const m of r.malts ?? []) line(m.malt, m.weight, "mash", "malt");
    for (const h of r.hops ?? []) {
      const stage = HOP_STAGES[h.hopTiming ?? ""] ?? "other";
      line(h.hop, h.weight, stage, "hop", stage === "boil" && positiveInt(h.boilTime) ? h.boilTime : undefined);
    }
    for (const s of r.sugars ?? []) line(s.sugar, s.weight, "boil", "sugar");
    for (const a of r.adjuncts ?? []) line(a.adjunct, a.weight, a.timing === "mash" ? "mash" : "boil", "adjunct");
    // ponytail: one pitch per batch; refine when MGR models a pitch rate.
    if (r.yeast) line(r.yeast, 1, "fermentation", "yeast");
    if (ingredients.length === 0) { skip("no ingredients"); continue; }

    const mashSchedule = (r.mashSchedule ?? []).map((s) => {
      const kind: MashKind = isOneOf(MASH_STEP_KINDS, s.stepType) ? s.stepType : "infusion";
      return { name: capitalize(kind), kind, tempF: s.temperature, minutes: s.duration };
    });
    if (mashSchedule.length === 0) mashSchedule.push({ name: "Mash", kind: "infusion", tempF: r.mashTemp ?? 152, minutes: 60 });

    const fermentationSchedule = (r.fermentationSchedule ?? []).filter((s) => s.duration > 0).map((s) => ({
      name: s.stage,
      kind: FERMENTATION_ALIASES[s.stage] ?? (isOneOf(FERMENTATION_STAGE_KINDS, s.stage) ? s.stage : "custom"),
      tempF: s.temperature, days: s.duration,
    }));

    const additions: VersionInput["water"]["additions"] = [];
    for (const a of r.waterAdditions ?? []) {
      const materialName = a.mineral ? SALT_NAMES[a.mineral as Mineral] : undefined;
      if (!materialName || !(a.amount > 0)) { skip(`water addition ${a.mineral ?? "(none)"} ${a.amount}${a.unit}: dropped`); continue; }
      additions.push({ materialName, qty: a.amount, unit: "g", stage: isOneOf(WATER_ADDITION_STAGES, a.target) ? a.target : "mash" });
    }

    // Only the six ions decide a custom profile; pH alone does not make one.
    const custom = r.sourceWaterProfile && mapWaterProfile(`${r.name} source water`, r.sourceWaterProfile);
    const sourceProfile = r.useDefaultWaterProfile ? "default"
      : custom && Object.values(custom).some((x) => typeof x === "number" && x > 0) ? custom
      : null;

    out.push({
      lolevId: r._id, name: r.name,
      note: `${typeof r.notes === "string" && r.notes ? `${r.notes}\n` : ""}Imported from Lolev recipe ${r._id}`,
      sourceProfile,
      version: {
        mashSchedule, fermentationSchedule, water: { additions },
        brewhouseEfficiency: 0.75, // Lolev has no efficiency; plan default.
        yeastAttenuation: attenuation(r, yeasts),
        ...(positiveInt(r.boilTime) ? { boilMinutes: r.boilTime } : {}),
        ingredients,
      },
    });
  }
  dedupeNames(out, new Map(recipes.map((r) => [r._id, r.createdAt])));
  return { recipes: out, skipped };
}

// The recipe's target percent, else the midpoint of its yeast's range, else 0.75.
function attenuation(r: LolevRecipe, yeasts: LolevCatalog["yeasts"]): number {
  const t = r.targetAttenuation;
  if (t !== undefined && t > 0 && t <= 100) return t / 100;
  const range = yeasts.find((y) => y._id === r.yeast)?.attenuation;
  if (range?.low !== undefined && range.high !== undefined) return (range.low + range.high) / 200;
  return 0.75;
}

// The newest recipe of a name keeps it; each older one gets " (YYYY-MM-DD)" of its creation.
function dedupeNames(recipes: RecipeImport[], createdAt: Map<string, string>) {
  const groups = Map.groupBy(recipes, (r) => r.name);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const newest = group.reduce((a, b) => (createdAt.get(b.lolevId)! > createdAt.get(a.lolevId)! ? b : a));
    for (const r of group) if (r !== newest) r.name = `${r.name} (${createdAt.get(r.lolevId)!.slice(0, 10)})`;
  }
}
