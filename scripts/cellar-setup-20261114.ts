// One-off (owner, 2026-11-14: "these are the only beers in tanks"): puts the batches the owner named into their tanks.
// Each placement is one record_brew_day with no ingredient pulls: brewed on the planned date, at the owner's placeholder
// volume for the brand's tier (Tier 1-2 19, 3 18, 4-6 16.5, 7 16, 8 14 bbl). No material stock moves.
// A batch is found by number and must also match the recipe and planned date written here, so a database whose
// numbers differ is refused instead of filled wrongly. A rerun skips a batch that is already brewed.
// Then it closes the pre-October batches the owner called completed (COMPLETED), through the importer's own
// close-planned history pass: brew day, volume and readings come from Lolev, the close date is its latest evidence.
// Usage: bun --env-file=<env> scripts/cellar-setup-20261114.ts <new dump> <first dump> --email <staff email> [--dry-run]
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { publicEnv } from "@/lib/env/public";
import { runCommand, unwrap, type Ctx } from "@/lib/commands/registry";
import { ctxForBearer } from "@/lib/commands/context";
import "@/lib/commands/all";
import { dry, importHistory, readDump } from "@/scripts/import-lolev";
import { mapHistory } from "@/lib/import/lolev";

/**
 * Owner, 2026-11-14: "anything from before october is completed". These five Lolev batches from before October 2026
 * are still planned in MGR because Lolev never marked them finished. Named by their Lolev batch name.
 */
/** Owner, 2026-11-14: the brandless Lolev batch "Batch • Nov 13, 2025" (MGR #186, recipe Hades) is the brand Hades, "for now". */
/** Owner, 2026-11-14: the Bad Bones collab (MGR #197, also planned without a brand) is Bonebreaker and "already packaged". */
const REBRANDED = [
  { lolevName: "Batch • Nov 13, 2025", brand: "Hades" },
  { lolevName: "UHA Tripple Bad Bones Collab • Oct 8, 2026", brand: "Bonebreaker" },
];
const COMPLETED = ["Samo • Aug 13, 2025", "Edo • Oct 7, 2025", "Batch • Nov 13, 2025", "Harvest • Nov 16, 2025", "Akko • Jan 26, 2026", "UHA Tripple Bad Bones Collab • Oct 8, 2026"];

/** One tank: the vessel, the batch that is in it (number, recipe, planned date), and the placeholder barrels. */
const PLACEMENTS: { vessel: string; batchNo: number; recipe: string; plannedOn: string; bbl: number }[] = [
  { vessel: "FV1", batchNo: 211, recipe: "Rock/Mineral #9", plannedOn: "2026-11-04", bbl: 16 },
  { vessel: "FV2", batchNo: 210, recipe: "Amphibian #7", plannedOn: "2026-11-03", bbl: 16 },
  { vessel: "FV3", batchNo: 215, recipe: "Lolev x CLAG Anniversary 4 UHA Tripple", plannedOn: "2026-11-12", bbl: 14 },
  { vessel: "FV4", batchNo: 213, recipe: "Animal #33", plannedOn: "2026-11-10", bbl: 16.5 },
  { vessel: "FV6", batchNo: 214, recipe: "Rock/Mineral #8", plannedOn: "2026-11-11", bbl: 16 },
  { vessel: "FV8", batchNo: 216, recipe: "Akko V", plannedOn: "2026-11-13", bbl: 18 },
  // A brite, filled directly: a fermenter stay since October would overlap the batch that fermenter holds now.
  { vessel: "BT4", batchNo: 206, recipe: "Rock/Mineral #7", plannedOn: "2026-10-28", bbl: 16 },
  { vessel: "FV9", batchNo: 209, recipe: "BDB x Bad Bones x Offscript", plannedOn: "2026-11-02", bbl: 16.5 },
  // Owner: BT1 is the Lupula from Oct 22 and FV5 the Lupula from Nov 5 ("yes"); FV7's sour base holds 20 bbl.
  { vessel: "BT1", batchNo: 204, recipe: "Lupula V", plannedOn: "2026-10-22", bbl: 18 },
  { vessel: "FV5", batchNo: 212, recipe: "Lupula V", plannedOn: "2026-11-05", bbl: 18 },
  { vessel: "FV7", batchNo: 203, recipe: "Lolev Sour Base", plannedOn: "2026-10-23", bbl: 20 },
];

/**
 * Owner, 2026-11-14: BT2 holds Monarch, "a dryhopped version of edo", from the Edo brewed "aug 11" (MGR #189, closed),
 * and the brand is new at "tier 2". A closed batch cannot hold a tank, so Monarch gets its own batch on Edo's recipe.
 */
