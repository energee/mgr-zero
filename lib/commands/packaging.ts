// lib/commands/packaging.ts — turning beer into stock. A packaging run is
// planned against a *brand* and a date ("600 cans of Stout on Friday"), which
// is what a brewer knows first; the tank it draws from is picked later, and
// only then can the run start. The brand is therefore the run's identity and
// the occupancy is optional — see `packaging_runs` in the baseline, whose
// check constraint enforces "no tank, no start" and whose trigger refuses a
// tank already promised to a different brand.
//
// `product_volume_requirements` (a view) reads these plans back as demand and
// answers the brewhouse's question: what still has to be brewed?
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError, type Ctx } from "./registry";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const outputs = z.array(z.object({
  skuId: z.string().uuid(),
  qtyPlanned: z.number().nonnegative(),
}));

const rpcOutputs = (lines: z.infer<typeof outputs>) =>
  lines.map((l) => ({ sku_id: l.skuId, qty_planned: l.qtyPlanned }));

defineCommand({
  name: "schedule_packaging_run",
  description: "Plan a packaging run: the brand being packaged, the date, the units intended, and optionally the tank it draws from",
  input: z.object({
    brandId: z.string().uuid(),
    plannedOn: isoDate,
    occupancyId: z.string().uuid().optional(),
    outputs,
  }),
  roles: ["admin", "brewer", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("schedule_packaging_run", {
    p_brewery: ctx.breweryId, p_brand: i.brandId, p_planned_on: i.plannedOn,
    p_occupancy: i.occupancyId ?? null, p_outputs: rpcOutputs(i.outputs),
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "update_packaging_run",
  description: "Revise a planned run: pick the tank it draws from, replace the planned units, or stamp it started (which needs a tank)",
  input: z.object({
    runId: z.string().uuid(),
    occupancyId: z.string().uuid().optional(),
    outputs: outputs.optional(),
    startedAt: z.string().datetime().optional(),
  }),
  roles: ["admin", "brewer", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_packaging_run", {
    p_brewery: ctx.breweryId, p_run: i.runId, p_occupancy: i.occupancyId ?? null,
    // null means "leave the outputs alone"; [] means "clear them".
    p_outputs: i.outputs === undefined ? null : rpcOutputs(i.outputs),
    p_started_at: i.startedAt ?? null, p_request_id: execution.requestId,
  })),
});

// Closing is the moment beer becomes stock. `locationId`/`binId` are required
// rather than derived: a vessel has no location, so the finished goods would
// otherwise have nowhere to land. Missing planned packages settle at zero --
// the run is history once it closes, so "we filled none of those" is stated,
// not left null. The occupancy stays open on purpose: emptying the tank is a
// cellar decision (`record_cellar_transfer` / ending the occupancy), not a
// side effect of packaging.
defineCommand({
  name: "close_packaging_run",
  description: "Close a started run: record the barrels drawn and the units actually filled, which writes the lot, the production_in stock and the packaging materials consumed",
  input: z.object({
    runId: z.string().uuid(),
    bblDrawn: z.number().nonnegative(),
    outputs: z.array(z.object({ skuId: z.string().uuid(), qtyActual: z.number().nonnegative() })),
    lotCode: z.string().min(1),
    packagedOn: isoDate,
    bestBy: isoDate.optional(),
    locationId: z.string().uuid(),
    binId: z.string().uuid(),
  }),
  roles: ["admin", "brewer", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("close_packaging_run", {
    p_brewery: ctx.breweryId, p_run: i.runId, p_bbl_drawn: i.bblDrawn,
    p_outputs: i.outputs.map((o) => ({ sku_id: o.skuId, qty_actual: o.qtyActual })),
    p_lot_code: i.lotCode, p_packaged_on: i.packagedOn, p_best_by: i.bestBy ?? null,
    p_location: i.locationId, p_bin: i.binId, p_request_id: execution.requestId,
  })),
});

type RunRow = {
  id: string; run_no: number; brand_id: string; occupancy_id: string | null;
  planned_on: string; started_at: string | null; closed_at: string | null;
  bbl_drawn: number | null; note: string | null;
};

// Names for a set of brand ids, in one read. Embedded selects are avoided
// throughout the command layer (see production.ts): every join here is an
// explicit id -> name map, which keeps the composite-FK tables unambiguous.
async function brandNames(ctx: Ctx, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map<string, string>();
  const rows = (await unwrap(ctx.db.from("brands").select("id, name")
    .eq("brewery_id", ctx.breweryId).in("id", unique))) ?? [];
  return new Map(rows.map((r) => [r.id as string, r.name as string]));
}

// Vessel name per occupancy id, for the runs that have picked a tank.
async function vesselNames(ctx: Ctx, occupancyIds: (string | null)[]) {
  const unique = [...new Set(occupancyIds.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map<string, string>();
  const occs = (await unwrap(ctx.db.from("vessel_occupancies").select("id, vessel_id")
    .eq("brewery_id", ctx.breweryId).in("id", unique))) ?? [];
  const vessels = (await unwrap(ctx.db.from("vessels").select("id, name")
    .in("id", [...new Set(occs.map((o) => o.vessel_id as string))]))) ?? [];
  const names = new Map(vessels.map((v) => [v.id as string, v.name as string]));
  return new Map(occs.map((o) => [o.id as string, names.get(o.vessel_id as string) ?? ""]));
}

// Planned units per run. Summed here rather than in a view: the number is a
// convenience for the list, and packaging_run_outputs stays the truth.
async function plannedQty(ctx: Ctx, runIds: string[]) {
  if (runIds.length === 0) return new Map<string, number>();
  const rows = (await unwrap(ctx.db.from("packaging_run_outputs").select("run_id, qty_planned")
    .eq("brewery_id", ctx.breweryId).in("run_id", runIds))) ?? [];
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.run_id as string, (totals.get(r.run_id as string) ?? 0) + Number(r.qty_planned));
  return totals;
}

const RUN_COLUMNS = "id, run_no, brand_id, occupancy_id, planned_on, started_at, closed_at, bbl_drawn, note";

defineQuery({
  name: "list_packaging_runs",
  description: "Packaging runs by planned date, newest first, with the brand each one packages, the tank it draws from and the units planned",
  input: z.object({}), roles: ["admin", "brewer", "warehouse"],
  handler: async (ctx) => {
    const runs = (await unwrap(ctx.db.from("packaging_runs").select(RUN_COLUMNS)
      .eq("brewery_id", ctx.breweryId).order("planned_on", { ascending: false })) ?? []) as RunRow[];
    if (runs.length === 0) return [];

    const brands = await brandNames(ctx, runs.map((r) => r.brand_id));
    const vessels = await vesselNames(ctx, runs.map((r) => r.occupancy_id));
    const qty = await plannedQty(ctx, runs.map((r) => r.id));

    return runs.map((r) => ({
      ...r,
      brand_name: brands.get(r.brand_id) ?? null,
      vessel_name: r.occupancy_id ? vessels.get(r.occupancy_id) ?? null : null,
      qty_planned: qty.get(r.id) ?? 0,
    }));
  },
});

defineQuery({
  name: "get_packaging_run",
  description: "One packaging run with the packages it plans to fill",
  input: z.object({ runId: z.string().uuid() }), roles: ["admin", "brewer", "warehouse"],
  handler: async (ctx, i) => {
    const run = (await unwrap(ctx.db.from("packaging_runs").select(RUN_COLUMNS)
      .eq("brewery_id", ctx.breweryId).eq("id", i.runId).maybeSingle())) as RunRow | null;
    if (!run) throw new CommandError("packaging run not found", 404, "not_found");

    const brands = await brandNames(ctx, [run.brand_id]);
    const vessels = await vesselNames(ctx, [run.occupancy_id]);
    const rows = (await unwrap(ctx.db.from("packaging_run_outputs")
      .select("id, sku_id, qty_planned, qty_actual")
      .eq("brewery_id", ctx.breweryId).eq("run_id", i.runId).order("id"))) ?? [];
    const skus = (await unwrap(ctx.db.from("skus").select("id, name")
      .eq("brewery_id", ctx.breweryId).in("id", [...new Set(rows.map((o) => o.sku_id as string))]))) ?? [];
    const skuNames = new Map(skus.map((s) => [s.id as string, s.name as string]));

    return {
      run: {
        ...run,
        brand_name: brands.get(run.brand_id) ?? null,
        vessel_name: run.occupancy_id ? vessels.get(run.occupancy_id) ?? null : null,
      },
      outputs: rows.map((o) => ({
        id: o.id as string, sku_id: o.sku_id as string,
        qty_planned: Number(o.qty_planned), qty_actual: o.qty_actual === null ? null : Number(o.qty_actual),
        sku_name: skuNames.get(o.sku_id as string) ?? null,
      })),
    };
  },
});

defineQuery({
  name: "list_occupancies",
  description: "Tanks with beer in them right now: the vessel, the batch, the brand it intends and how many barrels are left",
  input: z.object({}), roles: ["admin", "brewer", "warehouse"],
  handler: async (ctx) => {
    const rows = (await unwrap(ctx.db.from("occupancy_volumes")
      .select("occupancy_id, vessel_id, batch_id, started_at, bbl")
      .eq("brewery_id", ctx.breweryId).is("ended_at", null).order("started_at"))) ?? [];
    if (rows.length === 0) return [];

    const vessels = (await unwrap(ctx.db.from("vessels").select("id, name")
      .in("id", [...new Set(rows.map((r) => r.vessel_id as string))]))) ?? [];
    const vesselNameById = new Map(vessels.map((v) => [v.id as string, v.name as string]));
    const batches = (await unwrap(ctx.db.from("batches").select("id, batch_no, intended_brand_id")
      .in("id", [...new Set(rows.map((r) => r.batch_id as string))]))) ?? [];
    const batchById = new Map(batches.map((b) => [b.id as string, b]));
    const brands = await brandNames(ctx, batches.map((b) => b.intended_brand_id as string | null));

    return rows.map((r) => {
      const batch = batchById.get(r.batch_id as string);
      const intended = (batch?.intended_brand_id ?? null) as string | null;
      return {
        occupancy_id: r.occupancy_id as string,
        vessel_id: r.vessel_id as string,
        vessel_name: vesselNameById.get(r.vessel_id as string) ?? null,
        batch_id: r.batch_id as string,
        batch_no: (batch?.batch_no ?? null) as number | null,
        brand_name: intended ? brands.get(intended) ?? null : null,
        started_at: r.started_at as string,
        bbl: Number(r.bbl),
      };
    });
  },
});
