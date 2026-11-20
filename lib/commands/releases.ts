// lib/commands/releases.ts — portal releases (docs/plans/portal-release-windows.md,
// Phase A). A release offers a quantity of one SKU to portal buyers, from a
// planned batch or from packaged stock, for delivery on or after its
// ships-from date. Admin and sales release, edit and withdraw; every staff
// role reads. Counts and open/closed come from the database
// (private.release_state through release_rows), never from the page.
import { z } from "zod";
import { completeRows, defineCommand, defineQuery, isoDate, PAGE_SIZE, unwrap } from "./registry";

const READ_ROLES = ["admin", "sales", "warehouse", "brewer"] as const;
const WRITE_ROLES = ["admin", "sales"] as const;
const units = z.number().int().positive().describe("Whole units of the SKU offered in this release");
/** A numeric column that may be null, as a number or null. */
const num = (value: unknown) => (value == null ? null : Number(value));
const wholesaleBbl = z.number().positive().multipleOf(0.01).describe("Barrels of the batch open to wholesale: the pool every package of the batch draws from, at most the batch's planned barrels");

defineCommand({
  name: "release_sku", description: "Release SKUs for portal ordering, one release per line: from a planned batch (each SKU a package of its brand, ships from the batch's ready date unless given; wholesaleBbl sets the pool its packages share, and a line may then leave qty out) or, without batchId, from packaged stock (ships from today; each line needs a qty that fits what is free to promise)",
  compensation: "Reverse with withdraw_release on each release.",
  roles: [...WRITE_ROLES],
  input: z.object({
    batchId: z.string().uuid().optional().describe("The planned batch released; omit to release packaged stock"),
    shipsFrom: isoDate.optional().describe("Earliest delivery date for orders on this release"),
    ordersCloseOn: isoDate.optional().describe("Last day buyers can order from this release; omit for no limit"),
    wholesaleBbl: wholesaleBbl.optional(),
    lines: z.array(z.object({ skuId: z.string().uuid(), qty: units.optional().describe("Whole units offered; omit on a batch with a pool to limit the package only by the pool") })).min(1),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("release_sku", {
    p_brewery: ctx.breweryId, p_batch: i.batchId ?? null, p_ships_from: i.shipsFrom ?? null,
    p_orders_close_on: i.ordersCloseOn ?? null, p_lines: i.lines.map((l) => ({ sku_id: l.skuId, ...(l.qty === undefined ? {} : { qty: l.qty }) })), p_request_id: execution.requestId,
    ...(i.wholesaleBbl === undefined ? {} : { p_wholesale_bbl: i.wholesaleBbl }),
  })),
});

defineCommand({
  name: "update_release", description: "Change a release's quantity and order-by date (null clears it); never below the quantity already confirmed on it, and a larger stock release must fit what is free to promise. On a batch release with a pool, a null qty removes the package's own limit, and wholesaleBbl changes the batch's pool for all its packages",
  compensation: "Reverse with update_release and the previous values.",
  roles: [...WRITE_ROLES],
  input: z.object({
    releaseId: z.string().uuid(), qty: units.nullable(),
    ordersCloseOn: isoDate.nullable().describe("Last day buyers can order from this release; null for no limit"),
    wholesaleBbl: wholesaleBbl.optional(),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_release", {
    p_brewery: ctx.breweryId, p_release: i.releaseId, p_qty: i.qty as number, p_orders_close_on: i.ordersCloseOn as string, p_request_id: execution.requestId,
    ...(i.wholesaleBbl === undefined ? {} : { p_wholesale_bbl: i.wholesaleBbl }),
  })),
});

