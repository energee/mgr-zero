import { z } from "zod";
import { defineCommand, defineQuery, unwrap, Ctx } from "./registry";

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
 * Inserts an inventory movement. `bbl` is not supplied: the DB trigger
 * (enforce_bbl_integrity, 00002_catalog_ledger.sql) computes it from
 * `qty * skus.bbl_per_unit` and overwrites anything a client sends.
 * CHECK/FK failures surface as CommandError.
 */
export function insertMovement(ctx: Ctx, input: z.infer<typeof movementInput>) {
  return unwrap(ctx.db.from("inventory_movements").insert({
    brewery_id: ctx.breweryId, sku_id: input.skuId, location_id: input.locationId,
    qty: input.qty, type: input.type, channel: input.channel ?? null,
    dest_state: input.destState ?? null, note: input.note ?? null, created_by: ctx.userId,
  }).select().single());
}

defineCommand({
  name: "record_movement", description: "Append an inventory movement (immutable; corrections are reversals)",
  input: movementInput, roles: ["admin", "warehouse"],
  handler: insertMovement,
});

defineCommand({
  name: "set_taproom_par", description: "Set par level for a SKU at a taproom",
  input: z.object({ locationId: z.string().uuid(), skuId: z.string().uuid(), parQty: z.number().nonnegative() }),
  roles: ["admin", "sales"],
  handler: (ctx, i) =>
    unwrap(ctx.db.from("taproom_pars").upsert({
      brewery_id: ctx.breweryId, location_id: i.locationId, sku_id: i.skuId, par_qty: i.parQty,
    }).select().single()),
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
