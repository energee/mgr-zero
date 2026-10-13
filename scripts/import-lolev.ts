// scripts/import-lolev.ts — imports the Lolev Manager catalog and recipes into
// one MGR brewery (docs/plans/lolev-import.md, pass 1). Reads a mongodump with
// `bsondump`, maps it with lib/import/lolev.ts, and writes only through the
// existing commands via runCommand, signed in as a staff user of the brewery,
// so validation, roles and RPCs apply unchanged. Local Supabase only. A rerun
// skips every material, water profile and recipe whose name already exists.
//
//   LOLEV_IMPORT_PASSWORD=... bun --env-file=.env.local scripts/import-lolev.ts <dump-dir> --email <staff email> [--dry-run]
// The staff user must be an admin or brewer of exactly one brewery (upsert_material and the recipe commands allow both).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { publicEnv } from "@/lib/env/public";
import { runCommand, unwrap, type Ctx } from "@/lib/commands/registry";
import { ctxForBearer } from "@/lib/commands/context";
import "@/lib/commands/all";
import { assertLocalSeedUrl } from "@/scripts/seed-dev-url";
import { DEFAULT_PROFILE_NAME, mapMaterials, mapRecipes, mapWaterProfile, type LolevCatalog, type LolevRecipe, type WaterProfileInput } from "@/lib/import/lolev";

/** The dump collections the import reads, as plain objects. */
export type LolevDump = LolevCatalog & { recipes: LolevRecipe[]; defaultIons?: Record<string, unknown> };

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

/** One collection of the dump; a missing file is an empty collection. */
function readCollection(dir: string, name: string): Record<string, unknown>[] {
  const file = readdirSync(dir).find((f) => f === `${name}.bson.gz` || f === `${name}.bson`);
  if (!file) return [];
  const path = join(dir, file);
  const raw = file.endsWith(".gz") ? execFileSync("gunzip", ["-c", path]) : undefined;
  // bsondump reads stdin when given no file argument (it does not accept "-").
  const out = execFileSync("bsondump", raw ? ["--quiet"] : ["--quiet", path], { input: raw, maxBuffer: 1 << 30, encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((line) => fromEjson(JSON.parse(line)) as Record<string, unknown>);
}

/** Reads the dump. Shapes are asserted, not validated: every field the mapper reads comes from Lolev's own Payload schema. */
export function readDump(dir: string): LolevDump {
  const docs = <T>(name: string) => readCollection(dir, name) as T[];
  return {
    malts: docs("malts"), hops: docs("hops"), yeasts: docs("yeasts"), sugars: docs("sugars"), adjuncts: docs("adjuncts"),
    recipes: docs("recipes"),
    defaultIons: readCollection(dir, "globals").find((g) => g.globalType === "water-profile"),
  };
}

async function staffCtx(email: string, password: string): Promise<Ctx> {
  const db = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const member = (await unwrap(db.from("brewery_users").select("brewery_id").eq("user_id", data.user.id))) ?? [];
  if (member.length !== 1) throw new Error(`${email} must belong to exactly one brewery (found ${member.length})`);
  return ctxForBearer(db, data.user.id, member[0].brewery_id);
}

/** Name → id for rows the brewery already has, so a rerun reuses them. */
async function existingIds(ctx: Ctx, table: "materials" | "water_profiles" | "recipes") {
  const rows = (await unwrap(ctx.db.from(table).select("id, name").eq("brewery_id", ctx.breweryId))) ?? [];
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** What the dump maps to, without writing: the dry run. */
export function planImport(dump: LolevDump) {
  const { materials, byLolevId } = mapMaterials(dump);
  // Yeasts go in so a recipe without a target attenuation uses its yeast's range midpoint.
  const { recipes, skipped } = mapRecipes(dump.recipes, byLolevId, dump.yeasts);
  if (!dump.defaultIons && recipes.some((r) => r.sourceProfile === "default")) throw new Error("recipes use the default water profile but the dump has no water-profile global");
  return { materials, recipes, skipped };
}

/** Writes the plan through the commands, skipping names the brewery already has; returns how many rows each step created. */
export async function importLolev(dump: LolevDump, ctx: Ctx) {
  const { materials, recipes, skipped } = planImport(dump);
  const created = { materials: 0, waterProfiles: 0, recipes: 0, skippedExisting: 0 };

  const materialIds = await existingIds(ctx, "materials");
  for (const m of materials) {
    if (materialIds.has(m.name)) { created.skippedExisting++; continue; }
    const row = (await runCommand("upsert_material", m, ctx)) as { id: string };
    materialIds.set(m.name, row.id); created.materials++;
  }
  const materialId = (name: string) => {
    const id = materialIds.get(name);
    if (!id) throw new Error(`material not imported: ${name}`);
    return id;
  };

  const profileIds = await existingIds(ctx, "water_profiles");
  const profileId = async (p: WaterProfileInput) => {
    const have = profileIds.get(p.name);
    if (have) return have;
    const row = (await runCommand("upsert_water_profile", p, ctx)) as { id: string };
    profileIds.set(p.name, row.id); created.waterProfiles++;
    return row.id;
  };
  const defaultId = dump.defaultIons ? await profileId(mapWaterProfile(DEFAULT_PROFILE_NAME, dump.defaultIons)) : undefined;

  const recipeIds = await existingIds(ctx, "recipes");
  for (const r of recipes) {
    if (recipeIds.has(r.name)) { created.skippedExisting++; continue; }
    const sourceProfileId = r.sourceProfile === "default" ? defaultId : r.sourceProfile ? await profileId(r.sourceProfile) : undefined;
    const { ingredients, water, ...rest } = r.version;
    const recipe = (await runCommand("create_recipe", { name: r.name, note: r.note }, ctx)) as { id: string };
    await runCommand("create_recipe_version", {
      ...rest, recipeId: recipe.id,
      ingredients: ingredients.map(({ materialName, ...l }) => ({ ...l, materialId: materialId(materialName) })),
      water: { sourceProfileId, additions: water.additions.map(({ materialName, ...a }) => ({ ...a, materialId: materialId(materialName) })) },
    }, ctx);
    created.recipes++;
  }
  return { created, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  const flag = (f: string) => { const i = args.indexOf(f); return i > 0 ? args[i + 1] : undefined; };
  if (!dir) throw new Error("usage: import-lolev.ts <dump-dir> --email <staff email> [--dry-run]");
  const dump = readDump(dir);
  if (args.includes("--dry-run")) {
    const { materials, recipes, skipped } = planImport(dump);
    console.log("dry run, nothing written; would import:", { materials: materials.length, recipes: recipes.length });
    for (const s of skipped) console.log(`dropped ${s.name} [${s.lolevId}]: ${s.reason}`);
    return;
  }
  assertLocalSeedUrl(publicEnv.supabaseUrl); // ponytail: local only; hosted is an ask-first run (AGENTS.md)
  const email = flag("--email"), password = process.env.LOLEV_IMPORT_PASSWORD;
  if (!email || !password) throw new Error("--email and LOLEV_IMPORT_PASSWORD are required unless --dry-run");
  const { created, skipped } = await importLolev(dump, await staffCtx(email, password));
  console.log("imported:", created);
  for (const s of skipped) console.log(`dropped ${s.name} [${s.lolevId}]: ${s.reason}`);
}

if (process.argv[1]?.endsWith("import-lolev.ts")) main().catch((e) => { console.error(e); process.exit(1); });
