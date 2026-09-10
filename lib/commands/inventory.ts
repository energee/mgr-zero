import { z } from "zod";
import { defineCommand, defineQuery, unwrap, Ctx, CommandExecution, CommandError, STAFF_ROLES } from "./registry";
import { stockLine } from "./stock-line";

export const movementInput = z.object({
  lotId: z.string().uuid().optional(),
  skuId: z.string().uuid(), locationId: z.string().uuid(), binId: z.string().uuid(),
  qty: z.number().refine(n => n !== 0, "qty cannot be 0"),
  type: z.enum(["opening_balance", "production_in", "adjustment", "sale_removal", "taproom_transfer",
                "depletion", "return_in", "destruction", "loss", "sample", "festival_removal"]),
  saleChannelId: z.string().uuid().optional(),
  destState: z.string().length(2).optional(),
  note: z.string().optional(),
});

/**
 * Appends an inventory movement through its security-definer RPC. `binId` is
 * required: every ledger row names a bin and there is no default bin. `bbl`
 * is not supplied: the DB trigger (enforce_bbl_integrity, 00001_baseline.sql)
 * computes it from `qty * skus.bbl_per_unit`.
 */
export function insertMovement(ctx: Ctx, input: z.infer<typeof movementInput>, execution: CommandExecution) {
  return unwrap(ctx.db.rpc("record_inventory_movement", {
    p_brewery: ctx.breweryId, p_sku: input.skuId, p_location: input.locationId, p_bin: input.binId, p_qty: input.qty,
    p_type: input.type, p_sale_channel: input.saleChannelId ?? null, p_dest_state: input.destState ?? null,
    p_note: input.note ?? null, p_lot: input.lotId ?? null, p_request_id: execution.requestId,
    p_origin: execution.origin ?? "ui", p_conversation: execution.conversationId ?? null, p_preview_token: execution.previewToken ?? null,
  }));
}

defineCommand({
  name: "record_movement", description: "Append an inventory movement (immutable; corrections are reversals); sale_removal and depletion each name a saleChannelId, which no other type may carry",
  input: movementInput, roles: ["admin", "warehouse"], aiExposed: true,
  risk: "append_only", requiresConfirmation: true,
  compensation: "reverse_inventory_movement for an eligible standalone adjustment or loss",
  idempotency: "dedupe", offlineReplay: false, atomicity: "rpc",
  preview: (ctx, input, conversationId) => unwrap(ctx.db.rpc("preview_inventory_movement", {
    p_brewery: ctx.breweryId, p_sku: input.skuId, p_location: input.locationId, p_bin: input.binId, p_qty: input.qty,
    p_type: input.type, p_sale_channel: input.saleChannelId ?? null, p_dest_state: input.destState ?? null,
    p_note: input.note ?? null, p_lot: input.lotId ?? null, p_conversation: conversationId,
  })),
  handler: (ctx, input, execution) => insertMovement(ctx, input, execution),
});

