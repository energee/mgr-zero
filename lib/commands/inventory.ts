import { z } from "zod";
import { defineCommand, defineQuery, CommandError, Ctx } from "./registry";

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
 * Reusable helper to insert an inventory movement, computing bbl from SKU.
 * Thrown errors are CommandError instances (not re-wrapped).
 */
export async function insertMovement(ctx: Ctx, input: z.infer<typeof movementInput>) {
  const { data: sku, error: se } = await ctx.db.from("skus").select("bbl_per_unit").eq("id", input.skuId).single();
  if (se) throw new CommandError(`sku not found: ${se.message}`);
  const bbl = input.qty * Number(sku.bbl_per_unit);
  const { data, error } = await ctx.db.from("inventory_movements").insert({
    brewery_id: ctx.breweryId, sku_id: input.skuId, location_id: input.locationId,
    qty: input.qty, bbl, type: input.type, channel: input.channel ?? null,
    dest_state: input.destState ?? null, note: input.note ?? null, created_by: ctx.userId,
  }).select().single();
  if (error) throw new CommandError(error.message); // CHECK constraints surface here
  return data;
}

defineCommand({
  name: "record_movement", description: "Append an inventory movement (immutable; corrections are reversals)",
  input: movementInput, roles: ["admin", "warehouse"],
  handler: async (ctx, i) => insertMovement(ctx, i),
});

defineCommand({
  name: "set_taproom_par", description: "Set par level for a SKU at a taproom",
  input: z.object({ locationId: z.string().uuid(), skuId: z.string().uuid(), parQty: z.number().nonnegative() }),
  roles: ["admin", "sales"],
  handler: async (ctx, i) => {
    const { data, error } = await ctx.db.from("taproom_pars").upsert({
      brewery_id: ctx.breweryId, location_id: i.locationId, sku_id: i.skuId, par_qty: i.parQty,
    }).select().single();
    if (error) throw new CommandError(error.message);
    return data;
  },
});

defineQuery({
  name: "get_on_hand", description: "On-hand quantity per SKU/location",
  input: z.object({ skuId: z.string().uuid().optional() }), roles: ["admin", "sales", "warehouse"],
  handler: async (ctx, i) => {
    let q = ctx.db.from("on_hand").select().eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    const { data, error } = await q;
    if (error) throw new CommandError(error.message);
    return data;
  },
});

defineQuery({
  name: "get_atp", description: "Available-to-promise (on-hand minus open allocations) per SKU",
  input: z.object({ skuId: z.string().uuid().optional() }), roles: ["admin", "sales", "warehouse"],
  handler: async (ctx, i) => {
    let q = ctx.db.from("atp").select().eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    const { data, error } = await q;
    if (error) throw new CommandError(error.message);
    return data;
  },
});

defineQuery({
  name: "list_movements", description: "Recent inventory movements",
  input: z.object({ skuId: z.string().uuid().optional(), limit: z.number().int().max(200).default(50) }),
  roles: ["admin", "sales", "warehouse"],
  handler: async (ctx, i) => {
    let q = ctx.db.from("inventory_movements").select().eq("brewery_id", ctx.breweryId)
      .order("created_at", { ascending: false }).limit(i.limit);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    const { data, error } = await q;
    if (error) throw new CommandError(error.message);
    return data;
  },
});
