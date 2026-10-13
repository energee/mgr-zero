// scripts/import-lolev.ts — imports the Lolev Manager catalog and recipes into
// one MGR brewery (docs/plans/lolev-import.md, pass 1). Reads a mongodump with
// `bsondump`, maps it with lib/import/lolev.ts, and writes only through the
// existing commands via runCommand, signed in as a staff user of the brewery,
// so validation, roles and RPCs apply unchanged. Local Supabase only. A rerun
// skips every material, water profile and recipe whose name already exists.
//
//   LOLEV_IMPORT_PASSWORD=... bunx tsx scripts/import-lolev.ts <dump-dir> --email <staff email> [--dry-run]
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { publicEnv } from "@/lib/env/public";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { assertLocalSeedUrl } from "@/scripts/seed-dev-url";
import { DEFAULT_PROFILE_NAME, fromEjson, mapMaterials, mapRecipes, mapWaterProfile, type LolevCatalog, type LolevRecipe } from "@/lib/import/lolev";

type Doc = Record<string, unknown>;

/** One collection of the dump as plain objects; a missing file is an empty collection.
 *  Shapes are asserted at the call site, not checked: the mapper reads every field defensively (lib/import/lolev.ts). */
export function readCollection(dir: string, name: string): Doc[] {
  const file = readdirSync(dir).find((f) => f === `${name}.bson.gz` || f === `${name}.bson`);
  if (!file) return [];
  const path = join(dir, file);
  const raw = file.endsWith(".gz") ? execFileSync("gunzip", ["-c", path]) : undefined;
  // bsondump reads stdin when given no file argument (it does not accept "-").
  const out = execFileSync("bsondump", raw ? ["--quiet"] : ["--quiet", path], { input: raw, maxBuffer: 1 << 30, encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((line) => fromEjson(JSON.parse(line)) as Doc);
}

async function staffCtx(email: string, password: string): Promise<Ctx> {
  const db = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: member, error: mErr } = await db.from("brewery_users").select("brewery_id, role").eq("user_id", data.user.id);
  if (mErr) throw mErr;
  if (member.length !== 1) throw new Error(`${email} must belong to exactly one brewery (found ${member.length})`);
  return { db, userId: data.user.id, breweryId: member[0].brewery_id, role: member[0].role as Ctx["role"] };
}

/** Name → id for rows the brewery already has, so a rerun reuses them. */
async function existingIds(ctx: Ctx, table: "materials" | "water_profiles" | "recipes") {
  const { data, error } = await ctx.db.from(table).select("id, name").eq("brewery_id", ctx.breweryId);
  if (error) throw error;
  return new Map(data.map((r) => [r.name, r.id]));
}

/** `read` defaults to the dump on disk; the DB test passes synthetic collections instead. */
export async function importLolev(dir: string, ctx: Ctx | null, read: (dir: string, name: string) => Doc[] = readCollection) {
  const catalog = {
    malts: read(dir, "malts"), hops: read(dir, "hops"), yeasts: read(dir, "yeasts"),
    sugars: read(dir, "sugars"), adjuncts: read(dir, "adjuncts"),
  } as LolevCatalog;
  const { materials, byLolevId } = mapMaterials(catalog);
  const defaultIons = read(dir, "globals").find((g) => g.globalType === "water-profile");
  // Yeasts go in so a recipe without a target attenuation uses its yeast's range midpoint.
  const { recipes, skipped } = mapRecipes(read(dir, "recipes") as LolevRecipe[], byLolevId, catalog.yeasts);
  const counts = { materials: 0, waterProfiles: 0, recipes: 0, existing: 0 };
  if (!ctx) return { counts: { ...counts, materials: materials.length, recipes: recipes.length }, skipped };

  const matIds = await existingIds(ctx, "materials");
  for (const m of materials) {
    if (matIds.has(m.name)) { counts.existing++; continue; }
    const row = (await runCommand("upsert_material", m, ctx)) as { id: string };
    matIds.set(m.name, row.id); counts.materials++;
  }

  const profileIds = await existingIds(ctx, "water_profiles");
  const profile = async (p: ReturnType<typeof mapWaterProfile>) => {
    const have = profileIds.get(p.name);
    if (have) return have;
    const row = (await runCommand("upsert_water_profile", p, ctx)) as { id: string };
    profileIds.set(p.name, row.id); counts.waterProfiles++;
    return row.id;
  };
  if (!defaultIons && recipes.some((r) => r.sourceProfile === "default")) throw new Error("recipes use the default water profile but the dump has no water-profile global");
  const defaultId = defaultIons ? await profile(mapWaterProfile(DEFAULT_PROFILE_NAME, defaultIons)) : null;

  const recipeIds = await existingIds(ctx, "recipes");
  const id = (name: string) => {
    const v = matIds.get(name);
    if (!v) throw new Error(`material not imported: ${name}`);
    return v;
  };
  for (const r of recipes) {
    if (recipeIds.has(r.name)) { counts.existing++; continue; }
    const sourceProfileId = r.sourceProfile === "default" ? defaultId : r.sourceProfile ? await profile(r.sourceProfile) : null;
    const { ingredients, water, ...rest } = r.version;
    const recipe = (await runCommand("create_recipe", { name: r.name, note: r.note }, ctx)) as { id: string };
    await runCommand("create_recipe_version", {
      ...rest, recipeId: recipe.id,
      ingredients: ingredients.map(({ materialName, ...l }) => ({ ...l, materialId: id(materialName) })),
      water: water && {
        ...water, sourceProfileId: sourceProfileId ?? undefined,
        additions: water.additions.map(({ materialName, ...a }) => ({ ...a, materialId: id(materialName) })),
      },
    }, ctx);
    recipeIds.set(r.name, recipe.id); counts.recipes++;
  }
  return { counts, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  const flag = (f: string) => { const i = args.indexOf(f); return i > 0 ? args[i + 1] : undefined; };
  const dryRun = args.includes("--dry-run");
  if (!dir) throw new Error("usage: import-lolev.ts <dump-dir> --email <staff email> [--dry-run]");
  let ctx: Ctx | null = null;
  if (!dryRun) {
    assertLocalSeedUrl(publicEnv.supabaseUrl); // ponytail: local only; hosted is an ask-first run (AGENTS.md)
    const email = flag("--email"), password = process.env.LOLEV_IMPORT_PASSWORD;
    if (!email || !password) throw new Error("--email and LOLEV_IMPORT_PASSWORD are required unless --dry-run");
    ctx = await staffCtx(email, password);
  }
  const { counts, skipped } = await importLolev(dir, ctx);
  console.log(dryRun ? "dry run (nothing written):" : "imported:", counts);
  for (const s of skipped) console.log(`skipped ${s.name} [${s.lolevId}]: ${s.reason}`);
}

if (process.argv[1]?.endsWith("import-lolev.ts")) main().catch((e) => { console.error(e); process.exit(1); });