defineCommand({
  name: "reverse_inventory_movement", description: "Reverse one standalone adjustment or loss with an exact linked opposite entry; compound movements and counts keep their correction owner",
  input: z.object({ movementId: z.string().uuid(), note: z.string().trim().min(1) }), roles: ["admin", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("reverse_inventory_movement", {
    p_brewery: ctx.breweryId, p_movement: i.movementId, p_note: i.note, p_request_id: execution.requestId,
  })),
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

async function completeRows<T extends { id: string }>(name: string, page: (afterId: string | null) => PromiseLike<{
  data: T[] | null; error: { message: string; code?: string } | null; count: number | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  let total: number | undefined;
  do {
    const afterId = rows.at(-1)?.id ?? null;
    const result = await page(afterId);
    const next = await unwrap(Promise.resolve(result));
    const invalidPage = next?.some((row, index) => row.id <= (index === 0 ? afterId ?? "" : next[index - 1].id));
    if (result.count === null || (total !== undefined && result.count !== total) || !next || invalidPage
      || rows.length + next.length > result.count || (!next.length && rows.length < result.count)) {
      throw new CommandError(`${name} changed while loading. Reload and try again.`, 409, "conflict");
    }
    total = result.count;
    rows.push(...next);
  } while (rows.length < total);
  return rows;
}

defineQuery({
  name: "get_on_hand", description: "On-hand quantity per SKU/location",
  input: bySku, roles: [...readRoles],
  handler: async (ctx, i) => {
    const rows: { brewery_id: string; sku_id: string; location_id: string; qty: number }[] = [];
    for (let start = 0; ; start += 500) {
      let q = ctx.db.from("on_hand").select("brewery_id, sku_id, location_id, qty", { count: "exact" }).eq("brewery_id", ctx.breweryId)
        .order("sku_id").order("location_id").range(start, start + 499);
      if (i.skuId) q = q.eq("sku_id", i.skuId);
      const result = await q;
      const page = await unwrap(Promise.resolve(result)) as typeof rows;
      rows.push(...page);
      if (result.count === null || (!page.length && rows.length < result.count)) throw new Error("Could not read complete on-hand stock");
      if (rows.length >= result.count) break;
    }
    const names = new Map<string, string>();
    const locationIds = [...new Set(rows.map(row => row.location_id))];
    for (let start = 0; start < locationIds.length; start += 100) {
      const labels = await unwrap(ctx.db.from("locations").select("id, name").eq("brewery_id", ctx.breweryId).in("id", locationIds.slice(start, start + 100)));
      for (const label of labels ?? []) names.set(label.id, label.name);
    }
    return rows.map(row => {
      const name = names.get(row.location_id);
      if (name === undefined) throw new CommandError("Location labels changed while loading. Reload and try again.", 409, "conflict");
      return { ...row, locations: { name } };
    });
  },
});

// A bin move inside one location: paired ledger rows, no document (spec
// 2026-09-06 Decision 5). Two locations is create_stock_transfer; the RPC says so.
defineCommand({
  name: "move_stock_bin", description: "Move stock between two bins of one location: paired ledger rows, no transfer document; a cross-location pair is refused",
  roles: ["admin", "warehouse"],
  input: stockLine.safeExtend({ materialLotId: z.string().uuid().optional(), skuLotId: z.string().uuid().optional() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("move_stock_bin", {
    p_brewery: ctx.breweryId, p_sku: i.skuId ?? null, p_material: i.materialId ?? null, p_keg_pool: i.kegPoolId ?? null, p_keg_size: i.kegSize ?? null,
    p_material_lot: i.materialLotId ?? null, p_sku_lot: i.skuLotId ?? null, p_qty: i.qty, p_from_bin: i.fromBinId, p_to_bin: i.toBinId, p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "get_bin_on_hand", description: "On-hand quantity per SKU/location/bin",
  input: z.object({ skuId: z.string().uuid().optional(), locationId: z.string().uuid().optional() }), roles: [...readRoles],
  handler: (ctx, i) => {
    let q = ctx.db.from("bin_on_hand").select().eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    if (i.locationId) q = q.eq("location_id", i.locationId);
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
  name: "list_movements", description: "Paginated immutable movements with location/bin/lot labels and reversal links; movementId selects an original and its exact compensation",
  input: z.object({ skuId: z.string().uuid().optional(), movementId: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().nonnegative().default(0) }),
  roles: [...readRoles],
  handler: async (ctx, i) => {
    let q = ctx.db.from("inventory_movements").select("*, locations(name), bins(name), lots!inventory_movements_lot_fk(code)").eq("brewery_id", ctx.breweryId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(i.offset, i.offset + i.limit - 1);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    if (i.movementId) q = q.or(`id.eq.${i.movementId},compensates_id.eq.${i.movementId}`);
    const rows = (await unwrap(q)) ?? [];
    if (!rows.length) return [];
    const corrections = await unwrap(ctx.db.from("inventory_movements").select("id, compensates_id")
      .eq("brewery_id", ctx.breweryId).in("compensates_id", rows.map(r => r.id)));
    return rows.map(row => ({ ...row, reversed_by: corrections?.find(c => c.compensates_id === row.id)?.id ?? null }));
  },
});

defineQuery({
  name: "get_inventory_sku", description: "One inventory SKU with brand and format, including inactive and zero-stock history",
  input: z.object({ skuId: z.string().uuid() }), roles: [...readRoles],
  handler: async (ctx, i) => {
    const row = await unwrap(ctx.db.from("skus").select("id, name, active, brands(name), formats(name)")
      .eq("brewery_id", ctx.breweryId).eq("id", i.skuId).maybeSingle());
    if (!row) throw new CommandError("SKU not found", 404, "not_found");
    return row;
  },
});

defineQuery({
  // Brewers read SKUs too: the packaging pages pick the SKU a run fills.
  name: "list_skus", description: "SKUs with their brand and format, alphabetical",
  input: z.object({}), roles: STAFF_ROLES,
  handler: async (ctx) => {
    const rows = await completeRows("SKU list", async (afterId) => {
      let query = ctx.db.from("skus")
        .select("id, name, active, brand_id, format_id, qbo_item_id, qbo_realm_id, brands(name), formats(name, bbl_per_unit, package_type), format_volume:format_volumes(bbl_per_unit)")
        .eq("brewery_id", ctx.breweryId).order("id").limit(500);
      if (afterId) query = query.gt("id", afterId);
      const [result, counted] = await Promise.all([
        query,
        ctx.db.from("skus").select("id", { count: "exact", head: true }).eq("brewery_id", ctx.breweryId),
      ]);
      return { ...result, count: counted.count, error: result.error ?? counted.error };
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  },
});

defineQuery({
  // Brewers read locations too: a packaging run puts its output somewhere.
  name: "list_locations", description: "Warehouses and taprooms, alphabetical",
  input: z.object({}), roles: STAFF_ROLES,
  handler: async (ctx) => {
    const rows = await completeRows("Location list", async (afterId) => {
      let query = ctx.db.from("locations").select("id, name, kind").eq("brewery_id", ctx.breweryId).order("id").limit(500);
      if (afterId) query = query.gt("id", afterId);
      const [result, counted] = await Promise.all([
        query,
        ctx.db.from("locations").select("id", { count: "exact", head: true }).eq("brewery_id", ctx.breweryId),
      ]);
      return { ...result, count: counted.count, error: result.error ?? counted.error };
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  },
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

export type BinMoveStock = {
  bin_id: string; kind: "sku" | "material" | "keg"; stock_id: string; lot_id: string | null;
  keg_size: string | null; name: string; unit: string; lot_code: string | null; qty: number;
};
defineQuery({
  name: "get_bin_move_stock", description: "Stock by bin and explicit lot identity at one location, including untracked stock and empty keg sizes",
  input: z.object({ locationId: z.string().uuid() }), roles: ["admin", "warehouse"],
  handler: async (ctx, i) => {
    const rows: BinMoveStock[] = [];
    // Read all grouped sources, not just PostgREST's first 1,000 rows.
    for (let start = 0; ; start += 500) {
      const result = await ctx.db.from("bin_move_stock").select("bin_id, kind, stock_id, lot_id, keg_size, name, unit, lot_code, qty", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("location_id", i.locationId).gt("qty", 0)
        .order("bin_id").order("kind").order("stock_id").order("lot_id").order("keg_size").range(start, start + 499);
      const page = await unwrap(Promise.resolve(result)) as BinMoveStock[];
      rows.push(...page);
      if (result.count === null || (!page.length && rows.length < result.count)) throw new Error("Could not read complete bin stock");
      if (rows.length >= result.count) return rows;
    }
  },
});
