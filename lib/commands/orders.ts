// lib/commands/orders.ts — order lifecycle commands. Every mutation delegates
// to one plpgsql function (00001_baseline.sql, iron rule 5); this layer does
// zod validation, role gating, and camelCase→p_* argument mapping.
import { historyInput, historyResult, newestFirst, type HistoryRow } from "./history";
import { z } from "zod";
import { qboStaffInvoiceLink, type QboInvoiceIdentity, type QboPushedIdentity, type QboStaffConnection } from "@/lib/mgr/qbo-ui";
import type { Ctx } from "./registry";
import { invoiceCurrentTotalCents } from "@/lib/mgr/invoice-state";
import { ORDER_FILTERS, salesRoles, warehouseRoles } from "@/lib/mgr/order-status";
import { hasAnyRole } from "@/lib/mgr/roles";
import { PAYMENT_METHODS, REFUSAL_REASONS, type PaymentMethod } from "@/lib/mgr/enums";
import { isoDate } from "./packaging";
import { completeRows, defineCommand, defineQuery, inChunks, PAGE_SIZE, unwrap, runCommand, CommandError } from "./registry";

const lines = z.array(z.object({ skuId: z.string().uuid(), qty: z.number().positive() })).min(1);
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
    // A pickup is collected at the brewery: never put on a route, invoiced when it ships.
    pickup: z.boolean().optional(),
    lines,
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_order", {
    p_brewery: ctx.breweryId, p_kind: i.kind, p_customer: i.customerId ?? null, p_ship_to: i.shipToId ?? null,
    p_from_location: i.fromLocationId, p_to_location: i.toLocationId ?? null,
    p_requested: i.requestedShipDate ?? null, p_po: i.poNumber ?? null, p_note: i.note ?? null,
    p_lines: toLines(i.lines), p_request_id: execution.requestId, p_pickup: i.pickup ?? false,
  })),
});

defineCommand({
  name: "update_draft_order", description: "Replace a draft order's header fields and lines",
  roles: [...salesRoles],
  input: z.object({
    orderId: z.string().uuid(), shipToId: z.string().uuid().optional(),
    // Omitted preserves the saved date; explicit null clears it via the existing RPC.
    requestedShipDate: z.string().date().nullable().optional(), poNumber: z.string().optional(), note: z.string().optional(),
    // Omitted keeps the saved pickup flag.
    pickup: z.boolean().optional(),
    lines,
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_draft_order", {
    p_order: i.orderId, p_ship_to: i.shipToId ?? null, p_requested: i.requestedShipDate ?? null,
    p_po: i.poNumber ?? null, p_note: i.note ?? null, p_lines: toLines(i.lines), p_request_id: execution.requestId,
    p_clear_requested: i.requestedShipDate === null, p_pickup: i.pickup ?? null,
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
  name: "adjust_order_lines", description: "Replace lines on a submitted/confirmed/picked order; a submitted order holds no allocations until confirm, otherwise re-syncs allocations and returnable-keg deposits; on a picked order, an added or raised line sends it back to confirmed for a re-pick, and staged excess flags a restock; returns ATP soft warnings",
  roles: [...salesRoles], requiresConfirmation: true,
  // Keep raw reasons replayable; the RPC trims and validates new writes after its request lookup.
  input: z.object({ orderId: z.string().uuid(), reason: z.string().min(1), lines }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("adjust_order_lines", { p_order: i.orderId, p_lines: toLines(i.lines), p_reason: i.reason, p_request_id: execution.requestId })),
});

defineCommand({
  name: "set_order_pickup", description: "Set pickup or delivery on an unshipped wholesale order without changing lines, prices or allocations; pickups are invoiced when shipped and never routed",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid(), pickup: z.boolean() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_order_pickup", {
    p_order: i.orderId, p_pickup: i.pickup, p_request_id: execution.requestId,
  })),
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
  name: "resolve_short_pick", description: "Resolve one line counted below ordered after any pending put-back: adjust the order down to the count, or keep the remainder owed",
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
  name: "confirm_delivery", description: "Close a stop with accepted and refused quantities; invoice only accepted goods on delivery, never restore stock",
  roles: [...warehouseRoles], requiresConfirmation: true,
  input: z.object({ deliveryId: z.string().uuid(), signedBy: z.string().trim().optional(),
    refused: z.array(z.object({ orderLineId: z.string().uuid(), qty: z.number().int().positive() })).default([]),
    // Compatibility only: SQL replays completed old closed refusals, then rejects fresh ones.
    reason: z.enum([...REFUSAL_REASONS, "closed"]).optional(),
    note: z.string().optional(), transferRefused: z.boolean().default(false),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("confirm_delivery", {
    p_delivery: i.deliveryId, p_signed_by: i.signedBy ?? "", p_request_id: execution.requestId,
    p_refused: i.refused.map((l) => ({ order_line_id: l.orderLineId, qty: l.qty })),
    p_reason: i.reason ?? null, p_note: i.note ?? null, p_transfer_refused: i.transferRefused,
  })),
});