const MONARCH = { brand: "Monarch", tier: "Tier 2", vessel: "BT2", bbl: 19, edoBatchNo: 189, edoRecipe: "Edo II", plannedOn: "2026-08-11",
  note: "Monarch: dry-hopped Edo II (#189, planned 2026-08-11), in BT2" };

/** Signs the staff member in with a one-time link minted from the secret key (no email is sent). Same route as lolev-apply-20261113.ts. */
async function signIn(email: string): Promise<Ctx> {
  const db = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
  const admin = createClient(publicEnv.supabaseUrl, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const { error } = await db.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (error) throw error;
  const user = (await db.auth.getUser()).data.user!;
  const member = (await unwrap(db.from("brewery_users").select("brewery_id").eq("user_id", user.id))) ?? [];
  if (member.length !== 1) throw new Error(`${email} must belong to exactly one brewery (found ${member.length})`);
  return ctxForBearer(db, user.id, member[0].brewery_id);
}

async function main() {
  const email = process.argv[process.argv.indexOf("--email") + 1];
  const dryRun = process.argv.includes("--dry-run");
  const ctx = await signIn(email);
  const brewery = await unwrap(ctx.db.from("breweries").select("name").eq("id", ctx.breweryId).single());
  console.log(`database ${publicEnv.supabaseUrl}, brewery ${brewery?.name}${dryRun ? " (dry run, nothing written)" : ""}`);

  // What a vessel holds is its open occupancy (vessel_contents is not readable by a staff session).
  const rows = (await unwrap(ctx.db.from("vessels").select("id, name").eq("brewery_id", ctx.breweryId).eq("active", true))) ?? [];
  const open = (await unwrap(ctx.db.from("vessel_occupancies").select("vessel_id, batch_id").eq("brewery_id", ctx.breweryId).is("ended_at", null))) ?? [];
  const vessels = rows.map((v) => ({ vessel_id: v.id, name: v.name, batch_id: open.find((o) => o.vessel_id === v.id)?.batch_id }));
  const batches = (await unwrap(ctx.db.from("batches")
    .select("id, batch_no, planned_on, brewed_on, closed_at, cancelled_at, recipe_versions(recipes(name))")
    .eq("brewery_id", ctx.breweryId).in("batch_no", PLACEMENTS.map((p) => p.batchNo)))) ?? [];

  // Every placement is checked before the first write, so a mismatch leaves nothing half done.
  const todo = PLACEMENTS.flatMap((p) => {
    const what = `${p.vessel} ← #${p.batchNo} ${p.recipe}`;
    const vessel = vessels.find((v) => v.name === p.vessel);
    const batch = batches.find((b) => b.batch_no === p.batchNo);
    if (!vessel) throw new Error(`${what}: no vessel ${p.vessel}`);
    if (!batch) throw new Error(`${what}: no batch #${p.batchNo}`);
    const recipe = batch.recipe_versions?.recipes?.name;
    if (recipe !== p.recipe || batch.planned_on !== p.plannedOn) throw new Error(`${what}: batch is "${recipe}" planned ${batch.planned_on}`);
    if (batch.closed_at || batch.cancelled_at) throw new Error(`${what}: batch is closed or cancelled`);
    if (batch.brewed_on) {
      if (vessel.batch_id !== batch.id) throw new Error(`${what}: already brewed, but not in ${p.vessel}`);
      console.log(`${what}: already there`);
      return [];
    }
    if (vessel.batch_id) throw new Error(`${what}: ${p.vessel} holds another batch`);
    return [{ ...p, what, vesselId: vessel.vessel_id, batchId: batch.id }];
  });

  for (const t of todo) {
    console.log(`${dryRun ? "would " : ""}record_brew_day ${t.what}: ${t.bbl} bbl, brewed ${t.plannedOn}`);
    if (!dryRun) await runCommand("record_brew_day", { batchId: t.batchId, vesselId: t.vesselId, initialBbl: t.bbl, brewedOn: t.plannedOn, actuals: [], confirmEmpty: true }, ctx);
  }
  // Monarch: the brand if it is missing, then one batch on Edo II's recipe, filled straight into BT2.
  const m = MONARCH;
  const made = (await unwrap(ctx.db.from("batches").select("id, brewed_on").eq("brewery_id", ctx.breweryId).eq("note", m.note))) ?? [];
  const bt2 = vessels.find((v) => v.name === m.vessel)!;
  if (made.length) {
    if (made.length !== 1 || !made[0].brewed_on || bt2.batch_id !== made[0].id) throw new Error("Monarch: a batch exists but is not in BT2");
    console.log("Monarch: already there");
  } else {
    if (bt2.batch_id) throw new Error("Monarch: BT2 holds another batch");
    const edo = await unwrap(ctx.db.from("batches").select("planned_on, recipe_version_id, recipe_versions(recipes(name))").eq("brewery_id", ctx.breweryId).eq("batch_no", m.edoBatchNo).single());
    if (edo?.recipe_versions?.recipes?.name !== m.edoRecipe || edo.planned_on !== m.plannedOn) throw new Error(`Monarch: #${m.edoBatchNo} is not ${m.edoRecipe} planned ${m.plannedOn}`);
    const tier = await unwrap(ctx.db.from("price_groups").select("id").eq("brewery_id", ctx.breweryId).eq("name", m.tier).single());
    const findBrand = async () => ((await unwrap(ctx.db.from("brands").select("id").eq("brewery_id", ctx.breweryId).eq("name", m.brand))) ?? [])[0];
    console.log(`${dryRun ? "would " : ""}${(await findBrand()) ? "" : `create brand ${m.brand} (${m.tier}), `}schedule ${m.brand} on ${m.edoRecipe}, record_brew_day ${m.vessel}: ${m.bbl} bbl, brewed ${m.plannedOn}`);
    if (!dryRun) {
      if (!(await findBrand())) await runCommand("upsert_brand", { name: m.brand, priceGroupId: tier!.id }, ctx);
      const batch = await runCommand("schedule_batch", { intendedBrandId: (await findBrand()).id, recipeVersionId: edo.recipe_version_id!, plannedOn: m.plannedOn, plannedBbl: m.bbl, note: m.note }, ctx) as { id: string };
      await runCommand("record_brew_day", { batchId: batch.id, vesselId: bt2.vessel_id, initialBbl: m.bbl, brewedOn: m.plannedOn, actuals: [], confirmEmpty: true }, ctx);
    }
  }

  // Cinnabar and Rose Quartz. Owner, 2026-11-14: "ill will collab is another alias for cinnabar", and Rock/Mineral #7
  // "might be the next beer which is rose quartz". An earlier run of this script had moved "Cinnabar" onto Rock/Mineral #7's
  // brand; this puts it back on the Ill Will collab. upsert_brand replaces every field, so the others go back as they are.
  const brands = (await unwrap(ctx.db.from("brands").select("id, name, alias, abv, description, category, price_group_id, hops, styles(name)").eq("brewery_id", ctx.breweryId).in("name", ["Cinnabar", "Ill Will Collab UHA", "Animal #30"]))) ?? [];
  const rename = async (from: string, name: string, alias?: string) => {
    const b = brands.find((x) => x.name === from);
    if (!b) throw new Error(`no brand "${from}"`);
    console.log(`${dryRun ? "would " : ""}upsert_brand "${from}" → "${name}"${alias ? ` (alias "${alias}")` : ""}`);
    if (!dryRun) await runCommand("upsert_brand", {
      id: b.id, name, ...(alias ? { alias } : {}), ...(b.price_group_id ? { priceGroupId: b.price_group_id } : {}),
      ...(b.styles?.name ? { style: b.styles.name } : {}), ...(b.abv != null ? { abv: Number(b.abv) } : {}),
      ...(b.description ? { description: b.description } : {}), ...(b.category ? { category: b.category } : {}), ...(b.hops ? { hops: b.hops } : {}),
    }, ctx);
  };
  if (brands.find((x) => x.name === "Cinnabar")?.alias === "Mineral #7") {
    await rename("Cinnabar", "Rose Quartz", "Mineral #7");
    await rename("Ill Will Collab UHA", "Cinnabar", "Ill Will Collab UHA");
  } else console.log("Cinnabar: already the Ill Will collab's brand");
  // Owner, 2026-11-14: "30 is Coyote". Named like its siblings: the animal as the name, "Animal #30" as the alias.
  if (brands.some((x) => x.name === "Animal #30")) await rename("Animal #30", "Coyote", "Animal #30");
  else console.log("Coyote: already renamed");
  // Owner, 2026-11-14: Clouded Leopard (Animal #32) "obviously" has a half-barrel SKU. Made like its siblings' halves:
  // named by the series alias, in the keg pool its sixtel already uses.
  const leopard = await unwrap(ctx.db.from("brands").select("id, skus(name, keg_pool_id)").eq("brewery_id", ctx.breweryId).eq("name", "Clouded Leopard").single());
  const half = await unwrap(ctx.db.from("formats").select("id").eq("brewery_id", ctx.breweryId).eq("name", "Half").single());
  if (leopard!.skus.some((k) => k.name === "Animal #32 · Half")) console.log("Animal #32 · Half: already there");
  else {
    const pool = leopard!.skus.find((k) => k.name === "Animal #32 · Sixtel")?.keg_pool_id;
    if (!pool) throw new Error("Animal #32 · Sixtel has no keg pool to copy");
    console.log(`${dryRun ? "would " : ""}create_sku Animal #32 · Half`);
    if (!dryRun) await runCommand("create_sku", { brandId: leopard!.id, formatId: half!.id, name: "Animal #32 · Half", kegPoolId: pool }, ctx);
  }

  // The completed batches. Only these five reach the history pass, marked finished, so it closes nothing else.
  const [newDir, firstDir] = process.argv.slice(2);
  const dump = readDump(newDir);
  // Lolev holds these batches' readings twice, embedded on the batch and in `tests` under other ids; the embedded copy of a
  // reading `tests` also has (same time) is dropped, so each is recorded once.
  const testTimes = new Set(dump.tests.map((t) => `${t.batch} ${t.time}`));
  const finished = dump.batches.filter((b) => COMPLETED.includes(b.name)).map((b) => ({
    ...b, terminalState: "completed", testsEmbedded: b.testsEmbedded?.filter((e) => !testTimes.has(`${b._id} ${e.time}`)),
  }));
  if (finished.length !== COMPLETED.length) throw new Error(`the dump has ${finished.length} of the ${COMPLETED.length} completed batches`);
  dry.on = dryRun;
  const r = await importHistory({ ...dump, batches: finished }, dump.beers, ctx, readDump(firstDir), true);
  console.log("completed:", r.created, ...r.done, ...dry.planned.map((x) => `would ${x}`), ...r.held.map((x) => `HELD ${x}`), ...r.skipped.map((x) => `SKIPPED ${x.name}: ${x.reason}`), ...r.failed.map((x) => `FAILED ${x.name}: ${x.error}`));

  // Hades and Bonebreaker. The history pass holds them: the planned batch has no brand, and no command sets one on a batch. So the
  // brandless plan is cancelled and the same batch is scheduled again under its brand, then closed as history from Lolev's record.
  for (const x of REBRANDED) {
    const note = `Imported from Lolev: ${x.lolevName}`;
    const plans = (await unwrap(ctx.db.from("batches").select("id, batch_no, recipe_version_id, intended_brand_id, closed_at, cancelled_at").eq("brewery_id", ctx.breweryId).eq("note", note))) ?? [];
    if (plans.some((b) => b.closed_at)) { console.log(`${x.brand}: already completed`); continue; }
    const plan = plans.find((b) => !b.cancelled_at && !b.intended_brand_id);
    if (!plan || plans.length !== 1) throw new Error(`${x.brand}: expected one brandless planned batch with note "${note}", found ${plans.length}`);
    const brand = await unwrap(ctx.db.from("brands").select("id").eq("brewery_id", ctx.breweryId).eq("name", x.brand).single());
    const h = mapHistory(finished.filter((b) => b.name === x.lolevName), dump.brewLogs, dump.tests, dump.finishedGoods, new Map()).history[0];
    console.log(`${dryRun ? "would " : ""}cancel #${plan.batch_no}, schedule it again as ${x.brand}, close as history: brewed ${h.brewedOn}, closed ${h.closedOn}, ${h.knockoutBbl} bbl, ${h.readings.length} readings`);
    if (dryRun) continue;
    await runCommand("cancel_batch", { batchId: plan.id }, ctx);
    const batch = await runCommand("schedule_batch", { intendedBrandId: brand!.id, ...(plan.recipe_version_id ? { recipeVersionId: plan.recipe_version_id } : {}), plannedOn: h.brewedOn, plannedBbl: h.knockoutBbl, note }, ctx) as { id: string };
    await runCommand("record_historical_batch", { batchId: batch.id, brewedOn: h.brewedOn, closedOn: h.closedOn, knockoutBbl: h.knockoutBbl, process: h.process }, ctx);
    for (const r of h.readings) {
      await runCommand("record_fermentation_reading", { batchId: batch.id, at: r.at, note: r.note, ...(r.tempF !== undefined ? { tempF: r.tempF } : {}),
        ...(r.gravityPlato !== undefined ? { gravityPlato: r.gravityPlato } : {}), ...(r.ph !== undefined ? { ph: r.ph } : {}) }, ctx);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
