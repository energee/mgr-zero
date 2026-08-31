// lib/commands/orders.ts — order lifecycle commands. Every mutation delegates
// to one plpgsql function (00001_baseline.sql, iron rule 5); this layer does
// zod validation, role gating, and camelCase→p_* argument mapping.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

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
  handler: (ctx, i) => unwrap(ctx.db.rpc("create_order", {
    p_brewery: ctx.breweryId, p_kind: i.kind, p_customer: i.customerId ?? null, p_ship_to: i.shipToId ?? null,
    p_from_location: i.fromLocationId, p_to_location: i.toLocationId ?? null,
    p_requested: i.requestedShipDate ?? null, p_po: i.poNumber ?? null, p_note: i.note ?? null,
    p_lines: toLines(i.lines),
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
  handler: (ctx, i) => unwrap(ctx.db.rpc("update_draft_order", {
    p_order: i.orderId, p_ship_to: i.shipToId ?? null, p_requested: i.requestedShipDate ?? null,
    p_po: i.poNumber ?? null, p_note: i.note ?? null, p_lines: toLines(i.lines),
  })),
});

defineCommand({
  name: "submit_order", description: "Submit a draft order for confirmation",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("submit_order", { p_order: i.orderId })),
});

defineCommand({
  name: "confirm_order", description: "Confirm a submitted order; creates allocations and returns ATP soft warnings",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("confirm_order", { p_order: i.orderId })),
});

defineCommand({
  name: "adjust_order_lines", description: "Replace lines on a confirmed/picked order; re-syncs allocations; flags restocking when picked",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({ orderId: z.string().uuid(), reason: z.string().min(1), lines }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("adjust_order_lines", { p_order: i.orderId, p_lines: toLines(i.lines), p_reason: i.reason })),
});

defineCommand({
  name: "cancel_order", description: "Cancel an unshipped order and release its allocations",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({ orderId: z.string().uuid(), reason: z.string().min(1) }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("cancel_order", { p_order: i.orderId, p_reason: i.reason })),
});

const pickLines = z.array(z.object({ lineId: z.string().uuid(), qty: z.number().nonnegative() })).min(1);

defineCommand({
  name: "record_pick", description: "Record picked quantities per line; order becomes picked",
  roles: [...warehouseRoles],
  input: z.object({ orderId: z.string().uuid(), picks: pickLines }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("record_pick", {
    p_order: i.orderId, p_picks: i.picks.map(p => ({ line_id: p.lineId, qty_picked: p.qty })),
  })),
});

defineCommand({
  name: "ship_order", description: "Ship a picked order: movements + allocation fulfillment + invoice, one transaction",
  roles: [...warehouseRoles], requiresConfirmation: true,
  input: z.object({
    orderId: z.string().uuid(), carrier: z.string().optional(), tracking: z.string().optional(),
    ship: pickLines,
  }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("ship_order", {
    p_order: i.orderId, p_ship: i.ship.map(s => ({ line_id: s.lineId, qty_shipped: s.qty })),
    p_carrier: i.carrier ?? null, p_tracking: i.tracking ?? null,
  })),
});

defineCommand({
  name: "create_credit_memo", description: "Credit an invoice: negative lines at original prices + return_in movements",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({
    invoiceId: z.string().uuid(), locationId: z.string().uuid(), reason: z.string().min(1),
    lines: z.array(z.object({ invoiceLineId: z.string().uuid(), qty: z.number().positive() })).min(1),
  }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("create_credit_memo", {
    p_invoice: i.invoiceId, p_lines: i.lines.map(l => ({ invoice_line_id: l.invoiceLineId, qty: l.qty })),
    p_location: i.locationId, p_reason: i.reason,
  })),
});

defineCommand({
  name: "create_replenishment_order", description: "Create a confirmed taproom transfer order from par-gap quantities",
  roles: [...salesRoles],
  input: z.object({ fromLocationId: z.string().uuid(), toLocationId: z.string().uuid(), lines }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("create_replenishment_order", {
    p_from: i.fromLocationId, p_to: i.toLocationId, p_lines: toLines(i.lines),
  })),
});

// ---- queries ----

defineQuery({
  name: "list_orders", description: "Orders newest-first, optionally by status",
  roles: [...readRoles],
  input: z.object({ status: z.enum(["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"]).optional(), limit: z.number().int().max(200).default(50) }),
  handler: (ctx, i) => {
    let q = ctx.db.from("orders").select("*, customers(name)")
      .eq("brewery_id", ctx.breweryId).order("created_at", { ascending: false }).limit(i.limit);
    if (i.status) q = q.eq("status", i.status);
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
