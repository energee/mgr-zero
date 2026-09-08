// lib/commands/orders.ts — order lifecycle commands. Every mutation delegates
// to one plpgsql function (00001_baseline.sql, iron rule 5); this layer does
// zod validation, role gating, and camelCase→p_* argument mapping.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, runCommand } from "./registry";

const lines = z.array(z.object({ skuId: z.string().uuid(), qty: z.number().positive() })).min(1);
const salesRoles = ["admin", "sales"] as const;
const warehouseRoles = ["admin", "warehouse"] as const;
const readRoles = ["admin", "sales", "warehouse"] as const;
const toLines = (ls: z.infer<typeof lines>) => ls.map(l => ({ sku_id: l.skuId, qty: l.qty }));

defineCommand({
  name: "create_order", description: "Create a draft order (wholesale or taproom transfer) with price-snapshot lines",
  roles: [...salesRoles],
  input: z.object({
    kind: z.enum(["wholesale", "taproom_transfer"]),
    customerId: z.string().uuid().optional(), shipToId: z.string().uuid().optional(),
    fromLocationId: z.string().uuid(), toLocationId: z.string().uuid().optional(),
    requestedShipDate: z.string().date().optional(), poNumber: z.string().optional(), note: z.string().optional(),
    lines,
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_order", {
    p_brewery: ctx.breweryId, p_kind: i.kind, p_customer: i.customerId ?? null, p_ship_to: i.shipToId ?? null,
    p_from_location: i.fromLocationId, p_to_location: i.toLocationId ?? null,
    p_requested: i.requestedShipDate ?? null, p_po: i.poNumber ?? null, p_note: i.note ?? null,
    p_lines: toLines(i.lines), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "update_draft_order", description: "Replace a draft order's header fields and lines",
  roles: [...salesRoles],
  input: z.object({
    orderId: z.string().uuid(), shipToId: z.string().uuid().optional(),
    requestedShipDate: z.string().date().optional(), poNumber: z.string().optional(), note: z.string().optional(),
    lines,
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_draft_order", {
    p_order: i.orderId, p_ship_to: i.shipToId ?? null, p_requested: i.requestedShipDate ?? null,
    p_po: i.poNumber ?? null, p_note: i.note ?? null, p_lines: toLines(i.lines), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "submit_order", description: "Submit a draft order for confirmation",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("submit_order", { p_order: i.orderId, p_request_id: execution.requestId })),
});

defineCommand({
  name: "confirm_order", description: "Confirm a submitted order; creates allocations and returns ATP soft warnings",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("confirm_order", { p_order: i.orderId, p_request_id: execution.requestId })),
});

defineCommand({
  name: "adjust_order_lines", description: "Replace lines on a confirmed/picked order; re-syncs allocations; flags restocking when picked",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({ orderId: z.string().uuid(), reason: z.string().min(1), lines }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("adjust_order_lines", { p_order: i.orderId, p_lines: toLines(i.lines), p_reason: i.reason, p_request_id: execution.requestId })),
});

defineCommand({
  name: "cancel_order", description: "Cancel an unshipped order and release its allocations",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({ orderId: z.string().uuid(), reason: z.string().min(1) }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("cancel_order", { p_order: i.orderId, p_reason: i.reason, p_request_id: execution.requestId })),
});

defineCommand({
  name: "confirm_restock", description: "Confirm staged quantities were put back; clears needs_restock; no ledger movement",
  roles: [...warehouseRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("confirm_restock", { p_order: i.orderId, p_request_id: execution.requestId })),
});

defineCommand({
  name: "resolve_short_pick", description: "Resolve one line counted below ordered: adjust the order down to the count, or keep the remainder owed",
  roles: [...warehouseRoles],
  input: z.object({
    orderId: z.string().uuid(), lineId: z.string().uuid(), qtyPicked: z.number().nonnegative(),
    reason: z.string().trim().min(1), resolution: z.enum(["adjust_down", "keep_owed"]),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("resolve_short_pick", {
    p_order: i.orderId, p_line: i.lineId, p_qty_picked: i.qtyPicked, p_reason: i.reason, p_resolution: i.resolution, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "confirm_delivery", description: "Sign a delivery stop as the assigned driver or an admin; an on-delivery shipment gets its invoice now (shipped quantities, order prices); a transfer stop is only stamped; never moves stock",
  roles: [...warehouseRoles], requiresConfirmation: true,
  input: z.object({ deliveryId: z.string().uuid(), signedBy: z.string().trim().min(1) }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("confirm_delivery", { p_delivery: i.deliveryId, p_signed_by: i.signedBy, p_request_id: execution.requestId })),
});

const pickLines = z.array(z.object({ lineId: z.string().uuid(), qty: z.number().nonnegative() })).min(1);

defineCommand({
  name: "record_pick", description: "Record picked quantities per line; order becomes picked",
  roles: [...warehouseRoles],
  input: z.object({ orderId: z.string().uuid(), picks: pickLines }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_pick", {
    p_order: i.orderId, p_picks: i.picks.map(p => ({ line_id: p.lineId, qty_picked: p.qty })), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "ship_order", description: "Ship a picked order: movements + allocation fulfillment + invoice (now, or deferred to confirm_delivery), one transaction; anything held back below picked flags a restock",
  roles: [...warehouseRoles], requiresConfirmation: true,
  input: z.object({
    orderId: z.string().uuid(), carrier: z.string().optional(), tracking: z.string().optional(),
    ship: z.array(z.object({ lineId: z.string().uuid(), qty: z.number().nonnegative().multipleOf(0.01),
      sources: z.array(z.object({ binId: z.string().uuid(), lotId: z.string().uuid().nullable(), qty: z.number().positive().multipleOf(0.01), toBinId: z.string().uuid().optional() })).optional(),
    })).min(1), invoiceTiming: z.enum(["now", "on_delivery"]).default("now"),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("ship_order", {
    p_order: i.orderId, p_ship: i.ship.map(s => ({ line_id: s.lineId, qty_shipped: s.qty, ...(s.sources === undefined ? {} : { sources: s.sources.map(a => ({ bin_id: a.binId, lot_id: a.lotId, qty: a.qty, to_bin_id: a.toBinId ?? null })) }) })),
    p_carrier: i.carrier ?? null, p_tracking: i.tracking ?? null, p_invoice_timing: i.invoiceTiming, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "release_allocation", description: "Release one open reservation so its quantity returns to ATP",
  roles: [...salesRoles],
  input: z.object({ allocationId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("release_allocation", { p_allocation: i.allocationId, p_request_id: execution.requestId })),
});

defineQuery({
  name: "get_shortfalls", description: "SKUs whose available-to-promise is negative, with on-hand and open reservations",
  roles: [...readRoles],
  input: z.object({}),
  handler: async (ctx) => {
    const [atp, onHand, allocs] = await Promise.all([
      unwrap(ctx.db.from("atp").select("sku_id, qty, skus(name)").eq("brewery_id", ctx.breweryId).lt("qty", 0)),
      unwrap(ctx.db.from("on_hand").select("sku_id, qty").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("allocations").select("sku_id, qty").eq("brewery_id", ctx.breweryId).eq("status", "open")),
    ]);
    const sum = (rows: { sku_id: string; qty: number }[]) => rows.reduce((m, r) => m.set(r.sku_id, (m.get(r.sku_id) ?? 0) + Number(r.qty)), new Map<string, number>());
    const onHandBySku = sum(onHand as { sku_id: string; qty: number }[]);
    const allocatedBySku = sum(allocs as { sku_id: string; qty: number }[]);
    return (atp as unknown as { sku_id: string; qty: number; skus: { name: string } | null }[]).map((r) => ({
      skuId: r.sku_id, skuName: r.skus?.name ?? r.sku_id, atp: Number(r.qty),
      onHand: onHandBySku.get(r.sku_id) ?? 0, allocated: allocatedBySku.get(r.sku_id) ?? 0,
    }));
  },
});

defineCommand({
  name: "return_shipment", description: "Return shipped beer: credit memo at the invoiced price + return_in at the destination; a damaged return is also written to loss in the same transaction",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({
    invoiceId: z.string().uuid(), locationId: z.string().uuid(), reason: z.enum(["damaged", "wrong_item", "unsold"]),
    lines: z.array(z.object({ invoiceLineId: z.string().uuid(), qty: z.number().positive().multipleOf(0.01), sources: z.array(z.object({ movementId: z.string().uuid(), binId: z.string().uuid(), qty: z.number().positive().multipleOf(0.01) })).optional() })).min(1),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("return_shipment", {
    p_invoice: i.invoiceId, p_lines: i.lines.map(l => ({ invoice_line_id: l.invoiceLineId, qty: l.qty, ...(l.sources === undefined ? {} : { sources: l.sources.map(a => ({ movement_id: a.movementId, bin_id: a.binId, qty: a.qty })) }) })),
    p_location: i.locationId, p_reason: i.reason, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "create_credit_memo", description: "Credit an invoice: negative lines at original prices + return_in movements",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({
    invoiceId: z.string().uuid(), locationId: z.string().uuid(), reason: z.string().min(1),
    lines: z.array(z.object({ invoiceLineId: z.string().uuid(), qty: z.number().positive().multipleOf(0.01), sources: z.array(z.object({ movementId: z.string().uuid(), binId: z.string().uuid(), qty: z.number().positive().multipleOf(0.01) })).optional() })).min(1),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_credit_memo", {
    p_invoice: i.invoiceId, p_lines: i.lines.map(l => ({ invoice_line_id: l.invoiceLineId, qty: l.qty, ...(l.sources === undefined ? {} : { sources: l.sources.map(a => ({ movement_id: a.movementId, bin_id: a.binId, qty: a.qty })) }) })),
    p_location: i.locationId, p_reason: i.reason, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "create_replenishment_order", description: "Create a confirmed taproom transfer order from par-gap quantities",
  roles: [...salesRoles],
  input: z.object({ fromLocationId: z.string().uuid(), toLocationId: z.string().uuid(), lines }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_replenishment_order", {
    p_from: i.fromLocationId, p_to: i.toLocationId, p_lines: toLines(i.lines), p_request_id: execution.requestId,
  })),
});

// ---- queries ----

defineQuery({
  name: "list_orders", description: "Orders newest-first, optionally by status and customer",
  roles: [...readRoles],
  input: z.object({ customerId: z.string().uuid().optional(), status: z.enum(["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"]).optional(), limit: z.number().int().max(200).default(50) }),
  handler: (ctx, i) => {
    let q = ctx.db.from("orders").select("*, customers(name)")
      .eq("brewery_id", ctx.breweryId).order("created_at", { ascending: false }).limit(i.limit);
    if (i.status) q = q.eq("status", i.status);
    if (i.customerId) q = q.eq("customer_id", i.customerId);
    return unwrap(q);
  },
});

defineQuery({
  name: "get_order", description: "One order with lines, events, shipment, and per-SKU ATP",
  roles: [...readRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const order = await unwrap(ctx.db.from("orders").select("*, customers(name), ship_tos(label, city, state)").eq("id", i.orderId).single());
    const [ln, events, shipment, atp] = await Promise.all([
      unwrap(ctx.db.from("order_lines").select("*, skus(name)").eq("order_id", i.orderId)),
      unwrap(ctx.db.from("order_events").select().eq("order_id", i.orderId).order("created_at")),
      unwrap(ctx.db.from("shipments").select().eq("order_id", i.orderId).maybeSingle()),
      unwrap(ctx.db.from("atp").select().eq("brewery_id", ctx.breweryId)),
    ]);
    return { order, lines: ln, events, shipment, atp };
  },
});

/** Buyer questions about invoices (Program 10 task 8): unanswered first. */
defineQuery({
  name: "list_invoice_questions", description: "Questions buyers raised from the portal about invoices, unanswered first; invoiceId narrows to one invoice",
  roles: [...salesRoles],
  input: z.object({ invoiceId: z.string().uuid().optional() }),
  handler: (ctx, i) => {
    let q = ctx.db.from("invoice_questions").select("*, invoices(invoice_no), customers(name)").eq("brewery_id", ctx.breweryId);
    if (i.invoiceId) q = q.eq("invoice_id", i.invoiceId);
    return unwrap(q.order("answered_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }));
  },
});

defineCommand({
  name: "resolve_invoice_question", description: "Mark a buyer's invoice question answered (the reply happens off-system); clears its sales Today row",
  roles: [...salesRoles],
  input: z.object({ questionId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("resolve_invoice_question", { p_brewery: ctx.breweryId, p_question: i.questionId, p_request_id: execution.requestId })),
});

defineQuery({
  name: "daily_pick_sheet", description: "Confirmed/picked orders grouped by requested ship date with lines",
  roles: [...readRoles],
  input: z.object({ date: z.string().date().optional() }),
  handler: (ctx, i) => {
    let q = ctx.db.from("orders")
      .select("*, customers(name), order_lines(*, skus(name))")
      .eq("brewery_id", ctx.breweryId).in("status", ["confirmed", "picked"])
      .order("requested_ship_date", { ascending: true });
    if (i.date) q = q.eq("requested_ship_date", i.date);
    return unwrap(q);
  },
});

defineQuery({
  name: "list_invoices", description: "Invoices and credit memos with subtotal (from invoice_totals), newest first",
  roles: [...readRoles],
  input: z.object({ customerId: z.string().uuid().optional(), limit: z.number().int().max(200).default(50) }),
  handler: async (ctx, i) => {
    let q = ctx.db.from("invoices").select("*, customers(name)").eq("brewery_id", ctx.breweryId)
      .order("created_at", { ascending: false }).limit(i.limit);
    if (i.customerId) q = q.eq("customer_id", i.customerId);
    const invoices = (await unwrap(q)) as { id: string }[];
    const ids = invoices.map(inv => inv.id);
    const totals = ids.length
      ? (await unwrap(ctx.db.from("invoice_totals").select("invoice_id, subtotal_cents").in("invoice_id", ids))) as { invoice_id: string; subtotal_cents: number }[]
      : [];
    const subtotalById = new Map(totals.map(t => [t.invoice_id, t.subtotal_cents]));
    return invoices.map(inv => ({ ...inv, subtotal_cents: subtotalById.get(inv.id) ?? 0 }));
  },
});

defineQuery({
  name: "get_invoice", description: "One invoice with its lines",
  roles: [...readRoles],
  input: z.object({ invoiceId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const invoice = await unwrap(ctx.db.from("invoices").select("*, customers(name)").eq("id", i.invoiceId).single());
    const invLines = await unwrap(ctx.db.from("invoice_lines").select("*, skus(name)").eq("invoice_id", i.invoiceId));
    return { invoice, lines: invLines };
  },
});

defineQuery({
  name: "replenishment_suggestions", description: "Per-taproom par gap: par − on-hand, suggested transfer qty",
  roles: [...readRoles],
  input: z.object({ locationId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const [pars, onHand] = await Promise.all([
      unwrap(ctx.db.from("taproom_pars").select("*, skus(name)").eq("brewery_id", ctx.breweryId).eq("location_id", i.locationId)),
      unwrap(ctx.db.from("on_hand").select().eq("brewery_id", ctx.breweryId).eq("location_id", i.locationId)),
    ]);
    const oh = new Map((onHand ?? []).map((r: { sku_id: string; qty: number }) => [r.sku_id, Number(r.qty)]));
    return (pars ?? []).map((p: { sku_id: string; par_qty: number; skus: { name: string } }) => ({
      skuId: p.sku_id, sku: p.skus.name, par: Number(p.par_qty), onHand: oh.get(p.sku_id) ?? 0,
      suggested: Math.max(0, Number(p.par_qty) - (oh.get(p.sku_id) ?? 0)),
    }));
  },
});

export type ShipSources = { stock: import("./inventory").BinMoveStock[]; bins: { id: string; name: string; location_id: string }[]; destinationBins: { id: string; name: string; location_id: string }[] };
defineQuery({
  name: "get_order_ship_sources", description: "Recorded source bins and lots for a picked order; no customer recall contact data",
  roles: [...warehouseRoles], input: z.object({ orderId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const order = await unwrap(ctx.db.from("orders").select("from_location_id,to_location_id,order_lines(sku_id)").eq("id", i.orderId).eq("brewery_id", ctx.breweryId).single());
    if (!order) throw new Error("Order not found");
    const [stock, bins, destinationBins] = await Promise.all([
      runCommand("get_bin_move_stock", { locationId: order.from_location_id }, ctx) as Promise<ShipSources["stock"]>,
      runCommand("list_bins", { locationId: order.from_location_id }, ctx) as Promise<ShipSources["bins"]>,
      order.to_location_id ? runCommand("list_bins", { locationId: order.to_location_id }, ctx) as Promise<ShipSources["bins"]> : [],
    ]);
    const skus = new Set(order.order_lines.map((l: { sku_id: string }) => l.sku_id));
    return { stock: stock.filter(s => s.kind === "sku" && skus.has(s.stock_id)), bins, destinationBins };
  },
});

export type ReturnSource = { id: string; sku_id: string; qty: number; lot_id: string | null; lots: { code: string } | null; bins: { name: string } | null };
defineQuery({
  name: "get_invoice_return_sources", description: "Original shipped movements available as explicit return identities",
  roles: [...salesRoles], input: z.object({ invoiceId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const invoice = await unwrap(ctx.db.from("invoices").select("shipment_id").eq("id", i.invoiceId).eq("brewery_id", ctx.breweryId).single());
    if (!invoice?.shipment_id) return [];
    const shipment = await unwrap(ctx.db.from("shipments").select("order_id").eq("id", invoice.shipment_id).single());
    if (!shipment) throw new Error("Shipment not found");
    const sources: ReturnSource[] = [];
    for (let start = 0; ; start += 500) {
      const result = await ctx.db.from("inventory_movements").select("id,sku_id,qty,lot_id,lots(code),bins(name)", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("ref", shipment.order_id).eq("type", "sale_removal").order("id").range(start, start + 499);
      const page = await unwrap(Promise.resolve(result)) as unknown as ReturnSource[];
      sources.push(...page);
      if (result.count === null || (!page.length && sources.length < result.count)) throw new Error("Could not read complete shipped sources");
      if (sources.length >= result.count) return sources;
    }
  },
});
