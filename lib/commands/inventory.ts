import { z } from "zod";
import { historyInput, historyResult, newestFirst } from "./history";
import { defineCommand, defineQuery, unwrap, completeRows, inChunks, PAGE_SIZE, Ctx, CommandExecution, CommandError, STAFF_ROLES } from "./registry";
import { stockLine } from "./stock-line";
import { qboUnmappedFilter, unmappedInput } from "./qbo";
import { movementInput } from "./movement-input";
import type { Database } from "@/lib/supabase/database";
import { docNo, runNo, trfNo } from "@/lib/mgr/doc-no";
import { formatDate } from "@/lib/date-format";

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
  name: "record_movement", description: "Append a staff-entered inventory movement (immutable; corrections are reversals); depletion names a saleChannelId, which no other supported type may carry",
  input: movementInput, roles: ["admin", "warehouse"], aiExposed: true,
  risk: "append_only", requiresConfirmation: true,
  compensation: "reverse_inventory_movement for an eligible standalone adjustment or loss",
  idempotency: "dedupe", offlineReplay: false, atomicity: "rpc",
  preview: async (ctx, input, conversationId) => {
    const preview = await unwrap(ctx.db.rpc("preview_inventory_movement", {
      p_brewery: ctx.breweryId, p_sku: input.skuId, p_location: input.locationId, p_bin: input.binId, p_qty: input.qty,
      p_type: input.type, p_sale_channel: input.saleChannelId ?? null, p_dest_state: input.destState ?? null,
      p_note: input.note ?? null, p_lot: input.lotId ?? null, p_conversation: conversationId,
    }));
    if (!preview) throw new CommandError("Inventory preview unavailable", 500);
    return preview;
  },
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
 * it is one plpgsql function per iron rule 5 (set_standing_allocation_impl,
 * latest in 20261021095000_raise_atp_lock.sql). qty 0 releases the open
 * allocation, if any.
 */
defineCommand({
  name: "set_standing_allocation", description: "Set or release a standing taproom allocation (source 'taproom_standing') for a SKU at a location; returns an ATP soft warning",
  input: z.object({ locationId: z.string().uuid(), skuId: z.string().uuid(), qty: z.number().nonnegative() }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_standing_allocation", {
    p_location: i.locationId, p_sku: i.skuId, p_qty: i.qty, p_request_id: execution.requestId,
  })),
});

const bySku = z.object({ skuId: z.string().uuid().optional() });
const readRoles = ["admin", "sales", "warehouse"] as const;

type OnHandRow = { brewery_id: string; sku_id: string; location_id: string; qty: number };
type BinOnHandRow = OnHandRow & { bin_id: string };
type AtpRow = { brewery_id: string; sku_id: string; qty: number };

