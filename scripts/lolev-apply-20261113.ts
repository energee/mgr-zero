// One-off (owner, 2026-11-13: "yes and yes"): brings three Lolev changes into MGR that the additive rerun holds back.
//   1. The additive recipes pass (importLolev with --since): recipes that are new in Lolev.
//   2. Renames the recipe "TBD UHA Tripple" to Lolev's new name, through update_recipe.
//   3. Adds the next version of "Rock/Mineral #8" from Lolev's current recipe, through create_recipe_version.
// Usage: bun --env-file=<env> scripts/lolev-apply-20261113.ts <new dump> <first dump> --email <staff email> [--dry-run]
// Signs in with LOLEV_IMPORT_PASSWORD, or with a one-time sign-in link when only SUPABASE_SECRET_KEY is set (hosted).
// Unlike import-lolev.ts it has no local-only guard, so the caller names the database by the env file it passes.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { publicEnv } from "@/lib/env/public";
import { runCommand, unwrap, type Ctx } from "@/lib/commands/registry";
import { ctxForBearer } from "@/lib/commands/context";
import "@/lib/commands/all";
import { DEFAULT_PROFILE_NAME } from "@/lib/import/lolev";
import { dry, importLolev, planImport, readDump } from "@/scripts/import-lolev";

const OLD_NAME = "TBD UHA Tripple", NEW_NAME = "Lolev x CLAG Anniversary 4 UHA Tripple", REVISED = "Rock/Mineral #8";
const BRAND_OLD = "TBD Triple UHA", BRAND_NEW = "CLAG collab";