defineCommand({
  name: "withdraw_release", description: "Withdraw a release so buyers can no longer order from it; the release and orders already submitted against it stay",
  compensation: "Cannot be undone; release the SKU again with release_sku.",
  roles: [...WRITE_ROLES],
  input: z.object({ releaseId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("withdraw_release", { p_brewery: ctx.breweryId, p_release: i.releaseId, p_request_id: execution.requestId })),
});

defineQuery({
  name: "list_releases", description: "Releases with their SKU, batch number and batch ready date, quantity, ships-from and order-by dates, whether buyers can still order (open) and whether its batch was cancelled, units confirmed, pre-ordered (submitted, not yet confirmed) and remaining, and for a batch with a pool the package's barrels per unit, the pool and the barrels of it left (qty is null when the package has no limit of its own); optionally only these ids, SKUs or batches, or only open or closed releases",
  roles: [...READ_ROLES],
  input: z.object({
    ids: z.array(z.string().uuid()).optional().describe("Only these releases"),
    skuIds: z.array(z.string().uuid()).optional().describe("Only releases of these SKUs"),
    batchIds: z.array(z.string().uuid()).optional().describe("Only releases of these batches"),
    open: z.boolean().optional().describe("true: only releases buyers can order from; false: only withdrawn or closed ones"),
  }),
  handler: async (ctx, i) => {
    const rows = await completeRows("Release list", (start) => ctx.db.rpc("release_rows", {
      p_brewery: ctx.breweryId, p_ids: i.ids, p_skus: i.skuIds, p_batches: i.batchIds, p_open: i.open,
    }, { count: "exact" }).range(start, start + PAGE_SIZE - 1));
    return rows.map((r) => ({ ...r, qty: num(r.qty), confirmed: Number(r.confirmed), preordered: Number(r.preordered), remaining: Number(r.remaining),
      bbl_per_unit: num(r.bbl_per_unit), pool_bbl: num(r.pool_bbl), pool_left_bbl: num(r.pool_left_bbl), planned_bbl: num(r.planned_bbl) }));
  },
});

defineQuery({
  name: "list_release_batches", description: "Planned batches a release can draw on: each unpackaged batch's active packaged SKUs (with SKU and brand names), its planned barrels, its pool when it has one (wholesale_bbl) and its ready date; optionally only these SKUs",
  roles: [...READ_ROLES],
  input: z.object({ skuIds: z.array(z.string().uuid()).optional().describe("Only these SKUs") }),
  handler: async (ctx, i) => {
    const rows = await completeRows("Release batches", (start) => {
      let q = ctx.db.from("release_batch_skus").select("batch_id, batch_no, sku_id, planned_bbl, wholesale_bbl, needed_by", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).order("needed_by").order("batch_no").order("sku_id");
      if (i.skuIds) q = q.in("sku_id", i.skuIds);
      return q.range(start, start + PAGE_SIZE - 1);
    });
    // PostgREST cannot embed through the view, so the SKU and brand names are a second read.
    const skuIds = [...new Set(rows.map((r) => r.sku_id as string))];
    const skus = skuIds.length ? await completeRows("Release batch SKUs", (start) => ctx.db.from("skus")
      .select("id, name, brands(name)", { count: "exact" }).eq("brewery_id", ctx.breweryId).in("id", skuIds).order("id").range(start, start + PAGE_SIZE - 1)) : [];
    const names = new Map(skus.map((s) => [s.id, { name: s.name, brands: s.brands }]));
    return rows.map((r) => ({ ...r, planned_bbl: Number(r.planned_bbl), wholesale_bbl: num(r.wholesale_bbl), skus: names.get(r.sku_id as string) ?? null }));
  },
});

// Customer ceilings (docs/plans/release-pool-and-ceilings.md): the share of a
// batch pool each customer may order until ceilings lift.
defineQuery({
  name: "list_release_shares", description: "Each customer's ceiling on a batch pool, in percent: the share typed on the customer (manual_pct), their part of recent purchases counted once (base_pct, null without a history window or purchases) and the ceiling that applies (pct: typed, else calculated with stock purchases counting for more, else null for none)",
  roles: [...WRITE_ROLES],
  input: z.object({}),
  handler: async (ctx) => {
    const rows = await unwrap(ctx.db.rpc("release_share_rows", { p_brewery: ctx.breweryId })) ?? [];
    return rows.map((r) => ({ ...r, manual_pct: num(r.manual_pct), base_pct: num(r.base_pct), pct: num(r.pct) }));
  },
});
