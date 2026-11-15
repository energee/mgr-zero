// One-off (owner, 2026-11-14): Masai Giraffe, Clouded Leopard and Bearded Dragon are "all packaged if not in any tank".
// Lolev's last record of them is 2026-11-11, the day the books opened, so they cannot be imported history: each gets a
// real brew day and a real packaging run. Owner's answers: packaged 2026-11-12, stock into the Lawrenceville Orders bin,
// units = the open (submitted) orders, and the batches stay open so no loss is written until real totals are known.
// The beer the orders do not account for therefore stays in the brite the brew day was recorded into.
// Brew day: Lolev's 22 bbl on the planned date, no ingredient pulls (as scripts/cellar-setup-20261114.ts).
// A rerun picks each beer up where it stopped: brew day, run planned, run started, run closed.
// Usage: bun --env-file=<env> scripts/packaging-20261114.ts --email <staff email> [--dry-run]
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { publicEnv } from "@/lib/env/public";
import { runCommand, unwrap, type Ctx } from "@/lib/commands/registry";
import { ctxForBearer } from "@/lib/commands/context";
import "@/lib/commands/all";

const PACKAGED_ON = "2026-11-12", BREW_BBL = 22, LOCATION = "Lolev Lawrenceville", BIN = "Lawrenceville Orders";
/** One beer: its batch (number, recipe, planned date), the empty brite it is recorded into, and the units the owner confirmed (SKU name → units). */
const RUNS: { batchNo: number; recipe: string; plannedOn: string; vessel: string; units: Record<string, number> }[] = [
  { batchNo: 205, recipe: "Animal #31", plannedOn: "2026-10-27", vessel: "BT3", units: { "Animal #31 · Case": 31, "Animal #31 · Sixtel": 3, "Animal #31 · Sixtel (one-way)": 1 } },
  { batchNo: 207, recipe: "Animal #32", plannedOn: "2026-10-29", vessel: "BT5", units: { "Animal #32 · Case": 127, "Animal #32 · Sixtel": 6, "Animal #32 · Sixtel (one-way)": 12 } },
  { batchNo: 208, recipe: "Reptile #6", plannedOn: "2026-10-30", vessel: "BT6", units: { "Reptile #6 · Case": 93, "Reptile #6 · Half": 4, "Reptile #6 · Sixtel": 12, "Reptile #6 · Sixtel (one-way)": 3 } },
];