/** Signs the staff member in and returns their command context. */
async function signIn(email: string): Promise<Ctx> {
  const db = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
  const password = process.env.LOLEV_IMPORT_PASSWORD;
  if (password) {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } else {
    // Hosted: the owner's password is not on this machine, so the secret key mints a one-time link (no email is sent).
    const admin = createClient(publicEnv.supabaseUrl, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    const { error } = await db.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
    if (error) throw error;
  }
  const user = (await db.auth.getUser()).data.user!;
  const member = (await unwrap(db.from("brewery_users").select("brewery_id").eq("user_id", user.id))) ?? [];
  if (member.length !== 1) throw new Error(`${email} must belong to exactly one brewery (found ${member.length})`);
  return ctxForBearer(db, user.id, member[0].brewery_id);
}

async function main() {
  const [newDir, firstDir] = process.argv.slice(2);
  const email = process.argv[process.argv.indexOf("--email") + 1];
  const dryRun = process.argv.includes("--dry-run");
  const dump = readDump(newDir), first = readDump(firstDir);
  const ctx = await signIn(email);
  const brewery = await unwrap(ctx.db.from("breweries").select("name").eq("id", ctx.breweryId).single());
  console.log(`database ${publicEnv.supabaseUrl}, brewery ${brewery?.name}${dryRun ? " (dry run, nothing written)" : ""}`);

  // 1. New recipes.
  dry.on = dryRun;
  const r = await importLolev(dump, ctx, first);
  console.log("new recipes:", r.created, ...r.failed.map((f) => `FAILED ${f}`), ...dry.planned.map((p) => `would ${p}`));
  if (r.failed.length) throw new Error("the recipes pass failed; stopping before the rename");

  const recipes = (await unwrap(ctx.db.from("recipes").select("id, name, note, recipe_versions(version)").eq("brewery_id", ctx.breweryId).in("name", [OLD_NAME, NEW_NAME, REVISED]))) ?? [];
  const byName = new Map(recipes.map((x) => [x.name, x]));

  // 2. The rename. A rerun finds the new name and sends nothing.
  const old = byName.get(OLD_NAME);
  if (!old) console.log(byName.has(NEW_NAME) ? `rename: already "${NEW_NAME}"` : `rename: no recipe "${OLD_NAME}", nothing sent`);
  else {
    console.log(`${dryRun ? "would " : ""}update_recipe "${OLD_NAME}" → "${NEW_NAME}"`);
    if (!dryRun) await runCommand("update_recipe", { recipeId: old.id, name: NEW_NAME, note: old.note }, ctx);
  }

  // 2b. The beer's brand (owner, 2026-11-13: "name it CLAG collab"). The orders workbook's placeholder "TBD Triple UHA"
  // is this beer, so it takes the name and keeps the old one as its alias, as renameCinnabar did; then the recipe
  // brews it. upsert_brand replaces every field, so the others go back as they are. A rerun sends nothing.
  const brands = (await unwrap(ctx.db.from("brands").select("id, name, alias, abv, description, category, price_group_id, hops, styles(name)").eq("brewery_id", ctx.breweryId).in("name", [BRAND_OLD, BRAND_NEW]))) ?? [];
  const placeholder = brands.find((x) => x.name === BRAND_OLD);
  let brandId = brands.find((x) => x.name === BRAND_NEW)?.id;
  if (placeholder) {
    console.log(`${dryRun ? "would " : ""}upsert_brand "${BRAND_OLD}" → "${BRAND_NEW}" (alias "${BRAND_OLD}")`);
    const p = placeholder;
    const input = {
      id: p.id, name: BRAND_NEW, alias: BRAND_OLD, ...(p.price_group_id ? { priceGroupId: p.price_group_id } : {}),
      ...(p.styles?.name ? { style: p.styles.name } : {}), ...(p.abv != null ? { abv: Number(p.abv) } : {}),
      ...(p.description ? { description: p.description } : {}), ...(p.category ? { category: p.category } : {}), ...(p.hops ? { hops: p.hops } : {}),
    };
    if (!dryRun) await runCommand("upsert_brand", input, ctx);
    brandId = p.id;
  } else if (!brandId) throw new Error(`no brand "${BRAND_OLD}" or "${BRAND_NEW}"`);
  const clag = (await unwrap(ctx.db.from("recipes").select("id, brand_id").eq("brewery_id", ctx.breweryId).eq("name", NEW_NAME).maybeSingle())) ?? old;
  if (clag && (!("brand_id" in clag) || clag.brand_id !== brandId)) {
    console.log(`${dryRun ? "would " : ""}set_recipe_brand "${NEW_NAME}" → "${BRAND_NEW}"`);
    if (!dryRun) await runCommand("set_recipe_brand", { recipeId: clag.id, brandId }, ctx);
  } else console.log(`recipe brand: already "${BRAND_NEW}"`);

  // 3. The next version of the revised recipe. A rerun finds version 2 and sends nothing.
  const revised = byName.get(REVISED);
  if (!revised) throw new Error(`no recipe "${REVISED}"`);
  const versions = revised.recipe_versions.map((v) => v.version);
  if (versions.length !== 1) return console.log(`${REVISED}: has versions ${versions.join(", ")}, nothing sent`);
  const mapped = planImport(dump).recipes.find((x) => x.name === REVISED);
  if (!mapped) throw new Error(`the dump has no recipe "${REVISED}"`);
  const names = [...mapped.version.ingredients, ...mapped.version.water.additions].map((l) => l.materialName);
  const materials = (await unwrap(ctx.db.from("materials").select("id, name").eq("brewery_id", ctx.breweryId).in("name", names))) ?? [];
  const materialId = (name: string) => {
    const id = materials.find((m) => m.name === name)?.id;
    if (!id) throw new Error(`material not in MGR: ${name}`);
    return id;
  };
  const profileName = mapped.sourceProfile === "default" ? DEFAULT_PROFILE_NAME : mapped.sourceProfile?.name;
  const profile = profileName ? await unwrap(ctx.db.from("water_profiles").select("id").eq("brewery_id", ctx.breweryId).eq("name", profileName).single()) : undefined;
  const { ingredients, water, ...rest } = mapped.version;
  const version = {
    ...rest, recipeId: revised.id,
    ingredients: ingredients.map(({ materialName, ...l }) => ({ ...l, materialId: materialId(materialName) })),
    water: { sourceProfileId: profile?.id, additions: water.additions.map(({ materialName, ...a }) => ({ ...a, materialId: materialId(materialName) })) },
  };
  console.log(`${dryRun ? "would " : ""}create_recipe_version ${REVISED} v2 (${version.ingredients.length} lines)`);
  for (const l of mapped.version.ingredients.filter((x) => /oats|crystals/i.test(x.materialName))) console.log(`  ${l.materialName}: ${JSON.stringify(l)}`);
  if (!dryRun) await runCommand("create_recipe_version", version, ctx);
}

main().catch((e) => { console.error(e); process.exit(1); });