const pickLines = z.array(z.object({ lineId: z.string().uuid(), qty: z.number().nonnegative() })).min(1);

defineCommand({
  name: "record_pick", description: "Record picked quantities per line after any pending put-back; order becomes picked once all lines are counted",
  roles: [...warehouseRoles],
  input: z.object({ orderId: z.string().uuid(), picks: pickLines }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_pick", {
    p_order: i.orderId, p_picks: i.picks.map(p => ({ line_id: p.lineId, qty_picked: p.qty })), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "ship_order", description: "Ship a picked order (refused while any line has no picked count): movements + allocation fulfillment + invoice (now, or deferred to confirm_delivery), one transaction; anything held back below picked flags a restock, and a wholesale line shipped below picked needs a shortReason (saved as the line's short reason); returnable keg lines post Shipped shells and warn, never refuse, when shells are short",
  roles: [...warehouseRoles], requiresConfirmation: true,
  input: z.object({
    orderId: z.string().uuid(), carrier: z.string().optional(), tracking: z.string().optional(),
    ship: z.array(z.object({ lineId: z.string().uuid(), qty: z.number().nonnegative().multipleOf(0.01),
      sources: z.array(z.object({ binId: z.string().uuid(), lotId: z.string().uuid().nullable(), qty: z.number().positive().multipleOf(0.01), toBinId: z.string().uuid().optional() })).optional(),
      shortReason: z.string().trim().min(1).optional(),
    })).min(1), invoiceTiming: z.enum(["now", "on_delivery"]).default("now"),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("ship_order", {
    p_order: i.orderId, p_ship: i.ship.map(s => ({ line_id: s.lineId, qty_shipped: s.qty, ...(s.shortReason === undefined ? {} : { short_reason: s.shortReason }), ...(s.sources === undefined ? {} : { sources: s.sources.map(a => ({ bin_id: a.binId, lot_id: a.lotId, qty: a.qty, to_bin_id: a.toBinId ?? null })) }) })),
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
  input: z.object({ skuId: z.string().uuid().optional() }),
  handler: async (ctx, i) => {
    // Read all rows being summed, not just PostgREST's first 1,000. Filtering
    // precedes pagination; deterministic keys keep each page disjoint.
    const [atp, onHand, allocs] = await Promise.all([
      completeRows("Reservations", start => {
        let q = ctx.db.from("atp").select("sku_id, qty", { count: "exact" }).eq("brewery_id", ctx.breweryId).lt("qty", 0);
        if (i.skuId) q = q.eq("sku_id", i.skuId);
        return q.order("sku_id").range(start, start + PAGE_SIZE - 1);
      }),
      completeRows("Reservations", start => {
        let q = ctx.db.from("on_hand").select("sku_id, location_id, qty", { count: "exact" }).eq("brewery_id", ctx.breweryId);
        if (i.skuId) q = q.eq("sku_id", i.skuId);
        return q.order("sku_id").order("location_id").range(start, start + PAGE_SIZE - 1);
      }),
      completeRows("Reservations", start => {
        let q = ctx.db.from("allocations").select("id, sku_id, qty, source, ref", { count: "exact" }).eq("brewery_id", ctx.breweryId).eq("status", "open");
        if (i.skuId) q = q.eq("sku_id", i.skuId);
        return q.order("id").range(start, start + PAGE_SIZE - 1);
      }),
    ]);
    // Aggregate view lineage is not a reliable PostgREST relationship. Read
    // labels explicitly through the same tenant/RLS boundary in bounded batches.
    const refs = [...new Set(allocs.filter(a => a.source === "order_line").map(a => a.ref))];
    const [skus, lines] = await Promise.all([
      inChunks(atp.map(r => r.sku_id), async chunk => (await unwrap(ctx.db.from("skus").select("id, name").eq("brewery_id", ctx.breweryId).in("id", chunk))) ?? []),
      inChunks(refs, async chunk => (await unwrap(ctx.db.from("order_lines").select("id, order_id, orders(order_no)").eq("brewery_id", ctx.breweryId).in("id", chunk))) as unknown as { id: string; order_id: string; orders: { order_no: number } | null }[]),
    ]);
    const skuNames = new Map(skus.map(sku => [sku.id, sku.name]));
    const orderLines = new Map<string, { orderId: string; orderNo: number }>();
    for (const line of lines) if (line.orders) orderLines.set(line.id, { orderId: line.order_id, orderNo: line.orders.order_no });
    const sum = (rows: { sku_id: string; qty: number }[]) => rows.reduce((m, r) => m.set(r.sku_id, (m.get(r.sku_id) ?? 0) + Number(r.qty)), new Map<string, number>());
    const onHandBySku = sum(onHand), allocatedBySku = sum(allocs);
    const reservationsBySku = new Map<string, typeof allocs>();
    for (const allocation of allocs) {
      const rows = reservationsBySku.get(allocation.sku_id) ?? [];
      rows.push(allocation); reservationsBySku.set(allocation.sku_id, rows);
    }
    return atp.map(r => ({
      skuId: r.sku_id, skuName: skuNames.get(r.sku_id) ?? r.sku_id, atp: Number(r.qty),
      onHand: onHandBySku.get(r.sku_id) ?? 0, allocated: allocatedBySku.get(r.sku_id) ?? 0,
      reservations: (reservationsBySku.get(r.sku_id) ?? []).map(a => ({ id: a.id, source: a.source, ref: a.ref, qty: Number(a.qty), ...orderLines.get(a.ref) })),
    }));
  },
});

defineCommand({
  name: "return_shipment", description: "Return shipped beer at invoice prices and its destination, posting damaged beer to loss and full-keg shells as Returned. Deposit-only refunds need no location or reason; returnEmptyKegs optionally checks empties into locationId and binId with the refund atomically",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({
    invoiceId: z.string().uuid(), refusedDeliveryId: z.string().uuid().optional(), locationId: z.string().uuid().optional(), reason: z.enum(["damaged", "wrong_item", "unsold"]).optional(),
    returnEmptyKegs: z.boolean().default(false), binId: z.string().uuid().optional(),
    lines: z.array(z.object({ invoiceLineId: z.string().uuid(), qty: z.number().positive().multipleOf(0.01), sources: z.array(z.object({ movementId: z.string().uuid(), binId: z.string().uuid(), qty: z.number().positive().multipleOf(0.01) })).optional() })).min(1),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("return_shipment", {
    p_invoice: i.invoiceId, p_lines: i.lines.map(l => ({ invoice_line_id: l.invoiceLineId, qty: l.qty, ...(l.sources === undefined ? {} : { sources: l.sources.map(a => ({ movement_id: a.movementId, bin_id: a.binId, qty: a.qty })) }) })),
    p_refused_delivery: i.refusedDeliveryId, p_location: i.locationId ?? null, p_reason: i.reason ?? null, p_return_empty: i.returnEmptyKegs, p_bin: i.binId ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "reorder_refused_delivery", description: "Create one editable draft for a shipped order's refused quantities, preserving customer, ship-to, fulfillment source, pickup, customer PO and note; capture current prices; a second reorder of the same order is refused",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("reorder_refused_delivery", { p_order: i.orderId, p_request_id: execution.requestId })),
});

defineCommand({
  name: "create_credit_memo", description: "Full returnable kegs coming back with beer also post Returned shells; deposit-only refunds do not. Credit an invoice: negative lines at original prices + return_in movements",
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

defineCommand({
  name: "record_historical_order", description: "Admin only: record an order picked up before the books opened as shipped, picked up and paid at the given prices; writes no stock, deposits or fees, and its invoice is never sent to QuickBooks",
  roles: ["admin"],
  input: z.object({
    customerId: z.string().uuid(), shipToId: z.string().uuid(), pickedUpOn: isoDate, note: z.string().optional(),
    lines: z.array(z.object({ skuId: z.string().uuid(), qty: z.number().positive().multipleOf(0.01), unitPriceCents: z.number().int().min(0) })).min(1),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_historical_order", {
    p_brewery: ctx.breweryId, p_customer: i.customerId, p_ship_to: i.shipToId, p_picked_up_on: i.pickedUpOn,
    p_lines: i.lines.map(l => ({ sku_id: l.skuId, qty: l.qty, unit_price_cents: l.unitPriceCents })),
    p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

// ---- queries ----

defineQuery({
  name: "list_orders", description: "Orders newest-first with each one's delivery stop outcome, optionally by status (delivered: shipped orders whose stop closed delivered or partly delivered) and customer",
  roles: [...readRoles],
  input: z.object({ customerId: z.string().uuid().optional(), status: z.enum(ORDER_FILTERS).optional(), ...historyInput }),
  handler: async (ctx, i) => {
    // Delivered is not an orders.status; it is a shipped order whose stop closed delivered or partial (#1483).
    let q = ctx.db.from("orders").select(i.status === "delivered" ? "*, customers(name), shipments!inner(deliveries!inner(outcome))" : "*, customers(name), shipments(deliveries(outcome))")
      .eq("brewery_id", ctx.breweryId).limit(i.limit + 1);
    if (i.status === "delivered") q = q.eq("status", "shipped").in("shipments.deliveries.outcome", ["delivered", "partial"]);
    else if (i.status) q = q.eq("status", i.status);
    if (i.customerId) q = q.eq("customer_id", i.customerId);
    return historyResult(await unwrap(newestFirst(q, i.cursor)) as HistoryRow[], i.limit);
  },
});

export type OrderCogs = { cost_cents: number; revenue_cents: number; uncosted_qty: number; margin_pct: number | null };

defineQuery({
  name: "get_order_cogs", description: "What the shipped beer on one order cost (frozen packaging-close cost of its lots, returns netted out), its revenue at the order-line prices, and the margin percent; margin is null while any shipped unit has no cost",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: async (ctx, i): Promise<OrderCogs> => {
    const order = await unwrap(ctx.db.from("orders").select("id").eq("brewery_id", ctx.breweryId).eq("id", i.orderId).maybeSingle());
    if (!order) throw new CommandError("Order not found", 404, "not_found");
    const [costs, prices] = await Promise.all([
      completeRows("Order cost", start => ctx.db.from("order_line_cogs").select("sku_id, qty, cost_cents, uncosted_qty", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("order_id", i.orderId).order("sku_id").range(start, start + PAGE_SIZE - 1)),
      completeRows("Order lines", start => ctx.db.from("order_lines").select("sku_id, unit_price_cents", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("order_id", i.orderId).order("sku_id").range(start, start + PAGE_SIZE - 1)),
    ]);
    // Revenue prices the units still sold (shipped minus returned), not invoice lines: a deferred-invoice order has none yet.
    const price = new Map(prices.map(p => [p.sku_id, p.unit_price_cents]));
    const rows = costs;
    const cost_cents = rows.reduce((n, r) => n + Number(r.cost_cents), 0);
    const revenue_cents = rows.reduce((n, r) => n + Number(r.qty) * (price.get(r.sku_id) ?? 0), 0);
    const uncosted_qty = rows.reduce((n, r) => n + Number(r.uncosted_qty), 0);
    // A partial cost must never read as a full one, so any uncosted unit withholds the margin.
    const margin_pct = uncosted_qty > 0 || revenue_cents <= 0 ? null : Math.round((revenue_cents - cost_cents) / revenue_cents * 1000) / 10;
    return { cost_cents: Math.round(cost_cents), revenue_cents: Math.round(revenue_cents), uncosted_qty: Math.round(uncosted_qty * 100) / 100, margin_pct };
  },
});

defineQuery({
  name: "get_order", description: "One order with lines (each SKU with its brand name and staff alias, and format name), keg deposits, events, shipment with its invoice, brewery ATP, and on-hand stock at its fulfillment source",
  roles: [...readRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const [order, lines, events, shipment, deposits] = await Promise.all([
      unwrap(ctx.db.from("orders").select("*, customers(name), ship_tos(label, country, city, state)")
        .eq("brewery_id", ctx.breweryId).eq("id", i.orderId).single()),
      completeRows("Order lines", start => ctx.db.from("order_lines").select("*, skus(name, brands(name, alias), formats(name))", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("order_id", i.orderId).order("sku_id").range(start, start + PAGE_SIZE - 1)),
      unwrap(ctx.db.from("order_events").select().eq("order_id", i.orderId).order("created_at")),
      unwrap(ctx.db.from("shipments").select("*, deliveries(outcome), invoices(id, invoice_no)").eq("order_id", i.orderId).maybeSingle()),
      completeRows("Order deposits", start => ctx.db.from("order_deposit_lines")
        .select("id, order_line_id, description, qty_ordered, unit_price_cents, amount_cents", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("order_id", i.orderId).order("id").range(start, start + PAGE_SIZE - 1)),
    ]);
    if (!order) throw new CommandError("Order not found", 404, "not_found");
    // Both aggregate views have one row per selected key. Restrict each request
    // to this order's SKUs in bounded batches so PostgREST's row cap cannot turn
    // an omitted balance into a false zero on the confirmation screen.
    const skuIds = [...new Set(lines.map((line: { sku_id: string }) => line.sku_id))];
    const [atp, sourceOnHand] = await Promise.all([
      inChunks(skuIds, async batch => (await unwrap(ctx.db.from("atp").select("brewery_id, sku_id, qty").eq("brewery_id", ctx.breweryId).in("sku_id", batch))) ?? []),
      inChunks(skuIds, async batch => (await unwrap(ctx.db.from("on_hand").select("sku_id, qty").eq("brewery_id", ctx.breweryId)
        .eq("location_id", order.from_location_id).in("sku_id", batch))) ?? []),
    ]);
    return { order, lines, events, shipment, atp, sourceOnHand, deposits };
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

// Payments recorded in MGR (#1045, docs/plans/invoice-local-payments.md). The
// RPCs hold every rule: only an invoice QuickBooks never received, no more
// than the balance, no future received date in the brewery's zone.
defineCommand({
  name: "record_invoice_payment", description: "Record a payment received outside QuickBooks on an invoice QuickBooks never received; paid in full marks the invoice paid on the latest received day of its payments; returns the remaining balance",
  roles: [...salesRoles],
  input: z.object({
    invoiceId: z.string().uuid(), amountCents: z.number().int().positive(), receivedOn: isoDate,
    method: z.enum(PAYMENT_METHODS), reference: z.string().trim().max(200).optional(),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_invoice_payment", {
    p_brewery: ctx.breweryId, p_invoice: i.invoiceId, p_amount_cents: i.amountCents, p_received_on: i.receivedOn,
    p_method: i.method, p_reference: i.reference ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "void_invoice_payment", description: "Void a payment recorded in MGR with a reason, the only correction; the payment row is kept, and an invoice that drops below its total is no longer paid; returns the balance",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({ paymentId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("void_invoice_payment", {
    p_brewery: ctx.breweryId, p_payment: i.paymentId, p_reason: i.reason, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "daily_pick_sheet", description: "Confirmed/picked orders grouped by requested ship date with lines (each SKU with its brand name and staff alias, and format name)",
  roles: [...readRoles],
  input: z.object({ date: z.string().date().optional() }),
  // Paged past PostgREST's 1000-row cap (#759); without a date this is every
  // confirmed/picked order. id breaks ship-date ties so pages never overlap.
  handler: (ctx, i) => completeRows("Pick sheet", start => {
    let q = ctx.db.from("orders")
      .select("*, customers(name), order_lines(*, skus(name, brands(name, alias), formats(name)))", { count: "exact" })
      .eq("brewery_id", ctx.breweryId).in("status", ["confirmed", "picked"]);
    if (i.date) q = q.eq("requested_ship_date", i.date);
    return q.order("requested_ship_date", { ascending: true }).order("id").range(start, start + PAGE_SIZE - 1);
  }),
});

// Both invoice reads use the same current connection and exact successful push provenance.
async function invoiceStaffLinks(ctx: Ctx, invoices: (QboInvoiceIdentity & { id: string })[]) {
  if (!invoices.length || !hasAnyRole(ctx.roles, ["admin", "sales"])) return new Map(invoices.map(invoice => [invoice.id, null]));
  const connection = await runCommand("get_qbo_connection", {}, ctx) as QboStaffConnection;
  const pushes = connection.connected && connection.connectionId && connection.realmId
    ? await completeRows("Invoice provider identities", start => ctx.db.from("qbo_pushes")
      .select("id,invoice_id,connection_id,realm_id,qbo_entity_id", { count: "exact" })
      .eq("brewery_id", ctx.breweryId).eq("connection_id", connection.connectionId!).eq("realm_id", connection.realmId!)
      .eq("status", "pushed").eq("entity_type", "Invoice").in("invoice_id", invoices.map(invoice => invoice.id))
      .order("id").range(start, start + PAGE_SIZE - 1)) as (QboPushedIdentity & { invoice_id: string })[] : [];
  const pushByEntity = new Map(pushes.map(push => [`${push.invoice_id}:${push.qbo_entity_id}`, push]));
  return new Map(invoices.map(invoice => [invoice.id, qboStaffInvoiceLink(invoice, ctx.roles, connection,
    pushByEntity.get(`${invoice.id}:${invoice.qbo_invoice_id}`))]));
}

type InvoicePushFacts = { has_pending_push: boolean; was_pushed: boolean };

/** Each invoice's pending and successful QuickBooks pushes, by invoice id; an
 *  invoice with neither is absent. Read through invoice_push_facts, because
 *  qbo_pushes is readable by Admin and Sales only and Warehouse also reads
 *  invoices: without the facts, a pending or earlier-pushed invoice would look
 *  ledger-owned to Warehouse (invoiceLedgerOwnsBalance, #1045). */
async function invoicePushFacts(ctx: Ctx, invoiceIds: string[]) {
  const rows = await unwrap(ctx.db.rpc("invoice_push_facts", { p_brewery: ctx.breweryId, p_invoices: invoiceIds }));
  // A set-returning RPC answers [] for no rows; data is null only beside an error, which unwrap threw.
  return new Map<string, InvoicePushFacts>(rows!.map(({ invoice_id, ...facts }) => [invoice_id, facts]));
}

defineQuery({
  name: "list_invoices", description: "Invoices and credit memos with current total plus frozen local subtotal and the sum of payments recorded in MGR, newest first; optionally only unpaid invoices",
  roles: [...readRoles],
  input: z.object({
    customerId: z.string().uuid().optional(),
    status: z.enum(["unpaid"]).optional().describe("unpaid: invoices still owing money — not written off, voided or deleted in QuickBooks, and either a positive QuickBooks balance or, with none, not marked paid"),
    ...historyInput,
  }),
  handler: async (ctx, i) => {
    let q = ctx.db.from("invoices").select("*, customers(name)").eq("brewery_id", ctx.breweryId).limit(i.limit + 1);
    if (i.customerId) q = q.eq("customer_id", i.customerId);
    // invoiceCurrentState's "unpaid", less a QuickBooks balance of zero or below (settled or a credit).
    if (i.status === "unpaid") q = q.eq("kind", "invoice").is("written_off_at", null).eq("qbo_remote_state", "live")
      .or("qbo_balance_cents.gt.0,and(qbo_balance_cents.is.null,paid_at.is.null)");
    const page = historyResult((await unwrap(newestFirst(q, i.cursor))) as (HistoryRow & QboInvoiceIdentity & { qbo_total_cents: number | null })[], i.limit);
    const invoices = page.rows;
    const ids = invoices.map(inv => inv.id);
    const staffLinksPromise = invoiceStaffLinks(ctx, invoices);
    const [totals, pushes] = ids.length ? await Promise.all([
      unwrap(ctx.db.from("invoice_totals").select("invoice_id, subtotal_cents, local_paid_cents").in("invoice_id", ids)) as PromiseLike<{ invoice_id: string; subtotal_cents: number; local_paid_cents: number }[]>,
      invoicePushFacts(ctx, ids),
    ]) : [[], new Map<string, InvoicePushFacts>()];
    const staffLinks = await staffLinksPromise;
    const totalsById = new Map(totals.map(t => [t.invoice_id, t]));
    return { ...page, rows: invoices.map(inv => {
      const { subtotal_cents = 0, local_paid_cents = 0 } = totalsById.get(inv.id) ?? {};
      const push = pushes.get(inv.id);
      return { ...inv, subtotal_cents, total_cents: invoiceCurrentTotalCents(inv, subtotal_cents), local_paid_cents,
        has_pending_qbo_push: push?.has_pending_push ?? false, was_pushed_to_qbo: push?.was_pushed ?? false, quickbooks_link: staffLinks.get(inv.id) ?? null };
    }) };
  },
});

defineQuery({
  name: "get_invoice", description: "One invoice with its lines, the order it bills (through its shipment), the payments recorded in MGR, and the method of the customer's last unvoided payment on any invoice",
  roles: [...readRoles],
  input: z.object({ invoiceId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const [invoice, invLines, pushes, paymentRows] = await Promise.all([
      unwrap(ctx.db.from("invoices").select("*, customers(id,name,qbo_customer_id,qbo_realm_id), shipments(orders(id, order_no))").eq("id", i.invoiceId).eq("brewery_id", ctx.breweryId).single()),
      completeRows("Invoice lines", start => ctx.db.from("invoice_lines").select("*, skus(name,qbo_item_id,qbo_realm_id)", { count: "exact" })
        .eq("invoice_id", i.invoiceId).eq("brewery_id", ctx.breweryId).order("kind").order("id").range(start, start + PAGE_SIZE - 1)),
      invoicePushFacts(ctx, [i.invoiceId]),
      // A void is its own row. PostgREST embeds it as one object or null, since
      // (brewery_id, payment_id) is unique; the generated types still say an array.
      completeRows("Invoice payments", start => ctx.db.from("invoice_payments")
        .select("id, amount_cents, received_on, method, reference, invoice_payment_voids(reason)", { count: "exact" })
        .eq("invoice_id", i.invoiceId).eq("brewery_id", ctx.breweryId)
        .order("received_on", { ascending: false }).order("id").range(start, start + PAGE_SIZE - 1)),
    ]);
    if (!invoice) throw new Error("Invoice not found");
    const [staffLinks, lastPayment] = await Promise.all([
      invoiceStaffLinks(ctx, [invoice]),
      // Record payment starts on the method this customer last paid with, on any invoice;
      // a voided payment was a mistake and never sets it (#1506).
      unwrap(ctx.db.from("invoice_payments").select("method, invoices!inner(customer_id), invoice_payment_voids(id)")
        .eq("brewery_id", ctx.breweryId).eq("invoices.customer_id", invoice.customer_id).is("invoice_payment_voids", null)
        .order("received_on", { ascending: false }).order("recorded_at", { ascending: false }).limit(1)),
    ]);
    const payments = paymentRows.map(({ invoice_payment_voids: voids, ...payment }) => ({ ...payment, void: voids as unknown as { reason: string } | null }));
    const push = pushes.get(invoice.id);
    return { invoice, lines: invLines, payments,
      localPaidCents: payments.reduce((sum, payment) => payment.void ? sum : sum + payment.amount_cents, 0),
      hasPendingPush: push?.has_pending_push ?? false, wasPushedToQbo: push?.was_pushed ?? false,
      quickbooksLink: staffLinks.get(invoice.id) ?? null,
      lastPaymentMethod: (lastPayment as { method: PaymentMethod }[])[0]?.method ?? null };
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

export type ReturnSource = { id: string; sku_id: string; qty: number; lot_id: string | null; location_id: string; lots: { code: string } | null; bins: { name: string } | null };
defineQuery({
  name: "get_invoice_return_sources", description: "Original shipped movements available as explicit return identities",
  roles: ["admin", "warehouse", "sales"], input: z.object({ invoiceId: z.string().uuid().optional(), deliveryId: z.string().uuid().optional() }).refine((i) => Boolean(i.invoiceId) !== Boolean(i.deliveryId), "Choose an invoice or delivery"),
  handler: async (ctx, i) => {
    const invoice = i.deliveryId
      ? await unwrap(ctx.db.from("deliveries").select("shipment_id").eq("id", i.deliveryId).eq("brewery_id", ctx.breweryId).single())
      : await unwrap(ctx.db.from("invoices").select("shipment_id").eq("id", i.invoiceId!).eq("brewery_id", ctx.breweryId).single());
    if (!invoice?.shipment_id) return [];
    const shipment = await unwrap(ctx.db.from("shipments").select("order_id").eq("id", invoice.shipment_id).single());
    if (!shipment) throw new Error("Shipment not found");
    return await completeRows("Shipped sources", start => ctx.db.from("inventory_movements").select("id,sku_id,qty,lot_id,location_id,lots(code),bins(name)", { count: "exact" })
      .eq("brewery_id", ctx.breweryId).eq("ref", shipment.order_id).eq("type", "sale_removal").order("id").range(start, start + PAGE_SIZE - 1)) as unknown as ReturnSource[];
  },
});

defineQuery({
  name: "get_order_email_status", description: "Read buyer confirmation email states for an order; provider acceptance does not prove inbox delivery",
  roles: ["admin", "sales"],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_order_email_status", { p_brewery: ctx.breweryId, p_order: i.orderId })),
});