/** Signs the staff member in with a one-time link minted from the secret key (no email is sent). Same route as cellar-setup-20261114.ts. */
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
  const { db, breweryId } = ctx;
  console.log(`database ${publicEnv.supabaseUrl}${dryRun ? " (dry run, nothing written)" : ""}`);

  const location = await unwrap(db.from("locations").select("id, bins(id, name)").eq("brewery_id", breweryId).eq("name", LOCATION).single());
  const bin = location!.bins.find((b) => b.name === BIN);
  if (!bin) throw new Error(`no bin ${BIN} at ${LOCATION}`);
  const vessels = (await unwrap(db.from("vessels").select("id, name").eq("brewery_id", breweryId).eq("active", true))) ?? [];
  const occupied = (await unwrap(db.from("vessel_occupancies").select("vessel_id").eq("brewery_id", breweryId).is("ended_at", null))) ?? [];

  // Every beer is checked before the first write.
  const todo = [];
  for (const r of RUNS) {
    const what = `#${r.batchNo} ${r.recipe}`;
    const batch = await unwrap(db.from("batches").select("id, planned_on, brewed_on, closed_at, cancelled_at, intended_brand_id, recipe_versions(recipes(name))").eq("brewery_id", breweryId).eq("batch_no", r.batchNo).single());
    if (batch?.recipe_versions?.recipes?.name !== r.recipe || batch.planned_on !== r.plannedOn || !batch.intended_brand_id) throw new Error(`${what}: batch does not match`);
    if (batch.closed_at || batch.cancelled_at) throw new Error(`${what}: batch is closed or cancelled`);
    const vessel = vessels.find((v) => v.name === r.vessel);
    if (!vessel || (!batch.brewed_on && occupied.some((o) => o.vessel_id === vessel.id))) throw new Error(`${what}: ${r.vessel} is missing or occupied`);
    // The confirmed units must still equal the open orders in this database.
    const skus = (await unwrap(db.from("skus").select("id, name, formats(bbl_per_unit), order_lines(qty_ordered, orders(status))").eq("brewery_id", breweryId).eq("brand_id", batch.intended_brand_id))) ?? [];
    const outputs = skus.flatMap((s) => {
      const ordered = s.order_lines.filter((l) => l.orders?.status === "submitted").reduce((n, l) => n + Number(l.qty_ordered), 0);
      if (ordered !== (r.units[s.name] ?? 0)) throw new Error(`${what}: ${s.name} has ${ordered} on open orders, the owner confirmed ${r.units[s.name] ?? 0}`);
      return ordered ? [{ skuId: s.id, qty: ordered, bbl: ordered * Number(s.formats!.bbl_per_unit) }] : [];
    });
    if (outputs.length !== Object.keys(r.units).length) throw new Error(`${what}: a confirmed SKU is missing`);
    const bblDrawn = Math.round(outputs.reduce((n, o) => n + o.bbl, 0) * 1000) / 1000;
    todo.push({ ...r, what, brewed: !!batch.brewed_on, batchId: batch.id, brandId: batch.intended_brand_id, vesselId: vessel.id, outputs, bblDrawn });
  }

  for (const t of todo) {
    console.log(`${dryRun ? "would " : ""}brew ${t.what} into ${t.vessel}: ${BREW_BBL} bbl on ${t.plannedOn}; package ${JSON.stringify(t.units)} = ${t.bblDrawn} bbl on ${PACKAGED_ON} into ${BIN}; ${(BREW_BBL - t.bblDrawn).toFixed(3)} bbl stays in ${t.vessel}`);
    if (dryRun) continue;
    if (!t.brewed) await runCommand("record_brew_day", { batchId: t.batchId, vesselId: t.vesselId, initialBbl: BREW_BBL, brewedOn: t.plannedOn, actuals: [], confirmEmpty: true }, ctx);
    const occ = await unwrap(db.from("vessel_occupancies").select("id, packaging_runs(id, started_at, closed_at, cancelled_at)").eq("batch_id", t.batchId).is("ended_at", null).single());
    let run = occ!.packaging_runs.find((x) => !x.cancelled_at);
    if (run?.closed_at) { console.log(`${t.what}: already packaged`); continue; }
    if (!run) run = { ...(await runCommand("schedule_packaging_run", { brandId: t.brandId, plannedOn: PACKAGED_ON, occupancyId: occ!.id, outputs: t.outputs.map((o) => ({ skuId: o.skuId, qtyPlanned: o.qty })) }, ctx) as { id: string }), started_at: null, closed_at: null, cancelled_at: null };
    if (!run.started_at) await runCommand("update_packaging_run", { runId: run.id, startedAt: `${PACKAGED_ON}T14:00:00.000Z` }, ctx);
    // Closing wants every planned material confirmed. Each is confirmed at zero used: the owner gave no material counts,
    // and MGR holds no stock of them (one-way keg shells) to draw from.
    const plan = await runCommand("get_packaging_close_plan", { runId: run.id }, ctx) as { revision: string; planned: { materialId: string; name: string; qty: number }[] };
    console.log(`${t.what}: materials confirmed at zero used: ${plan.planned.map((m) => `${m.qty} ${m.name}`).join(", ") || "none planned"}`);
    await runCommand("close_packaging_run", { runId: run.id, bblDrawn: t.bblDrawn, outputs: t.outputs.map((o) => ({ skuId: o.skuId, qtyActual: o.qty })),
      lotCode: `L-${t.batchNo}-${PACKAGED_ON.replaceAll("-", "")}`, packagedOn: PACKAGED_ON, locationId: location!.id, binId: bin.id, planRevision: plan.revision,
      actuals: plan.planned.map((m) => ({ materialId: m.materialId, locationId: location!.id, binId: bin.id, lotId: null, used: 0, loss: 0, unused: 0 })) }, ctx);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
