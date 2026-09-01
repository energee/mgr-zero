import { z } from "zod";
import { defineCommand, defineQuery, unwrap, Ctx, CommandExecution } from "./registry";

const movementInput = z.object({
  skuId: z.string().uuid(), locationId: z.string().uuid(),
  qty: z.number().refine(n => n !== 0, "qty cannot be 0"),
  type: z.enum(["opening_balance", "production_in", "adjustment", "sale_removal", "taproom_transfer",
                "depletion", "return_in", "destruction", "loss", "sample", "festival_removal"]),
  channel: z.enum(["wholesale", "taproom", "dtc", "export"]).optional(),
  destState: z.string().length(2).optional(),
  note: z.string().optional(),
});

/**
 * Appends an inventory movement through its security-invoker RPC. `bbl` is
 * not supplied: the DB trigger (enforce_bbl_integrity, 00001_baseline.sql)
 * computes it from `qty * skus.bbl_per_unit`.
 */
export function insertMovement(ctx: Ctx, input: z.infer<typeof movementInput>, execution: CommandExecution) {
  return unwrap(ctx.db.rpc("record_inventory_movement", {
    p_brewery: ctx.breweryId, p_sku: input.skuId, p_location: input.locationId, p_qty: input.qty,
    p_type: input.type, p_channel: input.channel ?? null, p_dest_state: input.destState ?? null,
    p_note: input.note ?? null, p_request_id: execution.requestId,
  }));
}

defineCommand({
  name: "record_movement", description: "Append an inventory movement (immutable; corrections are reversals)",
  input: movementInput, roles: ["admin", "warehouse"],
  handler: (ctx, input, execution) => insertMovement(ctx, input, execution),
});

defineCommand({
  name: "set_taproom_par", description: "Set par level for a SKU at a taproom",
  input: z.object({ locationId: z.string().uuid(), skuId: z.string().uuid(), parQty: z.number().nonnegative() }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_taproom_par", {
    p_brewery: ctx.breweryId, p_location: i.locationId, p_sku: i.skuId,
    p_par_qty: i.parQty, p_request_id: execution.requestId,
  })),
});

/**
 * Sets (or releases) the standing taproom allocation for a SKU at a location —
 * inventory reserved against ATP without an order line (e.g. house pours,
 * events). Find-then-write (open row may need update, insert, or release), so
 * it is one plpgsql function per iron rule 5 (00001_baseline.sql,
 * set_standing_allocation). qty 0 releases the open allocation, if any.
 */
defineCommand({
  name: "set_standing_allocation", description: "Set or release a standing taproom allocation (source 'taproom_standing') for a SKU at a location",
  input: z.object({ locationId: z.string().uuid(), skuId: z.string().uuid(), qty: z.number().nonnegative() }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_standing_allocation", {
    p_location: i.locationId, p_sku: i.skuId, p_qty: i.qty, p_request_id: execution.requestId,
  })),
});

const bySku = z.object({ skuId: z.string().uuid().optional() });
const readRoles = ["admin", "sales", "warehouse"] as const;

defineQuery({
  name: "get_on_hand", description: "On-hand quantity per SKU/location",
  input: bySku, roles: [...readRoles],
  handler: (ctx, i) => {
    let q = ctx.db.from("on_hand").select().eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    return unwrap(q);
  },
});

defineQuery({
  name: "get_atp", description: "Available-to-promise (on-hand minus open allocations) per SKU",
  input: bySku, roles: [...readRoles],
  handler: (ctx, i) => {
    let q = ctx.db.from("atp").select().eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    return unwrap(q);
  },
});

defineQuery({
  name: "list_movements", description: "Recent inventory movements",
  input: z.object({ skuId: z.string().uuid().optional(), limit: z.number().int().max(200).default(50) }),
  roles: [...readRoles],
  handler: (ctx, i) => {
    let q = ctx.db.from("inventory_movements").select().eq("brewery_id", ctx.breweryId)
      .order("created_at", { ascending: false }).limit(i.limit);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    return unwrap(q);
  },
});

defineQuery({
  name: "list_skus", description: "SKUs with their product name, alphabetical",
  input: z.object({}), roles: [...readRoles],
  handler: (ctx) => unwrap(ctx.db.from("skus").select("id, name, products(name)").eq("brewery_id", ctx.breweryId).order("name")),
});

defineQuery({
  name: "list_locations", description: "Warehouses and taprooms, alphabetical",
  input: z.object({}), roles: [...readRoles],
  handler: (ctx) => unwrap(ctx.db.from("locations").select("id, name, kind").eq("brewery_id", ctx.breweryId).order("name")),
});

defineQuery({
  name: "list_standing_allocations", description: "Open standing taproom allocations (source 'taproom_standing'), with SKU names",
  input: z.object({ locationId: z.string().uuid().optional() }), roles: [...readRoles],
  handler: (ctx, i) => {
    let q = ctx.db.from("allocations").select("id, sku_id, qty, ref, skus(name)")
      .eq("brewery_id", ctx.breweryId).eq("source", "taproom_standing").eq("status", "open");
    if (i.locationId) q = q.eq("ref", i.locationId);
    return unwrap(q);
  },
});