defineQuery({
  name: "get_on_hand", description: "Physical on-hand quantity per SKU and location. Pass skuId for one SKU; omit it for every SKU. Use it for where stock sits; use get_atp for what can still be promised, since on-hand ignores open allocations.",
  input: bySku, roles: [...readRoles],
  aiExposed: true,
  handler: async (ctx, i) => {
    const rows = await completeRows<OnHandRow>("On-hand stock", async (_, after) => {
      let q = ctx.db.from("on_hand").select("brewery_id, sku_id, location_id, qty").eq("brewery_id", ctx.breweryId);
      let counted = ctx.db.from("on_hand").select("sku_id", { count: "exact", head: true }).eq("brewery_id", ctx.breweryId);
      if (i.skuId) q = q.eq("sku_id", i.skuId);
      if (i.skuId) counted = counted.eq("sku_id", i.skuId);
      if (after) q = q.or(`sku_id.gt.${after.sku_id},and(sku_id.eq.${after.sku_id},location_id.gt.${after.location_id})`);
      const [result, count] = await Promise.all([q.order("sku_id").order("location_id").limit(PAGE_SIZE), counted]);
      return { ...result, count: count.count, error: result.error ?? count.error };
    }, row => `${row.sku_id}\0${row.location_id}`);
    const labels = await inChunks([...new Set(rows.map(row => row.location_id))],
      async chunk => (await unwrap(ctx.db.from("locations").select("id, name").eq("brewery_id", ctx.breweryId).in("id", chunk))) ?? []);
    const names = new Map(labels.map(label => [label.id, label.name]));
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
  handler: (ctx, i) => completeRows<BinOnHandRow>("Bin stock", async (_, after) => {
    let q = ctx.db.from("bin_on_hand").select("brewery_id, sku_id, location_id, bin_id, qty").eq("brewery_id", ctx.breweryId);
    let counted = ctx.db.from("bin_on_hand").select("sku_id", { count: "exact", head: true }).eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    if (i.skuId) counted = counted.eq("sku_id", i.skuId);
    if (i.locationId) q = q.eq("location_id", i.locationId);
    if (i.locationId) counted = counted.eq("location_id", i.locationId);
    if (after) q = q.or(`sku_id.gt.${after.sku_id},and(sku_id.eq.${after.sku_id},location_id.gt.${after.location_id}),and(sku_id.eq.${after.sku_id},location_id.eq.${after.location_id},bin_id.gt.${after.bin_id})`);
    const [result, count] = await Promise.all([q.order("sku_id").order("location_id").order("bin_id").limit(PAGE_SIZE), counted]);
    return { ...result, count: count.count, error: result.error ?? count.error };
  }, row => `${row.sku_id}\0${row.location_id}\0${row.bin_id}`),
});

defineQuery({
  name: "get_atp", description: "Available-to-promise per SKU: on-hand minus open allocations, across all locations. Pass skuId for one SKU; omit it for every SKU. Use it to answer whether an order can be filled; use get_on_hand for where stock sits by location.",
  input: bySku, roles: [...readRoles],
  aiExposed: true,
  handler: (ctx, i) => completeRows<AtpRow>("Available stock", async (_, after) => {
    let q = ctx.db.from("atp").select("brewery_id, sku_id, qty").eq("brewery_id", ctx.breweryId);
    let counted = ctx.db.from("atp").select("sku_id", { count: "exact", head: true }).eq("brewery_id", ctx.breweryId);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    if (i.skuId) counted = counted.eq("sku_id", i.skuId);
    if (after) q = q.gt("sku_id", after.sku_id);
    const [result, count] = await Promise.all([q.order("sku_id").limit(PAGE_SIZE), counted]);
    return { ...result, count: count.count, error: result.error ?? count.error };
  }, row => row.sku_id),
});

export type InventoryValue = Pick<Database["public"]["Views"]["inventory_value"]["Row"], "value_cents" | "uncosted_qty">;

defineQuery({
  name: "get_inventory_value", description: "Current finished-goods value at frozen packaging-close cost, with the units lacking a cost",
  input: z.object({}), roles: ["admin", "sales"],
  handler: async (ctx): Promise<InventoryValue> => {
    const row = await unwrap(ctx.db.from("inventory_value").select("value_cents, uncosted_qty").eq("brewery_id", ctx.breweryId).maybeSingle());
    // The view groups stock rows by brewery; no row means no stock, worth nothing.
    return row ?? { value_cents: 0, uncosted_qty: 0 };
  },
});

/** Resolve polymorphic movement references only to documents visible to this caller. */
export async function movementReferences(ctx: Ctx, references: (string | null)[]) {
  const refs = [...new Set(references.filter((ref): ref is string => ref !== null))];
  const labels = new Map<string, { ref_label: string; ref_kind: "order" | "run" | "transfer" | "invoice" | "delivery" | "count" }>();
  if (!refs.length) return labels;
  const [orders, runs, transfers, invoices, deliveries, counts] = await Promise.all([
    inChunks(refs, async chunk => (await unwrap(ctx.db.from("orders").select("id, order_no").eq("brewery_id", ctx.breweryId).in("id", chunk).limit(chunk.length))) ?? []),
    inChunks(refs, async chunk => (await unwrap(ctx.db.from("packaging_runs").select("id, run_no").eq("brewery_id", ctx.breweryId).in("id", chunk).limit(chunk.length))) ?? []),
    inChunks(refs, async chunk => (await unwrap(ctx.db.from("stock_transfers").select("id, transfer_no").eq("brewery_id", ctx.breweryId).in("id", chunk).limit(chunk.length))) ?? []),
    inChunks(refs, async chunk => (await unwrap(ctx.db.from("invoices").select("id, invoice_no").eq("brewery_id", ctx.breweryId).in("id", chunk).limit(chunk.length))) ?? []),
    inChunks(refs, async chunk => (await unwrap(ctx.db.from("deliveries").select("id, shipments(orders(order_no))").eq("brewery_id", ctx.breweryId).in("id", chunk).limit(chunk.length))) ?? []),
    inChunks(refs, async chunk => (await unwrap(ctx.db.from("taproom_counts").select("id, counted_on").eq("brewery_id", ctx.breweryId).in("id", chunk).limit(chunk.length))) ?? []),
  ]);
  for (const row of orders) labels.set(row.id, { ref_label: docNo("ORD", row.order_no, "Order"), ref_kind: "order" });
  for (const row of runs) labels.set(row.id, { ref_label: runNo(row.run_no), ref_kind: "run" });
  for (const row of transfers) labels.set(row.id, { ref_label: trfNo(row.transfer_no), ref_kind: "transfer" });
  for (const row of invoices) labels.set(row.id, { ref_label: docNo("CM", row.invoice_no, "Credit memo"), ref_kind: "invoice" });
  for (const row of deliveries) {
    const order = row.shipments?.orders;
    if (order) labels.set(row.id, { ref_label: `Refused delivery · ${docNo("ORD", order.order_no, "Order")}`, ref_kind: "delivery" });
  }
  for (const row of counts) labels.set(row.id, { ref_label: `Count ${formatDate(row.counted_on)}`, ref_kind: "count" });
  return labels;
}

defineQuery({
  name: "list_movements", description: "Immutable movements newest-first as { rows, nextCursor }, with location/bin/lot labels, resolved source document ref_label and ref_kind, and reversal links; movementId selects an original and its exact compensation",
  input: z.object({ skuId: z.string().uuid().optional(), movementId: z.string().uuid().optional(), ...historyInput }),
  roles: [...readRoles],
  handler: async (ctx, i) => {
    let q = ctx.db.from("inventory_movements").select("*, locations(name), bins(name), lots!inventory_movements_lot_fk(code)").eq("brewery_id", ctx.breweryId)
      .limit(i.limit + 1);
    if (i.skuId) q = q.eq("sku_id", i.skuId);
    if (i.movementId) q = q.or(`id.eq.${i.movementId},compensates_id.eq.${i.movementId}`);
    const page = historyResult((await unwrap(newestFirst(q, i.cursor))) ?? [], i.limit);
    const rows = page.rows;
    if (!rows.length) return page;
    const [corrections, references] = await Promise.all([
      unwrap(ctx.db.from("inventory_movements").select("id, compensates_id")
        .eq("brewery_id", ctx.breweryId).in("compensates_id", rows.map(r => r.id))),
      movementReferences(ctx, rows.map(row => row.ref)),
    ]);
    return { ...page, rows: rows.map(row => {
      const reference = references.get(row.ref ?? "");
      return { ...row, ref_label: reference?.ref_label ?? null, ref_kind: reference?.ref_kind ?? null, reversed_by: corrections?.find(c => c.compensates_id === row.id)?.id ?? null };
    }) };
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
  name: "get_inventory_lot", description: "The display code of one existing finished-goods lot, including lots with no remaining stock; null when not visible",
  input: z.object({ lotId: z.string().uuid() }), roles: [...readRoles],
  handler: (ctx, i) => unwrap(ctx.db.from("lots").select("id, code")
    .eq("brewery_id", ctx.breweryId).eq("id", i.lotId).maybeSingle()),
});

defineQuery({
  // Brewers read SKUs too: the packaging pages pick the SKU a run fills.
  name: "list_skus", description: "SKUs with their brand and format, alphabetical; saleChannelId keeps only SKUs active and priced on that channel; packageType keeps only SKUs whose format is that package; unmapped keeps only those with no QuickBooks id in the connected company",
  input: z.object({
    saleChannelId: z.string().uuid().optional().describe("Keep only SKUs a wholesale order on this sale channel can price"),
    active: z.boolean().optional().describe("Keep only active or inactive SKUs when supplied"),
    packageType: z.enum(["keg", "can", "bottle"]).optional().describe("Keep only SKUs whose format packages this type"),
    unmapped: unmappedInput,
  }), roles: STAFF_ROLES,
  aiExposed: true,
  handler: async (ctx, i) => {
    // `formats!inner` turns the format embed into a filter; the count joins the same way, or paging waits for rows the filter removed.
    const formats = i.packageType ? "formats!inner" : "formats";
    const unmapped = i.unmapped ? await qboUnmappedFilter(ctx, "qbo_item_id") : null;
    const rows = await completeRows("SKU list", async (_, after?: { id: string }) => {
      let query = ctx.db.from("skus")
        .select(`id, name, active, brand_id, format_id, qbo_item_id, qbo_realm_id, brands(name), ${formats}(name, bbl_per_unit, package_type), format_volume:format_volumes(bbl_per_unit)`)
        .eq("brewery_id", ctx.breweryId).order("id").limit(PAGE_SIZE);
      if (after) query = query.gt("id", after.id);
      let count = ctx.db.from("skus").select(i.packageType ? "id, formats!inner(package_type)" : "id", { count: "exact", head: true }).eq("brewery_id", ctx.breweryId);
      for (const [column, value] of [["active", i.active], ["formats.package_type", i.packageType]] as const) {
        if (value !== undefined) { query = query.eq(column, value); count = count.eq(column, value); }
      }
      if (unmapped) { query = query.or(unmapped); count = count.or(unmapped); }
      const [result, counted] = await Promise.all([query, count]);
      return { ...result, count: counted.count, error: result.error ?? counted.error };
    }, row => row.id);
    const sorted = rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const channel = i.saleChannelId;
    if (!channel) return sorted;
    // sku_prices is the same resolution create_order prices a line with.
    const priced = await completeRows("SKU prices", start => ctx.db.from("sku_prices").select("sku_id", { count: "exact" })
      .eq("brewery_id", ctx.breweryId).eq("sale_channel_id", channel).eq("active", true)
      .order("sku_id").range(start, start + PAGE_SIZE - 1));
    const ids = new Set(priced.map(p => p.sku_id));
    return sorted.filter(sku => ids.has(sku.id));
  },
});

defineQuery({
  // Brewers read locations too: a packaging run puts its output somewhere.
  name: "list_locations", description: "Locations and what each is used for, alphabetical; `use` keeps only the places put to that use (a place with several uses answers to each of them)",
  input: z.object({ use: z.enum(["warehouse", "taproom", "storage"]).optional() }), roles: STAFF_ROLES,
  aiExposed: true,
  handler: async (ctx, i) => {
    // Postgres does the membership test (`uses @> {use}`): asking for taprooms
    // and scanning the answer would spend the row cap on locations the caller
    // is about to throw away. The count is filtered the same way, or the page
    // loop would wait for rows the filter already removed.
    const rows = await completeRows("Location list", async (_, after?: { id: string }) => {
      let query = ctx.db.from("locations").select("id, name, uses").eq("brewery_id", ctx.breweryId).order("id").limit(PAGE_SIZE);
      if (i.use) query = query.contains("uses", [i.use]);
      if (after) query = query.gt("id", after.id);
      let count = ctx.db.from("locations").select("id", { count: "exact", head: true }).eq("brewery_id", ctx.breweryId);
      if (i.use) count = count.contains("uses", [i.use]);
      const [result, counted] = await Promise.all([query, count]);
      return { ...result, count: counted.count, error: result.error ?? counted.error };
    }, row => row.id);
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
  aiExposed: true,
  // Read all grouped sources, not just PostgREST's first 1,000 rows.
  handler: async (ctx, i) => await completeRows("Bin stock", start => ctx.db.from("bin_move_stock").select("bin_id, kind, stock_id, lot_id, keg_size, name, unit, lot_code, qty", { count: "exact" })
    .eq("brewery_id", ctx.breweryId).eq("location_id", i.locationId).gt("qty", 0)
    .order("bin_id").order("kind").order("stock_id").order("lot_id").order("keg_size").range(start, start + PAGE_SIZE - 1)) as BinMoveStock[],
});
